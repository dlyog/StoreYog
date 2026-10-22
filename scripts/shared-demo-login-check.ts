import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {mkdir} from 'node:fs/promises';
// Public store app: the synthetic demo store is offered first, credentials filled in; it can edit stock but not email or mint keys.
const base=process.env.BUSINESS_BASE_URL||'http://localhost:3100';const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1440,height:960}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>sessionStorage.setItem('storeyog-preview-ack-v1','yes'));
 await page.goto(base+'/store/');await page.waitForFunction(()=>document.querySelector<HTMLSelectElement>('#profile')?.value==='synthetic');
 assert.ok(await page.locator('#profile-label').isVisible());assert.equal(await page.locator('#email').inputValue(),'reviewer@little-india.example');assert.ok((await page.locator('#password').inputValue()).length>=12);assert.ok(await page.locator('#reviewer-note').isVisible());
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/store-login-synthetic.png'});
 await page.locator('#login-button').click();await page.locator('#workspace:not([hidden])').waitFor();assert.ok(await page.locator('#shared-demo-note').isVisible());assert.match(await page.locator('#store-name').textContent()||'',/Little India/);
 const csrf=await page.evaluate(async()=>(await(await fetch('/store/api/session')).json()).csrf);
 const post=(path:string)=>page.evaluate(async([path,csrf])=>(await fetch('/store/api/'+path,{method:'POST',headers:{'x-csrf-token':csrf}})).status,[path,csrf]);
 assert.equal(await post('reconcile'),200);for(const blocked of ['report/send','report/sales/send','owner-key','customer-key'])assert.equal(await post(blocked),403,blocked);
 await page.screenshot({path:'artifacts/store-workspace-synthetic.png'});assert.deepEqual(errors,[]);
 console.log('PASS shared synthetic store: dropdown prefilled, owner workspace opens, writes allowed, email/API keys denied.');
}finally{await browser.close();}
