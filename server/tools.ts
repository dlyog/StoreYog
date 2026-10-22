import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {Store,storeDate} from './store.js';
import {sendInventoryReport,sendSalesReport} from './reports.js';
import {getDatabase} from './database.js';
import type {CallContext} from './observability.js';
export function createServer(context:CallContext){
 const db=getDatabase();const store=new Store(storeDate,db,context.identity.storeId,context.identity.storeName);
 const server=new McpServer({name:'storeyog',version:'1.0.0'});
 const wrap=(name:string,fn:(args:any)=>Record<string,unknown>|Promise<Record<string,unknown>>)=>async(args:any)=>{
  context.invoked=true;
  const scope=['send_inventory_report','send_sales_report'].includes(name)?'reports:send':name==='place_reorder'?'orders:write':['reconcile_inventory','update_inventory'].includes(name)?'inventory:write':'inventory:read';
  if(!context.identity.scopes.includes(scope)){context.error=`Missing required scope: ${scope}`;return {isError:true,content:[{type:'text' as const,text:JSON.stringify({summary:context.error})}]};}
  const captured=db.traced(()=>fn(args));context.queries=captured.queries;
  let data:Record<string,unknown>;try{if(captured.error)throw captured.error;data=await captured.value||{summary:'Tool completed'};}catch(error){captured.error=error instanceof Error?error:new Error('Tool failed');data={summary:captured.error.message};}
  context.summary=name==='get_inventory'&&Array.isArray(data.items)?data.items.map((i:any)=>`${i.item}: ${i.stock} ${i.unit}${i.stock!==1&&/^(bag|bottle|pack|box|jar)$/.test(i.unit)?'s':''}`).join('; ')||String(data.summary||''):String(data.summary||'');context.error=captured.error?.message;
  return {isError:!!captured.error,content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:data,_meta:{requestId:context.id,storeId:context.identity.storeId,sql:captured.queries}};
 };
 server.registerTool('get_inventory',{description:'Look up grocery stock, units, reorder thresholds and full-stock percentages. Before reconciliation stock is today’s opening stock. Optionally filter by an item name.',inputSchema:{item:z.string().max(100).optional()},annotations:{readOnlyHint:true,openWorldHint:false}},wrap('get_inventory',a=>store.inventory(a.item)));
 server.registerTool('get_todays_transactions',{description:'Read today’s seeded sales receipts, total revenue, transaction count, and the previous seven days of revenue. Use for sales summaries and store performance.',inputSchema:{},annotations:{readOnlyHint:true,openWorldHint:false}},wrap('get_todays_transactions',()=>store.sales()));
 server.registerTool('reconcile_inventory',{description:'Deduct today’s sales from opening inventory and return low-stock items with percentages and reorder quantities. Always use this before reporting closing stock. Idempotent per store-local calendar day; safe to repeat.',inputSchema:{},annotations:{readOnlyHint:false,idempotentHint:true,destructiveHint:false,openWorldHint:false}},wrap('reconcile_inventory',()=>store.reconcile()));
 server.registerTool('place_reorder',{description:'Prepare or confirm a SIMULATED Amazon Business reorder. NEVER makes a real purchase. First call with confirmed=false to draft the exact basket and estimate. Ask the owner for an explicit spoken yes, then and only then call confirmed=true with the same basket. An earlier request to reorder is NOT confirmation. Identical same-day baskets return the existing order.',inputSchema:{items:z.array(z.object({item:z.string().min(1).max(100),qty:z.number().int().min(1).max(1000)})).min(1).max(15),confirmed:z.boolean()},annotations:{readOnlyHint:false,idempotentHint:true,destructiveHint:false,openWorldHint:false}},wrap('place_reorder',a=>store.reorder(a.items,a.confirmed)));
 server.registerTool('update_inventory',{description:'Update an exact physical stock count after today’s sales are reconciled. Only when the owner explicitly requests this item and count. Get current inventory first and pass expectedStock; never infer or guess a count. Reason is required. Rejects stale stock edits.',inputSchema:{item:z.string().min(1).max(100),stock:z.number().int().min(0).max(100000),expectedStock:z.number().int().min(0),reason:z.string().trim().min(1).max(200)},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}},wrap('update_inventory',a=>store.updateStock(a.item,a.stock,a.expectedStock,a.reason)));
 server.registerTool('send_inventory_report',{description:'Email the latest inventory snapshot, including low-stock status, to this store’s preconfigured report recipient. Only call when the owner explicitly asks to email/send an inventory report. Recipient cannot be supplied or changed by the model. Reports use seeded store data. Requires reports:send scope.',inputSchema:{},annotations:{readOnlyHint:false,openWorldHint:true}},wrap('send_inventory_report',()=>sendInventoryReport(store)));
 server.registerTool('send_sales_report',{description:'Email today’s actual recorded sales to the preconfigured owner and verified partner. Only on an explicit request to email sales. Recipients cannot be changed by the model.',inputSchema:{},annotations:{readOnlyHint:false,openWorldHint:true}},wrap('send_sales_report',()=>sendSalesReport(store)));
 return server;
}
