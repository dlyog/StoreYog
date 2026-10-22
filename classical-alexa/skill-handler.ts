// Classic Alexa custom skill endpoint: everything the user says arrives in one catch-all intent and is
// handed, word for word, to the same agent the web simulator uses (LLM planning + real MCP tools on the
// synthetic demo store). The reply text is returned for the Echo to speak. Mounted only when
// CLASSIC_ALEXA_ENABLED=true; see classical-alexa/README.md.
import express from 'express';
import {createVerify,X509Certificate} from 'node:crypto';
import {rootCertificates} from 'node:tls';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import type {Session} from '../simulator/agent.js';
import {asksAboutStock} from '../simulator/inventory-query.js';
import {withModelAudit} from '../simulator/model-audit.js';
import {config} from '../server/config.js';
import {labFetch} from '../server/lab-http.js';
import {completionUrl,completionHeaders} from '../server/ai-services.js';
import {SUGGESTIONS,supportsApl,welcomeScreen,answerScreen,shelfScreen,videoScreen} from './apl.js';

type Emit=(event:Record<string,any>)=>void;
type RunAgent=(session:Session,text:string,scripted:boolean,emit:Emit)=>Promise<unknown>;
type Options={runAgent:RunAgent;skillId?:string;skipVerification?:boolean;replyTimeoutMs?:number};

const LAUNCH_TEXT='Alexa, open StoreYog';
const REPROMPT='What else would you like to know about your store?';
const GREETING=`Hello, I am your Virtual Store Assistant! You can ask me: ${SUGGESTIONS.map(s=>s.replace(/[?.]$/,'')).join('; ')}. You can also ask me anything else. How can I help?`;
const HELP=`You can ask me: ${SUGGESTIONS.map(s=>s.replace(/[?.]$/,'')).join('; ')}. Say stop to finish.`;
const origin=()=>(process.env.PUBLIC_WEB_ORIGIN||'https://storeyog.dlyog.com').replace(/\/$/,'');
const DEMO_VIDEO=fileURLToPath(new URL('../docs/pitch-v7/storeyog-live-normal.mp4',import.meta.url));
const WELCOME_ART=fileURLToPath(new URL('../simulator/landing/assets/store-owner-evening.webp',import.meta.url));
const WANTS_VIDEO=/\b(?:play|show|watch|start|open)\b.*\b(?:demo|video|film|pitch)\b/i;
const WANTS_PLACE=/\b(?:where|which\s+(?:aisle|shelf)|find|locate|show\s+me)\b/i;
// Store intents (stock, sales, orders, approvals) stay on the MCP agent. Anything else, including general
// questions that merely mention a product ("what can I cook with dal"), goes to the LLM as a general question.
const STORE_TOPIC=/\b(?:stock|inventory|in\s+stock|shelf|shelves|aisle|sales?|sold|sell|revenue|made|make|earn|orders?|reorder|restock|reconcile|supplier|price|cost|customers?|report|receipts?|transactions?|low|available|left|yes|yeah|no|nope|cancel|approve|confirm|go\s+ahead|my\s+store|the\s+store|store\s+doing)\b/i;
const sessions=new Map<string,Session>();
setInterval(()=>{for(const [id,s] of sessions)if(!s.busy&&Date.now()-s.updatedAt>3600_000)sessions.delete(id);},300_000).unref();

// --- Alexa request verification (https://developer.amazon.com/docs/custom-skills/host-a-custom-skill-as-a-web-service.html)
const chainCache=new Map<string,{chain:X509Certificate[];expires:number}>();
const roots=rootCertificates.map(pem=>new X509Certificate(pem));

export function validCertUrl(raw:string){
 try{const url=new URL(raw);const path=new URL(url.pathname.replace(/\/+/g,'/'),'https://x').pathname;
  return url.protocol==='https:'&&url.hostname.toLowerCase()==='s3.amazonaws.com'&&(url.port===''||url.port==='443')&&path.startsWith('/echo.api/');}
 catch{return false;}
}

async function signingChain(url:string){
 const cached=chainCache.get(url);if(cached&&cached.expires>Date.now())return cached.chain;
 const r=await fetch(url,{signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error('certificate download failed');
 const pems=(await r.text()).match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)||[];
 const chain=pems.map(p=>new X509Certificate(p));if(!chain.length)throw Error('empty certificate chain');
 const now=Date.now(),leaf=chain[0];
 if(now<Date.parse(leaf.validFrom)||now>Date.parse(leaf.validTo))throw Error('signing certificate expired');
 if(!(leaf.subjectAltName||'').split(/,\s*/).includes('DNS:echo-api.amazon.com'))throw Error('signing certificate is not echo-api.amazon.com');
 for(let i=0;i<chain.length-1;i++)if(!chain[i].verify(chain[i+1].publicKey))throw Error('broken certificate chain');
 const top=chain[chain.length-1];if(!roots.some(root=>top.checkIssued(root)&&top.verify(root.publicKey))&&!roots.some(root=>root.fingerprint256===top.fingerprint256))throw Error('untrusted certificate chain');
 chainCache.set(url,{chain,expires:Math.min(Date.parse(leaf.validTo),now+3600_000)});return chain;
}

export async function verifyAlexaRequest(headers:express.Request['headers'],raw:Buffer,body:any,skillId?:string){
 const certUrl=String(headers['signaturecertchainurl']||''),signature=String(headers['signature-256']||'');
 if(!certUrl||!signature||!validCertUrl(certUrl))throw Error('missing or invalid signature headers');
 const chain=await signingChain(certUrl);
 if(!createVerify('RSA-SHA256').update(raw).verify(chain[0].publicKey,signature,'base64'))throw Error('signature mismatch');
 const timestamp=Date.parse(body?.request?.timestamp);if(!timestamp||Math.abs(Date.now()-timestamp)>150_000)throw Error('stale request');
 const appId=body?.session?.application?.applicationId||body?.context?.System?.application?.applicationId;
 if(skillId&&appId!==skillId)throw Error('unexpected skill id');
}

// --- Alexa responses
const speak=(text:string,end=false,directive?:any)=>({version:'1.0',response:{outputSpeech:{type:'PlainText',text:text.slice(0,7900)},...(end?{}:{reprompt:{outputSpeech:{type:'PlainText',text:REPROMPT}}}),...(directive?{directives:[directive]}:{}),shouldEndSession:end}});
// While the video plays, keep the session without opening the microphone (shouldEndSession omitted).
const playVideo=(text:string)=>({version:'1.0',response:{outputSpeech:{type:'PlainText',text},directives:[videoScreen(origin())]}});

// Published shelf details for a product (the customer finder's read-only find_product projection).
async function shelfFor(text:string){
 try{const r=await fetch(new URL('/shop/raj-demo/api/search?q='+encodeURIComponent(text),config.mcpUrl),{signal:AbortSignal.timeout(2500)});if(!r.ok)return null;
  const data=await r.json() as any;return {summary:String(data.summary||''),item:(data.items||[]).find((i:any)=>i.photo?.url)||null,count:(data.items||[]).length};}
 catch{return null;}
}

// General questions: the same LLM, a general-assistant prompt, recorded in the store's model audit.
async function generalAnswer(s:Session,text:string){
 const request={model:config.llmModel,max_tokens:220,temperature:0.4,stream:false,messages:[
  {role:'system',content:'You are a friendly voice assistant on an Echo Show in Little India Grocery, a small store. Answer helpfully in one to three short spoken sentences, without markdown or lists. Never state this store\'s stock counts, sales, prices or orders; for those, invite the user to ask about the product or the day, and the store records will be checked.'},
  ...s.history.slice(-6),{role:'user',content:text}]};
 const body=await withModelAudit(s.id,'chat-completions',config.llmModel,request,async()=>{const r=await labFetch(completionUrl(),{method:'POST',headers:completionHeaders(),body:JSON.stringify(request),signal:AbortSignal.timeout(6000)});const data=await r.json() as any;if(!r.ok)throw Object.assign(new Error(`Model returned HTTP ${r.status}`),{auditResponse:data});return data;}) as any;
 const reply=String(body?.choices?.[0]?.message?.content||'').replace(/<think>[\s\S]*?<\/think>/g,'').replace(/[*#_`]/g,'').trim();
 if(reply){s.history.push({role:'user',content:text},{role:'assistant',content:reply});s.history=s.history.slice(-12);}
 return reply||'Sorry, I could not answer that right now.';
}

function sessionFor(id:string){let s=sessions.get(id);if(!s){s={id:'alexa-'+crypto.randomUUID(),updatedAt:Date.now(),busy:false,history:[],pending:null};sessions.set(id,s);}s.updatedAt=Date.now();return s;}

// Runs one turn through the simulator's agent and returns its final spoken reply.
async function ask(run:RunAgent,s:Session,text:string,timeoutMs:number){
 if(s.busy)return 'I am still working on your last request. Ask me again in a moment.';
 s.busy=true;let reply='',error='';
 const turn=run(s,text,false,event=>{if(event.type==='done')reply=String(event.reply||'');if(event.type==='error')error=String(event.error||'');})
  .catch(e=>{error=e instanceof Error?e.message:'failed';}).finally(()=>{s.busy=false;s.updatedAt=Date.now();});
 const timedOut=await Promise.race([turn.then(()=>false),new Promise<boolean>(r=>setTimeout(()=>r(true),timeoutMs))]);
 if(timedOut)return 'That is taking a little longer. Ask me again in a moment.';
 return reply||(error?'Sorry, the store assistant could not finish that. Please try again.':'Sorry, I did not get an answer. Please try again.');
}

export function classicAlexaRouter(options:Options){
 const router=express.Router(),timeout=options.replyTimeoutMs??7000;
 // The demo video for the Echo Show (Range requests supported by sendFile).
 // Echo Show images as JPEG (APL format support for WebP is not documented). Shelf photos are fetched through the
 // customer finder route, which serves only photos the owner has published.
 const jpeg=(res:express.Response,input:Buffer|string)=>sharp(input).resize({width:1280,withoutEnlargement:true}).jpeg({quality:85}).toBuffer().then(b=>res.type('image/jpeg').set('Cache-Control','public, max-age=3600').send(b)).catch(()=>res.status(404).end());
 router.get('/media/welcome.jpg',(_req,res)=>{jpeg(res,WELCOME_ART);});
 router.get('/media/photo/:id.jpg',async(req,res)=>{const id=String(req.params.id);if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(404).end();
  try{const r=await fetch(new URL('/shop/raj-demo/api/photos/'+id,config.mcpUrl),{signal:AbortSignal.timeout(4000)});if(!r.ok)return res.status(404).end();jpeg(res,Buffer.from(await r.arrayBuffer()));}catch{res.status(404).end();}});
 router.get('/media/demo.mp4',(_req,res)=>res.sendFile(DEMO_VIDEO,{headers:{'Cache-Control':'public, max-age=3600'}},error=>{if(error&&!res.headersSent)res.status(404).end();}));
 router.post('/',express.raw({type:'*/*',limit:'64kb'}),async(req,res)=>{
  const raw=Buffer.isBuffer(req.body)?req.body:Buffer.from('');let body:any;
  try{body=JSON.parse(raw.toString('utf8'));}catch{return res.status(400).json({error:'Invalid JSON.'});}
  if(!options.skipVerification){try{await verifyAlexaRequest(req.headers,raw,body,options.skillId);}catch(e){console.warn('Classic Alexa: rejected request:',e instanceof Error?e.message:e);return res.status(400).json({error:'Request verification failed.'});}}
  const request=body?.request||{},alexaSession=body?.session?.sessionId||body?.context?.System?.device?.deviceId||'unknown';
  try{
   if(request.type==='SessionEndedRequest'){sessions.delete(alexaSession);return res.json({version:'1.0',response:{}});}
   const s=sessionFor(alexaSession);
   const screen=supportsApl(body);
   if(request.type==='LaunchRequest'){await ask(options.runAgent,s,LAUNCH_TEXT,timeout);return res.json(speak(GREETING,false,screen?welcomeScreen(origin()):undefined));}
   if(request.type==='Alexa.Presentation.APL.UserEvent'){const args=request.arguments||[];return res.json(speak(args.includes('videoEnded')?'That was the StoreYog demo. What would you like to do next?':REPROMPT,false,screen?welcomeScreen(origin()):undefined));}
   if(request.type!=='IntentRequest')return res.json(speak(HELP));
   const intent=request.intent?.name;
   if(intent==='AMAZON.StopIntent'||intent==='AMAZON.CancelIntent'){sessions.delete(alexaSession);return res.json(speak('Goodbye. Have a good evening.',true));}
   if(intent==='AMAZON.HelpIntent')return res.json(speak(HELP,false,screen?welcomeScreen(origin()):undefined));
   if(intent==='AMAZON.NavigateHomeIntent')return res.json(speak(REPROMPT));
   const text=String(request.intent?.slots?.text?.value||'').trim();
   if(intent!=='ChatIntent'||!text)return res.json(speak('Sorry, I did not catch that. Please say it again.'));
   // Same rule as every StoreYog voice view: any sentence containing the word "stop" ends listening.
   if(/\bstop\b/i.test(text)){sessions.delete(alexaSession);return res.json(speak('Goodbye. Have a good evening.',true));}
   const said=text.slice(0,1000);
   if(WANTS_VIDEO.test(said))return res.json(screen?playVideo('Here is the StoreYog demo.'):speak('The demo video needs a screen. You can watch it at storeyog dot dlyog dot com. What else can I help with?'));
   if(WANTS_PLACE.test(said)&&!s.pending){const shelf=await shelfFor(said);if(shelf?.count){const reply=shelf.summary.replace(/\.\.$/,'.');return res.json(speak(reply,false,screen?(shelf.item?shelfScreen(shelf.item,reply,origin()):answerScreen(said,reply)):undefined));}}
   if(!s.pending&&!STORE_TOPIC.test(said)&&!asksAboutStock(said)){const reply=await generalAnswer(s,said).catch(()=>'Sorry, I could not answer that right now.');return res.json(speak(reply,false,screen?answerScreen(said,reply):undefined));}
   const reply=await ask(options.runAgent,s,said,timeout);
   if(!screen)return res.json(speak(reply));
   const shelf=asksAboutStock(said)?await shelfFor(said):null;
   return res.json(speak(reply,false,shelf?.item&&shelf.count===1?shelfScreen(shelf.item,reply,origin()):answerScreen(said,reply)));
  }catch(e){console.error('Classic Alexa:',e instanceof Error?e.message:'failed');return res.json(speak('Sorry, something went wrong. Please try again.'));}
 });
 return router;
}
