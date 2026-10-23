import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {z} from 'zod';
import type express from 'express';
import type {SqlDatabase} from './database.js';
import {runtimeDir} from './credentials.js';
export const photoDir=path.join(runtimeDir,'product-images');
const idSchema=z.string().uuid();
function info(row:any,url:string){return {id:row.id,url,description:row.description,marker:row.marker_x==null?null:{x:row.marker_x,y:row.marker_y},publicEnabled:!!row.public_enabled};}
export function ownerPhoto(db:SqlDatabase,storeId:string,item:string){const row=db.one('SELECT * FROM product_photos WHERE store_id=? AND item=?',[storeId,item]);return row?info(row,'/store/api/photos/'+row.id):null;}
export function customerPhoto(db:SqlDatabase,storeId:string,item:string,slug:string){const row=db.one('SELECT * FROM product_photos WHERE store_id=? AND item=? AND public_enabled=1',[storeId,item]);if(!row)return null;const {publicEnabled,...photo}=info(row,(process.env.PUBLIC_WEB_ORIGIN?new URL(process.env.PUBLIC_WEB_ORIGIN).origin:'')+'/shop/'+encodeURIComponent(slug)+'/api/photos/'+row.id);return photo;}
export async function normalizePhoto(bytes:Buffer){
 if(bytes.length>6*1024*1024)throw Error('Choose an image smaller than 6 MB.');
 try{const image=sharp(bytes,{limitInputPixels:25000000,animated:false}),meta=await image.metadata();if(!['jpeg','png','webp'].includes(meta.format||'')||(meta.pages||1)>1)throw Error();return await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();}catch{throw Error('Use a single JPEG, PNG or WebP photo, up to 25 megapixels.');}
}
export async function savePhoto(db:SqlDatabase,storeId:string,item:string,bytes:Buffer){
 if(!db.one('SELECT item FROM inventory WHERE store_id=? AND item=? LIMIT 1',[storeId,item]))throw Error('Save the product before uploading its photo.');
 const encoded=await normalizePhoto(bytes),id=crypto.randomUUID();await mkdir(photoDir,{recursive:true,mode:0o700});await writeFile(path.join(photoDir,id+'.webp'),encoded,{mode:0o600,flag:'wx'});
 // Replacing a photo always withdraws publication until the owner reviews it. Old files remain private.
 db.run("INSERT INTO product_photos(store_id,item,id) VALUES (?,?,?) ON CONFLICT(store_id,item) DO UPDATE SET id=excluded.id,description='',marker_x=NULL,marker_y=NULL,public_enabled=0",[storeId,item,id]);return ownerPhoto(db,storeId,item);
}
function imageResponse(res:express.Response,id:string){res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Type':'image/webp'}).sendFile(path.join(photoDir,id+'.webp'),{dotfiles:'allow'},err=>{if(err&&!res.headersSent)res.status(404).end();});}
export function serveCustomerPhoto(db:SqlDatabase,req:express.Request,res:express.Response){
 const id=idSchema.safeParse(req.params.id);if(!id.success)return res.status(404).end();
 const row=db.one('SELECT f.id FROM product_photos f JOIN store_profiles p ON p.store_id=f.store_id JOIN stores s ON s.id=p.store_id JOIN product_details d ON d.store_id=f.store_id AND d.item=f.item WHERE p.slug=? AND p.public_enabled=1 AND s.active=1 AND d.customer_visible=1 AND f.public_enabled=1 AND f.id=?',[req.params.slug,id.data]);if(!row)return res.status(404).end();imageResponse(res,row.id);
}
export function mountOwnerPhotos(router:express.Router,db:SqlDatabase){
 const uploads=new Map<string,{since:number,n:number}>();
 router.post('/api/photos',async(req,res,next)=>{try{const i=z.object({item:z.string().min(1).max(100),image:z.string().min(4).max(8*1024*1024).regex(/^[A-Za-z0-9+/]+={0,2}$/)}).parse(req.body),storeId=res.locals.owner.store_id;const quota=uploads.get(storeId)||{since:Date.now(),n:0};if(Date.now()-quota.since>3600000){quota.since=Date.now();quota.n=0;}uploads.set(storeId,quota);if(++quota.n>30)return res.status(429).json({error:'Photo limit reached. Try again in an hour.'});res.status(201).json({photo:await savePhoto(db,storeId,i.item,Buffer.from(i.image,'base64'))});}catch(e){next(e);}});
 router.get('/api/photos/:id',(req,res)=>{const id=idSchema.safeParse(req.params.id);if(!id.success||!db.one('SELECT id FROM product_photos WHERE id=? AND store_id=?',[id.data,res.locals.owner.store_id]))return res.status(404).end();imageResponse(res,id.data);});
 router.patch('/api/photos', (req,res,next)=>{try{const i=z.object({id:idSchema,description:z.string().trim().max(400),marker:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1)}).nullable(),publicEnabled:z.boolean()}).parse(req.body);const row=db.one('SELECT item FROM product_photos WHERE id=? AND store_id=?',[i.id,res.locals.owner.store_id]);if(!row)return res.status(404).json({error:'Photo not found. Reopen this product.'});db.run('UPDATE product_photos SET description=?,marker_x=?,marker_y=?,public_enabled=? WHERE id=? AND store_id=?',[i.description,i.marker?.x??null,i.marker?.y??null,i.publicEnabled?1:0,i.id,res.locals.owner.store_id]);res.json({photo:ownerPhoto(db,res.locals.owner.store_id,row.item)});}catch(e){next(e);}});
 // Shelf descriptions are written by the owner, or at ingestion time for demo/bulk images; there is no runtime image captioning.
}
