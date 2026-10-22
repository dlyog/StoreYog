import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import type {SqlDatabase} from './database.js';
import {Store,storeDate} from './store.js';
import {savePhoto} from './photos.js';
// Only the configured fictitious demo tenant receives synthetic media. Never populate a registered business.
export async function seedDemoShelves(db:SqlDatabase,storeId:string,storeName:string){
 if(db.one('SELECT store_id FROM store_profiles WHERE store_id=? AND kind=?',[storeId,'business']))return;
 new Store(storeDate,db,storeId,storeName);
 db.run("INSERT OR IGNORE INTO store_profiles(store_id,slug,kind,public_enabled,description,plan) VALUES (?,?,'demo',1,?,?)",[storeId,'raj-demo','Fictitious Indian grocery · Synthetic inventory and AI-generated shelf photo for demonstration only.','Pantry shelves: rice on the bottom shelf, yellow lentils on the middle shelf, spices above. Frozen items at the rear.']);
 const products=[['Basmati rice','Bottom shelf, left — large clear bags of white rice.',.22,.86,'Large clear bags of white rice on the bottom shelf.'],['Toor dal','Middle shelf, center — clear bags of yellow lentils.',.55,.48,'Clear yellow lentil bags in the center of the middle shelf.'],['Chana dal','Middle shelf, left — yellow lentil bags.',.3,.48,'Yellow lentil bags on the left side of the middle shelf.'],['Turmeric','Top shelf, left of center — yellow spice jar.',.29,.12,'Bright yellow spice jar on the top shelf.'],['Cumin seeds','Top shelf, left — plain spice jars.',.09,.12,'Spice jars at the left of the top shelf.'],['Tea','Top shelf, right — plain packets.',.74,.13,'Plain packets on the right side of the top shelf.']] as const;
 for(const [item,location,x,y,description]of products){db.run('INSERT OR IGNORE INTO product_details(store_id,item,category,location,customer_visible,selling_price) SELECT store_id,item,?,?,1,unit_cost*1.5 FROM inventory WHERE store_id=? AND item=? LIMIT 1',['Pantry',location,storeId,item]);if(!db.one('SELECT id FROM product_photos WHERE store_id=? AND item=?',[storeId,item])){const photo=await savePhoto(db,storeId,item,await readFile(fileURLToPath(new URL('./demo-assets/indian-grocery-shelf.webp',import.meta.url))));db.run('UPDATE product_photos SET description=?,marker_x=?,marker_y=?,public_enabled=1 WHERE id=?',[description+' AI-generated synthetic demo image.',x,y,photo!.id]);}}
}
