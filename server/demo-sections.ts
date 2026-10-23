// Section photos for the synthetic demo store (prompts: demo-assets/SECTION_PROMPTS.md). Each photo is shared by
// the products in that section, with one arrow per product. Arrow positions are normalized (0–1), set by
// inspecting each finished image on a 10% grid; a missing image file is skipped, so the store works before the photos exist.
import {readFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import type {SqlDatabase} from './database.js';
import {savePhoto} from './photos.js';

type Marker=[item:string,x:number,y:number,description:string];
export const SECTION_PHOTOS:Record<string,Marker[]>={
 'lentils-flour':[['Poha',.18,.12,'Flattened rice flakes, top shelf left.'],['Sooji',.52,.12,'Semolina bags, top shelf center.'],['Besan',.84,.12,'Gram flour bags, top shelf right.'],['Moong dal',.61,.35,'Green lentil bags, middle shelf right.'],['Masoor dal',.88,.35,'Orange lentil bags, middle shelf far right.'],['Kabuli chana',.18,.6,'Large white chickpeas, lower shelf left.'],['Rajma',.52,.6,'Red kidney beans, lower shelf center.'],['Urad dal',.84,.6,'White lentil bags, lower shelf right.'],['Atta',.18,.84,'Large flour sacks, bottom shelf left.']],
 'spice-rack':[['Garam masala',.25,.15,'Brown spice pouches, top row left.'],['Cardamom',.75,.15,'Green cardamom pods, top row right.'],['Coriander powder',.25,.39,'Light brown pouches, second row left.'],['Red chili powder',.75,.39,'Bright red pouches, second row right.'],['Mustard seeds',.5,.61,'Small dark seeds, third row.']],
 'oils-ghee':[['Ghee',.38,.2,'Glass jars of ghee, top shelf.'],['Jaggery',.88,.15,'Golden jaggery blocks, top right.'],['Mustard oil',.3,.55,'Amber bottles, middle shelf left.'],['Coconut oil',.8,.55,'Clear bottles, middle shelf right.']],
 'dairy-fridge':[['Paneer',.5,.2,'Paneer packs, top shelf.'],['Dahi',.5,.47,'Yogurt tubs, middle shelf.'],['Milk',.5,.78,'Milk jugs, bottom shelf.']],
 'produce-bins':[['Tomatoes',.2,.42,'Red tomatoes, left bin.'],['Onions',.52,.4,'Brown onions, center bin.'],['Ginger',.8,.33,'Fresh ginger, basket right.'],['Green chilies',.84,.5,'Green chilies, basket right, below the ginger.'],['Potatoes',.53,.82,'Potatoes, front crate.'],['Cilantro',.83,.1,'Cilantro bunches, chilled shelf top right.']],
 'freezer':[['Frozen samosas',.5,.17,'Frozen samosa boxes, top basket.'],['Samosa wrappers',.5,.47,'Samosa wrapper packs, middle basket.'],['Frozen parathas',.5,.78,'Frozen paratha packs, bottom basket.']],
 'snacks-pickles':[['Papad',.5,.25,'Papad packs, top shelf.'],['Mango pickle',.5,.7,'Mango pickle jars, lower shelf.']],
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
