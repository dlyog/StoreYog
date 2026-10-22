import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import type {Request} from 'express';
import {getDatabase,type SqlDatabase} from './database.js';
import {bootstrapCredentials} from './credentials.js';
import {Store,storeDate} from './store.js';
export const ALL_SCOPES=['inventory:read','inventory:write','orders:write','reports:send'] as const;
export type Identity={storeId:string;storeName:string;keyId:string;scopes:string[]};
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function secretEqual(a:string,b:string){const x=Buffer.from(hash(a)),y=Buffer.from(hash(b));return timingSafeEqual(x,y);}
export function bearer(req:Request){const auth=req.get('authorization')||'';return /^Bearer [^\s]+$/i.test(auth)?auth.slice(7):'';}
export function provisionKey(db:SqlDatabase,storeId:string,label:string,scopes:readonly string[]=ALL_SCOPES,key=`sp_${randomBytes(32).toString('base64url')}`){
 const id=crypto.randomUUID();db.run('INSERT INTO api_keys(id,store_id,label,key_hash,prefix,scopes) VALUES (?,?,?,?,?,?)',[id,storeId,label,hash(key),key.slice(0,10),JSON.stringify(scopes)]);return {id,key,storeId,label,scopes};
}
export function initializeIdentity(db=getDatabase()){
 const credentials=bootstrapCredentials();new Store(storeDate,db,credentials.storeId,credentials.storeName);
 if(!db.one('SELECT id FROM api_keys WHERE key_hash = ?',[hash(credentials.apiKey)]))provisionKey(db,credentials.storeId,'Default simulator',ALL_SCOPES,credentials.apiKey);
 const primary=db.one('SELECT id,scopes FROM api_keys WHERE key_hash=?',[hash(credentials.apiKey)]);if(primary&&!JSON.parse(primary.scopes).includes('reports:send'))db.run('UPDATE api_keys SET scopes=? WHERE id=?',[JSON.stringify([...JSON.parse(primary.scopes),'reports:send']),primary.id]);
 return credentials;
}
export function authenticate(token:string,db=getDatabase(),resource?:string):Identity|null{
 if(!token||token.length>300)return null;
 if(token.startsWith('spo_')){
  const row=db.one(`SELECT k.id,k.store_id,k.scopes AS parent_scopes,s.name,t.scopes,t.resource FROM oauth_tokens t JOIN api_keys k ON k.id=t.key_id JOIN stores s ON s.id=k.store_id WHERE t.hash=? AND t.kind='access' AND t.revoked=0 AND t.expires>? AND k.revoked=0 AND s.active=1`,[hash(token),Date.now()]);
  if(!row||(resource&&row.resource!==resource))return null;
  const scopes:string[]=JSON.parse(row.scopes),parent:string[]=JSON.parse(row.parent_scopes);if(scopes.some(s=>!parent.includes(s)))return null;
  return {storeId:row.store_id,storeName:row.name,keyId:row.id,scopes};
 }
 const row=db.one(`SELECT k.id,k.store_id,k.scopes,s.name FROM api_keys k JOIN stores s ON s.id = k.store_id WHERE k.key_hash = ? AND k.revoked = 0 AND s.active = 1`,[hash(token)]);
 if(!row)return null;db.run('UPDATE api_keys SET last_used_at = ? WHERE id = ?',[new Date().toISOString(),row.id]);return {storeId:row.store_id,storeName:row.name,keyId:row.id,scopes:JSON.parse(row.scopes)};
}
