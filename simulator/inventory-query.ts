// Item answers come directly from MCP stock rows, never a model summary.
type StockItem={item:string;stock:number;unit:string};
// Speech-to-text spellings (Alexa often writes "dahl") and common Hindi names map to catalog words.
const SPOKEN:[RegExp,string][]=[[/lentils?/g,'dal'],[/\b(?:dahl|daal|dhal|dhall|dall)\b/g,'dal'],[/\bchann?a\b/g,'chana'],[/\bjeera\b/g,'cumin'],[/\bhaldi\b/g,'turmeric'],[/\bchai\b/g,'tea'],[/\bata\b/g,'atta'],[/\bpanir\b/g,'paneer'],[/\bmung\b/g,'moong'],[/\b(?:curd|yogh?urt)\b/g,'dahi'],[/\bchill?ies\b/g,'chilies'],[/\bchill?i\b/g,'chili'],[/\bchick\s?peas?\b/g,'kabuli chana'],[/\bsuji\b/g,'sooji'],[/\bgur\b/g,'jaggery'],[/\b(?:dhaniya|coriander leaves)\b/g,'cilantro']];
export const normalizeSpoken=(text:string)=>SPOKEN.reduce((t,[pattern,word])=>t.replace(pattern,word),text.toLowerCase());
const words=(text:string):string[]=>normalizeSpoken(text).match(/[a-z0-9]+/g)||[];
const ignored=new Set('alexa how much many do does we you i have got is are there any available availability stock inventory check show tell me my the a an of in on for please current currently bags bag bottles bottle boxes box packs pack pieces piece kilograms kilogram kg litres liters litre liter left remaining look like looks can could what about today no yes ok okay just again got some need'.split(' '));
const CHANGES=/\b(?:set|update|change|receive|add|remove|deduct|order|reorder|restock|email|send|report|reconcile|reconciliation)\b/i;
// Routes a turn to the direct MCP count answer. Sales and order questions keep their own paths.
export function asksAboutStock(text:string){
 return /\b(?:how\s+(?:much|many)|available|availability|in stock|do\s+(?:you|we|i)\s+have|check|got\s+any|have\s+any)\b/i.test(text)
  &&!CHANGES.test(text)&&!/\b(?:sales|sold|sell|revenue|made|make|earn(?:ed)?|money|profit|transactions?|orders?|best\s*sellers?|store\s+doing)\b/i.test(text);
}
export function inventoryQuestion(text:string,items:StockItem[]):StockItem[]|null{
 if(CHANGES.test(text))return null;
 const terms=words(text).filter(word=>!ignored.has(word));
 const matches=items.filter(item=>{const name=words(item.item);return terms.length>0&&terms.every(word=>name.includes(word));});
 const explicit=/\b(?:how\s+(?:much|many)|do\s+(?:you|we|i)\s+have|check|got\s+any|(?:is|are)\b.*\b(?:available|in stock)|availability)\b/i.test(text);
 return matches.length||explicit?matches:null;
}
export function stockAnswer(items:StockItem[],reconciled:boolean){
 if(!items.length)return 'I could not find that product in this store’s inventory. Please try its product name.';
 const lines=items.map(item=>{const measured=/^(.+) (bag|bottle|box|pack|piece|can|jar|carton)$/i.exec(item.unit);const noun=measured?.[2]||item.unit;const unit=noun+(item.stock!==1&&/^(?:bag|bottle|pack|piece|can|jar|carton)$/i.test(noun)?'s':item.stock!==1&&noun==='box'?'es':'');return `${item.item}: ${item.stock} ${unit}${measured?` (${measured[1]} each)`:''} in stock.`;});
 return lines.join(' ')+(reconciled?'':" These are opening stock counts; today’s sales have not been reconciled yet.");
}
