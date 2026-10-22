import {isStopListening} from './voice-commands.js';
// Shared microphone lifecycle for both public voice views. Audio upload APIs are
// utterance based; the browser keeps the mic open and segments speech on pauses.
export class HandsFree {
 constructor({onText,onSpeech=()=>{},onState=()=>{},onStop=()=>{},onError=()=>{}}){Object.assign(this,{onText,onSpeech,onState,onStop,onError});this.active=false;this.generation=0;this.pending=null;}
 async start(){
  if(this.active)return;const generation=++this.generation;
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('Use localhost or HTTPS and a browser with microphone support. You can also type.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
  this.stream=stream;
  try{this.context=new (window.AudioContext||window.webkitAudioContext)();await this.context.resume();
   if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());await this.context.close();return;}
   this.analyser=this.context.createAnalyser();this.analyser.fftSize=1024;this.context.createMediaStreamSource(stream).connect(this.analyser);this.samples=new Float32Array(this.analyser.fftSize);this.active=true;this.onState('ready');this.record();this.detect();
  }catch(error){this.stop();throw error;}
 }
 stop(){
  this.active=false;this.generation++;cancelAnimationFrame(this.frame);this.pending=null;this.upload?.abort();this.upload=null;
  if(this.recorder?.state==='recording'){this.recorder.onstop=null;this.recorder.stop();}
  this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;void this.context?.close();this.context=null;this.onState('off');
 }
 disconnect(text='Stop'){this.stop();this.onStop(text);}
 record(){
  if(!this.active)return;const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
  const recorder=new MediaRecorder(this.stream,mime?{mimeType:mime}:{}),chunks=[];this.recorder=recorder;this.frames=0;this.started=performance.now();this.lastVoice=this.started;
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onstop=()=>{if(!this.active)return;const voiced=this.frames>=5;this.record();if(voiced){this.pending={blob:new Blob(chunks,{type:recorder.mimeType||'audio/webm'}),generation:this.generation};void this.transcribe();}};
  recorder.start();
 }
 detect(){
  if(!this.active)return;this.analyser.getFloatTimeDomainData(this.samples);let power=0;for(const sample of this.samples)power+=sample*sample;
  const now=performance.now(),voiced=Math.sqrt(power/this.samples.length)>.022;
  if(voiced&&this.recorder?.state==='recording'){this.lastVoice=now;if(++this.frames===5){this.onSpeech();this.onState('hearing');}}
  if(this.recorder?.state==='recording'&&((this.frames>=5&&now-this.lastVoice>950)||now-this.started>25000))this.recorder.stop();
  this.frame=requestAnimationFrame(()=>this.detect());
 }
 async transcribe(){
  if(this.upload||!this.pending||!this.active)return;const pending=this.pending;this.pending=null;const controller=new AbortController();this.upload=controller;const timeout=setTimeout(()=>controller.abort(),60000);this.onState('transcribing');
  try{const form=new FormData();form.append('audio',pending.blob,pending.blob.type.includes('mp4')?'question.mp4':'question.webm');const r=await fetch('/api/stt',{method:'POST',body:form,signal:controller.signal}),data=await r.json();
   if(!this.active||pending.generation!==this.generation)return;if(!r.ok)throw Error(data.error||'Transcription failed. Please try again.');const text=data.transcript?.trim();if(!text)return;
   if(isStopListening(text)){this.disconnect(text);return;}this.onText(text);
  }catch(error){if(this.active&&pending.generation===this.generation&&error.name!=='AbortError')this.onError(error.message||'Speech recognition is unavailable. You can type instead.');}
  finally{clearTimeout(timeout);if(this.upload===controller){this.upload=null;if(this.active){this.onState('ready');void this.transcribe();}}}
 }
}
