import {modelAuditSchema,startModelAudit,finishModelAudit} from './model-audit.js';
import {z} from 'zod';
import {demoAudit} from './demo-audit.js';
import {seedDemoShelves} from './demo-shelves.js';
import {customerRouter,createCustomerServer} from './customer.js';
import express from 'express';
import {createServer} from './tools.js';
import {Store,storeDate} from './store.js';
import {getDatabase} from './database.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {config} from './config.js';
import {initializeIdentity,authenticate,bearer} from './auth.js';
import {recordCall,securityEvent,type CallContext} from './observability.js';
import {ownerRouter} from './owner.js';
import {StoreOAuth} from './oauth.js';
import {adminRouter} from './admin.js';
const credentials=initializeIdentity();modelAuditSchema(getDatabase());
await seedDemoShelves(getDatabase(),credentials.storeId,credentials.storeName);
const app=express();app.disable('x-powered-by');if(process.env.TRUST_PROXY)app.set('trust proxy',process.env.TRUST_PROXY);app.use('/client/llm-audit',express.json({limit:'1mb'}));app.use('/store/api/photos',express.json({limit:'9mb'}));app.use(express.json({limit:'100kb'}));
app.get('/health',(_req,res)=>res.json({ok:true,service:'storeyog-mcp',protocol:'2025-11-25',authentication:'Bearer',storage:'SQLite'}));
app.use('/console',adminRouter(credentials.adminKey));
app.use('/store',ownerRouter(credentials));app.use('/shop',customerRouter());
app.get('/client/identity',(req,res)=>{const identity=authenticate(bearer(req));if(!identity)return res.status(401).json({error:'Store authentication required.'});res.json({storeId:identity.storeId,storeName:identity.storeName,scopes:identity.scopes,demo:getDatabase().one('SELECT kind FROM store_profiles WHERE store_id=?',[identity.storeId])?.kind==='demo'});});
app.post('/client/llm-audit',(req,res)=>{const identity=authenticate(bearer(req));if(!identity||!identity.scopes.includes('inventory:read')||req.get('x-storeyog-internal')!==credentials.internalToken)return res.status(403).json({error:'Internal model audit only.'});try{if(req.body?.phase==='start'){const input=z.object({conversationId:z.string().max(100),provider:z.string().max(50),model:z.string().max(200),request:z.unknown()}).parse(req.body);return res.json({id:startModelAudit(getDatabase(),identity.storeId,{...input,request:input.request})});}const input=z.object({id:z.string().uuid(),ms:z.number().min(0),response:z.unknown().optional(),error:z.string().max(2000).optional()}).parse(req.body);finishModelAudit(getDatabase(),identity.storeId,input.id,input);res.json({id:input.id});}catch{res.status(400).json({error:'Invalid model audit record.'});}});
app.get('/client/demo-audit',(req,res)=>{const identity=authenticate(bearer(req));if(!identity||!identity.scopes.includes('inventory:read'))return res.status(401).json({error:'Store authentication required.'});try{res.set('Cache-Control','no-store').json(demoAudit(getDatabase(),identity.storeId));}catch{res.status(403).json({error:'Synthetic demo audit only.'});}});
app.post('/internal/reset',(req,res)=>{
 const identity=authenticate(bearer(req));if(req.get('x-storeyog-internal')!==credentials.internalToken||!identity||!identity.scopes.includes('inventory:write'))return res.status(403).json({error:'Authorized internal reset only.'});
 res.json(new Store(storeDate,getDatabase(),identity.storeId,identity.storeName).reset());
});
app.use('/mcp',(req,res,next)=>{
 const allowed=(process.env.MCP_ALLOWED_ORIGINS||`http://localhost:${config.webPort},http://127.0.0.1:${config.webPort}`).split(',');for(const value of [process.env.PUBLIC_WEB_ORIGIN,process.env.OAUTH_ISSUER_URL])if(value)allowed.push(new URL(value).origin);
 if(req.headers.origin&&!allowed.includes(req.headers.origin))return res.status(403).json({jsonrpc:'2.0',id:null,error:{code:-32000,message:'Origin not allowed.'}});
 const identity=authenticate(bearer(req));if(!identity){securityEvent('mcp_auth_denied');return res.status(401).json({jsonrpc:'2.0',id:req.body?.id??null,error:{code:-32001,message:'A valid store-scoped Bearer token is required.'}});}
 res.locals.identity=identity;next();
});
app.post('/mcp',async(req,res)=>{
 const start=performance.now();const ctx:CallContext={id:crypto.randomUUID(),conversationId:/^[a-zA-Z0-9_-]{1,100}$/.test(req.get('x-storeyog-conversation')||'')?req.get('x-storeyog-conversation'):undefined,identity:res.locals.identity,queries:[],summary:'',invoked:false};
 const isTool=req.body?.method==='tools/call';const chunks:Buffer[]=[];
 // Capture SDK-level schema/unknown-tool errors too; validation can fail before our tool handler runs.
 const write=res.write.bind(res);const end=res.end.bind(res);
 res.write=((chunk:any,...args:any[])=>{if(isTool&&chunk)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));return (write as any)(chunk,...args);}) as any;
 res.end=((chunk:any,...args:any[])=>{if(isTool&&chunk)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));return (end as any)(chunk,...args);}) as any;
 res.on('finish',()=>{if(!isTool)return;try{const body=JSON.parse(Buffer.concat(chunks).toString());if(body.error||body.result?.isError){ctx.error ||= body.error?.message||body.result?.content?.find((c:any)=>c.type==='text')?.text||'Tool request failed';}ctx.summary ||= ctx.error||'Tool completed';recordCall(ctx,req.body.method,req.body.params?.name,req.body.params?.arguments,performance.now()-start);}catch(e){console.error('Audit recording failed:',e instanceof Error?e.message:'unknown error');}});
 const server=ctx.identity.scopes.includes('customer:read')&&!ctx.identity.scopes.includes('inventory:read')?createCustomerServer(ctx):createServer(ctx);const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});res.on('close',()=>{void transport.close();void server.close();});await server.connect(transport);await transport.handleRequest(req,res,req.body);
});
app.all('/mcp',(_req,res)=>res.status(405).set('Allow','POST').json({jsonrpc:'2.0',id:null,error:{code:-32000,message:'Stateless server: use POST.'}}));
app.use((error:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(!res.headersSent)res.status(400).json({error:error.message});});
app.listen(config.port,process.env.APP_BIND||'127.0.0.1',()=>console.log(`StoreYog MCP http://localhost:${config.port}/mcp\nAdmin console http://localhost:${config.port}/console/\nLocal bootstrap credentials: .runtime/credentials.json (private; never sent to the simulator browser)`));

// One MCP implementation, with an OAuth-only public ingress. Private UI/API routes are never mounted here.
const publicApp=express();publicApp.disable('x-powered-by');if(process.env.TRUST_PROXY)publicApp.set('trust proxy',process.env.TRUST_PROXY);
publicApp.use(express.json({limit:'100kb'}));
const oauth=new StoreOAuth();publicApp.use(oauth.router());
publicApp.get('/health',(_req,res)=>res.json({ok:true,service:'storeyog-public-mcp',authentication:'OAuth 2.1 + PKCE S256'}));
publicApp.use('/mcp',async(req,res,next)=>{try{await oauth.verifyAccessToken(bearer(req));next();}catch{securityEvent('oauth_mcp_denied');res.status(401).json({error:'OAuth access token required.'});}});
publicApp.all('/mcp',(req,res)=>app(req,res));
publicApp.use((_req,res)=>res.status(404).json({error:'Not found.'}));
publicApp.listen(Number(process.env.PUBLIC_MCP_PORT||3102),process.env.PUBLIC_MCP_BIND||'127.0.0.1',()=>console.log(`OAuth-only MCP ingress http://${process.env.PUBLIC_MCP_BIND||'127.0.0.1'}:${process.env.PUBLIC_MCP_PORT||3102}/mcp · canonical ${oauth.resource.href}`));
