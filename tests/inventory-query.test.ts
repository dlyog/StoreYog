import {test} from 'node:test';import assert from 'node:assert/strict';
import {asksAboutStock,inventoryQuestion,stockAnswer} from '../simulator/inventory-query.js';
const items=[{item:'Basmati rice',stock:12,unit:'bag'},{item:'Toor dal',stock:7,unit:'bag'},{item:'Brown rice',stock:0,unit:'bag'}];
test('quantity questions match short names and lentil aliases without choosing an arbitrary product',()=>{
 assert.deepEqual(inventoryQuestion('How much rice available?',items),[items[0],items[2]]);
 assert.deepEqual(inventoryQuestion('How many bags of basmati rice do we have?',items),[items[0]]);
 assert.deepEqual(inventoryQuestion('How many basmati rice do we have?',items),[items[0]]);
 assert.deepEqual(inventoryQuestion('Do you have lentils?',items),[items[1]]);
 assert.deepEqual(inventoryQuestion('How much quinoa is available?',items),[]);
 assert.equal(inventoryQuestion('Update rice to 20',items),null);
 assert.equal(inventoryQuestion('Reorder rice',items),null);
 assert.equal(inventoryQuestion('Send inventory report',items),null);
});
test('stock replies preserve real zero counts, units and reconciliation state',()=>{
 assert.match(stockAnswer([items[2]],true),/Brown rice: 0 bags in stock/);
 assert.match(stockAnswer([items[0]],false),/opening stock counts/);
 assert.equal(stockAnswer([{item:'Rice',stock:1,unit:'bag'}],true),'Rice: 1 bag in stock.');
 assert.match(stockAnswer([],true),/could not find/);
});
test('spoken spellings from Alexa speech recognition reach the real count',()=>{
 const shelf=[{item:'Toor dal',stock:18,unit:'2 lb bag'},{item:'Chana dal',stock:34,unit:'2 lb bag'},{item:'Cumin seeds',stock:12,unit:'jar'},{item:'Basmati rice',stock:12,unit:'25 lb bag'}];
 for(const said of ['do I have dahl','check dahl','no check the dahl','how much daal do we have'])assert.deepEqual(inventoryQuestion(said,shelf),[shelf[0],shelf[1]],said);
 assert.deepEqual(inventoryQuestion('do we have toor dhal',shelf),[shelf[0]]);
 assert.deepEqual(inventoryQuestion('got any jeera',shelf),[shelf[2]]);
});
test('stock questions route to MCP counts while sales and order questions keep their paths',()=>{
 for(const said of ['do I have dahl','check dahl','how much rice is available','got any ghee','is paneer in stock'])assert.ok(asksAboutStock(said),said);
 for(const said of ['check today\'s sales','how much did I make today','what is the status of my order','reorder rice','reconcile today\'s inventory','email my inventory report','how is my store doing'])assert.ok(!asksAboutStock(said),said);
});
