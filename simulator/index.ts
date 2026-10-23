import {oauthIngressProxy} from './oauth-proxy.js';
import {demoRoleTurn} from './demo-role.js';
import {storeProxy} from './store-proxy.js';
import {transcribe,synthesize} from '../server/ai-services.js';
import {labFetch} from '../server/lab-http.js';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../server/config.js';
import {runAgent,type Session} from './agent.js';
const app=express();if(process.env.TRUST_PROXY)app.set('trust proxy',process.env.TRUST_PROXY);app.disable('x-powered-by');app.use(oauthIngressProxy);
// Optional classic Alexa skill (classical-alexa/); off unless CLASSIC_ALEXA_ENABLED=true. Mounted before the JSON parser so the signed raw body is verified.
if(process.env.CLASSIC_ALEXA_ENABLED==='true'){const {classicAlexaRouter}=await import('../classical-alexa/skill-handler.js');app.use('/alexa',classicAlexaRouter({runAgent,skillId:process.env.CLASSIC_ALEXA_SKILL_ID,skipVerification:process.env.CLASSIC_ALEXA_SKIP_VERIFY==='true'}));}
app.use('/store/api/photos',express.json({limit:'9mb'}));app.use(express.json({limit:'32kb'}));
// Explicit public origin supports TLS termination without trusting arbitrary forwarding headers.
const publicWebOrigin=process.env.PUBLIC_WEB_ORIGIN?new URL(process.env.PUBLIC_WEB_ORIGIN).origin:undefined;
// Same-origin mutations, including microphone uploads. No cross-origin app control.
app.use('/api',(req,res,next)=>{const origin=req.get('origin');if(origin&&origin!==`${req.protocol}://${req.get('host')}`&&origin!==publicWebOrigin)return res.status(403).json({error:'Cross-origin requests are not allowed.'});next();});
const sessions=new Map<string,Session>();
setInterval(()=>{for(const [id,s] of sessions)if(!s.busy&&Date.now()-s.updatedAt>3600_000)sessions.delete(id);},300_000).unref();
function session(req:express.Request,res:express.Response){
 const cookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('sp_session='))?.slice(11);
 let s=cookie?sessions.get(cookie):undefined;
 if(!s){if(sessions.size>=1000)throw new Error('Too many active sessions. Try again later.');const id=crypto.randomUUID();s={id,updatedAt:Date.now(),busy:false,history:[],pending:null};sessions.set(id,s);res.cookie('sp_session',id,{httpOnly:true,sameSite:'strict',maxAge:3600_000,secure:process.env.COOKIE_SECURE==='true'});}
 s.updatedAt=Date.now();return s;
}
app.use('/store',storeProxy);app.use('/shop',storeProxy);
app.get('/api/status',async(_req,res)=>{
 const probe=async(url:string)=>{if(url.startsWith('/'))return false;try{return (await labFetch(url,{signal:AbortSignal.timeout(2500)})).ok;}catch{return false;}};
 const mcp=await probe(config.mcpUrl.replace(/\/mcp$/,'/health'));const stt=!!config.sttUrl,tts=!!config.ttsUrl,llm=!!config.llmUrl||config.simulatorLlmProtocol==='storeyog-small'; // Functional provider checks are performed by setup.py --live.

 let storeInfo:any={};try{const identity=await fetch(new URL('/client/identity',config.mcpUrl),{headers:{Authorization:`Bearer ${config.mcpApiKey}`},signal:AbortSignal.timeout(3000)});if(identity.ok)storeInfo=await identity.json();}catch{}
 res.json({mcp,stt,tts,llm,...storeInfo,authenticated:!!storeInfo.storeId,consoleUrl:process.env.MCP_CONSOLE_URL||new URL('/console/',config.mcpUrl).href,demoMode:process.env.DEMO_MODE!=='false',provider:process.env.DEMO_MODE!=='false'?'scripted':process.env.ANTHROPIC_API_KEY?'anthropic':'local',model:process.env.ANTHROPIC_API_KEY?config.claudeModel:config.llmModel,voice:config.ttsVoice,timezone:config.timezone});
});
app.get('/api/demo-audit',(_req,res)=>res.status(401).json({error:'Sign in at /store/admin to view audit records.'}));
app.post('/api/chat',async(req,res)=>{
 const {message,scripted=false}=req.body||{};
 if(typeof message!=='string'||!message.trim()||message.length>4000||typeof scripted!=='boolean')return res.status(400).json({error:'Send a message of 1–4000 characters and an optional scripted boolean.'});
 const s=session(req,res);if(s.busy)return res.status(409).json({error:'The assistant is still handling your last request.'});s.busy=true;
 res.set({'Content-Type':'application/x-ndjson','Cache-Control':'no-cache','X-Accel-Buffering':'no'});res.flushHeaders();
 const emit=(event:Record<string,unknown>)=>{if(!res.destroyed)res.write(JSON.stringify(event)+'\n');};
 try{await runAgent(s,message.trim(),scripted||process.env.DEMO_MODE!=='false',emit);}
 catch(error){console.error('Chat:',error instanceof Error?error.message:'failed');emit({type:'error',error:error instanceof Error?error.message:'The assistant could not finish. Please retry.'});}
 finally{s.busy=false;s.updatedAt=Date.now();res.end();}
});
// Separate synthetic demo conversation. PIN never grants access to registered business stores.
app.post('/api/demo-conversation',async(req,res)=>{
 if(process.env.MCP_DEMO_LOGIN!=='true')return res.status(404).end();
 const text=req.body?.message;if(typeof text!=='string'||text.length>1000||!text.trim())return res.status(400).json({error:'Provide a short message.'});
 const s=session(req,res);if(s.busy)return res.status(409).json({error:'Wait for the current reply.'});s.busy=true;
 try{const identity=await fetch(new URL('/client/identity',config.mcpUrl),{headers:{Authorization:`Bearer ${config.mcpApiKey}`}});const who=await identity.json() as any;if(who.storeId!=='little-india'||who.demo!==true)return res.status(403).json({error:'PIN walkthrough is available only for the fictitious demo store.'});
 const turn=demoRoleTurn(s.demoRole,text);s.demoRole=turn.state;let result:any={reply:turn.reply,stage:turn.state.stage,traces:[],demo:true};
 if(turn.execute&&turn.state.stage==='customer'&&/^(?:perfect[,.! ]*)?(?:thank you|thanks)[.! ]*$/i.test(text)){result.reply='You are welcome. Happy shopping!';}
 else if(turn.execute&&turn.state.stage==='customer'){const r=await fetch(new URL('/shop/raj-demo/api/search?q='+encodeURIComponent(text),config.mcpUrl));if(!r.ok)throw Error('Customer finder unavailable.');const catalog=await r.json() as any;result={...result,reply:catalog.summary,catalog,traces:catalog.audit?.requestId?[{requestId:catalog.audit.requestId,name:'find_product'}]:[]};}
 else if(turn.execute&&turn.state.stage==='owner'){const events:any[]=[];await runAgent(s,text,true,e=>events.push(e));const done=events.find(e=>e.type==='done');if(!done)throw Error('Owner response did not finish.');result={...result,reply:done.reply,pending:done.pendingConfirmation,traces:events.filter(e=>e.type==='tool_result')};const sent=result.traces.find((t:any)=>t.name==='send_sales_report'&&!t.isError);if(sent)s.demoMail=sent.result;}
 res.set('Cache-Control','no-store').json(result);
 }catch(e){res.status(503).json({error:e instanceof Error?e.message:'Demo request failed.'});}finally{s.busy=false;s.updatedAt=Date.now();}
});
app.get('/api/demo-mailbox',(req,res)=>{if(process.env.SMTP_DEMO_CAPTURE!=='true')return res.status(404).end();const s=session(req,res);if(s.demoRole?.stage!=='owner'||s.demoRole.expires<Date.now()||!s.demoMail)return res.status(403).json({error:'Open the owner demo and prepare a sales email first.'});res.set('Cache-Control','no-store').json(s.demoMail);});
app.post('/api/reset',async(req,res)=>{
 if([...sessions.values()].some(s=>s.busy))return res.status(409).json({error:'Wait for the current request to finish before resetting.'});
 try{const url=new URL('/internal/reset',config.mcpUrl);const r=await fetch(url,{method:'POST',headers:{'x-storeyog-internal':config.internalToken,Authorization:`Bearer ${config.mcpApiKey}`},signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error(`MCP reset returned ${r.status}. Start both services with npm run dev.`);sessions.clear();res.clearCookie('sp_session');res.json(await r.json());}catch(e){res.status(503).json({error:e instanceof Error?e.message:'Reset failed.'});}
});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:12*1024*1024,files:1}});
// Whisper turns room noise or speaker echo into repeated filler, such as one token repeated dozens of times or a run of non-Latin symbols. Drop it instead of sending it to the assistant.
function speechOrNoise(text:string){const t=text.trim();const words=t.split(/\s+/).filter(Boolean);const latin=(t.match(/[a-z]/gi)||[]).length;if(!latin||latin<t.replace(/[\s\p{P}\d]/gu,'').length*.5)return '';if(words.length>=6&&new Set(words.map(w=>w.toLowerCase())).size/words.length<.3)return '';return t;}
app.post('/api/stt',upload.single('audio'),async(req,res)=>{
 if(!req.file)return res.status(400).json({error:'Attach microphone audio using the audio field.'});
 try{res.json({transcript:speechOrNoise(await transcribe(new Uint8Array(req.file.buffer),req.file.mimetype,req.file.originalname||'recording.webm'))});}catch(e){res.status(502).json({error:`Speech recognition unavailable: ${e instanceof Error?e.message:'unknown error'}. You can type your request.`});}
});
app.post('/api/tts',async(req,res)=>{
 const text=req.body?.text;if(typeof text!=='string'||!text.trim()||text.length>3000)return res.status(400).json({error:'Provide 1–3000 characters of text.'});
 try{const output=await synthesize(text);res.type(output.type).set('Cache-Control','no-store').send(output.data);}catch(e){res.status(502).json({error:`Voice playback unavailable: ${e instanceof Error?e.message:'unknown error'}. The reply is shown on screen.`});}
});
app.get('/api/acknowledgement',async(_req,res)=>{try{const output=await synthesize('Let me check the details.');res.type(output.type).set('Cache-Control','no-store').send(output.data);}catch{res.status(503).json({error:'Optional speech is not configured. Replies are shown as text.'});}});
const simulatorDir=path.dirname(fileURLToPath(import.meta.url));
const projectRoot=path.resolve(simulatorDir,'..');
app.get('/api/judge',async(req,res)=>{
 const browserUrl=new URL(`${req.protocol}://${req.get('host')}`);browserUrl.port=String(config.port);browserUrl.pathname='/mcp';
 const mcpUrl=process.env.PUBLIC_MCP_URL||(process.env.MCP_CONSOLE_URL?new URL('/mcp',process.env.MCP_CONSOLE_URL).href:process.env.MCP_SERVER_URL)||browserUrl.href;
 const consoleUrl=process.env.MCP_CONSOLE_URL||new URL('/console/',mcpUrl).href;
 let online=false;try{online=(await fetch(new URL('/health',config.mcpUrl),{signal:AbortSignal.timeout(2000)})).ok;}catch{}
 res.set('Cache-Control','no-store').json({mcpUrl,consoleUrl:'/store/admin',storeUrl:'/store/',judgeDemoLogin:process.env.MCP_DEMO_LOGIN==='true',healthUrl:new URL('/health',mcpUrl).href,online});
});
app.get('/preview-notice.js',(_req,res)=>res.set('Cache-Control','no-cache').sendFile(path.join(simulatorDir,'shared','preview-notice.js')));
app.get('/',(_req,res)=>res.sendFile(path.join(simulatorDir,'landing','index.html')));
app.get('/experience/mailbox',(_req,res)=>{if(process.env.SMTP_DEMO_CAPTURE!=='true')return res.status(404).end();res.sendFile(path.join(simulatorDir,'experience','mailbox.html'));});
app.get('/audit',(req,res)=>res.redirect(302,'/store/admin'+(req.originalUrl.includes('?')?'?'+req.originalUrl.split('?').slice(1).join('?'):'')));
app.use('/audit-assets',(_req,res)=>res.status(404).end());
app.get('/experience',(_req,res)=>res.sendFile(path.join(simulatorDir,'experience','index.html')));
app.use('/experience-assets',express.static(path.join(simulatorDir,'experience')));
app.get(['/simulator','/simulator/'],(_req,res)=>res.sendFile(path.join(simulatorDir,'public','index.html')));
app.use('/landing',express.static(path.join(simulatorDir,'landing')));
// Videos remain hosted; no generated audio/video or private recording assets ship here.
const resources:Record<string,string>={readme:'README.md','alexa-deploy':'docs/ARCHITECTURE.md',verification:'docs/TESTING.md','demo-guide':'docs/JUDGE_GUIDE.md'};
app.get('/resources/:name',(req,res)=>{const file=resources[String(req.params.name)];if(!file)return res.status(404).end();res.type('text/plain').sendFile(path.join(projectRoot,file));});
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)),'public')));
app.use((error:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(400).json({error:error.message});});
app.listen(config.webPort,process.env.APP_BIND||'127.0.0.1',()=>console.log(`StoreYog judge landing http://localhost:${config.webPort}/\nEcho Simulator http://localhost:${config.webPort}/simulator`));
