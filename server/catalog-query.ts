// "What do you have?" questions answered from the customer-visible catalog (names, sections, locations only).
type CatalogItem={name:string;category?:string;location?:string;available?:boolean};

// Spoken section names and synonyms, mapped to words that appear in the store's category names.
const SECTION_WORDS:[RegExp,string][]=[[/\b(?:rice|pantry|jaggery)\b/i,'rice'],[/\b(?:lentils?|dals?|pulses?|beans?|flours?|atta)\b/i,'lentils'],[/\b(?:spices?|masalas?|tea|chai)\b/i,'spices'],[/\b(?:oils?|ghee|fats?)\b/i,'fats'],[/\b(?:dairy|fridge|milk\s+products?)\b/i,'dairy'],[/\b(?:produce|vegetables?|veggies|fresh)\b/i,'produce'],[/\b(?:snacks?|pickles?|papad)\b/i,'snacks'],[/\b(?:frozen|freezer)\b/i,'frozen']];
const LISTING=/\b(?:what|which)\b.*\b(?:items?|products?|things|groceries|sections?|categories|aisles?|do\s+(?:you|we)\s+(?:have|sell|carry|stock)|you\s+(?:have|sell|carry)|in\s+(?:the\s+)?\w+)\b|\b(?:list|show|tell\s+me)\b.*\b(?:items?|products?|everything|catalog(?:ue)?|categories|sections?|what\s+you\s+have)\b|\bwhat(?:'s|\s+is)\s+(?:in|on)\s+(?:the\s+)?\w+/i;

// Low-stock, sales and order questions keep their own answers.
const NOT_CATALOG=/\b(?:low|running\s+(?:low|out)|sold|sales|best|top|reorder|restock|reconcile|alerts?|orders?|transactions?|expir\w*)\b/i;
// Returns null when the text is not a catalog question; otherwise the requested section word (or '' for all).
export function catalogQuestion(text:string):string|null{
 if(!LISTING.test(text)||NOT_CATALOG.test(text))return null;
 for(const [pattern,section] of SECTION_WORDS)if(pattern.test(text))return section;
 return /\b(?:items?|products?|everything|catalog(?:ue)?|sections?|categories|aisles?|have|sell|carry|stock|groceries)\b/i.test(text)?'':null;
}

const sectionOf=(items:CatalogItem[],word:string)=>items.filter(i=>(i.category||'').toLowerCase().includes(word));
const place=(items:CatalogItem[])=>{const first=(items[0]?.location||'').split(/,|—/)[0].trim();return first&&items.every(i=>(i.location||'').startsWith(first))?first:'';};
const names=(items:CatalogItem[])=>{const list=items.map(i=>i.name);return list.length>1?list.slice(0,-1).join(', ')+' and '+list.at(-1):list[0]||'';};

export function catalogAnswer(items:CatalogItem[],section:string){
 const visible=items.filter(i=>i.available!==false);
 if(section){
  const found=sectionOf(visible,section);
  if(!found.length)return 'I could not find that section. Ask what items we have to hear all the sections.';
  const where=place(found);
  return `${found[0].category}${where?`, ${where.charAt(0).toLowerCase()+where.slice(1)}`:''}: ${names(found)}. Ask where any of them is for the exact shelf.`;
 }
 const sections=[...new Set(visible.map(i=>i.category).filter(Boolean))] as string[];
 return `We carry ${visible.length} products in ${sections.length} sections: ${names(sections.map(s=>({name:s})))}. Ask what's in a section, for example what's in dairy, or where a product is.`;
}
