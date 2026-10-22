import {spawn} from 'node:child_process';
import { config } from '../server/config.js';
// Local launcher provisions credentials, but the two deployable services remain independent.
const {bootstrapCredentials}=await import('../server/credentials.js');
const credentials=bootstrapCredentials();
const common={...process.env,MCP_API_KEY:credentials.apiKey,INTERNAL_TOKEN:credentials.internalToken};
const children=['server/index.ts','simulator/index.ts'].map(file=>spawn(process.execPath,['--import','tsx',file],{stdio:'inherit',env:common}));
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const c of children)c.kill('SIGTERM');setTimeout(()=>process.exit(code),200).unref();}
for(const c of children)c.on('exit',code=>stop(code||0));
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
console.log(`\nStoreYog · open http://localhost:${config.webPort}\n`);

if(process.platform==='win32')process.on('SIGBREAK',()=>stop());
