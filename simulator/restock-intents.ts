import type {OrderLine} from '../server/store.js';
const onlyItem=/(?:only|just)\s+(?:(?:re)?order\s+)?(?:the\s+)?(basmati\s+rice|rice|toor\s+dal|dal|lentils)\b/i;
export function narrowRestock(text:string,items:OrderLine[]):OrderLine[]|null{
 const match=onlyItem.exec(text);if(!match)return null;
 // Reject explicit negation of the positive selection instead of guessing consent.
 if(/(?:do not|don.t|never)\s+(?:(?:re)?order\s+)?(?:only|just)\b/i.test(text))return null;
 const rice=/rice/i.test(match[1]);const selected=items.filter(i=>rice?/\brice\b/i.test(i.item):/\bdal\b|lentil/i.test(i.item));
 return selected.length?selected:null;
}
export const invokesStoreYog=(text:string)=>/^(?:alexa[,\s]+)?(?:connect|open|launch|start)(?:\s+to)?\s+store\s*yogg?[.!?\s]*$/i.test(text.trim());
export const asksCurrentInventory=(text:string)=>/\b(?:how|what|check|show)\b.*\b(?:current\s+)?inventory\b/i.test(text)&&!/\b(?:set|update|change|email|send|report|reorder|restock|don.t|do not)\b/i.test(text);
