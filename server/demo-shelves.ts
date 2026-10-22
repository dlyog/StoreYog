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
 // Locations for every product without a shelf photo (original staples and the extended synthetic catalog).
 const extended:[string,string,string,number][]=[
  ['Moong dal','Lentils & flour','Aisle 2, middle shelf, right — green lentil bags.',6.75],
  ['Masoor dal','Lentils & flour','Aisle 2, middle shelf, far right — orange lentil bags.',6.0],
  ['Urad dal','Lentils & flour','Aisle 2, lower shelf, right — white lentil bags.',7.5],
  ['Rajma','Lentils & flour','Aisle 2, lower shelf, center — red kidney beans.',6.75],
  ['Kabuli chana','Lentils & flour','Aisle 2, lower shelf, left — large white chickpeas.',6.0],
  ['Poha','Lentils & flour','Aisle 2, top shelf, left — flattened rice.',4.5],
  ['Sooji','Lentils & flour','Aisle 2, top shelf, center — semolina.',4.5],
  ['Besan','Lentils & flour','Aisle 2, top shelf, right — gram flour, next to the atta.',5.25],
  ['Jaggery','Pantry','Aisle 1, top shelf, right — golden blocks.',6.0],
  ['Coriander powder','Spices','Aisle 3, spice rack, second row.',3.75],
  ['Red chili powder','Spices','Aisle 3, spice rack, second row, right.',3.75],
  ['Mustard seeds','Spices','Aisle 3, spice rack, third row.',3.0],
  ['Cardamom','Spices','Aisle 3, spice rack, top row — near the counter.',9.0],
  ['Coconut oil','Cooking fats','Aisle 1, oil shelf, next to the mustard oil.',9.0],
  ['Dahi','Dairy','Dairy fridge, right wall, middle shelf.',5.25],
  ['Milk','Dairy','Dairy fridge, right wall, bottom shelf.',6.0],
  ['Tomatoes','Produce','Produce bins by the entrance, left.',1.8],
  ['Potatoes','Produce','Produce bins by the entrance, floor crate.',5.25],
  ['Green chilies','Produce','Produce bins by the entrance, small baskets.',2.25],
  ['Cilantro','Produce','Produce bins by the entrance, chilled shelf.',0.9],
  ['Mango pickle','Snacks & pickles','Aisle 4, pickles shelf.',6.0],
  ['Papad','Snacks & pickles','Aisle 4, snack shelf, top.',3.0],
  ['Frozen samosas','Frozen','Freezer at the rear, top basket.',9.0],
  ['Atta','Lentils & flour','Aisle 2, bottom shelf, left — large flour bags.',13.5],
  ['Ghee','Cooking fats','Aisle 1, oil shelf, top — glass jars.',12.0],
  ['Mustard oil','Cooking fats','Aisle 1, oil shelf, middle.',7.5],
  ['Garam masala','Spices','Aisle 3, spice rack, top row, left.',3.75],
  ['Samosa wrappers','Frozen','Freezer at the rear, middle basket.',4.5],
  ['Frozen parathas','Frozen','Freezer at the rear, bottom basket.',5.25],
  ['Paneer','Dairy','Dairy fridge, right wall, top shelf.',6.0],
  ['Onions','Produce','Produce bins by the entrance, right.',1.2],
  ['Ginger','Produce','Produce bins by the entrance, small baskets, right.',3.0],
 ];
 for(const [item,category,location,price]of extended)db.run('INSERT OR IGNORE INTO product_details(store_id,item,category,location,customer_visible,selling_price) VALUES (?,?,?,?,1,?)',[storeId,item,category,location,price]);
 for(const [item,location,x,y,description]of products){db.run('INSERT OR IGNORE INTO product_details(store_id,item,category,location,customer_visible,selling_price) SELECT store_id,item,?,?,1,unit_cost*1.5 FROM inventory WHERE store_id=? AND item=? LIMIT 1',['Pantry',location,storeId,item]);if(!db.one('SELECT id FROM product_photos WHERE store_id=? AND item=?',[storeId,item])){const photo=await savePhoto(db,storeId,item,await readFile(fileURLToPath(new URL('./demo-assets/indian-grocery-shelf.webp',import.meta.url))));db.run('UPDATE product_photos SET description=?,marker_x=?,marker_y=?,public_enabled=1 WHERE id=?',[description+' AI-generated synthetic demo image.',x,y,photo!.id]);}}
}
