import express from 'express';
import {randomBytes} from 'node:crypto';
import type {OAuthServerProvider,AuthorizationParams} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type {OAuthClientInformationFull,OAuthTokenRevocationRequest} from '@modelcontextprotocol/sdk/shared/auth.js';
import {InvalidGrantError,InvalidScopeError,InvalidTargetError,InvalidTokenError,InvalidRequestError} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import {mcpAuthRouter} from '@modelcontextprotocol/sdk/server/auth/router.js';
import {getDatabase,type SqlDatabase} from './database.js';
import {authenticate,hash,ALL_SCOPES} from './auth.js';
import {securityEvent} from './observability.js';
const opaque=()=>randomBytes(32).toString('base64url');
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function oauthSchema(db:SqlDatabase){db.connection.exec(`
 CREATE TABLE IF NOT EXISTS oauth_clients(id TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS oauth_requests(id TEXT PRIMARY KEY,data TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS oauth_codes(hash TEXT PRIMARY KEY,data TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS oauth_tokens(hash TEXT PRIMARY KEY,kind TEXT NOT NULL,family TEXT NOT NULL,client_id TEXT NOT NULL,key_id TEXT NOT NULL,scopes TEXT NOT NULL,resource TEXT NOT NULL,expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS oauth_token_family ON oauth_tokens(family);
 `);}
export class StoreOAuth implements OAuthServerProvider{
 readonly clientsStore;readonly issuer:URL;readonly resource:URL;
 constructor(readonly db=getDatabase(),issuer=process.env.OAUTH_ISSUER_URL||'http://localhost:3102',resource=process.env.PUBLIC_MCP_URL||new URL('/mcp',issuer).href){
  oauthSchema(db);this.issuer=new URL(issuer);this.resource=new URL(resource);
  if(this.issuer.username||this.issuer.password||this.issuer.pathname!=='/'||this.issuer.search||this.issuer.hash)throw new Error('OAUTH_ISSUER_URL must be an origin, without path/query/fragment.');
  if(this.issuer.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(this.issuer.hostname))throw new Error('Public OAuth requires HTTPS. HTTP is permitted only for loopback testing.');
  if(this.resource.origin!==this.issuer.origin||this.resource.pathname!=='/mcp'||this.resource.search||this.resource.hash||this.resource.username||this.resource.password)throw new Error('PUBLIC_MCP_URL must be the configured OAuth origin followed by /mcp.');
  this.clientsStore={getClient:async(id:string):Promise<OAuthClientInformationFull|undefined>=>{const row=this.db.one('SELECT data FROM oauth_clients WHERE id = ?',[id]);return row?JSON.parse(row.data):undefined;}};
 }
 target(resource?:URL){if(resource?.href!==this.resource.href)throw new InvalidTargetError('resource must equal the canonical MCP URI.');}
 scopes(scopes:string[]){if(!scopes.length||scopes.some(s=>!(ALL_SCOPES as readonly string[]).includes(s)))throw new InvalidScopeError('Request one or more supported store scopes.');}
 async authorize(client:OAuthClientInformationFull,params:AuthorizationParams,res:express.Response){
  this.target(params.resource);const scopes=params.scopes||[];this.scopes(scopes);if(client.scope&&scopes.some(s=>!client.scope!.split(' ').includes(s)))throw new InvalidScopeError('Scope is not enabled for this client.');
  if(!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge))throw new InvalidRequestError('Use a valid S256 PKCE challenge.');
  if(!client.redirect_uris.includes(params.redirectUri))throw new InvalidRequestError('Exact registered redirect_uri required.');
  const id=opaque(),csrf=opaque();this.db.run('DELETE FROM oauth_requests WHERE expires < ?',[Date.now()]);this.db.run('DELETE FROM oauth_codes WHERE expires < ?',[Date.now()]);this.db.run('DELETE FROM oauth_tokens WHERE expires < ?',[Date.now()-30*86400000]);
  this.db.run('INSERT INTO oauth_requests(id,data,expires) VALUES (?,?,?)',[hash(id),JSON.stringify({clientId:client.client_id,params:{...params,resource:this.resource.href},csrf:hash(csrf)}),Date.now()+300000]);
  res.cookie('sp_link',csrf,{httpOnly:true,sameSite:'lax',secure:this.issuer.protocol==='https:',path:'/oauth/consent',maxAge:300000});
  res.set({'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link your store · StoreYog</title><style>body{font:17px system-ui;background:#f1f7f1;color:#183e29;max-width:510px;margin:8vh auto;padding:30px}main{background:white;border-radius:24px;padding:36px}h1{font-size:32px}p{line-height:1.6}label{display:block;margin:24px 0 8px}input{box-sizing:border-box;width:100%;padding:14px;border:1px solid #a3bdaa;border-radius:9px;font:inherit}button{padding:14px 22px;border:0;border-radius:10px;background:#286545;color:white;font:inherit;margin:20px 8px 0 0}button[value=deny]{background:#eaf0eb;color:#183e29}small{color:#607b68}</style><main><small>STOREYOG · ACCOUNT LINKING</small><h1>Connect your store</h1><p><b>${escape(client.client_name||client.client_id)}</b> requests access to:</p><ul>${scopes.map(s=>'<li>'+escape(s)+'</li>').join('')}</ul><p>Enter your store access key to identify your store and approve this connection.</p><form method="post" action="/oauth/consent"><input type="hidden" name="request" value="${id}"><input type="hidden" name="csrf" value="${csrf}"><label for="key">Store access key</label><input id="key" type="password" name="key" autocomplete="off" maxlength="300"><button name="decision" value="allow">Connect store</button><button name="decision" value="deny" formnovalidate>Cancel</button></form><p><small>Seeded store data. All orders are simulated. Connecting allows tools within these scopes; your Alexa experience must still obtain approval before placing an order.</small></p></main></html>`);
 }
 code(client:OAuthClientInformationFull,code:string){const row=this.db.one('SELECT data,expires FROM oauth_codes WHERE hash = ?',[hash(code)]);if(!row||row.expires<Date.now())throw new InvalidGrantError('Invalid or expired authorization code.');const data=JSON.parse(row.data);if(data.clientId!==client.client_id)throw new InvalidGrantError('Code belongs to another client.');return data;}
 async challengeForAuthorizationCode(client:OAuthClientInformationFull,code:string){return this.code(client,code).codeChallenge;}
 issue(clientId:string,keyId:string,scopes:string[],family=opaque()){
  const parent=this.db.one('SELECT k.scopes FROM api_keys k JOIN stores s ON s.id=k.store_id WHERE k.id = ? AND k.revoked=0 AND s.active=1',[keyId]);
  if(!parent||scopes.some(s=>!JSON.parse(parent.scopes).includes(s)))throw new InvalidGrantError('Store access was revoked or scopes changed.');
  const access='spo_'+opaque(),refresh='spr_'+opaque();for(const [token,kind,ttl]of [[access,'access',3600000],[refresh,'refresh',30*86400000]] as const)this.db.run('INSERT INTO oauth_tokens(hash,kind,family,client_id,key_id,scopes,resource,expires) VALUES (?,?,?,?,?,?,?,?)',[hash(token),kind,family,clientId,keyId,JSON.stringify(scopes),this.resource.href,Date.now()+ttl]);
  return {access_token:access,refresh_token:refresh,token_type:'Bearer',expires_in:3600,scope:scopes.join(' ')};
 }
 async exchangeAuthorizationCode(client:OAuthClientInformationFull,code:string,_verifier?:string,redirectUri?:string,resource?:URL){this.target(resource);return this.db.transaction(()=>{const data=this.code(client,code);if(redirectUri!==data.redirectUri)throw new InvalidGrantError('redirect_uri mismatch.');this.db.run('DELETE FROM oauth_codes WHERE hash = ?',[hash(code)]);return this.issue(client.client_id,data.keyId,data.scopes);});}
 async exchangeRefreshToken(client:OAuthClientInformationFull,refresh:string,scopes?:string[],resource?:URL){this.target(resource);return this.db.transaction(()=>{const row=this.db.one('SELECT * FROM oauth_tokens WHERE hash = ? AND kind = ?',[hash(refresh),'refresh']);if(!row||row.client_id!==client.client_id||row.resource!==this.resource.href)throw new InvalidGrantError('Invalid refresh token.');if(row.revoked){this.db.run('UPDATE oauth_tokens SET revoked=1 WHERE family = ?',[row.family]);return null;}if(row.expires<Date.now())throw new InvalidGrantError('Refresh token expired.');const granted:string[]=JSON.parse(row.scopes),next=scopes||granted;if(!next.length||next.some(s=>!granted.includes(s)))throw new InvalidScopeError('Refresh cannot increase scopes.');this.db.run('UPDATE oauth_tokens SET revoked=1 WHERE hash = ?',[hash(refresh)]);return this.issue(client.client_id,row.key_id,next,row.family);})||Promise.reject(new InvalidGrantError('Refresh token reuse detected; connection revoked.'));}
 async verifyAccessToken(token:string){const identity=token.startsWith('spo_')?authenticate(token,this.db,this.resource.href):null;if(!identity)throw new InvalidTokenError('Invalid or expired access token.');const row=this.db.one('SELECT client_id,expires FROM oauth_tokens WHERE hash = ?',[hash(token)])!;return {token,clientId:row.client_id,scopes:identity.scopes,expiresAt:Math.floor(row.expires/1000),resource:this.resource};}
 async revokeToken(client:OAuthClientInformationFull,request:OAuthTokenRevocationRequest){const row=this.db.one('SELECT family FROM oauth_tokens WHERE hash = ? AND client_id = ?',[hash(request.token),client.client_id]);if(row)this.db.run('UPDATE oauth_tokens SET revoked=1 WHERE family = ?',[row.family]);}
 router(){
  const router=express.Router();router.use(express.urlencoded({extended:false,limit:'8kb'}));
  const attempts=new Map<string,{count:number;since:number}>();router.post('/oauth/consent',(req,res)=>{
   res.set('Cache-Control','no-store');const ip=req.ip||'unknown',now=Date.now();for(const [key,s]of attempts)if(now-s.since>900000)attempts.delete(key);const entry=attempts.get(ip)||{count:0,since:now};attempts.set(ip,entry);if(++entry.count>20)return res.status(429).send('Too many linking attempts. Try again later.');
   const row=typeof req.body.request==='string'?this.db.one('SELECT data,expires FROM oauth_requests WHERE id = ?',[hash(req.body.request)]):null;const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('sp_link='))?.slice(8);
   if(!row||row.expires<now)return res.status(400).send('Link request expired. Start again from your Alexa app.');const data=JSON.parse(row.data);
   if(typeof req.body.csrf!=='string'||!cookie||hash(cookie)!==data.csrf||hash(req.body.csrf)!==data.csrf||req.get('origin')&&req.get('origin')!==this.issuer.origin)return res.status(403).send('Invalid linking session.');
   const redirect=new URL(data.params.redirectUri);if(data.params.state)redirect.searchParams.set('state',data.params.state);
   if(req.body.decision==='deny'){this.db.run('DELETE FROM oauth_requests WHERE id = ?',[hash(req.body.request)]);redirect.searchParams.set('error','access_denied');return res.redirect(303,redirect.href);}
   const identity=typeof req.body.key==='string'&&req.body.key.startsWith('sp_')?authenticate(req.body.key,this.db):null;
   if(req.body.decision!=='allow'||!identity||data.params.scopes.some((s:string)=>!identity.scopes.includes(s))){securityEvent('oauth_consent_denied');return res.status(403).send('Invalid store key or insufficient permissions. Restart linking with an authorized store key.');}
   const code=opaque();this.db.transaction(()=>{this.db.run('DELETE FROM oauth_requests WHERE id = ?',[hash(req.body.request)]);this.db.run('INSERT INTO oauth_codes(hash,data,expires) VALUES (?,?,?)',[hash(code),JSON.stringify({clientId:data.clientId,redirectUri:data.params.redirectUri,codeChallenge:data.params.codeChallenge,keyId:identity.keyId,scopes:data.params.scopes}),now+60000]);});redirect.searchParams.set('code',code);res.clearCookie('sp_link',{path:'/oauth/consent'});securityEvent('oauth_store_linked');return res.redirect(303,redirect.href);
  });
  router.use('/token',(req,res,next)=>{if(req.body?.grant_type==='authorization_code'&&!/^[A-Za-z0-9._~-]{43,128}$/.test(String(req.body.code_verifier||'')))return res.status(400).json({error:'invalid_request',error_description:'A valid PKCE verifier is required.'});next();});
  router.get('/.well-known/oauth-protected-resource',(_req,res)=>res.set('Cache-Control','no-store').json({resource:this.resource.href,authorization_servers:[this.issuer.href],scopes_supported:[...ALL_SCOPES],bearer_methods_supported:['header'],resource_name:'StoreYog'}));
  router.use(mcpAuthRouter({provider:this,issuerUrl:this.issuer,resourceServerUrl:this.resource,scopesSupported:[...ALL_SCOPES],resourceName:'StoreYog'}));
  return router;
 }
}
