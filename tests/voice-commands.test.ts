import {test} from 'node:test';import assert from 'node:assert/strict';
// @ts-ignore browser module shares the exact matching rules with the voice UI.
import {isStopListening,WELCOME} from '../simulator/public/voice-commands.js';
test('spoken microphone stop commands recognize the word stop anywhere and retain microphone-off phrases',()=>{for(const s of ['stop','Stop.','stop listening','Alexa, stop listening.','microphone off','Turn off the mic.','please stop listening','stop listening, please','OK, stop.','Okay stop now please','I am done STOP thank you','stop ordering rice','do not stop listening','stop the reorder'])assert.equal(isStopListening(s),true,s);for(const s of ['how much stock do I have','stopping by the store','The stoplight is green','Show stocked products'])assert.equal(isStopListening(s),false,s);});
test('welcome identifies the product and invites an owner request',()=>{assert.match(WELCOME,/Welcome to StoreYog/);assert.match(WELCOME,/How can I help you today/);});
