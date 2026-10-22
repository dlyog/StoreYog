import {existsSync,mkdirSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import 'dotenv/config';
export const runtimeDir=path.resolve(process.env.RUNTIME_DIR||'.runtime');
export const credentialsPath=path.join(runtimeDir,'credentials.json');
export type Credentials={storeId:string;storeName:string;apiKey:string;adminKey:string;internalToken:string};
export function bootstrapCredentials():Credentials{
 mkdirSync(runtimeDir,{recursive:true,mode:0o700});
 let saved:Credentials;
 if(existsSync(credentialsPath))saved=JSON.parse(readFileSync(credentialsPath,'utf8'));
 else{saved={storeId:'little-india',storeName:'Little India Grocery',apiKey:`sp_${randomBytes(32).toString('base64url')}`,adminKey:`spa_${randomBytes(32).toString('base64url')}`,internalToken:randomBytes(32).toString('base64url')};writeFileSync(credentialsPath,JSON.stringify(saved,null,2)+'\n',{mode:0o600,flag:'wx'});}
 chmodSync(credentialsPath,0o600);
 const effective={storeId:process.env.MCP_STORE_ID||saved.storeId,storeName:process.env.MCP_STORE_NAME||saved.storeName,apiKey:process.env.MCP_API_KEY||saved.apiKey,adminKey:process.env.MCP_ADMIN_KEY||saved.adminKey,internalToken:process.env.INTERNAL_TOKEN||saved.internalToken};
 for(const value of [effective.apiKey,effective.adminKey,effective.internalToken])if(value.length<24)throw new Error('MCP credentials must contain at least 24 characters.');
 if(effective.adminKey===effective.apiKey)throw new Error('Admin and store credentials must be different.');
 return effective;
}
