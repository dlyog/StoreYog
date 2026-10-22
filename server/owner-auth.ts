import {scryptSync,randomBytes,timingSafeEqual} from 'node:crypto';import {existsSync,writeFileSync,readFileSync} from 'node:fs';import path from 'node:path';
import {getDatabase,type SqlDatabase} from './database.js';import {runtimeDir,type Credentials} from './credentials.js';
export function passwordHash(password:string){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
export function ownerLogin(email:string,password:string,db=getDatabase()){
 const row=db.one('SELECT u.*,s.name AS store_name FROM owner_users u JOIN stores s ON s.id=u.store_id WHERE u.email=? AND u.active=1 AND s.active=1',[email.trim().toLowerCase()]);
 const [salt,expected]=(row?.password_hash||'00000000000000000000000000000000:'+Buffer.alloc(64).toString('hex')).split(':');const actual=scryptSync(password,salt,64);if(!row||!timingSafeEqual(actual,Buffer.from(expected,'hex')))return null;return row;
}
export function bootstrapOwner(credentials:Credentials,db=getDatabase()){
 const file=path.join(runtimeDir,'owner-login.json');const saved=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{email:process.env.STORE_OWNER_EMAIL||'owner@example.test',password:process.env.STORE_OWNER_PASSWORD||randomBytes(18).toString('base64url')};
 const email=(process.env.STORE_OWNER_EMAIL||saved.email).toLowerCase(),password=process.env.STORE_OWNER_PASSWORD||saved.password;
 if(password.length<12)throw new Error('STORE_OWNER_PASSWORD must contain at least 12 characters.');
 if(!db.one('SELECT id FROM owner_users WHERE email=?',[email]))db.run('INSERT INTO owner_users(id,email,store_id,password_hash) VALUES (?,?,?,?)',[crypto.randomUUID(),email,credentials.storeId,passwordHash(password)]);
 if(!existsSync(file))writeFileSync(file,JSON.stringify({email,password,storeId:credentials.storeId},null,2)+'\n',{mode:0o600,flag:'wx'});
}
