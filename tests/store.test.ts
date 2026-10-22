import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/store.js';
test('reconcile deducts once, calculates thresholds and the exact basket',()=>{
 const s=new Store();const r=s.reconcile();
 assert.deepEqual(r.lowItems.map(i=>[i.item,i.stock,i.percentRemaining]),[['Basmati rice',12,30],['Toor dal',18,30]]);
 assert.deepEqual(r.suggestedReorder,[{item:'Basmati rice',qty:28},{item:'Toor dal',qty:42}]);
 assert.equal(s.reconcile().alreadyReconciled,true);assert.equal(s.reconcile().itemsUpdated,0);
 assert.equal(s.inventory('rice').items[0].stock,12);
});
test('sales receipts and trend are coherent',()=>{const s=new Store();const t=s.sales();assert.equal(t.lineItems.length,t.transactionCount);assert.equal(t.totalRevenue,Math.round(t.lineItems.reduce((s,t)=>s+t.amount,0)*100)/100);assert.equal(t.trend.length,7);});
test('draft is simulated, approval deduplicates, invalid input does not create orders',()=>{
 const s=new Store();const items=s.reconcile().suggestedReorder;
 const draft=s.reorder(items,false);assert.equal(draft.status,'draft');assert.equal(draft.simulated,true);assert.ok(!('orderId' in draft));
 const order=s.reorder(items,true);assert.equal(order.status,'confirmed');assert.deepEqual(s.reorder([...items].reverse(),true),order);
 for(const items of [[{item:'unknown',qty:1}],[{item:'Ghee',qty:-1}],[{item:'Ghee',qty:1.5}],[{item:'Ghee',qty:1},{item:'Ghee',qty:2}],[]]) assert.throws(()=>s.reorder(items,true));
});
test('reset restores opening inventory and midnight starts fresh demo day',()=>{let day='2026-10-21';const s=new Store(()=>day);s.reconcile();s.reset();assert.equal(s.inventory('rice').items[0].stock,32);s.reconcile();day='2026-10-22';assert.equal(s.inventory('rice').items[0].stock,32);assert.equal(s.reconcile().alreadyReconciled,false);});
test('all domain tools complete under 500ms',()=>{const s=new Store();for(const fn of [()=>s.inventory(),()=>s.sales(),()=>s.reconcile(),()=>s.reorder(s.reconcile().suggestedReorder,false)]){const start=performance.now();fn();assert.ok(performance.now()-start<500);}});
