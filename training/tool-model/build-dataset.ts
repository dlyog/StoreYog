// Builds the StoreYog tool-calling fine-tuning set for Gemma 4 E2B.
// Every tool result is produced by the real MCP server running in-process against a throwaway copy of
// the synthetic Little India Grocery database. Report emails are never sent: their results are written in.
// Output: OpenAI-style {tools, messages} conversations, rendered on the training host with Gemma's chat template.
//
//   sqlite3 .runtime/storeyog.sqlite ".backup '/tmp/train.sqlite'"
//   DATABASE_PATH=/tmp/train.sqlite node --import tsx training/tool-model/build-dataset.ts out/
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../../server/tools.js';
import {Store,storeDate} from '../../server/store.js';
import {getDatabase} from '../../server/database.js';
import {SYSTEM,TOOL_RULES,compact} from '../../simulator/agent.js';

if(!process.env.DATABASE_PATH||/\.runtime/.test(process.env.DATABASE_PATH))throw new Error('Set DATABASE_PATH to a throwaway copy of the database, never the live .runtime file.');
const out=process.argv[2]||'training/tool-model/out';mkdirSync(out,{recursive:true});
const STORE='little-india';

// Seeded random numbers so the dataset is reproducible.
let seed=20261022;const rand=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
const pick=<T>(list:T[]):T=>list[Math.floor(rand()*list.length)];
// SCALE multiplies every scenario loop (the paper's gain came from data volume: ~187k examples).
const SCALE=Math.max(1,Number(process.env.SCALE||1));
// Spoken-style variation of the owner's words: wake words, fillers, speech-to-text casing and mishearings.
function vary(text:string){
 let t=text;
 if(rand()<0.25)t=pick(['Alexa, ','Hey StoreYog, ','Okay, ','Um, ','Can you tell me, ','Quick question, '])+t[0].toLowerCase()+t.slice(1);
 if(rand()<0.15)t=t.replace(/[.?!]$/,'')+pick([' please?',' for me?',' right now?',' today?']);
 if(rand()<0.2)t=t.replace(/\bdal\b/g,pick(['dahl','daal','dal']));
 if(rand()<0.3)t=t.toLowerCase().replace(/[.,?!’']/g,'');
 return t;
}
const shuffle=<T>(list:T[])=>list.map(v=>[rand(),v] as const).sort((a,b)=>a[0]-b[0]).map(([,v])=>v);

const [serverSide,clientSide]=InMemoryTransport.createLinkedPair();
const context:any={id:'dataset',identity:{storeId:STORE,storeName:'Little India Grocery',scopes:['inventory:read','inventory:write','orders:write']},queries:[],summary:'',invoked:false};
await createServer(context).connect(serverSide);
const client=new Client({name:'storeyog-dataset',version:'1.0.0'});await client.connect(clientSide);
const {tools:mcpTools}=await client.listTools();
const tools=mcpTools.map(t=>{const {$schema,...parameters}=t.inputSchema as any;return {type:'function',function:{name:t.name,description:t.description||'',parameters}};});
const store=new Store(storeDate,getDatabase(),STORE,'Little India Grocery');
const SYSTEM_PROMPT=`${SYSTEM}\n${TOOL_RULES}`;

type Msg={role:string;content?:string;tool_calls?:any[];name?:string};
async function run(name:string,args:Record<string,any>){
 if(name==='send_inventory_report')return {summary:'Inventory report emailed to the store’s report recipient.',status:'sent'};
 if(name==='send_sales_report')return {error:'Sign in to the owner workspace to send a sales report. The public demo does not authorize external email.'};
 const r:any=await client.callTool({name,arguments:args});
 const data=r.structuredContent||JSON.parse(r.content?.[0]?.text||'{}');
 return r.isError?{error:data.summary||'Tool failed'}:compact(data);
}
// One conversation: the owner's request, each tool call with its real result, then the spoken answer.
class Turn{
 messages:Msg[]=[];results:Record<string,any>={};
 constructor(public text:string,history:[string,string][]=[],exact=false){this.messages.push({role:'system',content:SYSTEM_PROMPT});for(const [q,a] of history)this.messages.push({role:'user',content:q},{role:'assistant',content:a});this.messages.push({role:'user',content:exact?text:vary(text)});}
 async call(name:string,args:Record<string,any>={}){const result=await run(name,args);this.messages.push({role:'assistant',tool_calls:[{type:'function',function:{name,arguments:args}}]},{role:'tool',name,content:JSON.stringify(result)});this.results[name]=result;return result;}
 answer(text:string){this.messages.push({role:'assistant',content:text});return {kind:'',tools,messages:this.messages};}
}

// Catalog words an owner says, mapped to the search word passed to get_inventory.
const SPOKEN:Record<string,[string,string][]>={
 'Basmati rice':[['rice','rice'],['basmati rice','basmati'],['basmati','basmati']],'Toor dal':[['toor dal','toor'],['toor daal','toor'],['arhar dal','toor']],
 'Chana dal':[['chana dal','chana dal']],'Atta':[['atta','atta'],['wheat flour','atta'],['chapati flour','atta']],'Ghee':[['ghee','ghee']],
 'Mustard oil':[['mustard oil','mustard oil']],'Turmeric':[['turmeric','turmeric'],['haldi','turmeric']],'Cumin seeds':[['cumin','cumin'],['jeera','cumin']],
 'Garam masala':[['garam masala','garam masala']],'Tea':[['tea','tea'],['chai','tea']],'Samosa wrappers':[['samosa wrappers','samosa wrappers']],
 'Frozen parathas':[['parathas','paratha'],['frozen parathas','paratha']],'Paneer':[['paneer','paneer']],'Onions':[['onions','onion'],['onion','onion']],
 'Ginger':[['ginger','ginger'],['adrak','ginger']],'Moong dal':[['moong dal','moong'],['mung dal','moong']],'Masoor dal':[['masoor dal','masoor'],['red lentils','masoor']],
 'Urad dal':[['urad dal','urad']],'Rajma':[['rajma','rajma'],['kidney beans','rajma']],'Kabuli chana':[['chickpeas','kabuli chana'],['kabuli chana','kabuli chana']],
 'Poha':[['poha','poha'],['flattened rice','poha']],'Sooji':[['sooji','sooji'],['semolina','sooji'],['rava','sooji']],'Besan':[['besan','besan'],['gram flour','besan']],
 'Jaggery':[['jaggery','jaggery'],['gur','jaggery']],'Coriander powder':[['coriander powder','coriander'],['dhaniya powder','coriander']],
 'Red chili powder':[['chili powder','chili powder'],['lal mirch powder','chili powder']],'Mustard seeds':[['mustard seeds','mustard seeds'],['rai','mustard seeds']],
 'Cardamom':[['cardamom','cardamom'],['elaichi','cardamom']],'Coconut oil':[['coconut oil','coconut oil']],'Dahi':[['dahi','dahi'],['yogurt','dahi'],['curd','dahi']],
 'Milk':[['milk','milk']],'Tomatoes':[['tomatoes','tomato'],['tomato','tomato']],'Potatoes':[['potatoes','potato'],['aloo','potato']],
 'Green chilies':[['green chilies','green chil'],['hari mirch','green chil']],'Cilantro':[['cilantro','cilantro'],['fresh coriander','cilantro']],
 'Mango pickle':[['mango pickle','mango pickle'],['achar','pickle']],'Papad':[['papad','papad'],['papadum','papad']],'Frozen samosas':[['samosas','samosa'],['frozen samosas','frozen samosas']],
};
const ITEMS=Object.keys(SPOKEN);
// Some products are held out of training entirely so evaluation measures generalisation.
const HELD_OUT=new Set(['Cardamom','Rajma','Coconut oil','Papad']);

const nouns:Record<string,string>={bag:'bags',jar:'jars',bottle:'bottles',pouch:'pouches',box:'boxes',pack:'packs',tub:'tubs',block:'blocks',bunch:'bunches',gallon:'gallons',lb:'pounds',g:'packs'};
function quantity(item:any){const unit=String(item.unit);const word=(/\b(bag|jar|bottle|pouch|box|pack|tub|block|bunch|gallon)\b/.exec(unit)?.[1])||(/^1 (lb)$/.exec(unit)?.[1])||'g';const n=item.stock;return `${n} ${n===1?(word==='g'?'pack':word==='lb'?'pound':word):nouns[word]}`;}
const place=(item:any)=>String(item.location||'').replace(/\s+—\s+/g,', ').replace(/\.$/,'');
const at=(item:any)=>{const l=place(item);return /^(top|bottom|middle|lower|upper)\b/i.test(l)?`on the ${l[0].toLowerCase()+l.slice(1)}`:/^aisle\b/i.test(l)?`in ${l}`:`in the ${l[0].toLowerCase()+l.slice(1)}`;};
const money=(n:number)=>Number.isInteger(n)?`$${n}`:`$${n.toFixed(2)}`;
const list=(names:string[])=>names.length<2?names.join(''):`${names.slice(0,-1).join(', ')} and ${names.at(-1)}`;
const cap=(s:string)=>s[0].toUpperCase()+s.slice(1);

const examples:{split:string;heldOut:boolean;kind:string;tools:any;messages:Msg[]}[]=[];
const hash=(t:string)=>{let h=2166136261;for(const c of t.toLowerCase())h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h;};
const seenText=new Set<string>();
const add=(kind:string,product:string|null,example:{tools:any;messages:Msg[]})=>{
 const key=JSON.stringify(example.messages.slice(1));if(seenText.has(key))return;seenText.add(key); // drop exact duplicates
 const owner=String(example.messages.filter(m=>m.role==='user').at(-1)?.content||'');
 examples.push({split:product&&HELD_OUT.has(product)?'eval':hash(owner)%100<6?'eval':'train',heldOut:!!product&&HELD_OUT.has(product),kind,tools:example.tools,messages:example.messages});
};
const fresh=(reconciled:boolean)=>{store.reset();if(reconciled)store.reconcile();};

// 1. Where is it / do we have it / how many / price, for every product and spoken name (two passes for phrasing variety).
for(let pass=0;pass<2*SCALE;pass++)for(const product of ITEMS){
 for(const [said,word] of SPOKEN[product]){
  for(const reconciled of [false,true]){
   fresh(reconciled);
   const ask=async(kind:string,question:string,speak:(item:any,all:any[])=>string,history:[string,string][]=[])=>{const t=new Turn(question,history);const r=await t.call('get_inventory',{item:word});const items=(r.items||[]) as any[];const hit=items.find(i=>i.item===product)||items[0];add(kind,product,t.answer(hit?speak(hit,items):`I couldn’t find ${said} in the store’s inventory.`));};
   await ask('where',pick([`Where is the ${said}?`,`Where do we keep ${said}?`,`Where can I find ${said}?`,`Alexa, where's the ${said}?`,`which shelf is ${said} on`,`where did we put the ${said}`]),i=>pick([`${i.item} is ${at(i)}.`,`You'll find ${i.item} ${at(i)}.`,`${cap(i.item)}: ${place(i)}.`])+(rand()<0.5?` There are ${quantity(i)} in stock.`:''));
   await ask('count',pick([`How much ${said} do we have?`,`How many ${said} are left?`,`How much ${said} is available?`,`check my ${said}`,`what's the stock of ${said}`,`${said} stock?`]),i=>pick([`We have ${quantity(i)} of ${i.item} in stock, ${i.percentRemaining} percent of full stock.`,`${i.item}: ${quantity(i)} on hand.`,`There are ${quantity(i)} of ${i.item} left.`])+(i.stock<=i.reorderThreshold?` That's at or below the reorder level of ${i.reorderThreshold}.`:'')+(reconciled?'':pick([' That is today’s opening count.',''])));
   await ask('available',pick([`Do we have ${said}?`,`Is ${said} in stock?`,`Do we still have any ${said}?`,`Any ${said} left?`]),i=>i.stock>0?pick([`Yes, we have ${quantity(i)} of ${i.item}.`,`Yes. ${i.item} is in stock with ${quantity(i)}, ${at(i)}.`]):`No, ${i.item} is out of stock.`);
   if(rand()<0.6)await ask('price',pick([`How much does ${said} sell for?`,`What's the price of ${said}?`,`What do we charge for ${said}?`,`price of ${said}`]),i=>pick([`${i.item} sells for ${money(i.sellingPrice)} per ${String(i.unit)}.`,`We charge ${money(i.sellingPrice)} for ${i.item}, per ${String(i.unit)}.`])+(rand()<0.4?` It costs us ${money(i.unitCost)}.`:''));
   if(rand()<0.35){const known=(store.inventory(word).items as any[]).find(i=>i.item===product);const before:[string,string]=[`How much ${said} do we have?`,known?`We have ${quantity(known)} of ${product} in stock.`:`I couldn't find ${said}.`];await ask('followup','And where is it?',i=>`${i.item} is ${at(i)}.`,[before]);}
  }
 }
}
// Products the store does not carry.
const NOT_CARRIED=['pizza','olive oil','quinoa','eggs','bread','coffee','sugar','salt','almonds','cashews','saffron','tofu','pasta','chocolate','soda','chips','butter','cheese','apples','bananas','oranges','chicken','fish','honey','ketchup','noodles','oats','peanut butter','soap','shampoo','batteries','diapers','ice cream','yogurt drink','cornflakes','vinegar','mayonnaise','avocado','lettuce','garlic','lemons','cereal','cookies','juice','water bottles','candles','tissues','paper towels','beer','wine'];
for(let pass=0;pass<SCALE*2;pass++)for(const thing of NOT_CARRIED){
 fresh(rand()<0.5);const t=new Turn(pick([`Where is the ${thing}?`,`Do we have ${thing}?`,`How much ${thing} is left?`,`Where can I find ${thing}?`,`What's the price of ${thing}?`,`Is ${thing} in stock?`]));await t.call('get_inventory',{item:thing});add('missing',null,t.answer(pick([`We don't carry ${thing} at Little India Grocery.`,`I couldn't find ${thing} in the store's inventory.`,`Sorry, ${thing} isn't one of our products.`])));
}
// Broad words that match several products.
for(const [said,word] of [['dal','dal'],['lentils','dal'],['oil','oil'],['frozen food','frozen'],['powder','powder'],['spices','masala']] as const){
 fresh(false);const t=new Turn(pick([`What ${said} do we have?`,`How much ${said} do we have?`,`Show me our ${said}`]));const r=await t.call('get_inventory',{item:word});const items=(r.items||[]) as any[];add('broad',null,t.answer(items.length?`We have ${items.length} matching items: ${list(items.slice(0,6).map(i=>`${i.item}, ${quantity(i)}`))}.`:`I couldn't find any ${said}.`));
}

// 2. Sales, store health, alerts.
for(let n=0;n<60*SCALE;n++){
 const reconciled=rand()<0.5;fresh(reconciled);
 {const t=new Turn(pick(['Show today’s sales summary.','How were sales today?','How much did we make today?','What are today’s sales?','Alexa, sales today?','How many transactions today?']));const s=await t.call('get_todays_transactions');add('sales',null,t.answer(pick([`You made ${money(Math.round(s.totalRevenue))} across ${s.transactionCount} transactions today, ${Math.abs(s.changePercent)} percent ${s.changePercent>=0?'above':'below'} your recent average.`,`Today's sales are ${money(Math.round(s.totalRevenue))} from ${s.transactionCount} transactions. That's ${Math.abs(s.changePercent)} percent ${s.changePercent>=0?'higher':'lower'} than the last seven days.`])));}
 fresh(reconciled);
 {const t=new Turn(pick(['How’s my store doing today?','How is my store doing?','Alexa, how is the store doing?','Give me a quick update on the store.','How did we do today?']));const s=await t.call('get_todays_transactions');const rec=await t.call('reconcile_inventory');await t.call('get_inventory');const low=(rec.lowItems||[]) as any[];add('health',null,t.answer(`You made ${money(Math.round(s.totalRevenue))} across ${s.transactionCount} transactions, ${Math.abs(s.changePercent)} percent ${s.changePercent>=0?'above':'below'} your recent average. `+(low.length?`${list(low.map(i=>`${i.item} is at ${i.percentRemaining} percent`))}. Want me to draft a restock?`:'Stock levels look healthy.')));}
 fresh(reconciled);
 {const t=new Turn(pick(['Show my low stock items.','Show inventory alerts.','What’s running low?','Reconcile today’s inventory.','Anything I need to reorder?','Reconcile my inventory and tell me what is low.']));const rec=await t.call('reconcile_inventory');const low=(rec.lowItems||[]) as any[];add('alerts',null,t.answer(low.length?`${list(low.map(i=>`${i.item} is at ${i.percentRemaining} percent`))}. ${pick(['Shall I draft a restock?','Want me to prepare a reorder?'])}`:'Nothing is below its reorder level.'));}
}

// 3. Restock drafts: reconcile, then draft from suggestedReorder, optionally only the named items.
const lowNames=()=>{fresh(false);const r:any=store.reconcile();return (r.suggestedReorder||[]) as {item:string;qty:number}[];};
for(let n=0;n<110*SCALE;n++){
 const suggested=lowNames();fresh(false);
 const only=rand()<0.65&&suggested.length>1?[pick(suggested)]:suggested;
 const name=(i:{item:string})=>pick((SPOKEN[i.item]||[[i.item.toLowerCase(),'']]).map(([s])=>s));
 const text=only===suggested?pick(['Reconcile and restock.','Reconcile my inventory based on today’s transactions, and if I’m running low, order from Amazon.','Restock whatever is low.','Draft a reorder for the low items.','Order more of what we’re running out of.']):pick([`Restock only the ${name(only[0])}.`,`Draft a restock for just ${name(only[0])}.`,`Draft a restock for only ${name(only[0])}.`,`Reorder ${name(only[0])} only, not the rest.`,`Order more ${name(only[0])}.`,`Only restock ${name(only[0])}.`,`Just order the ${name(only[0])}.`,`Restock ${name(only[0])}, nothing else.`,`I only want ${name(only[0])} restocked.`]);
 const t=new Turn(text);await t.call('reconcile_inventory');const draft=await t.call('place_reorder',{items:only,confirmed:false});
 add('restock',null,t.answer(draft.status==='draft'?`I've drafted ${list(draft.items.map((i:any)=>`${i.qty} ${String(i.unit).replace(/^.*\b(bag|jar|bottle|pouch|box|pack)\b.*$/,'$1')}s of ${i.item}`))}, about ${money(Math.round(draft.estimatedCost))} from Amazon Business. Shall I place this order?`:String(draft.error||draft.summary)));
}
// A narrower request after a full draft: reconcile again (idempotent) and draft only the named item.
for(let n=0;n<30*SCALE;n++){
 const suggested=lowNames();if(suggested.length<2)break;fresh(false);
 const keep=pick(suggested);const said=pick((SPOKEN[keep.item]||[[keep.item.toLowerCase(),'']]).map(([s])=>s));
 const t=new Turn(pick([`No, only the ${said}.`,`Just the ${said} please.`,`Leave the rest out, only ${said}.`]),[['Reconcile and restock.',`I've drafted ${list(suggested.map(i=>`${i.qty} bags of ${i.item}`))}. Shall I place this order?`]]);
 await t.call('reconcile_inventory');const draft=await t.call('place_reorder',{items:[keep],confirmed:false});
 add('narrow',keep.item,t.answer(`Okay, just ${keep.qty} bags of ${keep.item}, about ${money(Math.round(draft.estimatedCost))}. Shall I place this order?`));
}
// Declining an offer to draft: no tool call. (A "no" to a pending draft is handled by the server, not the model.)
for(let n=0;n<40*SCALE;n++){
 const offer=pick(['Basmati rice is at 30 percent and Toor dal is at 30 percent. Shall I draft a restock?','You made $1035 across 40 transactions, 16 percent above your recent average. Basmati rice is at 30 percent and Toor dal is at 30 percent. Want me to draft a restock?','Basmati rice is at 30 percent. Want me to prepare a reorder?']);
 const t=new Turn(pick(['No','No thanks','Not now','No, not yet','Nope','Maybe later','Don’t order anything','No, leave it']),[[pick(['Show my low stock items.','How is my store doing?','What’s running low?']),offer]]);
 add('decline',null,t.answer(pick(['Okay, no restock for now.','Sure, I won’t draft anything. Just ask when you’re ready.','No problem. Nothing has been ordered.'])));
}
// Explicit quantities for any product.
for(let pass=0;pass<SCALE;pass++)for(const product of shuffle(ITEMS).slice(0,30)){
 fresh(false);const [said]=pick(SPOKEN[product]);const qty=pick([5,10,12,20,24,30]);
 const t=new Turn(pick([`Order ${qty} ${said}.`,`Put in an order for ${qty} of ${said}.`,`Reorder ${qty} units of ${said}.`]));const draft=await t.call('place_reorder',{items:[{item:product,qty}],confirmed:false});
 add('order',product,t.answer(draft.status==='draft'?`That's ${qty} of ${product}, about ${money(Math.round(draft.estimatedCost))}. Shall I place this order?`:String(draft.error||draft.summary)));
}

// 4. Count changes: look up the exact name and current stock, then update with expectedStock.
for(const product of ITEMS){
 for(let n=0;n<2*SCALE;n++){
  fresh(rand()<0.5);const [said,word]=pick(SPOKEN[product]);const target=pick([0,5,8,10,15,20,25,30,40]);
  const t=new Turn(pick([`Set ${said} stock to ${target}.`,`Update ${said} to ${target}.`,`We actually have ${target} ${said}, update the count.`,`Change the ${said} count to ${target}.`]));
  let r=await t.call('get_inventory',{item:word});
  if(r.items?.length&&!r.reconciledOn){await t.call('reconcile_inventory');r=await t.call('get_inventory',{item:word});}
  const item=(r.items||[]).find((i:any)=>i.item===product);
  if(!item){add('update',product,t.answer(`I couldn't find ${said} in the inventory.`));continue;}
  const u=await t.call('update_inventory',{item:item.item,stock:target,expectedStock:item.stock,reason:'Owner voice count update'});
  add('update',product,t.answer(u.error?`I couldn't update ${item.item}: ${u.error}`:`Done. ${item.item} is now set to ${target}, it was ${item.stock}.`));
 }
}

// 5. Reports. Inventory report results are written in; the sales report is refused in the public demo.
for(let n=0;n<20*SCALE;n++){
 fresh(false);
 {const t=new Turn(pick(['Email my inventory report.','Send the inventory report.','Email me the stock report.']));await t.call('send_inventory_report');add('report',null,t.answer('Done. The inventory report has been emailed to your store’s report address.'));}
 {const t=new Turn(pick(['Email today’s sales to me.','Send the sales report.','Email the sales summary.']));const r=await t.call('send_sales_report');add('report',null,t.answer(r.error?'Sending the sales report needs a signed-in owner. Please sign in to the owner workspace to send it.':'The sales report has been sent.'));}
}

// 6. No tool needed: greetings, help, thanks and off-topic chat.
const chat:[string,string[]][]=[
 ['Hello',['Hello! How can I help with your store today?','Hi! What would you like to check?']],['Hi Alexa',['Hi! Ask me about stock, sales or restocking.']],
 ['Thank you',['You’re welcome!','Happy to help.']],['Thanks, that’s all',['You’re welcome. Have a good evening.']],
 ['What can you do?',['I can find products and their shelf locations, check stock and prices, summarise today’s sales, reconcile inventory and draft restock orders for your approval.']],
 ['Good morning',['Good morning! Ready when you are.']],['Who are you?',['I’m StoreYog, your store assistant for Little India Grocery.']],
 ['Tell me a joke',['Why did the lentil break up with the rice? It needed some space in the pantry.']],['What time do you close?',['I don’t have store hours in my tools, but I can help with stock, sales and orders.']],
];
chat.push(
 ['Good night',['Good night! Your store data will be here tomorrow.']],['Are you there?',['Yes, I’m here. What would you like to check?']],
 ['Can you hear me?',['Yes, I can hear you. How can I help?']],['That’s great',['Glad to help!']],['Okay',['Anything else you’d like to check?']],
 ['What’s the weather today?',['I can’t check the weather. I can help with your store’s stock, sales and orders.']],
 ['Play some music',['I can’t play music here, but I can check stock, sales or draft a restock.']],
 ['How do I make dal?',['Rinse the dal, simmer it with turmeric and salt until soft, then add a tempering of ghee, cumin and garlic. I can also check how much dal you have.']],
 ['What is garam masala?',['Garam masala is a warm spice blend, usually with cardamom, cinnamon, cloves, cumin and pepper.']],
 ['Can you place an order without asking me?',['No. I always draft the order first and wait for your clear yes before placing it.']],
 ['Is this a real Amazon order?',['No. Supplier orders in this demo are simulated; nothing is purchased.']],
 ['Never mind',['Okay. I’m here when you need me.']],['Help',['Try asking where something is, how much is left, how sales are today, or to restock what is low.']],
);
chat.push(
 ['Is this a real Amazon order?',['No. Supplier orders in this demo are simulated; nothing is purchased.']],['Do you take payments?',['No. Checkout records the sale and updates stock, but no payment is collected.']],
 ['Are you a real person?',['No, I’m StoreYog, a voice assistant for your store.']],['Can customers see my sales?',['No. Customers only see published products and shelf locations, never counts, costs or sales.']],
 ['Who made you?',['StoreYog was built for the Alexa+ hackathon as a store assistant for small businesses.']],['Goodbye',['Goodbye! Have a great day.']],['Bye',['Bye for now.']],
 ['Nice work',['Thank you!']],['Wait',['Sure, take your time.']],['Sorry, wrong question',['No problem. What would you like to check?']],
 ['What is the capital of India?',['New Delhi. For your store, I can check stock, sales or restocking.']],['How are you?',['I’m doing well, thanks! How can I help with the store?']],
 ['Can you speak Hindi?',['I answer in English for now, but I understand grocery names like haldi, jeera and aloo.']],
);
const openers=['','Alexa, ','Hey StoreYog, ','StoreYog, '];
for(let pass=0;pass<SCALE*3;pass++)for(const [q,answers] of chat)for(const a of answers)for(const o of shuffle(openers).slice(0,3)){const t=new Turn(o?o+q[0].toLowerCase()+q.slice(1):q);add('chat',null,t.answer(a));}

// Real conversations carry earlier, unrelated turns. Prepend one or two finished turns from other examples
// to about half of the single-turn examples, so the model acts on the latest request and ignores stale context.
const finished=examples.filter(e=>e.messages.filter(m=>m.role==='user').length===1).map(e=>[String(e.messages.find(m=>m.role==='user')!.content),String(e.messages.at(-1)!.content)] as [string,string]);
for(const e of examples){
 if(e.messages.filter(m=>m.role==='user').length!==1||rand()<0.5)continue;
 const earlier=Array.from({length:rand()<0.6?1:2},()=>pick(finished)).flatMap(([q,a])=>[{role:'user',content:q},{role:'assistant',content:a}]);
 e.messages.splice(1,0,...earlier);
}
const train=examples.filter(e=>e.split==='train'),evalSet=examples.filter(e=>e.split==='eval');
const write=(file:string,rows:any[])=>writeFileSync(path.join(out,file),rows.map(r=>JSON.stringify({kind:r.kind,heldOut:r.heldOut,tools:r.tools,messages:r.messages})).join('\n')+'\n');
write('train.jsonl',shuffle(train));write('eval.jsonl',evalSet);
const counts:Record<string,number>={};for(const e of examples)counts[e.kind]=(counts[e.kind]||0)+1;
console.log(JSON.stringify({train:train.length,eval:evalSet.length,counts}));
store.reset();process.exit(0);
