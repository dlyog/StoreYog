import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.BUSINESS_BASE_URL||'http://localhost:3100';
const r=await fetch(base+'/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Hello! StoreYog is ready. How can I help your store today? You can interrupt this reply at any time.'})});
assert.ok(r.ok,'Kokoro must be reachable for the playback test');const wav=Buffer.from(await r.arrayBuffer());
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const w=window as any;w.__paused=0;document.addEventListener('pause',()=>w.__paused++,true);
  navigator.mediaDevices.getUserMedia=async()=>{const ctx=new AudioContext();await ctx.resume();const oscillator=ctx.createOscillator();oscillator.frequency.value=220;const gain=ctx.createGain();gain.gain.value=0;const target=ctx.createMediaStreamDestination();oscillator.connect(gain).connect(target);oscillator.start();w.__testGain=gain;w.__testStream=target.stream;return target.stream;};
 });
 let sttCalls=0,chatCalls=0;
 await page.route('**/api/stt',route=>route.fulfill({json:{transcript:++sttCalls===1?'How is my store doing?':sttCalls===2?'yes':'Okay, stop. Thank you.'}}));
 await page.route('**/api/chat',route=>{chatCalls++;return route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'done',reply:chatCalls===1?'Hello! StoreYog is ready. How can I help your store today? You can interrupt this reply at any time.':'Your next turn was heard. The microphone is still open.',pendingConfirmation:false})+'\n'});});
 await page.route('**/api/acknowledgement',route=>route.fulfill({contentType:'audio/wav',body:wav}));
 let goodbyes=0;await page.route('**/api/tts',route=>{if(route.request().postDataJSON().text.startsWith('Goodbye'))goodbyes++;return route.fulfill({contentType:'audio/wav',body:wav});});
 await page.addInitScript(()=>sessionStorage.setItem('storeyog-preview-ack-v1','yes'));await page.goto(base+'/simulator');assert.equal(await page.locator('.connection').count(),0,'Public connection details must be removed');await page.locator('#screen-talk').click();assert.equal(await page.locator('#talk strong').textContent(),'Mic is live');
 await page.waitForSelector('#screen.speaking');await page.waitForFunction(()=>!document.querySelector('#screen')?.classList.contains('speaking'));
 async function utterance(){await page.evaluate(()=>{(window as any).__testGain.gain.value=.12;});await page.waitForTimeout(450);await page.evaluate(()=>{(window as any).__testGain.gain.value=0;});}
 await utterance();await page.waitForSelector('#screen.speaking',{timeout:15000});
 assert.equal(await page.locator('#talk').isEnabled(),true,'Microphone control must remain usable while replying');
 assert.ok(await page.evaluate(()=>(window as any).__testStream.getAudioTracks()[0].readyState==='live'));
 // Start speaking during reply playback. Barge-in stops playback before utterance completion.
 await page.evaluate(()=>{(window as any).__testGain.gain.value=.12;});
 await page.waitForFunction(()=>!(document.querySelector('#screen')?.classList.contains('speaking')),undefined,{timeout:2000});
 await page.waitForTimeout(350);await page.evaluate(()=>{(window as any).__testGain.gain.value=0;});
 await page.waitForFunction(()=>document.querySelector('#reply')?.textContent?.includes('Your next turn was heard'),undefined,{timeout:10000});
 assert.equal(sttCalls,2);assert.equal(chatCalls,2);assert.equal(await page.locator('#talk strong').textContent(),'Mic is live');
 await utterance();await page.waitForFunction(()=>document.querySelector('#talk strong')?.textContent==='Start listening');assert.equal(sttCalls,3);assert.equal(chatCalls,2,'Spoken stop must not call the inventory agent');assert.equal(await page.locator('#talk strong').textContent(),'Start listening');assert.ok(await page.evaluate(()=>(window as any).__testStream.getTracks().every((t:MediaStreamTrack)=>t.readyState==='ended')));
 await page.waitForTimeout(200);assert.equal(goodbyes,1,'Spoken stop must play one goodbye after turning the microphone off');assert.deepEqual(errors,[]);console.log('PASS · continuous mic · two turns without re-tapping · microphone open during Kokoro playback · voice interruption stops playback · spoken stop bypasses agent and releases tracks · welcome played on activation');
}finally{await browser.close();}
