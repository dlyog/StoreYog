// Compact text protocol for the StoreYog small tool-calling model (OPT-350M fine-tune, 2,048-token context).
// The model learns the seven MCP tools by heart, so prompts carry no tool declarations. Each step is one line:
//   ### Catalog: <product names>     (the store's current products, so new products work without retraining)
//   ### Owner: <request>
//   ### Call: <tool> <json args>        (generation stops at "### Result:"; the app runs the MCP tool)
//   ### Result: <one-line facts>
//   ### Answer: <spoken reply>
// training/tool-model/to-text.ts renders the fine-tuning set with these same functions.
export const STOP='### Result:';
const money=(n:number)=>`$${Number.isInteger(n)?n:Number(n).toFixed(2)}`;

export function formatResult(name:string,result:any):string{
 if(!result||typeof result!=='object')return String(result);
 if(result.error)return `error: ${result.error}`;
 if(name==='get_inventory'){
  const items=(result.items||[]) as any[];
  if(!items.length)return 'no matching item';
  const head=`${items.length} item${items.length===1?'':'s'}, ${result.reconciledOn?'reconciled today':'opening stock, not reconciled'}`;
  // A long list keeps only names and counts so the prompt stays inside the context window.
  if(items.length>6)return `${head}: `+items.map(i=>`${i.item} ${i.stock}`).join('; ');
  return `${head}: `+items.map(i=>`${i.item} | ${i.stock} of ${i.fullStock} x ${i.unit} (${i.percentRemaining}%) | reorder at ${i.reorderThreshold} | price ${money(i.sellingPrice??0)} cost ${money(i.unitCost??0)} | ${i.location||'no location'}`).join(' || ');
 }
 if(name==='get_todays_transactions')return `revenue ${money(result.totalRevenue)}, ${result.transactionCount} transactions, ${result.changePercent}% vs 7-day average`;
 if(name==='reconcile_inventory'){
  const low=(result.lowItems||[]) as any[];
  return `${result.alreadyReconciled?'already reconciled':'reconciled'}; low: ${low.length?low.map(i=>`${i.item} ${i.percentRemaining}% (${i.stock} of ${i.fullStock})`).join(', '):'none'}; suggested: ${(result.suggestedReorder||[]).map((i:any)=>`${i.item} ${i.qty}`).join(', ')||'none'}`;
 }
 if(name==='place_reorder')return `${result.status}: ${(result.items||[]).map((i:any)=>`${i.item} ${i.qty} x ${i.unit} ${money(i.cost)}`).join(', ')}; total ${money(result.estimatedCost)}; supplier ${result.supplier}`;
 return String(result.summary||JSON.stringify(result));
}
export const formatCall=(name:string,args:Record<string,any>)=>`### Call: ${name} ${JSON.stringify(args||{})}`;
export function formatPrompt(history:{role:'user'|'assistant';content:string}[],text:string,steps:{name:string;args:any;result:any}[],catalog:string[]=[]){
 const earlier=history.slice(-4).map(m=>m.role==='user'?`### Owner: ${m.content}`:`### Answer: ${m.content}`);
 return [...(catalog.length?[`### Catalog: ${catalog.join('; ')}`]:[]),...earlier,`### Owner: ${text}`,...steps.flatMap(s=>[formatCall(s.name,s.args),`${STOP} ${formatResult(s.name,s.result)}`])].join('\n')+'\n';
}
// Parses the model's next line: a tool call or the spoken answer.
export function parseStep(output:string):{call?:{name:string;args:Record<string,any>};answer?:string}{
 const line=output.split(STOP)[0].trim();
 const call=/^### Call:\s*([a-z_]+)\s*(\{.*\})?\s*$/m.exec(line);
 if(call){try{return {call:{name:call[1],args:call[2]?JSON.parse(call[2]):{}}};}catch{return {};}}
 const answer=/### Answer:\s*([\s\S]*?)(?:\n###|$)/.exec(line)?.[1]?.trim();
 return answer?{answer}:{};
}
