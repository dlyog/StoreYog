import {config} from './config.js';
import {labFetch} from './lab-http.js';
function endpoint(base:string,suffix:string){
 if(!base)throw Error('Optional AI service is not configured. Use the credential-free demo or configure setup.py --live.');
 const url=new URL(base);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('AI URL must be an HTTP(S) base URL without embedded credentials, query or fragment.');
 return base.replace(/\/$/,'')+(base.replace(/\/$/,'').endsWith('/v1')?suffix:'/v1'+suffix);
}
export const completionUrl=()=>endpoint(config.llmUrl,'/chat/completions');
export const completionHeaders=()=>({'Content-Type':'application/json',...(process.env.LLM_API_KEY?{Authorization:'Bearer '+process.env.LLM_API_KEY}:{})});
export async function transcribe(bytes:Uint8Array,type:string,name:string){
 const base=config.sttUrl;if(!base)throw Error('Speech recognition is optional and not configured; type your question instead.');
 const form=new FormData(),openai=process.env.STT_API_FORMAT==='openai';form.append(openai?'file':'audio',new Blob([bytes as BlobPart],{type}),name);if(openai)form.append('model',process.env.STT_MODEL||'whisper-1');
 const response=await labFetch(openai?endpoint(base,'/audio/transcriptions'):base+'/transcribe',{method:'POST',headers:process.env.STT_API_KEY?{Authorization:'Bearer '+process.env.STT_API_KEY}:{},body:form,signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error('Speech recognition service returned HTTP '+response.status);const data=await response.json() as any;const text=openai?data.text:data.transcription;if(typeof text!=='string')throw Error('Speech recognition returned no transcript.');return text;
}
export async function synthesize(text:string){
 const base=config.ttsUrl;if(!base)throw Error('Speech playback is optional and not configured; the answer is shown on screen.');
 const openai=process.env.TTS_API_FORMAT==='openai';const response=await labFetch(openai?endpoint(base,'/audio/speech'):base+'/generate-audio-binary/',{method:'POST',headers:{'Content-Type':'application/json',...(process.env.TTS_API_KEY?{Authorization:'Bearer '+process.env.TTS_API_KEY}:{})},body:JSON.stringify(openai?{model:process.env.TTS_MODEL||'tts-1',input:text,voice:process.env.TTS_VOICE||'alloy',response_format:'mp3'}:{text,voice:config.ttsVoice,speed:1}),signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error('Speech service returned HTTP '+response.status);return {type:openai?'audio/mpeg':'audio/wav',data:Buffer.from(await response.arrayBuffer())};
}
