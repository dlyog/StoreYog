import type {SqlDatabase} from './database.js';
// Public verification is intentionally limited to the explicitly seeded tenant.
export function demoAudit(db:SqlDatabase,storeId:string){
 if(storeId!=='little-india'||db.one('SELECT kind FROM store_profiles WHERE store_id=?',[storeId])?.kind!=='demo')throw Error('Public audit is available only for the synthetic demo store.');
 const allowed=['get_inventory','get_todays_transactions','reconcile_inventory','place_reorder','update_inventory','find_product'];
 const rows=db.query('SELECT id,tool,success,duration_ms,summary,queries_json,created_at FROM mcp_calls WHERE store_id=? AND tool IN (?,?,?,?,?,?) ORDER BY created_at DESC LIMIT 60',[storeId,...allowed]);
 const calls=rows.map(row=>({requestId:row.id,tool:row.tool,success:!!row.success,ms:row.duration_ms,summary:row.summary,createdAt:row.created_at,queries:JSON.parse(row.queries_json).map((q:any)=>({sql:q.sql,params:q.params,ms:q.ms,rows:q.rows}))}));
 return {store:'Little India Grocery',synthetic:true,readOnly:true,generatedAt:new Date().toISOString(),calls};
}
