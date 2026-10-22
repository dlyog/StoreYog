import {ownerPhoto} from './photos.js';
import {SqlDatabase} from './database.js';
import { config } from './config.js';
export type Item = {item:string; unit:string; fullStock:number; openingStock:number; stock:number; reorderThreshold:number; unitCost:number; percentRemaining:number};
export type OrderLine = {item:string; qty:number};
export function storeDate(now = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:config.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
const seeds: [string,string,number,number,number,number][] = [
 ['Basmati rice','25 lb bag',40,32,14,24], ['Toor dal','2 lb bag',60,44,21,5],
 ['Chana dal','2 lb bag',40,36,12,4.5], ['Atta','10 lb bag',40,35,12,9],
 ['Ghee','16 oz jar',30,28,9,8], ['Mustard oil','1 L bottle',30,26,9,5],
 ['Turmeric','200 g pouch',40,36,12,2.5], ['Cumin seeds','200 g pouch',40,35,12,3],
 ['Garam masala','100 g pouch',40,36,12,2.5], ['Tea','500 g box',30,27,9,5.5],
 ['Samosa wrappers','pack',30,27,9,3], ['Frozen parathas','pack of 5',40,36,12,3.5],
 ['Paneer','400 g pack',30,24,10,4], ['Onions','1 lb',100,90,30,0.8], ['Ginger','1 lb',40,36,12,2],
];
const money=(n:number)=>Math.round(n*100)/100;
const columns=`item,unit,full_stock AS fullStock,opening_stock AS openingStock,stock,reorder_threshold AS reorderThreshold,unit_cost AS unitCost,ROUND(100.0*stock/full_stock) AS percentRemaining`;
export class Store{
 constructor(private clock:()=>string=storeDate,readonly db=new SqlDatabase(),readonly storeId='test-store',readonly name='Test Grocery'){
  db.run('INSERT OR IGNORE INTO stores(id,name) VALUES (?,?)',[storeId,name]);this.ensureDay();
 }
 private ensureDay(){const day=this.clock();if(!this.db.one('SELECT day FROM store_days WHERE store_id = ? AND day = ?',[this.storeId,day]))this.seedDay(day);return day;}
 private seedDay(day:string){
  if(this.db.one('SELECT store_id FROM store_profiles WHERE store_id=? AND kind=?',[this.storeId,'business'])){
   this.db.transaction(()=>{this.db.run('INSERT OR IGNORE INTO store_days(store_id,day,reconciled_on) VALUES (?,?,?)',[this.storeId,day,day]);const previous=this.db.one('SELECT MAX(day) AS day FROM inventory WHERE store_id=? AND day<?',[this.storeId,day])?.day;if(previous)this.db.run('INSERT OR IGNORE INTO daily_revenue(store_id,day,revenue) SELECT ?,?,COALESCE(SUM(amount),0) FROM transactions WHERE store_id=? AND day=?',[this.storeId,previous,this.storeId,previous]);if(previous)this.db.run('INSERT INTO inventory(store_id,day,item,unit,full_stock,opening_stock,stock,reorder_threshold,unit_cost,sort_order) SELECT store_id,?,item,unit,full_stock,stock,stock,reorder_threshold,unit_cost,sort_order FROM inventory WHERE store_id=? AND day=?',[day,this.storeId,previous]);});return;
  }
  this.db.transaction(()=>{
   this.db.run('INSERT OR IGNORE INTO store_days(store_id,day) VALUES (?,?)',[this.storeId,day]);
   for(const [index,row]of seeds.entries()){const [item,unit,full,opening,threshold,cost]=row;this.db.run('INSERT INTO inventory(store_id,day,item,unit,full_stock,opening_stock,stock,reorder_threshold,unit_cost,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)',[this.storeId,day,item,unit,full,opening,opening,threshold,cost,index]);}
   for(let i=0;i<40;i++){const index=i<10?0:i<23?1:2+(i-23)%13;const row=seeds[index],qty=index<2?2:1;this.db.run('INSERT INTO transactions(store_id,day,id,item,qty,amount,time) VALUES (?,?,?,?,?,?,?)',[this.storeId,day,`TX-${String(i+1).padStart(3,'0')}`,row[0],qty,money(qty*row[5]*1.5),`${String(9+Math.floor(i/4)).padStart(2,'0')}:${String((i%4)*13).padStart(2,'0')}`]);}
   [710,825,780,940,860,1010,910].forEach((revenue,i)=>{const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-7+i);this.db.run('INSERT OR IGNORE INTO daily_revenue(store_id,day,revenue) VALUES (?,?,?)',[this.storeId,d.toISOString().slice(0,10),revenue]);});
  });
 }
 reset(){const day=this.clock();this.db.transaction(()=>{this.db.run('DELETE FROM pos_receipts WHERE store_id=? AND json_extract(result_json, \'$.date\')=?',[this.storeId,day]);for(const table of ['orders','transactions','inventory','store_days'])this.db.run(`DELETE FROM ${table} WHERE store_id = ? AND day = ?`,[this.storeId,day]);this.seedDay(day);});return {summary:'Demo reset. Opening stock and 40 sales receipts restored.',date:day,storeId:this.storeId};}
 inventory(item?:string){const day=this.ensureDay();const items=this.db.query<Item>(`SELECT ${columns} FROM inventory WHERE store_id = ? AND day = ? AND (? = '' OR instr(lower(item),lower(?)) > 0) ORDER BY sort_order`,[this.storeId,day,item||'',item||'']);const reconciledOn=this.db.one('SELECT reconciled_on FROM store_days WHERE store_id = ? AND day = ?',[this.storeId,day])?.reconciled_on||null;return {date:day,storeId:this.storeId,storeName:this.name,items:items.map(i=>({...i,photo:ownerPhoto(this.db,this.storeId,i.item),...(this.db.one('SELECT sku,category,location,customer_visible AS customerVisible,selling_price AS sellingPrice FROM product_details WHERE store_id=? AND item=?',[this.storeId,i.item])||{})})),reconciledOn,summary:items.length?`${items.length} items in inventory. ${reconciledOn?'Today’s sales are reconciled.':'Stock is at today’s opening levels.'}`:'No matching item found.'};}
 checkout(lines:OrderLine[],idempotencyKey:string){
  if(!/^[a-zA-Z0-9-]{12,80}$/.test(idempotencyKey))throw new Error('A valid checkout reference is required.');if(!lines.length||lines.length>15)throw new Error('Choose 1–15 products.');
  const day=this.ensureDay();return this.db.transaction(()=>{
   const prior=this.db.one('SELECT result_json FROM pos_receipts WHERE store_id=? AND idempotency_key=?',[this.storeId,idempotencyKey]);if(prior){const result=JSON.parse(prior.result_json);const canonical=(rows:OrderLine[])=>JSON.stringify(rows.map(i=>({item:i.item,qty:i.qty})).sort((a,b)=>a.item.localeCompare(b.item)));if(canonical(result.items)!==canonical(lines))throw new Error('Checkout reference was already used for a different basket.');return result;}
   this.reconcile();const unique=new Set<string>();
   const items=lines.map(l=>{if(!Number.isInteger(l.qty)||l.qty<1||l.qty>1000||unique.has(l.item))throw new Error('Use unique products and whole quantities from 1 to 1000.');unique.add(l.item);const i=this.db.one<Item>(`SELECT ${columns} FROM inventory WHERE store_id=? AND day=? AND item=?`,[this.storeId,day,l.item]);if(!i)throw new Error('Unknown product.');if(i.stock<l.qty)throw new Error(`Not enough ${i.item} in stock.`);const price=this.db.one('SELECT selling_price AS price FROM product_details WHERE store_id=? AND item=?',[this.storeId,i.item])?.price??i.unitCost*1.5;return {item:i.item,qty:l.qty,unit:i.unit,unitPrice:money(price),amount:money(l.qty*price),stockBefore:i.stock,stockAfter:i.stock-l.qty};});
   const receiptId='POS-'+crypto.randomUUID().slice(0,8).toUpperCase(),time=new Intl.DateTimeFormat('en-GB',{timeZone:config.timezone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
   for(const [index,i]of items.entries()){this.db.run('UPDATE inventory SET stock=stock-? WHERE store_id=? AND day=? AND item=?',[i.qty,this.storeId,day,i.item]);this.db.run('INSERT INTO transactions(store_id,day,id,item,qty,amount,time,receipt_id) VALUES (?,?,?,?,?,?,?,?)',[this.storeId,day,receiptId+'-'+index,i.item,i.qty,i.amount,time,receiptId]);}
   const receipt={receiptId,date:day,storeId:this.storeId,items,total:money(items.reduce((n,i)=>n+i.amount,0)),simulated:true,summary:`Checkout recorded. ${items.reduce((n,i)=>n+i.qty,0)} items sold for $${money(items.reduce((n,i)=>n+i.amount,0))}. Inventory updated. No payment was processed.`};
   this.db.run('INSERT INTO pos_receipts(store_id,idempotency_key,result_json) VALUES (?,?,?)',[this.storeId,idempotencyKey,JSON.stringify(receipt)]);return receipt;
  });
 }
 updateStock(item:string,stock:number,expectedStock:number,reason:string){
  if(!Number.isInteger(stock)||stock<0||stock>100000)throw new Error('Stock must be a whole number from 0 to 100000.');
  if(!reason.trim()||reason.length>200)throw new Error('Provide an adjustment reason (1–200 characters).');
  const day=this.ensureDay();return this.db.transaction(()=>{
   if(!this.db.one('SELECT reconciled_on FROM store_days WHERE store_id=? AND day=?',[this.storeId,day])?.reconciled_on)throw new Error('Reconcile today’s sales before updating current stock.');
   const row=this.db.one<Item>(`SELECT ${columns} FROM inventory WHERE store_id=? AND day=? AND item=?`,[this.storeId,day,item]);if(!row)throw new Error('Inventory item not found.');if(row.stock!==expectedStock)throw new Error('Stock changed since you viewed it. Refresh and try again.');
   this.db.run('UPDATE inventory SET stock=?,opening_stock=opening_stock+? WHERE store_id=? AND day=? AND item=?',[stock,stock-row.stock,this.storeId,day,item]);
   this.db.run('INSERT INTO inventory_adjustments(id,store_id,day,item,previous_stock,new_stock,reason) VALUES (?,?,?,?,?,?,?)',[crypto.randomUUID(),this.storeId,day,item,row.stock,stock,reason.trim()]);
   return {storeId:this.storeId,item,previousStock:row.stock,stock,summary:`${item} stock updated from ${row.stock} to ${stock}.`};
  });
 }
 orders(){const day=this.ensureDay();return this.db.query('SELECT result_json,created_at FROM orders WHERE store_id=? AND day=? ORDER BY created_at DESC',[this.storeId,day]).map(row=>({...JSON.parse(row.result_json),createdAt:row.created_at}));}
 sales(){
  const day=this.ensureDay();const p=[this.storeId,day];
  const lineItems=this.db.query<{id:string;item:string;qty:number;amount:number;time:string}>('SELECT id,item,qty,amount,time FROM transactions WHERE store_id = ? AND day = ? ORDER BY time,id',p);
  const totals=this.db.one('SELECT COALESCE(ROUND(SUM(amount),2),0) AS totalRevenue,COUNT(DISTINCT COALESCE(receipt_id,id)) AS transactionCount FROM transactions WHERE store_id = ? AND day = ?',p)!;
  const trend=this.db.query<{date:string;revenue:number}>('SELECT day AS date,revenue FROM daily_revenue WHERE store_id = ? AND day < ? ORDER BY day DESC LIMIT 7',p).reverse();
  const average=trend.reduce((s,t)=>s+t.revenue,0)/Math.max(1,trend.length);const changePercent=average?Math.round((totals.totalRevenue/average-1)*100):0;
  return {date:day,storeId:this.storeId,lineItems,totalRevenue:totals.totalRevenue,transactionCount:totals.transactionCount,trend,changePercent,summary:`Today’s sales are $${Math.round(totals.totalRevenue)} across ${totals.transactionCount} transactions, ${changePercent} percent above the previous seven-day average.`};
 }
 reconcile(){
  const day=this.ensureDay(),p=[this.storeId,day];
  return this.db.transaction(()=>{
   const alreadyReconciled=this.db.one('SELECT reconciled_on FROM store_days WHERE store_id = ? AND day = ?',p)?.reconciled_on===day;
   let itemsUpdated=0;
   if(!alreadyReconciled){itemsUpdated=this.db.run(`UPDATE inventory SET stock = MAX(0, opening_stock - COALESCE((SELECT SUM(qty) FROM transactions WHERE transactions.store_id = inventory.store_id AND transactions.day = inventory.day AND transactions.item = inventory.item),0)) WHERE store_id = ? AND day = ?`,p).changes;this.db.run('UPDATE store_days SET reconciled_on = ? WHERE store_id = ? AND day = ?',[day,...p]);}
   const lowItems=this.db.query<Item>(`SELECT ${columns} FROM inventory WHERE store_id = ? AND day = ? AND stock < reorder_threshold ORDER BY sort_order`,p);
   return {date:day,storeId:this.storeId,alreadyReconciled,itemsUpdated,lowItems,suggestedReorder:lowItems.map(i=>({item:i.item,qty:i.fullStock-i.stock})),summary:`${alreadyReconciled?'Already reconciled today.':'Today’s sales reconciled.'} ${lowItems.map(i=>`${i.item} is at ${i.percentRemaining} percent`).join('; ')}.`};
  });
 }
 reorder(lines:OrderLine[],confirmed:boolean):Record<string,any>{
  const day=this.ensureDay();if(!lines.length||lines.length>15)throw new Error('Choose between 1 and 15 items.');const unique=new Set<string>();
  const items=lines.map(l=>{const row=this.db.one<Item>(`SELECT ${columns} FROM inventory WHERE store_id = ? AND day = ? AND lower(item) = lower(?)`,[this.storeId,day,l.item]);if(!row)throw new Error(`Unknown inventory item: ${l.item}`);if(unique.has(row.item))throw new Error('Combine duplicate items before ordering.');unique.add(row.item);if(!Number.isInteger(l.qty)||l.qty<1||l.qty>1000)throw new Error('Quantity must be a whole number between 1 and 1000.');return {item:row.item,qty:l.qty,unit:row.unit,unitCost:row.unitCost,cost:money(l.qty*row.unitCost)};}).sort((a,b)=>a.item.localeCompare(b.item));
  const eta=new Date(`${day}T12:00:00Z`);eta.setUTCDate(eta.getUTCDate()+2);const estimatedCost=money(items.reduce((s,i)=>s+i.cost,0));const base={storeId:this.storeId,simulated:true,supplier:'Amazon Business',items,estimatedCost,eta:eta.toISOString().slice(0,10)};
  if(!confirmed)return {...base,status:'draft',requiresConfirmation:true,summary:`The estimated total is $${Math.round(estimatedCost)}. Ask the owner: Shall I order these from Amazon Business? Wait for an explicit yes.`};
  return this.db.transaction(()=>{const basket=JSON.stringify(items.map(({item,qty})=>({item,qty})));const existing=this.db.one('SELECT result_json FROM orders WHERE store_id = ? AND day = ? AND basket = ?',[this.storeId,day,basket]);if(existing)return JSON.parse(existing.result_json);
   const sequence=this.db.one('SELECT COUNT(*) AS n FROM orders WHERE store_id = ? AND day = ?',[this.storeId,day])!.n+1;
   const order={...base,status:'confirmed',requiresConfirmation:false,orderId:`SP-${this.storeId.toUpperCase()}-${day.replaceAll('-','')}-${String(sequence).padStart(3,'0')}`,summary:`Your order is confirmed. ${items.length} items, estimated $${Math.round(estimatedCost)}, arriving in two days.`};this.db.run('INSERT INTO orders(store_id,day,basket,order_id,result_json) VALUES (?,?,?,?,?)',[this.storeId,day,basket,order.orderId,JSON.stringify(order)]);return order;
  });
 }
}
