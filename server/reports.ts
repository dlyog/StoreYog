import {spawn} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';import {Store} from './store.js';import {bootstrapCredentials} from './credentials.js';
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const active=new Set<string>();
export function inventoryReport(store:Store){
 const business=!!store.db.one('SELECT store_id FROM store_profiles WHERE store_id=? AND kind=?',[store.storeId,'business']);
 const inventory=store.inventory(),low=inventory.items.filter(i=>i.stock<i.reorderThreshold);
 const primary=bootstrapCredentials().storeId;const to=store.storeId===primary?(process.env.INVENTORY_REPORT_TO||process.env.STORE_OWNER_EMAIL||'owner@example.test'):store.db.one('SELECT email FROM owner_users WHERE store_id=? AND active=1 LIMIT 1',[store.storeId])?.email;
 if(!to||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to))throw new Error('Configure a report recipient for this store.');
 const subject=`StoreYog · ${store.name} inventory · ${inventory.date}`;
 const text=[subject,`Snapshot: ${new Date().toISOString()}`,inventory.reconciledOn?'Today’s sales reconciled.':'Opening stock — today’s sales have not been reconciled.',`${low.length} items below reorder threshold.`,'',...inventory.items.map(i=>`${i.item}: ${i.stock} ${i.unit} | threshold ${i.reorderThreshold} | ${i.percentRemaining}%`),'',business?'Owner-maintained inventory. Supplier orders are simulated.':'Seeded hackathon inventory. Orders are simulated.'].join('\n');
 const rows=inventory.items.map(i=>`<tr><td style="padding:10px;border-bottom:1px solid #e4eae5">${esc(i.item)}</td><td>${i.stock} ${esc(i.unit)}</td><td>${i.reorderThreshold}</td><td style="color:${i.stock<i.reorderThreshold?'#b85724':'#286545'}">${i.stock<i.reorderThreshold?'Low stock':'Healthy'}</td></tr>`).join('');
 const html=`<html><body style="font-family:Arial;background:#f3f7f3;padding:28px;color:#173b29"><div style="max-width:760px;margin:auto;background:white;padding:30px;border-radius:16px"><h1>StoreYog</h1><h2>${esc(store.name)} · Inventory report</h2><p>${esc(inventory.date)} · ${low.length} low-stock items · ${inventory.reconciledOn?'Sales reconciled':'Opening stock'}</p><table width="100%" cellpadding="8" cellspacing="0"><tr align="left"><th>Item</th><th>In stock</th><th>Threshold</th><th>Status</th></tr>${rows}</table><p style="color:#748675">Latest SQLite snapshot · ${business?'owner-maintained inventory':'seeded hackathon data'} · all orders simulated</p></div></body></html>`;
 return {to,subject,text,html,inventory};
}
export async function sendInventoryReport(store:Store){
 if(store.db.one('SELECT store_id FROM store_profiles WHERE store_id=? AND kind=?',[store.storeId,'business'])&&!(process.env.INVENTORY_REPORT_VERIFIED_STORES||'').split(',').includes(store.storeId))throw new Error('Email delivery requires the operator to verify this store’s recipient first. CSV export and report preview are available.');
 if(active.has(store.storeId))throw new Error('An inventory report is already being sent.');
 const report=inventoryReport(store);if(!process.env.SMTP_HOST||!process.env.SMTP_FROM_ADDRESS)throw new Error('Email transport is not configured.');
 const recent=store.db.one("SELECT id FROM inventory_reports WHERE store_id=? AND status='accepted' AND created_at > datetime('now','-60 seconds')",[store.storeId]);if(recent)throw new Error('A report was just sent. Wait a minute before sending another.');
 const id=crypto.randomUUID();store.db.run('INSERT INTO inventory_reports(id,store_id,recipient,status) VALUES (?,?,?,?)',[id,store.storeId,report.to,'sending']);active.add(store.storeId);
 try{
  await new Promise<void>((resolve,reject)=>{const child=spawn(process.env.PYTHON_BIN||'python3',[path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/send_inventory_mail.py')],{env:process.env,stdio:['pipe','pipe','pipe']});let error='';child.stderr.on('data',c=>error+=c);child.on('error',reject);const timer=setTimeout(()=>child.kill('SIGTERM'),25000);child.on('close',code=>{clearTimeout(timer);code?(console.error('Inventory email transport failed:',error.slice(-1600)),reject(new Error('SMTP did not accept the inventory report. Check the server mail configuration.'))):resolve();});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(report));});
  store.db.run('UPDATE inventory_reports SET status=? WHERE id=?',['accepted',id]);return {reportId:id,recipient:report.to,status:'accepted',summary:`Your latest inventory report was accepted by the mail server for ${report.to}.`};
 }catch(error){store.db.run('UPDATE inventory_reports SET status=?,error=? WHERE id=?',['failed',error instanceof Error?error.message:'Email failed',id]);throw error;}finally{active.delete(store.storeId);}
}

export function salesReport(store:Store){
 const owner=inventoryReport(store).to,partner=process.env.STORE_PARTNER_EMAIL||'';
 if(store.storeId!==bootstrapCredentials().storeId)throw Error('Partner sales reports require an operator-configured store recipient.');
 const recipients=[...new Set([owner,partner].filter(Boolean))];if(!partner)throw Error('Configure the verified partner email before sending a shared sales report.');
 if(recipients.some(s=>!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(s)))throw Error('Report recipients are not valid.');
 const sales=store.sales(),subject=`StoreYog · ${store.name} sales · ${sales.date}`;
 const text=`${subject}\nToday's sales: $${sales.totalRevenue.toFixed(2)}\nTransactions: ${sales.transactionCount}\n\n`+sales.lineItems.map(i=>`${i.time} · ${i.item} · ${i.qty} · $${i.amount.toFixed(2)}`).join('\n')+'\n\nSynthetic demo store data.';
 const html=`<html><body style="font-family:Arial;color:#173b29"><h1>StoreYog</h1><h2>Today’s sales report</h2><p>${esc(store.name)} · ${esc(sales.date)}</p><h2>$${sales.totalRevenue.toFixed(2)}</h2><p>${sales.transactionCount} transactions</p><table><tr><th>Time</th><th>Product</th><th>Quantity</th><th>Amount</th></tr>${sales.lineItems.map(i=>`<tr><td>${esc(i.time)}</td><td>${esc(i.item)}</td><td>${i.qty}</td><td>$${i.amount.toFixed(2)}</td></tr>`).join('')}</table><p>Shared with the configured owner and partner · Synthetic demo data</p></body></html>`;
 return {to:owner,recipients,subject,text,html,sales};
}
export async function sendSalesReport(store:Store){
 const report=salesReport(store);if(active.has(store.storeId))throw Error('A report is already being sent.');
 if(store.db.one("SELECT id FROM inventory_reports WHERE store_id=? AND status='accepted' AND created_at > datetime('now','-60 seconds')",[store.storeId]))throw Error('A report was just sent. Please wait a minute.');
 active.add(store.storeId);const id=crypto.randomUUID();store.db.run('INSERT INTO inventory_reports(id,store_id,recipient,status) VALUES (?,?,?,?)',[id,store.storeId,report.recipients.join(', '),'sending']);
 try{await new Promise<void>((resolve,reject)=>{const child=spawn(process.env.PYTHON_BIN||'python3',[path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/send_inventory_mail.py')],{env:process.env,stdio:['pipe','pipe','pipe']});let stderr='';child.stderr.on('data',c=>stderr+=c);child.on('error',reject);const timer=setTimeout(()=>child.kill('SIGTERM'),25000);child.on('close',code=>{clearTimeout(timer);code?reject(Error('The mail server did not accept the sales report.')):resolve();});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(report));});store.db.run('UPDATE inventory_reports SET status=? WHERE id=?',['accepted',id]);return {reportId:id,status:'accepted',recipients:report.recipients,sales:report.sales,mailbox:process.env.SMTP_DEMO_CAPTURE==='true'?'demo':'configured',summary:process.env.SMTP_DEMO_CAPTURE==='true'?"Done, Raj. I've shared today's sales report with you and Sam.":'Your sales report was accepted by the mail server for you and your partner.'};}
 catch(e){store.db.run('UPDATE inventory_reports SET status=?,error=? WHERE id=?',['failed','SMTP delivery failed',id]);throw e;}finally{active.delete(store.storeId);}
}
