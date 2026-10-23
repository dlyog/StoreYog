// Replays an owner conversation through /api/chat (the web simulator's Alexa+ flow) and checks the tool calls,
// media and replies: shelf photo, demo film, audio guides, product list, general questions, and no writes from
// a reaction like "Oh great.". Needs the small model (SIMULATOR_LLM_PROTOCOL=storeyog-small).
//   BUSINESS_BASE_URL=https://storeyog.dlyog.com node --import tsx scripts/alexa-plus-conversation-check.ts
import assert from 'node:assert/strict';

const base=(process.env.BUSINESS_BASE_URL||'http://localhost:3100').replace(/\/$/,'');
let cookie='';
type Turn={reply:string;tools:{name:string;args:any;result:any}[];media:any[]};
async function say(message:string):Promise<Turn>{
 const r=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify({message})});
 const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
 assert.equal(r.status,200,`${message}: HTTP ${r.status}`);
 const turn:Turn={reply:'',tools:[],media:[]};
 for(const line of (await r.text()).split('\n').filter(Boolean)){const e=JSON.parse(line);if(e.type==='tool_result')turn.tools.push({name:e.name,args:e.args,result:e.result});if(e.type==='media')turn.media.push(e);if(e.type==='done')turn.reply=e.reply;if(e.type==='error')throw new Error(`${message}: ${e.error}`);}
 console.log(`Q: ${message}\n${turn.tools.map(t=>`   tool: ${t.name} ${JSON.stringify(t.args)}`).join('\n')}${turn.media.length?'\n   media: '+turn.media.map(m=>m.kind+(m.number?' '+m.number:'')).join(', '):''}\nA: ${turn.reply}`);
 return turn;
}
const writes=(t:Turn)=>t.tools.filter(x=>x.name==='update_inventory'||x.name==='place_reorder');
const lookup=(t:Turn,item:string)=>t.tools.find(x=>x.name==='get_inventory'&&x.result.items?.length===1&&x.result.items[0].item===item);

await fetch(base+'/api/reset',{method:'POST'});
let t=await say('Hey, where is the rice?');
const rice=lookup(t,'Basmati rice');assert.ok(rice,'where-is looks up Basmati rice');assert.ok(rice.result.items[0].photo?.publicEnabled,'the single result carries the published shelf photo');
assert.match(t.reply,/shelf/i);
t=await say('Great, do we have dull?');
assert.ok(t.tools.some(x=>x.name==='get_inventory'&&/dal/i.test(JSON.stringify(x.args))),'"dull" is heard as dal');
t=await say('What about toor dal?');assert.ok(lookup(t,'Toor dal'),'toor dal lookup');
t=await say('Oh great.');assert.equal(writes(t).length,0,'a reaction never changes stock or orders');
t=await say('Can you show me some demo?');assert.ok(t.media.some(m=>m.kind==='video'),'demo film plays');
t=await say('List of items.');assert.ok(t.tools.some(x=>x.name==='get_inventory'&&!x.args.item),'full product list');assert.match(t.reply,/\d+ products/);
t=await say('Give me some tips.');const first=t.media.find(m=>m.kind==='audio');assert.ok(first,'an audio guide plays');
t=await say('Next tip.');const second=t.media.find(m=>m.kind==='audio');assert.ok(second&&second.number!==first.number,'next tip plays another guide');
t=await say('Is paneer high in protein?');assert.ok(t.media.some(m=>m.kind==='audio'),'nutrition question plays a food guide');
t=await say('How do I make chai?');assert.ok(t.tools.some(x=>x.name==='ask_general'),'general question goes to the general LLM');assert.ok(t.reply.length>10);
t=await say('Show me the ghee shelf.');assert.ok(lookup(t,'Ghee'),'shelf request looks up ghee');
t=await say('Set ghee stock to 20');const update=t.tools.find(x=>x.name==='update_inventory');assert.ok(update&&update.args.stock===20,'explicit count update');
t=await say('Draft a restock for only rice');const draft=t.tools.find(x=>x.name==='place_reorder');assert.ok(draft&&draft.args.items.length===1&&draft.args.items[0].item==='Basmati rice'&&draft.args.confirmed===false,'rice-only draft');
t=await say('no');assert.equal(writes(t).length,0);assert.match(t.reply,/cancel/i);
t=await say('Where is pizza?');assert.match(t.reply,/(?:couldn.t find|don.t carry|isn.t one of)/i);
await fetch(base+'/api/reset',{method:'POST'});
console.log('PASS Alexa+ web conversation: shelf photo, dal from "dull", no write from a reaction, demo film, product list, audio guides (next and nutrition), general LLM, explicit update, rice-only draft, decline, not carried.');
