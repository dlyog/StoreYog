import {config} from '../server/config.js';
const r=await fetch(`http://127.0.0.1:${config.webPort}/api/reset`,{method:'POST'});
if(!r.ok)throw new Error(`Reset failed (${r.status}): ${await r.text()}. Start npm run dev first.`);
console.log(await r.json());
