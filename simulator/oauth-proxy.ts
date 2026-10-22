import express from 'express';
import {Readable} from 'node:stream';
// Apache can keep forwarding / to port 3100. Only these protocol routes reach
// the loopback OAuth ingress; the private MCP/admin server is never the target.
const routes=new Set(['/mcp','/authorize','/token','/revoke','/oauth/consent','/.well-known/oauth-authorization-server','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp']);
const parse=express.raw({type:()=>true,limit:'100kb'});
export function oauthIngressProxy(req:express.Request,res:express.Response,next:express.NextFunction){
 const pathname=req.path.replace(/\/$/,'');if(!routes.has(pathname))return next();
 if(!['GET','HEAD','POST','OPTIONS'].includes(req.method))return res.status(405).set('Allow','GET, HEAD, POST, OPTIONS').end();
 const port=Number(process.env.PUBLIC_MCP_PORT||3102);if(!Number.isInteger(port)||port<1||port>65535)return res.status(503).json({error:'OAuth ingress is not configured.'});
 const origin=`http://127.0.0.1:${port}`,target=new URL(req.originalUrl,origin);
 if(target.origin!==origin||target.pathname.replace(/\/$/,'')!==pathname)return res.status(404).end();target.pathname=pathname;
 parse(req,res,error=>{if(error)return res.status((error as any).type==='entity.too.large'?413:400).json({error:'Invalid OAuth request body.'});void forward();});
 async function forward(){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);const abort=()=>{if(!res.writableEnded)controller.abort();};res.on('close',abort);
  try{const headers=new Headers();for(const name of ['accept','content-type','authorization','cookie','origin','mcp-protocol-version','mcp-session-id','last-event-id']){const value=req.get(name);if(value)headers.set(name,value);}
   const response=await fetch(target,{method:req.method,headers,redirect:'manual',signal:controller.signal,...(!['GET','HEAD'].includes(req.method)&&Buffer.isBuffer(req.body)&&req.body.length?{body:new Uint8Array(req.body)}:{})});clearTimeout(timer);
   for(const name of ['content-type','cache-control','location','content-security-policy','referrer-policy','x-content-type-options','retry-after','vary','access-control-allow-origin','access-control-allow-headers','access-control-allow-methods','access-control-expose-headers','mcp-session-id','mcp-protocol-version']){const value=response.headers.get(name);if(value)res.set(name,value);}
   for(const cookie of response.headers.getSetCookie())res.append('Set-Cookie',cookie);
   res.status(response.status);if(!response.body||req.method==='HEAD')return res.end();const body=Readable.fromWeb(response.body as any);body.on('error',()=>res.destroy());body.pipe(res);
  }catch{if(!res.headersSent)res.status(502).json({error:'The OAuth service is temporarily unavailable.'});else res.destroy();}finally{clearTimeout(timer);}
 }
}
