// Local check of the classic Alexa endpoint with realistic Alexa request JSON.
// Runs the real agent against the local MCP server (start the app first: ./manage.sh start).
// Usage: node --import tsx classical-alexa/test-skill.ts
// It confirms one simulated restock on the local synthetic demo store. No email or payment.
import assert from 'node:assert/strict';
import express from 'express';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {existsSync} from 'node:fs';
// Same local credentials the managed launcher gives the simulator (scripts/dev.ts), set before config loads.
const {bootstrapCredentials}=await import('../server/credentials.js');const credentials=bootstrapCredentials();
process.env.MCP_API_KEY=credentials.apiKey;process.env.INTERNAL_TOKEN=credentials.internalToken;
const {runAgent}=await import('../simulator/agent.js');
const {classicAlexaRouter,validCertUrl,verifyAlexaRequest}=await import('./skill-handler.js');

const skillId='amzn1.ask.skill.local-test';
async function serve(skipVerification:boolean){
 const app=express();app.use('/alexa',classicAlexaRouter({runAgent,skillId,skipVerification}));
 return await new Promise<{url:string,close:()=>void}>(resolve=>{const server=app.listen(0,'127.0.0.1',()=>{const port=(server.address() as any).port;resolve({url:`http://127.0.0.1:${port}/alexa`,close:()=>server.close()});});});
}
const envelope=(sessionId:string,request:Record<string,any>)=>({version:'1.0',session:{new:false,sessionId,application:{applicationId:skillId},user:{userId:'amzn1.ask.account.test'}},context:{System:{application:{applicationId:skillId},device:{deviceId:'test-echo'}}},request:{requestId:'amzn1.echo-api.request.'+crypto.randomUUID(),timestamp:new Date().toISOString(),locale:'en-US',...request}});
const chat=(text:string)=>({type:'IntentRequest',intent:{name:'ChatIntent',confirmationStatus:'NONE',slots:{text:{name:'text',value:text}}}});

// 1. Certificate URL rules from Amazon's verification requirements.
for(const ok of ['https://s3.amazonaws.com/echo.api/echo-api-cert.pem','https://s3.amazonaws.com:443/echo.api/echo-api-cert.pem','https://S3.AMAZONAWS.COM/echo.api/../echo.api/echo-api-cert.pem'])assert.ok(validCertUrl(ok),ok);
for(const bad of ['http://s3.amazonaws.com/echo.api/echo-api-cert.pem','https://notamazon.com/echo.api/echo-api-cert.pem','https://s3.amazonaws.com/EcHo.aPi/echo-api-cert.pem','https://s3.amazonaws.com:563/echo.api/echo-api-cert.pem','https://s3.amazonaws.com/invalid.path/echo-api-cert.pem'])assert.ok(!validCertUrl(bad),bad);

// 2. A self-signed "echo-api.amazon.com" certificate must be rejected (not chained to a trusted root).
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const realFetch=globalThis.fetch;
globalThis.fetch=(async()=>new Response('-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIUQ\n-----END CERTIFICATE-----'))as any;
const body=envelope('s-forged',chat('how much rice is available'));const raw=Buffer.from(JSON.stringify(body));
const signature=createSign('RSA-SHA256').update(raw).sign(privateKey,'base64');
await assert.rejects(verifyAlexaRequest({'signaturecertchainurl':'https://s3.amazonaws.com/echo.api/forged.pem','signature-256':signature},raw,body,skillId));
globalThis.fetch=realFetch;

// 3. With verification on, an unsigned request is refused before reaching the agent.
const strict=await serve(false);
try{const r=await fetch(strict.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(envelope('s-unsigned',chat('how much rice is available')))});assert.equal(r.status,400);}finally{strict.close();}

// 4. Conversation through the real agent and MCP tools (verification skipped locally).
const local=await serve(true);
async function send(sessionId:string,request:Record<string,any>){const r=await fetch(local.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(envelope(sessionId,request))});assert.equal(r.status,200);return await r.json() as any;}
const spoken=(res:any)=>String(res.response?.outputSpeech?.text||'');
try{
 const sid='amzn1.echo-api.session.'+crypto.randomUUID();
 let res=await send(sid,{type:'LaunchRequest'});console.log('Launch     →',spoken(res));assert.match(spoken(res),/Virtual Store Assistant/);assert.ok(!res.response.directives,'no screen directive for a device without APL');assert.equal(res.response.shouldEndSession,false);
 res=await send(sid,chat('how much rice is available'));console.log('Rice       →',spoken(res));assert.match(spoken(res),/Basmati rice: \d+/);
 for(const said of ['do I have dahl','check dahl','no check the dahl']){res=await send(sid,chat(said));console.log(said.padEnd(18),'→',spoken(res));assert.match(spoken(res),/Toor dal: \d+/);assert.match(spoken(res),/Chana dal: \d+/);}
 res=await send(sid,chat("reconcile today's inventory and draft a restock for the low items"));console.log('Restock    →',spoken(res));assert.match(spoken(res),/Shall I order|restock/i);
 res=await send(sid,chat('yes go ahead'));console.log('Yes        →',spoken(res));assert.match(spoken(res),/confirmed|order/i);
 res=await send(sid,{type:'IntentRequest',intent:{name:'AMAZON.HelpIntent'}});assert.match(spoken(res),/rice/);
 res=await send(sid,chat('please stop ordering rice'));console.log('Stop word  →',spoken(res));assert.equal(res.response.shouldEndSession,true);
 const sid2='amzn1.echo-api.session.'+crypto.randomUUID();await send(sid2,{type:'LaunchRequest'});
 res=await send(sid2,{type:'IntentRequest',intent:{name:'AMAZON.StopIntent'}});assert.equal(res.response.shouldEndSession,true);
 res=await send(sid2,{type:'SessionEndedRequest',reason:'USER_INITIATED'});assert.deepEqual(res.response,{});
 res=await send(sid2,chat(''));assert.match(spoken(res),/did not catch/);
 // Echo Show: same requests with the APL interface present.
 const show=(sessionId:string,request:Record<string,any>)=>{const body=envelope(sessionId,request);(body.context.System.device as any).supportedInterfaces={'Alexa.Presentation.APL':{runtime:{maxVersion:'2024.3'}}};return fetch(local.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()) as Promise<any>;};
 const doc=(r:any)=>r.response?.directives?.[0];
 const sid3='amzn1.echo-api.session.'+crypto.randomUUID();
 res=await show(sid3,{type:'LaunchRequest'});assert.equal(doc(res)?.type,'Alexa.Presentation.APL.RenderDocument');assert.equal(doc(res).token,'welcome');console.log('Show launch →',spoken(res));
 res=await show(sid3,chat('play the demo video'));assert.equal(doc(res).token,'video');assert.ok(!('shouldEndSession' in res.response),'video keeps the session without opening the mic');assert.match(JSON.stringify(doc(res)),/\/alexa\/media\/demo\.mp4/);console.log('Video       →',spoken(res));
 res=await show(sid3,{type:'Alexa.Presentation.APL.UserEvent',arguments:['videoEnded']});assert.match(spoken(res),/demo/);assert.equal(res.response.shouldEndSession,false);
 res=await show(sid3,chat('where is the toor dal'));assert.equal(doc(res).token,'shelf');const photo=/\/alexa\/media\/photo\/[0-9a-f-]+\.jpg/.exec(JSON.stringify(doc(res)))?.[0];assert.ok(photo,'shelf screen uses a JPEG photo');const img=await fetch(local.url.replace('/alexa','')+photo);assert.equal(img.status,200);assert.equal(img.headers.get('content-type'),'image/jpeg');assert.match(spoken(res),/Toor dal/i);console.log('Where       →',spoken(res));
 res=await show(sid3,chat('how much ghee is available'));assert.match(spoken(res),/Ghee: \d+/);assert.ok(['shelf','answer'].includes(doc(res).token));console.log('Ghee        →',spoken(res),'['+doc(res).token+']');
 res=await show(sid3,chat('tell me a fun fact about turmeric'));console.log('Fun fact    →',spoken(res));assert.doesNotMatch(spoken(res),/in stock/i);assert.equal(doc(res).token,'answer');
 res=await show(sid3,chat('what is the capital of France'));console.log('General     →',spoken(res));assert.match(spoken(res),/Paris|could not answer/i);assert.equal(doc(res).token,'answer');
 // Phrases from the first Echo Show session (Alexa spells dal as "dahl").
 const sid4='amzn1.echo-api.session.'+crypto.randomUUID();await show(sid4,{type:'LaunchRequest'});
 res=await show(sid4,chat('where is the dahl'));assert.equal(doc(res).token,'shelf');assert.match(spoken(res),/dal/i);console.log('Where dahl  →',spoken(res));
 res=await show(sid4,chat('Toor dahl'));assert.match(spoken(res),/Toor dal: \d+/);assert.equal(doc(res).token,'shelf');console.log('Toor dahl   →',spoken(res));
 res=await show(sid4,chat('can you show me the image of that'));assert.equal(doc(res).token,'shelf');assert.match(spoken(res),/Toor dal shelf/i);console.log('Image of it →',spoken(res));
 // Catalog questions: whole store and one section, names and places only.
 res=await show(sid4,chat('what items do you have'));assert.match(spoken(res),/We carry \d+ products in \d+ sections/);console.log('Catalog     →',spoken(res).slice(0,90));
 res=await show(sid4,chat("what's in the dairy fridge"));assert.match(spoken(res),/Dairy.*Paneer/);assert.doesNotMatch(spoken(res),/\d+ (?:packs|tubs|jugs)/);console.log('Dairy       →',spoken(res));
 // Audio guides: original scripts voiced with Kokoro, played inside the conversation with SSML audio.
 const guideOf=(r:any)=>/\/alexa\/media\/guide\/(\d+)\.mp3/.exec(r.response?.outputSpeech?.ssml||'')?.[1];
 const sid5='amzn1.echo-api.session.'+crypto.randomUUID();
 const cases:[string,string][]=[['play an inventory tip','01'],['next tip','02'],['play guide number five','05'],['play a business tip','14'],['is paneer high in protein','31'],['which food has more carbs','27'],['what are the health benefits of turmeric','32'],['which has more protein toor dal or chana dal','29']];
 for(const [said,id] of cases){res=await show(sid5,chat(said));assert.equal(guideOf(res),id,said+' -> '+guideOf(res));assert.equal(doc(res).token,'guide');assert.equal(res.response.shouldEndSession,false);console.log(('Guide: '+said).padEnd(52),'→',id);}
 res=await show(sid5,chat('what guides do you have'));assert.match(spoken(res),/33 short audio guides/);
 if(existsSync('classical-alexa/audio-guides/audio/01.mp3')){const clip=await fetch(local.url+'/media/guide/01.mp3');assert.equal(clip.status,200);assert.equal(clip.headers.get('content-type'),'audio/mpeg');}
 assert.equal((await fetch(local.url+'/media/guide/99.mp3')).status,404);
 // Echo Show with the VideoApp interface: native player streaming the MP4 from this server.
 const vbody=envelope(sid4,chat('play the demo video'));(vbody.context.System.device as any).supportedInterfaces={'Alexa.Presentation.APL':{},'VideoApp':{}};
 res=await (await fetch(local.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(vbody)})).json();
 assert.equal(res.response.directives.length,1);assert.equal(res.response.directives[0].type,'VideoApp.Launch');assert.match(res.response.directives[0].videoItem.source,/\/alexa\/media\/demo\.mp4$/);assert.ok(!('shouldEndSession' in res.response)&&!res.response.reprompt&&!res.response.outputSpeech);
 // The demo MP4 is local media (not in the public repo); when present it must serve byte ranges.
 const media=await fetch(local.url+'/media/demo.mp4',{headers:{Range:'bytes=0-1023'}});assert.ok(media.status===206||(media.status===404&&!existsSync('docs/pitch-v7/storeyog-live-720p.mp4')),'video '+media.status);const art=await fetch(local.url+'/media/welcome.jpg');assert.equal(art.headers.get('content-type'),'image/jpeg');assert.equal((await fetch(local.url+'/media/photo/not-an-id.jpg')).status,404);
 console.log('PASS classic Alexa: cert URL rules, forged cert rejected, unsigned request refused, greeting, Echo Show screens (welcome, APL video + end event, VideoApp native video, shelf photo, dahl and image-of-that follow-ups, audio guides and nutrition questions, catalog and section questions, stock, general answer), video byte ranges, launch → real MCP rice count → restock draft → fresh yes → stop rules, session end.');
}finally{local.close();}
