// General questions (cooking, food facts, small talk beyond the store) go to the general LLM with a general-assistant
// prompt, recorded in the store's model audit. Used by the classic Alexa skill and the web simulator's ask_general tool.
import type {Session} from './agent.js';
import {withModelAudit} from './model-audit.js';
import {config} from '../server/config.js';
import {labFetch} from '../server/lab-http.js';
import {completionUrl,completionHeaders} from '../server/ai-services.js';
import {RESPONSIBLE_AI} from './responsible-ai.js';

// remember=false when the caller records the turn in the session history itself.
export async function generalAnswer(s:Session,text:string,remember=true){
 const request={model:config.llmModel,max_tokens:220,temperature:0.4,stream:false,messages:[
  {role:'system',content:`You are a friendly voice assistant on an Echo Show in ${s.catalog?.storeName||'Little India Grocery'}, a small store. Answer helpfully in one to three short spoken sentences, without markdown or lists. Never state this store\'s stock counts, sales, prices or orders; for those, invite the user to ask about the product or the day, and the store records will be checked.\n${RESPONSIBLE_AI}`},
  ...s.history.slice(-6),{role:'user',content:text}]};
 const body=await withModelAudit(s.id,'chat-completions',config.llmModel,request,async()=>{const r=await labFetch(completionUrl(),{method:'POST',headers:completionHeaders(),body:JSON.stringify(request),signal:AbortSignal.timeout(6000)});const data=await r.json() as any;if(!r.ok)throw Object.assign(new Error(`Model returned HTTP ${r.status}`),{auditResponse:data});return data;}) as any;
 const reply=String(body?.choices?.[0]?.message?.content||'').replace(/<think>[\s\S]*?<\/think>/g,'').replace(/[*#_`]/g,'').trim();
 if(reply&&remember){s.history.push({role:'user',content:text},{role:'assistant',content:reply});s.history=s.history.slice(-12);}
 return reply||'Sorry, I could not answer that right now.';
}

