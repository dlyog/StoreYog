import {test} from 'node:test';import assert from 'node:assert/strict';
import {catalogQuestion,catalogAnswer} from '../server/catalog-query.js';
const items=[{name:'Paneer',category:'Dairy',location:'Dairy fridge, right wall, top shelf.'},{name:'Dahi',category:'Dairy',location:'Dairy fridge, right wall, middle shelf.'},{name:'Moong dal',category:'Lentils & flour',location:'Aisle 2, middle shelf, right.'},{name:'Cardamom',category:'Spices & tea',location:'Aisle 3, spice rack, top row, right.'}];
test('catalog questions: whole store, sections and spoken synonyms',()=>{
 for(const q of ['what items are available','what do you have','what products do you sell','list everything','show me the sections'])assert.equal(catalogQuestion(q),'',q);
 assert.equal(catalogQuestion("what's in the dairy fridge"),'dairy');
 assert.equal(catalogQuestion('which spices do you have'),'spices');
 assert.equal(catalogQuestion('what vegetables do you have'),'produce');
 assert.equal(catalogQuestion('which lentils do you carry'),'lentils');
});
test('stock, sales and location questions are not catalog questions',()=>{
 for(const q of ['which items are low','what sold best today','what is the status of my order','how much rice is available','where is the paneer','do you have rice','what can I cook with toor dal'])assert.equal(catalogQuestion(q),null,q);
});
test('catalog answers list sections or one section with its place, never counts',()=>{
 assert.match(catalogAnswer(items,''),/We carry 4 products in 3 sections: Dairy, Lentils & flour and Spices & tea/);
 assert.equal(catalogAnswer(items,'dairy'),'Dairy, dairy fridge: Paneer and Dahi. Ask where any of them is for the exact shelf.');
 assert.match(catalogAnswer(items,'frozen'),/could not find that section/);
});
