import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {getDatabase} from './database.js';
import {bearer,secretEqual,provisionKey,ALL_SCOPES} from './auth.js';
import {snapshot,securityEvent} from './observability.js';
import {Store,storeDate} from './store.js';
export function adminRouter(adminKey:string){
 const router=express.Router();const sessions=new Map<string,number>();const attempts=new Map<string,{count:number;since:number}>();
 const admin=(req:express.Request)=>{if(secretEqual(bearer(req),adminKey))return true;const cookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('sp_admin='))?.slice(9);return !!cookie&&(sessions.get(cookie)||0)>Date.now();};
 router.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');const origin=req.get('origin');if(origin&&origin!==`${req.protocol}://${req.get('host')}`)return res.status(403).json({error:'Cross-origin request denied.'});next();});
 router.get('/api/login-options',(_req,res)=>res.json({demoEnabled:process.env.MCP_DEMO_LOGIN==='true'}));
 router.post('/api/login',(req,res)=>{
  const ip=req.ip||'unknown';let state=attempts.get(ip);if(!state||Date.now()-state.since>900_000){state={count:0,since:Date.now()};attempts.set(ip,state);}if(++state.count>10)return res.status(429).json({error:'Too many attempts. Try again in 15 minutes.'});
  const judgeLogin=process.env.MCP_DEMO_LOGIN==='true'&&req.body?.profile==='judge-demo';
  if(!judgeLogin&&(typeof req.body?.key!=='string'||!secretEqual(req.body.key,adminKey))){securityEvent('admin_login_denied');return res.status(401).json({error:'Invalid admin credential.'});}
  attempts.delete(ip);for(const [id,expiry]of sessions)if(expiry<Date.now())sessions.delete(id);const id=crypto.randomUUID();sessions.set(id,Date.now()+3600_000);res.cookie('sp_admin',id,{httpOnly:true,sameSite:'strict',secure:process.env.COOKIE_SECURE==='true',maxAge:3600_000,path:'/console'});res.json({ok:true});
 });
 router.use('/api',(req,res,next)=>{if(!admin(req))return res.status(401).json({error:'Admin sign-in required.'});next();});
 router.post('/api/logout',(req,res)=>{const id=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('sp_admin='))?.slice(9);if(id)sessions.delete(id);res.clearCookie('sp_admin',{path:'/console'});res.json({ok:true});});
 router.get('/api/overview',(req,res)=>{const id=typeof req.query.store==='string'?req.query.store:undefined;res.json(snapshot(id));});
 router.post('/api/stores',(req,res)=>{
  const input=z.object({name:z.string().trim().min(2).max(80),id:z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/).optional()}).safeParse(req.body);if(!input.success)return res.status(400).json({error:'Enter a store name (2–80 characters) and optional lowercase store ID.'});
  const db=getDatabase();const id=input.data.id||`store-${crypto.randomUUID().slice(0,8)}`;if(db.one('SELECT id FROM stores WHERE id = ?',[id]))return res.status(409).json({error:'Store ID already exists.'});
  const result=db.transaction(()=>{new Store(storeDate,db,id,input.data.name);return provisionKey(db,id,'Initial client');});res.status(201).json({...result,name:input.data.name});
 });
 router.post('/api/stores/:id/keys',(req,res)=>{
  const input=z.object({label:z.string().trim().min(1).max(80),scopes:z.array(z.enum(ALL_SCOPES)).min(1).max(4)}).safeParse(req.body);if(!input.success)return res.status(400).json({error:'Provide a label and one or more valid scopes.'});
  const db=getDatabase();if(!db.one('SELECT id FROM stores WHERE id = ?',[req.params.id]))return res.status(404).json({error:'Store not found.'});res.status(201).json(provisionKey(db,String(req.params.id),input.data.label,input.data.scopes));
 });
 router.delete('/api/keys/:id',(req,res)=>{const result=getDatabase().run('UPDATE api_keys SET revoked = 1 WHERE id = ?',[req.params.id]);res.status(result.changes?200:404).json(result.changes?{ok:true}:{error:'Key not found.'});});
 router.patch('/api/stores/:id',(req,res)=>{if(typeof req.body?.active!=='boolean')return res.status(400).json({error:'Provide an active boolean.'});const result=getDatabase().run('UPDATE stores SET active = ? WHERE id = ?',[req.body.active?1:0,req.params.id]);res.status(result.changes?200:404).json(result.changes?{ok:true}:{error:'Store not found.'});});
 router.get('/preview-notice.js',(_req,res)=>res.set('Cache-Control','no-cache').sendFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../simulator/shared/preview-notice.js')));
 router.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)),'console')));
 return router;
}
