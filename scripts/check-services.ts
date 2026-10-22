import 'dotenv/config';
import {mkdirSync,writeFileSync} from 'node:fs';
import {config} from '../server/config.js';
import {completionUrl,completionHeaders,transcribe,synthesize} from '../server/ai-services.js';
const results={llm:false,stt:false,tts:false};
async function check(label:keyof typeof results,configured:boolean,fn:()=>Promise<unknown>){
 if(!configured){console.log(label.toUpperCase()+': not configured (optional)');return;}
 try{await fn();results[label]=true;console.log(label.toUpperCase()+': request succeeded');}catch{console.log(label.toUpperCase()+': check failed; verify URL, key, model, format and provider permissions. No credentials printed.');}
}
await check('llm',!!config.llmUrl,async()=>{const r=await fetch(completionUrl(),{method:'POST',headers:completionHeaders(),body:JSON.stringify({model:config.llmModel,messages:[{role:'user',content:'Reply with OK.'}],max_tokens:8,stream:false}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();const data=await r.json() as any;if(typeof data.choices?.[0]?.message?.content!=='string')throw Error();});
await check('stt',!!config.sttUrl,async()=>{const wav=Buffer.alloc(44+16000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);await transcribe(wav,'audio/wav','setup-check.wav');});
await check('tts',!!config.ttsUrl,async()=>{const result=await synthesize('Welcome to StoreYog.');if(result.data.length<20)throw Error();});
mkdirSync('.runtime',{recursive:true});writeFileSync('.runtime/ai-check.json',JSON.stringify(results)+'\n',{mode:0o600});
