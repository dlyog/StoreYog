import {spawn} from 'node:child_process';
// All URLs come from trusted server configuration, never browser input. Data travels over stdin.
export async function labFetch(url:string,init:RequestInit={}):Promise<Response>{
 const transport=process.env.LAB_HTTP_TRANSPORT||'fetch';
 if(transport==='curl')return curlFetch(url,init);
 try{return await fetch(url,init);}
 catch(error){if(transport==='auto'&&process.platform==='darwin')return curlFetch(url,init);throw error;}
}
async function curlFetch(url:string,init:RequestInit){
 const headers=new Headers(init.headers);let body:Uint8Array|undefined;
 if(init.body instanceof FormData){const req=new Request(url,{method:'POST',body:init.body});body=new Uint8Array(await req.arrayBuffer());headers.set('Content-Type',req.headers.get('content-type')!);}
 else if(typeof init.body==='string')body=new TextEncoder().encode(init.body);
 else if(init.body)throw new Error('Unsupported lab request body.');
 const args=['--silent','--show-error','--max-time','65','--request',init.method||'GET','--write-out','\n%{http_code}'];
 for(const [k,v] of headers)args.push('--header',`${k}: ${v}`);
 if(body)args.push('--data-binary','@-');args.push('--url',url);
 return new Promise<Response>((resolve,reject)=>{
  const child=spawn('curl',args,{stdio:['pipe','pipe','pipe']});const chunks:Buffer[]=[];const errors:Buffer[]=[];let bytes=0;
  const abort=()=>child.kill('SIGTERM');init.signal?.addEventListener('abort',abort,{once:true});
  child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>24*1024*1024){child.kill();reject(new Error('Lab response exceeded 24 MB'));}else chunks.push(chunk);});
  child.stderr.on('data',chunk=>errors.push(chunk));child.on('error',reject);
  child.on('close',code=>{init.signal?.removeEventListener('abort',abort);if(init.signal?.aborted)return reject(new DOMException('Request aborted','AbortError'));if(code!==0)return reject(new Error(Buffer.concat(errors).toString().trim()||`curl exited ${code}`));const buffer=Buffer.concat(chunks);const split=buffer.lastIndexOf(10);const status=Number(buffer.subarray(split+1).toString());if(status<100||status>599)return reject(new Error('Invalid lab HTTP response'));resolve(new Response(new Uint8Array(buffer.subarray(0,split)),{status}));});
  child.stdin.on('error',()=>{});child.stdin.end(body);
 });
}
