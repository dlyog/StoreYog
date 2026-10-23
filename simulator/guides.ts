// Original StoreYog audio guides (classical-alexa/audio-guides/): inventory, small business, and food/nutrition
// for the store's products. Shared by the classic Alexa skill and the web simulator's play_guide tool.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {normalizeSpoken} from './inventory-query.js';

export type Guide={id:string;category:string;title:string;keywords:string[]};
export const GUIDES:Guide[]=JSON.parse(readFileSync(fileURLToPath(new URL('../classical-alexa/audio-guides/guides.json',import.meta.url)),'utf8')).guides;
export const GUIDE_DIR=fileURLToPath(new URL('../classical-alexa/audio-guides/audio/',import.meta.url));
// Catalog words (after normalizing spoken spellings).
export const PRODUCT=/\b(?:rice|basmati|dal|toor|chana|moong|masoor|urad|rajma|kabuli|atta|besan|sooji|poha|jaggery|ghee|ginger|oil|coconut|mustard|onions?|potatoes?|tomatoes?|chilies|chili|cilantro|paneer|dahi|milk|parathas?|samosas?|wrappers?|pickle|papad|tea|turmeric|cumin|coriander|cardamom|masala)\b/i;
export const NUTRITION=/\b(?:protein|carbs?|carbohydrates?|fib(?:er|re)|fats?|calories|nutrition(?:al)?|nutrients?|healthy|healthier|health|benefits?|vitamins?|iron|calcium|diet)\b/i;
const NUMBER_WORDS:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30};
export function categoryOf(text:string){if(NUTRITION.test(text)||/\b(?:food|nutrition|eat|eating)\b/i.test(text))return 'food';if(/\b(?:business|grow|growth|cash|marketing|customers?|pricing|price|margin|staff|hiring|suppliers?)\b/i.test(text))return 'business';if(/\b(?:inventory|stock|reorder|shelf|shelves|counting|expiry)\b/i.test(text))return 'inventory';return '';}
// Picks a guide: an explicit number, "next" in the same set, the best keyword match, or the first in a set.
// With fallback, a request with no clear topic continues after the last guide played (or starts at guide 1).
export function pickGuide(text:string,lastId?:string,fallback=false):Guide|undefined{
 const t=normalizeSpoken(text),num=/\bguide\s+(?:number\s+)?(\d+|[a-z]+(?:[\s-][a-z]+)?)\b/.exec(t)?.[1];
 if(num){const n=/^\d+$/.test(num)?Number(num):num.split(/[\s-]/).reduce((sum,w)=>sum+(NUMBER_WORDS[w]||0),0);const g=GUIDES.find(x=>Number(x.id)===n);if(g)return g;}
 const category=categoryOf(t),last=GUIDES.find(g=>g.id===lastId);
 if(/\b(?:next|another|one more)\b/.test(t)&&last){const pool=GUIDES.filter(g=>g.category===(category||last.category));return pool[(pool.indexOf(last)+1)%pool.length]||pool[0];}
 const scored=GUIDES.filter(g=>!category||g.category===category).map(g=>({g,score:g.keywords.reduce((sum,k)=>sum+(new RegExp('\\b'+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b').test(t)?(k.includes(' ')?2:PRODUCT.test(k)?3:1):0),0)})).sort((a,b)=>b.score-a.score);
 if(scored[0]?.score)return scored[0].g;
 if(category)return GUIDES.find(g=>g.category===category&&g.id!==last?.id);
 return fallback?GUIDES[last?(GUIDES.indexOf(last)+1)%GUIDES.length:0]:undefined;
}
