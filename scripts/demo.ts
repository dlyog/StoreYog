import assert from 'node:assert/strict';
import {config} from '../server/config.js';
const base=`http://127.0.0.1:${config.webPort}`;
const reset=await fetch(`${base}/api/reset`,{method:'POST'});assert.ok(reset.ok,await reset.text());
let cookie='';
async function chat(message:string,scripted:boolean){
 const r=await fetch(`${base}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify({message,scripted})});
 cookie=r.headers.get('set-cookie')?.split(';')[0]||cookie;assert.ok(r.ok);
 const events=(await r.text()).trim().split('\n').map(s=>JSON.parse(s));
 const error=events.find(e=>e.type==='error');assert.ok(!error,error?.error);
 for(const e of events){if(e.type==='tool_result')console.log(`  ${e.name} · ${e.ms} ms · ${e.result.summary}`);if(e.type==='done')console.log(`Alexa: ${e.reply}`);}
 return events;
}
const live=process.argv.includes('--live');
console.log(live?'LIVE MODEL → REAL MCP':'SCRIPTED ASSISTANT → REAL MCP');
const first=await chat("Alexa, reconcile my inventory based on today's transactions, and if I'm running low, order from Amazon.",!live);
assert.equal(first.at(-1).pendingConfirmation,true);assert.ok(!first.some(e=>e.type==='tool_result'&&e.args.confirmed===true));
console.log('Owner: yes');const second=await chat('yes',!live);
const order=second.find(e=>e.type==='tool_result'&&e.name==='place_reorder');assert.equal(order.result.status,'confirmed');assert.equal(order.result.simulated,true);assert.equal(order.result.estimatedCost,882);
assert.equal(second.at(-1).pendingConfirmation,false);
console.log(`PASS · ${order.result.orderId} · $${order.result.estimatedCost} · simulated · ETA ${order.result.eta}`);
