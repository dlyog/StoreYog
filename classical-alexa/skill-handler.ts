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
import {asksAboutStock,normalizeSpoken} from '../simulator/inventory-query.js';
import {catalogQuestion} from '../server/catalog-query.js';
import {withModelAudit} from '../simulator/model-audit.js';
import {config} from '../server/config.js';
import {labFetch} from '../server/lab-http.js';
import {completionUrl,completionHeaders} from '../server/ai-services.js';
import {readFileSync} from 'node:fs';
import {SUGGESTIONS,supportsApl,welcomeScreen,answerScreen,shelfScreen,videoScreen,guideScreen} from './apl.js';

type Emit=(event:Record<string,any>)=>void;
type RunAgent=(session:Session,text:string,scripted:boolean,emit:Emit)=>Promise<unknown>;
type Options={runAgent:RunAgent;skillId?:string;skipVerification?:boolean;replyTimeoutMs?:number};

const LAUNCH_TEXT='Alexa, open StoreYog';
const REPROMPT='What else would you like to know about your store?';
const GREETING=`Hello, I am your Virtual Store Assistant! You can ask me: ${SUGGESTIONS.map(s=>s.replace(/[?.]$/,'')).join('; ')}. You can also ask me anything else. How can I help?`;
const HELP=`You can ask me: ${SUGGESTIONS.map(s=>s.replace(/[?.]$/,'')).join('; ')}. Say stop to finish.`;
const origin=()=>(process.env.PUBLIC_WEB_ORIGIN||'https://storeyog.dlyog.com').replace(/\/$/,'');
// Echo Show VideoApp plays at most 1280x720: serve the 720p H.264 Main encode (see docs/pitch-v7/README.md).
const DEMO_VIDEO=fileURLToPath(new URL('../docs/pitch-v7/storeyog-live-720p.mp4',import.meta.url));
const WELCOME_ART=fileURLToPath(new URL('../simulator/landing/assets/store-owner-evening.webp',import.meta.url));
const WANTS_VIDEO=/\b(?:play|show|watch|start|open)\b.*\b(?:demo|video|film|pitch)\b/i;
const WANTS_PLACE=/\b(?:where|which\s+(?:aisle|shelf)|find|locate)\b/i;
const WANTS_IMAGE=/\b(?:show|see|display|view)\b.*\b(?:image|photo|picture|pic|shelf|it|that|this|them)\b|\b(?:image|photo|picture)\s+of\b/i;
// Catalog words (after normalizing spoken spellings) mark a store question unless it is clearly a general one.
const PRODUCT=/\b(?:rice|basmati|dal|toor|chana|moong|masoor|urad|rajma|kabuli|atta|besan|sooji|poha|jaggery|ghee|ginger|oil|coconut|mustard|onions?|potatoes?|tomatoes?|chilies|chili|cilantro|paneer|dahi|milk|parathas?|samosas?|wrappers?|pickle|papad|tea|turmeric|cumin|coriander|cardamom|masala)\b/i;
const GENERAL_HINT=/\b(?:cook|recipe|dish|make\s+with|fact|healthy|health|benefits?|nutrition|calories|history|origin|joke|weather|capital|why|who)\b/i;
const lastProduct=new Map<string,string>();

// Original audio guides (audio-guides/): inventory, small business, and food/nutrition for the store's items.
type Guide={id:string;category:string;title:string;keywords:string[]};
const GUIDES:Guide[]=JSON.parse(readFileSync(fileURLToPath(new URL('./audio-guides/guides.json',import.meta.url)),'utf8')).guides;
const GUIDE_DIR=fileURLToPath(new URL('./audio-guides/audio/',import.meta.url));
const lastGuide=new Map<string,string>();
const WANTS_GUIDE_LIST=/\b(?:what|which|list)\b.*\b(?:guides?|tips|audio)\b/i;
const WANTS_GUIDE=/\b(?:play|listen|hear|give\s+me|tell\s+me|another|next)\b.*\b(?:tips?|guides?|guidance|advice|lessons?|audio|episodes?)\b|\bnext\s+(?:one|tip|guide)\b|\banother\s+one\b|\bguide\s+(?:number\s+)?\d+\b/i;
const NUTRITION=/\b(?:protein|carbs?|carbohydrates?|fib(?:er|re)|fats?|calories|nutrition(?:al)?|nutrients?|healthy|healthier|health|benefits?|vitamins?|iron|calcium|diet)\b/i;
const NUMBER_WORDS:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30};
function categoryOf(text:string){if(NUTRITION.test(text)||/\b(?:food|nutrition|eat|eating)\b/i.test(text))return 'food';if(/\b(?:business|grow|growth|cash|marketing|customers?|pricing|price|margin|staff|hiring|suppliers?)\b/i.test(text))return 'business';if(/\b(?:inventory|stock|reorder|shelf|shelves|counting|expiry)\b/i.test(text))return 'inventory';return '';}
// Picks a guide: an explicit number, "next" in the same set, the best keyword match, or the first in a set.
function pickGuide(text:string,alexaSession:string):Guide|undefined{
 const t=normalizeSpoken(text),num=/\bguide\s+(?:number\s+)?(\d+|[a-z]+(?:[\s-][a-z]+)?)\b/.exec(t)?.[1];
 if(num){const n=/^\d+$/.test(num)?Number(num):num.split(/[\s-]/).reduce((sum,w)=>sum+(NUMBER_WORDS[w]||0),0);const g=GUIDES.find(x=>Number(x.id)===n);if(g)return g;}
 const category=categoryOf(t),last=GUIDES.find(g=>g.id===lastGuide.get(alexaSession));
 if(/\b(?:next|another)\b/.test(t)&&last){const pool=GUIDES.filter(g=>g.category===(category||last.category));return pool[(pool.indexOf(last)+1)%pool.length]||pool[0];}
 const scored=GUIDES.filter(g=>!category||g.category===category).map(g=>({g,score:g.keywords.reduce((sum,k)=>sum+(new RegExp('\\b'+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b').test(t)?(k.includes(' ')?2:PRODUCT.test(k)?3:1):0),0)})).sort((a,b)=>b.score-a.score);
 if(scored[0]?.score)return scored[0].g;
 return category?GUIDES.find(g=>g.category===category&&g.id!==last?.id):undefined;
}
const escapeSsml=(text:string)=>text.replace(/&/g,'and').replace(/[<>"]/g,'');
// Plays a guide inside the conversation (SSML audio, under the 240 s limit), then invites the next request.
function playGuide(guide:Guide,alexaSession:string,screen:boolean){
 lastGuide.set(alexaSession,guide.id);
 const ssml=`<speak>Here is guide ${Number(guide.id)}: ${escapeSsml(guide.title)}. <audio src="${origin()}/alexa/media/guide/${guide.id}.mp3"/> <break time="400ms"/>Would you like another tip, or something else?</speak>`;
 return {version:'1.0',response:{outputSpeech:{type:'SSML',ssml},reprompt:{outputSpeech:{type:'PlainText',text:'Say next tip, or ask me about your store.'}},...(screen?{directives:[guideScreen(guide,GUIDES.length)]}:{}),shouldEndSession:false}};
}
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
// Native Echo Show player (VideoApp interface): one directive, no reprompt, no shouldEndSession.
const launchVideo=()=>({version:'1.0',response:{directives:[{type:'VideoApp.Launch',videoItem:{source:origin()+'/alexa/media/demo.mp4',metadata:{title:'StoreYog demo',subtitle:'Live walkthrough of the store assistant'}}}]}});

// Published shelf details for a product (the customer finder's read-only find_product projection).
async function shelfFor(text:string){
 try{const r=await fetch(new URL('/shop/raj-demo/api/search?q='+encodeURIComponent(normalizeSpoken(text)),config.mcpUrl),{signal:AbortSignal.timeout(2500)});if(!r.ok)return null;
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
 router.get('/media/guide/:id.mp3',(req,res)=>{const id=String(req.params.id);if(!GUIDES.some(g=>g.id===id))return res.status(404).end();res.sendFile(path.join(GUIDE_DIR,id+'.mp3'),{headers:{'Cache-Control':'public, max-age=86400'}},error=>{if(error&&!res.headersSent)res.status(404).end();});});
 router.get('/media/welcome.jpg',(_req,res)=>{jpeg(res,WELCOME_ART);});
 router.get('/media/photo/:id.jpg',async(req,res)=>{const id=String(req.params.id);if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(404).end();
  try{const r=await fetch(new URL('/shop/raj-demo/api/photos/'+id,config.mcpUrl),{signal:AbortSignal.timeout(4000)});if(!r.ok)return res.status(404).end();jpeg(res,Buffer.from(await r.arrayBuffer()));}catch{res.status(404).end();}});
 router.get('/media/demo.mp4',(req,res)=>{console.log(`Classic Alexa: video fetch range=${req.get('range')||'none'}`);res.sendFile(DEMO_VIDEO,{headers:{'Cache-Control':'public, max-age=3600'}},error=>{if(error&&!res.headersSent)res.status(404).end();});});
 router.post('/',express.raw({type:'*/*',limit:'64kb'}),async(req,res)=>{
  const raw=Buffer.isBuffer(req.body)?req.body:Buffer.from('');let body:any;
  try{body=JSON.parse(raw.toString('utf8'));}catch{return res.status(400).json({error:'Invalid JSON.'});}
  if(!options.skipVerification){try{await verifyAlexaRequest(req.headers,raw,body,options.skillId);}catch(e){console.warn('Classic Alexa: rejected request:',e instanceof Error?e.message:e);return res.status(400).json({error:'Request verification failed.'});}}
  const request=body?.request||{},alexaSession=body?.session?.sessionId||body?.context?.System?.device?.deviceId||'unknown';
  const interfaces=Object.keys(body?.context?.System?.device?.supportedInterfaces||{});
  // Diagnostics without user content: request kind, screen interfaces, directives sent, Alexa's error reports.
  const send=res.json.bind(res);res.json=(out:any)=>{console.log(`Classic Alexa: ${request.type}${request.intent?.name?' '+request.intent.name:''} interfaces=[${interfaces.join(',')}] -> ${(out?.response?.directives||[]).map((d:any)=>d.type).join(',')||'speech'}`);return send(out);};
  if(request.type==='SessionEndedRequest'&&request.error)console.warn(`Classic Alexa: Alexa reported ${request.error.type}: ${request.error.message}`);
  try{
   if(request.type==='SessionEndedRequest'){sessions.delete(alexaSession);lastProduct.delete(alexaSession);lastGuide.delete(alexaSession);return res.json({version:'1.0',response:{}});}
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
   const said=text.slice(0,1000),plain=normalizeSpoken(said),video=interfaces.includes('VideoApp');
   if(WANTS_VIDEO.test(said))return res.json(video?launchVideo():screen?playVideo('Here is the StoreYog demo.'):speak('The demo video needs a screen. You can watch it at storeyog dot dlyog dot com. What else can I help with?'));
   if(WANTS_GUIDE_LIST.test(said)&&!s.pending){const count=(c:string)=>GUIDES.filter(g=>g.category===c).length;const reply=`I have ${GUIDES.length} short audio guides: ${count('inventory')} on inventory management, ${count('business')} on running a successful small business, and ${count('food')} on food and nutrition for our products. Say play an inventory tip, play a business tip, or ask something like is paneer high in protein.`;return res.json(speak(reply,false,screen?answerScreen(said,reply):undefined));}
   if((WANTS_GUIDE.test(said)||(NUTRITION.test(plain)&&!/\b(?:how\s+(?:much|many)|in\s+stock|available|where)\b/i.test(said)))&&!s.pending){const guide=pickGuide(said,alexaSession);if(guide)return res.json(playGuide(guide,alexaSession,screen));}
   const named=PRODUCT.exec(plain)?.[0];
   // "Show me the image of that": the product named now, or the last one discussed.
   if(catalogQuestion(said)!==null&&!s.pending){const shelf=await shelfFor(said);if(shelf?.summary){const reply=shelf.summary;return res.json(speak(reply,false,screen?answerScreen(said,reply):undefined));}}
   if(WANTS_IMAGE.test(said)&&!s.pending){const product=named?plain:lastProduct.get(alexaSession);if(product){const shelf=await shelfFor(product);if(shelf?.count){const reply=shelf.item?`Here is the ${shelf.item.name} shelf. ${shelf.summary.replace(/\.{2,}/g,'.')}`:shelf.summary;if(shelf.item)lastProduct.set(alexaSession,shelf.item.name);return res.json(speak(reply,false,screen?(shelf.item?shelfScreen(shelf.item,reply,origin()):answerScreen(said,reply)):undefined));}}}
   if(WANTS_PLACE.test(said)&&!s.pending){const shelf=await shelfFor(said);if(shelf?.count){const reply=shelf.summary.replace(/\.{2,}/g,'.');if(shelf.item)lastProduct.set(alexaSession,shelf.item.name);return res.json(speak(reply,false,screen?(shelf.item?shelfScreen(shelf.item,reply,origin()):answerScreen(said,reply)):undefined));}}
   const storeTurn=!!s.pending||STORE_TOPIC.test(said)||asksAboutStock(plain)||(!!named&&!GENERAL_HINT.test(said));
   if(!storeTurn){const reply=await generalAnswer(s,said).catch(()=>'Sorry, I could not answer that right now.');return res.json(speak(reply,false,screen?answerScreen(said,reply):undefined));}
   // A bare product name ("toor dahl") is a stock question about that product.
   const bare=!s.pending&&!STORE_TOPIC.test(said)&&!asksAboutStock(plain)&&!!named;
   const reply=await ask(options.runAgent,s,bare?`how much ${said} is available`:said,timeout);
   const shelf=named?await shelfFor(said):null;if(shelf?.item&&shelf.count===1)lastProduct.set(alexaSession,shelf.item.name);
   if(!screen)return res.json(speak(reply));
   return res.json(speak(reply,false,shelf?.item&&shelf.count===1?shelfScreen(shelf.item,reply,origin()):answerScreen(said,reply)));
  }catch(e){console.error('Classic Alexa:',e instanceof Error?e.message:'failed');return res.json(speak('Sorry, something went wrong. Please try again.'));}
 });
 return router;
}
