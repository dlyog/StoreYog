import {invokesStoreYog} from './restock-intents.js';
export type DemoRole={stage:'role'|'pin'|'customer'|'owner';failures:number;expires:number};
export const demoWelcome='Welcome to StoreYog. Are you a customer or the owner?';
export function demoRoleTurn(state:DemoRole|undefined,text:string,now=Date.now()){
 const fresh=():DemoRole=>({stage:'role',failures:0,expires:now+600000});
 if(!state||state.expires<now||invokesStoreYog(text)||/^(?:switch|change) (?:user|role)|^sign out$/i.test(text))return {state:fresh(),reply:demoWelcome,execute:false};
 if(state.failures>=5)return {state,reply:'Too many PIN attempts. This demo session is locked. Start a fresh session.',execute:false};
 if(state.stage==='role'){
  if(/\bcustomer\b/i.test(text)){state.stage='customer';return {state,reply:'Great! I can help you find items in the store. What are you looking for?',execute:false};}
  if(/\bowner\b/i.test(text)){state.stage='pin';return {state,reply:'Great. I need to authenticate you. What is your PIN?',execute:false};}
  return {state,reply:demoWelcome,execute:false};
 }
 if(state.stage==='pin'){
  const pin=text.toLowerCase().replace(/\bone\b/g,'1').replace(/\btwo\b/g,'2').replace(/\bthree\b/g,'3').replace(/\bfour\b/g,'4').replace(/[\s,.!?-]/g,'');
  if(pin==='1234'){state.stage='owner';state.expires=now+300000;return {state,reply:'Welcome, Raj. Your owner access is verified. How can I help you?',execute:false};}
  state.failures++;return {state,reply:'That PIN was not recognized. Please try again.',execute:false};
 }
 return {state,reply:'',execute:true};
}
