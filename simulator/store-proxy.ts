import type {Request,Response} from 'express';import {config} from '../server/config.js';
export async function storeProxy(req:Request,res:Response){
 const origin=req.get('origin'),allowed=process.env.PUBLIC_WEB_ORIGIN?new URL(process.env.PUBLIC_WEB_ORIGIN).origin:'';
 if(origin&&origin!==`${req.protocol}://${req.get('host')}`&&origin!==allowed)return res.status(403).json({error:'Cross-origin request denied.'});
 const backendOrigin=new URL(config.mcpUrl).origin;
 const target=new URL(req.originalUrl,backendOrigin),decoded=new URL(decodeURIComponent(target.pathname),backendOrigin);
 const canonicalPath=decoded.pathname.replace(/\/+$/,'').toLowerCase(),mount=req.baseUrl.toLowerCase();
 // Never let normalization, absolute-form requests or traversal escape this route family.
 if(target.origin!==backendOrigin||decoded.origin!==backendOrigin||!['/store','/shop'].includes(mount)||!(canonicalPath===mount||canonicalPath.startsWith(mount+'/')))return res.status(404).json({error:'Not found.'});
 // Public self-service never exposes the private convenience login or admin APIs.
 if(canonicalPath==='/store/api/login-options')return res.json({demoEnabled:false,email:''});
 if(canonicalPath==='/store/api/login'&&req.body?.profile)return res.status(403).json({error:'Sign in with your own store credentials.'});
 if(!['GET','HEAD','POST','PATCH','PUT','DELETE'].includes(req.method))return res.status(405).end();
 try{const headers:Record<string,string>={};for(const name of ['cookie','content-type','x-csrf-token']){const v=req.get(name);if(v)headers[name]=v;}if(origin)headers.Origin=target.origin;
 const upstream=await fetch(target,{method:req.method,headers,redirect:'manual',...(req.body&& !['GET','HEAD'].includes(req.method)?{body:JSON.stringify(req.body)}:{}),signal:AbortSignal.timeout(60000)});
 for(const name of ['content-type','cache-control','content-disposition','location','x-content-type-options']){const v=upstream.headers.get(name);if(v)res.set(name,v);}for(const cookie of upstream.headers.getSetCookie()){const httpsHost=allowed.startsWith('https:')&&req.get('host')===new URL(allowed).host;res.append('Set-Cookie',httpsHost&&!/;\s*Secure/i.test(cookie)?cookie+'; Secure':cookie);}res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
 }catch{res.status(502).json({error:'The store service is temporarily unavailable.'});}
}
