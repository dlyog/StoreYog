import Database from 'better-sqlite3';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {runtimeDir} from './credentials.js';
export type SqlTrace={sql:string;params:unknown[];ms:number;rows:number;error?:string};
export class SqlDatabase{
 readonly connection:Database.Database;
 private capture:SqlTrace[]|null=null;
 constructor(filename=':memory:'){
  if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
  this.connection=new Database(filename);this.connection.pragma('journal_mode = WAL');this.connection.pragma('foreign_keys = ON');this.connection.pragma('busy_timeout = 1000');
  this.connection.exec(`
   CREATE TABLE IF NOT EXISTS stores(id TEXT PRIMARY KEY,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
   CREATE TABLE IF NOT EXISTS store_profiles(store_id TEXT PRIMARY KEY REFERENCES stores(id),slug TEXT UNIQUE NOT NULL,kind TEXT NOT NULL DEFAULT 'business',public_enabled INTEGER NOT NULL DEFAULT 0,description TEXT NOT NULL DEFAULT '',plan TEXT NOT NULL DEFAULT '');
   CREATE TABLE IF NOT EXISTS product_details(store_id TEXT NOT NULL REFERENCES stores(id),item TEXT NOT NULL,sku TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT '',location TEXT NOT NULL DEFAULT '',customer_visible INTEGER NOT NULL DEFAULT 0,selling_price REAL NOT NULL DEFAULT 0,PRIMARY KEY(store_id,item));
   CREATE TABLE IF NOT EXISTS product_photos(store_id TEXT NOT NULL REFERENCES stores(id),item TEXT NOT NULL,id TEXT UNIQUE NOT NULL,description TEXT NOT NULL DEFAULT '',marker_x REAL,marker_y REAL,public_enabled INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(store_id,item));
   CREATE TABLE IF NOT EXISTS shopper_queries(id INTEGER PRIMARY KEY AUTOINCREMENT,store_id TEXT NOT NULL,matched INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
   CREATE TABLE IF NOT EXISTS store_days(store_id TEXT NOT NULL REFERENCES stores(id),day TEXT NOT NULL,reconciled_on TEXT,PRIMARY KEY(store_id,day));
   CREATE TABLE IF NOT EXISTS inventory(store_id TEXT NOT NULL REFERENCES stores(id),day TEXT NOT NULL,item TEXT NOT NULL,unit TEXT NOT NULL,full_stock INTEGER NOT NULL,opening_stock INTEGER NOT NULL,stock INTEGER NOT NULL,reorder_threshold INTEGER NOT NULL,unit_cost REAL NOT NULL,sort_order INTEGER NOT NULL,PRIMARY KEY(store_id,day,item));
   CREATE TABLE IF NOT EXISTS transactions(store_id TEXT NOT NULL REFERENCES stores(id),day TEXT NOT NULL,id TEXT NOT NULL,item TEXT NOT NULL,qty INTEGER NOT NULL,amount REAL NOT NULL,time TEXT NOT NULL,receipt_id TEXT,PRIMARY KEY(store_id,day,id));
   CREATE TABLE IF NOT EXISTS daily_revenue(store_id TEXT NOT NULL REFERENCES stores(id),day TEXT NOT NULL,revenue REAL NOT NULL,PRIMARY KEY(store_id,day));
   CREATE TABLE IF NOT EXISTS orders(store_id TEXT NOT NULL REFERENCES stores(id),day TEXT NOT NULL,basket TEXT NOT NULL,order_id TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(store_id,day,basket));
   CREATE TABLE IF NOT EXISTS api_keys(id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),label TEXT NOT NULL,key_hash TEXT NOT NULL UNIQUE,prefix TEXT NOT NULL,scopes TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_used_at TEXT);
   CREATE TABLE IF NOT EXISTS mcp_calls(id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),key_id TEXT,method TEXT NOT NULL,tool TEXT,conversation_id TEXT,args_json TEXT NOT NULL,success INTEGER NOT NULL,duration_ms REAL NOT NULL,summary TEXT NOT NULL,error TEXT,queries_json TEXT NOT NULL,created_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS calls_store_time ON mcp_calls(store_id,created_at);
   CREATE TABLE IF NOT EXISTS pos_receipts(store_id TEXT NOT NULL REFERENCES stores(id),idempotency_key TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(store_id,idempotency_key));
   CREATE TABLE IF NOT EXISTS owner_users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,store_id TEXT NOT NULL REFERENCES stores(id),password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
   CREATE TABLE IF NOT EXISTS inventory_adjustments(id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),day TEXT NOT NULL,item TEXT NOT NULL,previous_stock INTEGER NOT NULL,new_stock INTEGER NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
   CREATE TABLE IF NOT EXISTS inventory_reports(id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),recipient TEXT NOT NULL,status TEXT NOT NULL,error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
   CREATE TABLE IF NOT EXISTS security_events(id INTEGER PRIMARY KEY AUTOINCREMENT,event TEXT NOT NULL,created_at TEXT NOT NULL);
  `);
  if(!this.connection.prepare('PRAGMA table_info(mcp_calls)').all().some((r:any)=>r.name==='conversation_id'))this.connection.exec('ALTER TABLE mcp_calls ADD COLUMN conversation_id TEXT');
  if(!this.connection.prepare('PRAGMA table_info(transactions)').all().some((r:any)=>r.name==='receipt_id'))this.connection.exec('ALTER TABLE transactions ADD COLUMN receipt_id TEXT');
 }
 query<T=Record<string,any>>(sql:string,params:unknown[]=[]):T[]{return this.execute(sql,params,true) as T[];}
 one<T=Record<string,any>>(sql:string,params:unknown[]=[]):T|undefined{return this.query<T>(sql,params)[0];}
 run(sql:string,params:unknown[]=[]){return this.execute(sql,params,false) as Database.RunResult;}
 private execute(sql:string,params:unknown[],read:boolean){const start=performance.now();let rows=0,error:string|undefined;try{const stmt=this.connection.prepare(sql);const result=read?stmt.all(...params):stmt.run(...params);rows=Array.isArray(result)?result.length:result.changes;return result;}catch(e){error=e instanceof Error?e.message:'SQL failed';throw e;}finally{this.capture?.push({sql,params,ms:Number((performance.now()-start).toFixed(3)),rows,...(error?{error}:{})});}}
 transaction<T>(fn:()=>T):T{return this.connection.transaction(fn).immediate();}
 traced<T>(fn:()=>T):{value?:T;queries:SqlTrace[];error?:Error}{const previous=this.capture;const queries:SqlTrace[]=[];this.capture=queries;try{return {value:fn(),queries};}catch(e){return {queries,error:e instanceof Error?e:new Error('Operation failed')};}finally{this.capture=previous;}}
 close(){this.connection.close();}
}
let shared:SqlDatabase|undefined;
export function getDatabase(){return shared ||= new SqlDatabase(process.env.DATABASE_PATH||path.join(runtimeDir,'storeyog.sqlite'));}
