import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { config } from '../server/config.js';
const key=config.mcpApiKey||(await import('../server/credentials.js')).bootstrapCredentials().apiKey;
const client = new Client({name:'storeyog-smoke',version:'1.0.0'});
try {
 await client.connect(new StreamableHTTPClientTransport(new URL(config.mcpUrl),{requestInit:{headers:{Authorization:`Bearer ${key}`}}}));
 const {tools} = await client.listTools();console.log('Tools:',tools.map(t=>t.name).join(', '));assert.equal(tools.length,6);
 for(const [name,args] of [['get_inventory',{}],['get_todays_transactions',{}],['reconcile_inventory',{}],['place_reorder',{items:[{item:'Basmati rice',qty:28},{item:'Toor dal',qty:42}],confirmed:false}]] as const){
  const start=performance.now();const result=await client.callTool({name,arguments:args});const ms=performance.now()-start;
  assert.ok(!result.isError);assert.ok(ms<500,`${name} took ${ms.toFixed(1)} ms`);
  console.log(`${name}: ${ms.toFixed(1)} ms · ${(result.structuredContent as any)?.summary}`);
 }
 console.log('PASS · six tools discovered · inventory/restock HTTP round trips under 500 ms');
} finally {await client.close();}
