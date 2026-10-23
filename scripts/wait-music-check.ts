// The "While StoreYog checks" setting: with background music chosen, a question plays the music track (no spoken
// acknowledgement is requested) and the music stops once the answer is ready; with spoken phrases, consecutive
// questions request different acknowledgement phrases.
//   BUSINESS_BASE_URL=https://storeyog.dlyog.com node --import tsx scripts/wait-music-check.ts
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=(process.env.BUSINESS_BASE_URL||'http://localhost:3100').replace(/\/$/,'');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 for(const style of ['music','phrases']){
  const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(s=>{sessionStorage.setItem('storeyog-preview-ack-v1','yes');localStorage.setItem('sy_wait',s);localStorage.setItem('sy_voice','on');},style);
  const requests:string[]=[];page.on('request',r=>requests.push(new URL(r.url()).pathname+new URL(r.url()).search));
  // Slow the answer a little so the waiting feedback has time to start; the real assistant runs behind it.
  await page.route('**/api/chat',async route=>{await new Promise(r=>setTimeout(r,1500));await route.continue();});
  await page.goto(base+'/simulator',{waitUntil:'networkidle'});
  for(const question of ['Where is the rice?','How much ghee do we have?']){
   await page.fill('#message',question);await page.press('#message','Enter');
   if(style==='music')await page.waitForFunction(()=>document.querySelector('#screen')?.getAttribute('data-feedback')==='music',undefined,{timeout:8000});
   await page.waitForFunction(()=>!document.querySelector('#screen')?.classList.contains('thinking')&&!/Checking|…/.test(document.querySelector('#reply')?.textContent||''),undefined,{timeout:45000});
  }
  const acks=requests.filter(p=>p.startsWith('/api/acknowledgement?'));
  if(style==='music'){
   assert.ok(requests.some(p=>p.startsWith('/media/wait-music.mp3')),'music track requested');
   assert.equal(acks.length,0,'no spoken acknowledgement in music mode');
   await page.waitForTimeout(800);
   assert.ok(await page.evaluate(()=>!document.querySelector('#screen')?.hasAttribute('data-feedback')),'music feedback ends with the answer');
  }else{
   assert.ok(new Set(acks).size>=2,`two questions use different phrases: ${acks.join(', ')}`);
  }
  assert.deepEqual(errors,[]);await page.close();
  console.log(`${style}: ${style==='music'?'music played, no phrase requested, stopped with the answer':'phrases requested: '+acks.join(', ')}`);
 }
 console.log('PASS wait feedback: background music mode plays the track instead of phrases and stops with the answer; phrase mode rotates phrases.');
}finally{await browser.close();}
