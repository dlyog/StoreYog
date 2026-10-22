import {modelAuditSchema} from './model-audit.js';
import type {SqlTrace} from './database.js';
import {getDatabase} from './database.js';
import type {Identity} from './auth.js';
export type CallContext={id:string;conversationId?:string;identity:Identity;queries:SqlTrace[];summary:string;error?:string;invoked:boolean};
export function recordCall(ctx:CallContext,method:string,tool:string|undefined,args:unknown,ms:number){
 getDatabase().run('INSERT INTO mcp_calls(id,store_id,key_id,method,tool,args_json,success,duration_ms,summary,error,queries_json,created_at,conversation_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[ctx.id,ctx.identity.storeId,ctx.identity.keyId,method,tool||null,JSON.stringify(args||{}),ctx.error?0:1,Number(ms.toFixed(2)),ctx.summary,ctx.error||null,JSON.stringify(ctx.queries),new Date().toISOString(),ctx.conversationId||null]);
 console.log(JSON.stringify({requestId:ctx.id,storeId:ctx.identity.storeId,method,tool,ms:Number(ms.toFixed(2)),queries:ctx.queries.length,error:ctx.error||null}));
}
export function securityEvent(event:string){getDatabase().run('INSERT INTO security_events(event,created_at) VALUES (?,?)',[event,new Date().toISOString()]);}
export function snapshot(storeId?:string){
 const db=getDatabase();modelAuditSchema(db);const where=storeId?'WHERE store_id = ?':'';const params=storeId?[storeId]:[];
 const stats=db.one(`SELECT COUNT(*) AS totalCalls,COALESCE(SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END),0) AS errors,COALESCE(AVG(duration_ms),0) AS avgMs,COALESCE(MAX(duration_ms),0) AS maxMs FROM mcp_calls ${where}`,params)!;
 const durations=db.query(`SELECT duration_ms FROM mcp_calls ${where} ORDER BY duration_ms`,params);const p95=durations.length?durations[Math.max(0,Math.ceil(durations.length*.95)-1)].duration_ms:0;
 const tools=db.query(`SELECT tool,COUNT(*) AS calls,SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS errors,ROUND(AVG(duration_ms),2) AS avgMs,MAX(duration_ms) AS maxMs FROM mcp_calls ${where} ${where?'AND':'WHERE'} method = 'tools/call' GROUP BY tool ORDER BY calls DESC`,params);
 const calls=db.query(`SELECT * FROM mcp_calls ${where} ORDER BY created_at DESC LIMIT 100`,params).map(row=>({...row,args:JSON.parse(row.args_json),queries:JSON.parse(row.queries_json),args_json:undefined,queries_json:undefined}));
 const stores=db.query('SELECT s.*,(SELECT COUNT(*) FROM api_keys k WHERE k.store_id = s.id AND k.revoked = 0) AS activeKeys FROM stores s ORDER BY s.created_at,s.id');
 const keys=db.query('SELECT id,store_id,label,prefix,scopes,revoked,created_at,last_used_at FROM api_keys ORDER BY created_at DESC').map(k=>({...k,scopes:JSON.parse(k.scopes)}));
 const queryCount=db.one(`SELECT COALESCE(SUM(json_array_length(queries_json)),0) AS n FROM mcp_calls ${where}`,params)!.n;
 const authFailures=db.one('SELECT COUNT(*) AS count FROM security_events')!.count;
 const llmCalls=db.query(`SELECT id,store_id,provider,model,request_json,response_json,status,error,duration_ms,created_at FROM llm_calls ${where} ORDER BY created_at DESC LIMIT 100`,params).map(row=>({...row,request:JSON.parse(row.request_json),response:row.response_json?JSON.parse(row.response_json):null,request_json:undefined,response_json:undefined}));
 return {llmCalls,stats:{...stats,p95Ms:p95,authFailures,queryCount},tools,calls,stores,keys,generatedAt:new Date().toISOString(),database:'SQLite · WAL',transport:'Streamable HTTP · MCP 2025-11-25'};
}
