import {test} from 'node:test';import assert from 'node:assert/strict';
import {inventoryQuestion,stockAnswer} from '../simulator/inventory-query.js';
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
