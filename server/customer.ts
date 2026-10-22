import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {provisionKey} from './auth.js';
import {config} from './config.js';
import {serveCustomerPhoto} from './photos.js';
import express from 'express';import path from 'node:path';import {fileURLToPath} from 'node:url';import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';import {z} from 'zod';import {getDatabase} from './database.js';import {publicInventory} from './catalog.js';import type {CallContext} from './observability.js';
function search(slug:string,q:string){const db=getDatabase(),result=publicInventory(db,slug,q),store=db.one('SELECT store_id FROM store_profiles WHERE slug=?',[slug]);db.run('INSERT INTO shopper_queries(store_id,matched) VALUES (?,?)',[store!.store_id,result.items.length]);return result;}
const finderKeys=new Map<string,{id:string;key:string}>();
async function mcpSearch(slug:string,query:string){
 const db=getDatabase(),store=db.one('SELECT p.store_id FROM store_profiles p JOIN stores s ON s.id=p.store_id WHERE p.slug=? AND p.public_enabled=1 AND s.active=1',[slug]);if(!store)throw Error('Store finder is not published.');
 let identity=finderKeys.get(store.store_id);
 if(!identity){db.run('UPDATE api_keys SET revoked=1 WHERE store_id=? AND label=?',[store.store_id,'Internal read-only customer finder']);identity=provisionKey(db,store.store_id,'Internal read-only customer finder',['customer:read']);finderKeys.set(store.store_id,identity);}
 const client=new Client({name:'storeyog-customer-finder',version:'1.0.0'});
 try{await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${config.port}/mcp`),{requestInit:{headers:{Authorization:`Bearer ${identity.key}`}}}));const result=await client.callTool({name:'find_product',arguments:{query}},undefined,{timeout:10000});if(result.isError||!result.structuredContent)throw Error('Customer lookup unavailable.');return {...result.structuredContent,audit:{requestId:(result._meta as any)?.requestId,tool:'find_product'}};}
 finally{await client.close();}
}
import {catalogQuestion,catalogAnswer} from './catalog-query.js';
export function customerRouter(){const r=express.Router(),folder=path.join(path.dirname(fileURLToPath(import.meta.url)),'customer');
 r.get('/assets/handsfree.js',(_req,res)=>res.type('application/javascript').sendFile(fileURLToPath(new URL('../simulator/public/handsfree.js',import.meta.url))));
 r.get('/assets/voice-commands.js',(_req,res)=>res.type('application/javascript').sendFile(fileURLToPath(new URL('../simulator/public/voice-commands.js',import.meta.url))));
 r.get('/:slug/api/photos/:id',(req,res)=>serveCustomerPhoto(getDatabase(),req,res));
 r.get('/:slug/api/search',async(req,res)=>{if(req.params.slug.length>60||String(req.query.q||'').length>180)return res.status(400).json({error:'Use a shorter product question.'});try{const q=String(req.query.q||''),section=catalogQuestion(q);
  // "What do you have?" / "what's in dairy?": the published catalog (or one section) through the same MCP tool.
  if(section!==null){const data:any=await mcpSearch(req.params.slug,'');const items=(data.items||[]).filter((i:any)=>!section||String(i.category||'').toLowerCase().includes(section));return res.set('Cache-Control','no-store').json({...data,items,summary:catalogAnswer(data.items||[],section),catalog:true});}
  res.set('Cache-Control','no-store').json(await mcpSearch(req.params.slug,q));}catch{res.status(404).json({error:'This store finder is not published or its lookup service is unavailable.'});}});
 r.get('/:slug',(_req,res)=>res.sendFile(path.join(folder,'index.html')));
 r.use('/assets',express.static(folder));return r;
}
export function createCustomerServer(ctx:CallContext){const server=new McpServer({name:'storeyog-customer',version:'1.0.0'});
 server.registerTool('find_product',{description:'Customer-only product finder. Read public product names, in-stock/out-of-stock availability and owner-published shelf directions. Never returns counts, cost, sales, reports, owner identity or credentials. Cannot update or order anything.',inputSchema:{query:z.string().max(180)},annotations:{readOnlyHint:true,openWorldHint:false}},async({query})=>{ctx.invoked=true;try{if(!ctx.identity.scopes.includes('customer:read'))throw Error('Customer access required.');const p=getDatabase().one('SELECT slug FROM store_profiles WHERE store_id=?',[ctx.identity.storeId]);if(!p)throw Error('Store finder is not published.');const traced=getDatabase().traced(()=>search(p.slug,query));ctx.queries=traced.queries;if(traced.error)throw traced.error;const data=traced.value!;ctx.summary=data.summary;return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,_meta:{requestId:ctx.id}};}catch(e){ctx.error='Customer lookup unavailable.';return {isError:true,content:[{type:'text',text:ctx.error}]};}});return server;
}
