// Item answers come directly from MCP stock rows, never a model summary.
type StockItem={item:string;stock:number;unit:string};
const words=(text:string):string[]=>text.toLowerCase().replace(/lentils?/g,'dal').match(/[a-z0-9]+/g)||[];
const ignored=new Set('alexa how much many do does we you i have got is are there any available availability stock inventory check show tell me my the a an of in on for please current currently bags bag bottles bottle boxes box packs pack pieces piece kilograms kilogram kg litres liters litre liter left remaining look like looks can could what about today'.split(' '));
export function inventoryQuestion(text:string,items:StockItem[]):StockItem[]|null{
 if(/\b(?:set|update|change|receive|add|remove|deduct|order|reorder|restock|email|send|report|reconcile|reconciliation)\b/i.test(text))return null;
 const terms=words(text).filter(word=>!ignored.has(word));
 const matches=items.filter(item=>{const name=words(item.item);return terms.length>0&&terms.every(word=>name.includes(word));});
 const explicit=/\b(?:how\s+(?:much|many)|do\s+(?:you|we)\s+have|(?:is|are)\b.*\b(?:available|in stock)|availability)\b/i.test(text);
 return matches.length||explicit?matches:null;
}
export function stockAnswer(items:StockItem[],reconciled:boolean){
 if(!items.length)return 'I could not find that product in this store’s inventory. Please try its product name.';
 const lines=items.map(item=>{const measured=/^(.+) (bag|bottle|box|pack|piece|can|jar|carton)$/i.exec(item.unit);const noun=measured?.[2]||item.unit;const unit=noun+(item.stock!==1&&/^(?:bag|bottle|pack|piece|can|jar|carton)$/i.test(noun)?'s':item.stock!==1&&noun==='box'?'es':'');return `${item.item}: ${item.stock} ${unit}${measured?` (${measured[1]} each)`:''} in stock.`;});
 return lines.join(' ')+(reconciled?'':" These are opening stock counts; today’s sales have not been reconciled yet.");
}
