// Converts build-dataset.ts conversations to the compact text protocol in simulator/small-model.ts.
//   node --import tsx training/tool-model/to-text.ts out/   → out/train.text.jsonl, out/eval.text.jsonl ({kind,text})
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {formatPrompt} from '../../simulator/small-model.js';
// Catalog names in each prompt: the full list in random order, sometimes a random subset that always keeps the
// products this conversation needs, so the model reads the list instead of memorising positions.
let seed=7;const rand=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
const CATALOG=['Basmati rice','Toor dal','Chana dal','Atta','Ghee','Mustard oil','Turmeric','Cumin seeds','Garam masala','Tea','Samosa wrappers','Frozen parathas','Paneer','Onions','Ginger','Moong dal','Masoor dal','Urad dal','Rajma','Kabuli chana','Poha','Sooji','Besan','Jaggery','Coriander powder','Red chili powder','Mustard seeds','Cardamom','Coconut oil','Dahi','Milk','Tomatoes','Potatoes','Green chilies','Cilantro','Mango pickle','Papad','Frozen samosas'];
function catalogFor(needed:string[]){const keep=rand()<0.6?CATALOG:CATALOG.filter(n=>needed.includes(n)||rand()<0.7);return keep.map(n=>[rand(),n] as const).sort((a,b)=>a[0]-b[0]).map(([,n])=>n);}
const dir=process.argv[2]||'training/tool-model/out';
for(const split of ['train','eval']){
 const rows=readFileSync(path.join(dir,`${split}.jsonl`),'utf8').trim().split('\n').map(l=>JSON.parse(l));
 const lines=rows.map(row=>{
  const msgs=row.messages.slice(1);const last=msgs.map((m:any)=>m.role).lastIndexOf('user');
  const history=msgs.slice(0,last).map((m:any)=>({role:m.role,content:m.content}));
  const steps:any[]=[];let answer='';
  for(let i=last+1;i<msgs.length;i++){const m=msgs[i];if(m.tool_calls){const f=m.tool_calls[0].function;steps.push({name:f.name,args:{...f.arguments},result:JSON.parse(msgs[++i].content)});}else answer=m.content;}
  // A lookup that found exactly one product searches by its catalog name (same result, since search is by substring).
  for(const s of steps)if(s.name==='get_inventory'&&s.args.item&&s.result.items?.length===1)s.args.item=s.result.items[0].item;
  const needed=steps.flatMap(s=>[...(s.result.items||[]).map((i:any)=>i.item),...(s.args.items||[]).map((i:any)=>i.item),s.args.item].filter(Boolean));
  return JSON.stringify({kind:row.kind,heldOut:row.heldOut||false,text:formatPrompt(history,msgs[last].content,steps,catalogFor(needed))+`### Answer: ${answer}\n`});
 });
 writeFileSync(path.join(dir,`${split}.text.jsonl`),lines.join('\n')+'\n');console.log(split,lines.length);
}
