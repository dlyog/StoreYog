// Section photos for the synthetic demo store (prompts: demo-assets/SECTION_PROMPTS.md). Each photo is shared by
// the products in that section, with one arrow per product. Arrow positions are normalized (0–1) and are checked
// against the finished image; a missing image file is skipped, so the store works before the photos exist.
import {readFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import type {SqlDatabase} from './database.js';
import {savePhoto} from './photos.js';

type Marker=[item:string,x:number,y:number,description:string];
export const SECTION_PHOTOS:Record<string,Marker[]>={
 'lentils-flour':[['Poha',.17,.15,'Flattened rice flakes, top shelf left.'],['Sooji',.5,.15,'Semolina bags, top shelf center.'],['Besan',.83,.15,'Gram flour bags, top shelf right.'],['Moong dal',.68,.42,'Green lentil bags, middle shelf right.'],['Masoor dal',.88,.42,'Orange lentil bags, middle shelf far right.'],['Kabuli chana',.17,.65,'Large white chickpeas, lower shelf left.'],['Rajma',.5,.65,'Red kidney beans, lower shelf center.'],['Urad dal',.83,.65,'White lentil bags, lower shelf right.'],['Atta',.17,.88,'Large flour sacks, bottom shelf left.']],
 'spice-rack':[['Garam masala',.25,.15,'Brown spice pouches, top row left.'],['Cardamom',.75,.15,'Green cardamom pods, top row right.'],['Coriander powder',.25,.38,'Light brown pouches, second row left.'],['Red chili powder',.75,.38,'Bright red pouches, second row right.'],['Mustard seeds',.5,.62,'Small dark seeds, third row.']],
 'oils-ghee':[['Ghee',.4,.2,'Glass jars of ghee, top shelf.'],['Jaggery',.85,.25,'Golden jaggery blocks, upper right.'],['Mustard oil',.25,.52,'Amber bottles, middle shelf left.'],['Coconut oil',.7,.52,'Clear bottles, middle shelf right.']],
 'dairy-fridge':[['Paneer',.5,.2,'Paneer packs, top shelf.'],['Dahi',.5,.5,'Yogurt tubs, middle shelf.'],['Milk',.5,.8,'Milk jugs, bottom shelf.']],
 'produce-bins':[['Tomatoes',.18,.45,'Red tomatoes, left bin.'],['Onions',.5,.45,'Brown onions, center bin.'],['Ginger',.76,.45,'Fresh ginger, small basket right.'],['Green chilies',.9,.45,'Green chilies, small basket right.'],['Potatoes',.5,.85,'Potatoes, floor crate.'],['Cilantro',.88,.15,'Cilantro bunches, chilled shelf top right.']],
 'freezer':[['Frozen samosas',.5,.2,'Frozen samosa boxes, top basket.'],['Samosa wrappers',.5,.5,'Samosa wrapper packs, middle basket.'],['Frozen parathas',.5,.8,'Frozen paratha packs, bottom basket.']],
 'snacks-pickles':[['Papad',.5,.3,'Papad packs, top shelf.'],['Mango pickle',.5,.72,'Mango pickle jars, lower shelf.']],
};
const SYNTHETIC=' AI-generated synthetic demo image.';

async function sectionFile(name:string){
 for(const ext of ['webp','png','jpg']){const file=fileURLToPath(new URL(`./demo-assets/sections/${name}.${ext}`,import.meta.url));try{await access(file);return file;}catch{}}
 return null;
}

// Attaches each available section photo to its products (published, synthetic label) and keeps arrows current.
export async function seedSectionPhotos(db:SqlDatabase,storeId:string){
 for(const [name,markers] of Object.entries(SECTION_PHOTOS)){
  const file=await sectionFile(name);if(!file)continue;const bytes=await readFile(file);
  for(const [item,x,y,description] of markers){
   if(!db.one('SELECT item FROM product_details WHERE store_id=? AND item=?',[storeId,item]))continue;
   let photo=db.one('SELECT id FROM product_photos WHERE store_id=? AND item=?',[storeId,item]) as {id:string}|undefined;
   if(!photo)photo=await savePhoto(db,storeId,item,bytes) as {id:string};
   db.run('UPDATE product_photos SET description=?,marker_x=?,marker_y=?,public_enabled=1 WHERE id=?',[description+SYNTHETIC,x,y,photo.id]);
  }
 }
}
