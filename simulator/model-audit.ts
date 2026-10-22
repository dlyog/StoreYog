import {config} from '../server/config.js';
async function persist(body:unknown){const response=await fetch(new URL('/client/llm-audit',config.mcpUrl),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.mcpApiKey}`,'x-storeyog-internal':config.internalToken},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('The model audit could not be saved.');return response.json() as Promise<{id:string}>;}
export async function withModelAudit<T>(conversationId:string,provider:string,model:string,request:unknown,execute:()=>Promise<T>){
 // Save the actual prompt before invoking the provider. No unaudited model call
 // is made if the authenticated store audit service is unavailable.
 const {id}=await persist({phase:'start',conversationId,provider,model,request});const start=performance.now();let response:T;
 try{response=await execute();}catch(error){await persist({phase:'finish',id,ms:performance.now()-start,error:error instanceof Error?error.message:'Model request failed',...((error as any)?.auditResponse!==undefined?{response:(error as any).auditResponse}:{})});throw error;}
 await persist({phase:'finish',id,ms:performance.now()-start,response});return response;
}
