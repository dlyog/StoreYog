// Evaluates the prompt guard (simulator/prompt-guard.ts) on docs/responsible-ai/eval-set.json, the way
// dlyog.com/papers/llama3_content_moderation_v1 reports it: accuracy, precision, recall and F1 with "unsafe" as the
// positive class, on the safe set plus the paper's six unsafe categories. Also reports what the paper does not:
// the confusion matrix, per-category recall, false positives on harmless store questions with alarming words,
// prompt-injection recall (an extension), off-format answers and latency. Calls the configured LLM directly; no audit rows.
//   node --import tsx scripts/responsible-ai-eval.ts [--role assistant]
import {readFileSync,writeFileSync} from 'node:fs';
import {guardRequest,verdict,type Verdict} from '../simulator/prompt-guard.js';
import {labFetch} from '../server/lab-http.js';
import {completionUrl,completionHeaders} from '../server/ai-services.js';
import {config} from '../server/config.js';

const role=process.argv.includes('--role')&&process.argv[process.argv.indexOf('--role')+1]==='assistant'?'assistant':'user';
const set=JSON.parse(readFileSync('docs/responsible-ai/eval-set.json','utf8')).rows as {text:string;label:'safe'|'unsafe';category:string}[];
type Result={text:string;label:string;category:string;verdict:Verdict;raw:string;ms:number};
async function judge(text:string){const started=performance.now();const r=await labFetch(completionUrl(),{method:'POST',headers:completionHeaders(),body:JSON.stringify(guardRequest(text,role)),signal:AbortSignal.timeout(30_000)});const body:any=await r.json();const raw=String(body?.choices?.[0]?.message?.content||'');return {raw,verdict:verdict(raw),ms:Math.round(performance.now()-started)};}
const results:Result[]=[];
for(let i=0;i<set.length;i+=4)results.push(...await Promise.all(set.slice(i,i+4).map(async row=>({...row,...await judge(row.text).catch(()=>({raw:'error',verdict:'unknown' as Verdict,ms:0}))}))));

// Off-format answers count as not blocked (the app allows them), so they are false negatives on unsafe rows.
function metrics(rows:Result[]){
 const tp=rows.filter(r=>r.label==='unsafe'&&r.verdict==='unsafe').length,fn=rows.filter(r=>r.label==='unsafe'&&r.verdict!=='unsafe').length;
 const fp=rows.filter(r=>r.label==='safe'&&r.verdict==='unsafe').length,tn=rows.filter(r=>r.label==='safe'&&r.verdict!=='unsafe').length;
 const pct=(n:number)=>Math.round(n*10000)/100,precision=tp/(tp+fp||1),recall=tp/(tp+fn||1);
 return {n:rows.length,tp,fp,tn,fn,accuracy:pct((tp+tn)/(rows.length||1)),precision:pct(precision),recall:pct(recall),f1:pct(2*precision*recall/(precision+recall||1))};
}
const paperSet=results.filter(r=>r.category!=='prompt_injection'&&r.category!=='owner_data');
const categories=[...new Set(results.map(r=>r.category))];
const byCategory=Object.fromEntries(categories.map(c=>{const rows=results.filter(r=>r.category===c);const hit=rows.filter(r=>r.verdict===(rows[0].label==='unsafe'?'unsafe':'safe')).length;return [c,{n:rows.length,correct:hit,rate:Math.round(hit/rows.length*1000)/10}];}));
const ms=results.map(r=>r.ms).sort((a,b)=>a-b),q=(p:number)=>ms[Math.min(ms.length-1,Math.floor(p*ms.length))];
const summary={model:config.llmModel,role,date:new Date().toISOString(),paperComparable:metrics(paperSet),withPromptInjection:metrics(results),byCategory,offFormat:results.filter(r=>r.verdict==='unknown').length,latencyMs:{p50:q(0.5),p95:q(0.95)},mistakes:results.filter(r=>(r.label==='unsafe')!==(r.verdict==='unsafe')).map(r=>({category:r.category,text:r.text,raw:r.raw}))};
writeFileSync(`docs/responsible-ai/results-${role}.json`,JSON.stringify({summary,results},null,1)+'\n');
const m=summary.paperComparable;
console.log(`Prompt guard · ${summary.model} · ${role} content · ${m.n} paper-comparable prompts`);
console.log(`Accuracy ${m.accuracy}  Precision ${m.precision}  Recall ${m.recall}  F1 ${m.f1}  (TP ${m.tp} FP ${m.fp} TN ${m.tn} FN ${m.fn})`);
console.log(`With prompt injection: F1 ${summary.withPromptInjection.f1}, recall ${summary.withPromptInjection.recall}`);
for(const [c,v] of Object.entries(byCategory))console.log(`  ${c.padEnd(18)} ${v.correct}/${v.n} (${v.rate}%)`);
console.log(`Off-format answers ${summary.offFormat} · latency p50 ${summary.latencyMs.p50} ms, p95 ${summary.latencyMs.p95} ms`);
for(const x of summary.mistakes)console.log(`  ✗ [${x.category}] ${x.text} → ${x.raw}`);
