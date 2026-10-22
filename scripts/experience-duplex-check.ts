import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.BUSINESS_BASE_URL||'http://localhost:3100';
// Silence for deterministic playback timing; the production microphone code
// receives a synthetic stream with controlled speech and pauses.
const wav=Buffer.alloc(44+32000*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{sessionStorage.setItem('storeyog-preview-ack-v1','yes');(window as any).__plays=0;document.addEventListener('play',()=>{(window as any).__plays++;},true);navigator.mediaDevices.getUserMedia=async()=>{const c=new AudioContext();await c.resume();const oscillator=c.createOscillator(),gain=c.createGain(),target=c.createMediaStreamDestination();gain.gain.value=0;oscillator.connect(gain).connect(target);oscillator.start();(window as any).__gain=gain;(window as any).__stream=target.stream;return target.stream;};});
 let stt=0,turns=0;
 await page.route('**/api/stt',route=>route.fulfill({json:{transcript:['I am a customer','Do you have dal?','OK stop please'][stt++]}}));
 let goodbyes=0;await page.route('**/api/tts',route=>{if(route.request().postDataJSON().text.startsWith('Goodbye'))goodbyes++;return route.fulfill({contentType:'audio/wav',body:wav});});
 await page.route('**/api/demo-conversation',route=>{turns++;const message=route.request().postDataJSON().message;return route.fulfill({json:{stage:message.includes('customer')||message.includes('dal')?'customer':'role',reply:message.includes('dal')?'Dal is available in the pantry aisle.':message.includes('customer')?'Great! What are you looking for?':'Welcome to StoreYog. Are you a customer or owner?',traces:[]}});});
 await page.goto(base+'/experience');await page.locator('#mic').click();await page.waitForFunction(()=>document.querySelector('#voice-status')?.textContent?.includes('Speaking'));assert.equal(turns,1,'Activation should welcome without needing another click');
 async function utterance(){await page.evaluate(()=>(window as any).__gain.gain.value=.12);await page.waitForTimeout(450);await page.evaluate(()=>(window as any).__gain.gain.value=0);}
 await utterance();await page.waitForFunction(()=>document.querySelector('#role')?.textContent==='CUSTOMER · READ ONLY');assert.equal(stt,1);assert.equal(turns,2);assert.equal(await page.locator('#mic').getAttribute('aria-pressed'),'true');
 await page.waitForFunction(()=>document.querySelector('#voice-status')?.textContent?.includes('Speaking'));
 await page.evaluate(()=>(window as any).__gain.gain.value=.12);await page.waitForFunction(()=>!document.querySelector('#voice-status')?.textContent?.includes('Speaking'),undefined,{timeout:2000});await page.waitForTimeout(350);await page.evaluate(()=>(window as any).__gain.gain.value=0);
 await page.waitForFunction(()=>document.querySelector('#reply')?.textContent?.includes('Dal is available'));assert.equal(stt,2);assert.equal(turns,3);assert.ok(await page.evaluate(()=>(window as any).__stream.getTracks()[0].readyState==='live'));
 await utterance();await page.waitForFunction(()=>document.querySelector('#mic')?.getAttribute('aria-pressed')==='false');assert.equal(stt,3);assert.equal(turns,3,'Stop must bypass agent');assert.ok(await page.evaluate(()=>(window as any).__stream.getTracks().every((t:MediaStreamTrack)=>t.readyState==='ended')));assert.match(await page.locator('#reply').textContent()||'',/Listening stopped/);await page.waitForTimeout(200);assert.equal(goodbyes,1,'Spoken stop must play one goodbye after turning the microphone off');assert.deepEqual(errors,[]);
 console.log('PASS experience: one activation, automatic pause submission, continuous mic across turns, playback interruption, spoken stop bypasses agent and releases microphone.');
}finally{await browser.close();}
