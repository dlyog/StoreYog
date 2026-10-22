// Echo Show screens (Alexa Presentation Language) for the classic skill. Sent only when the device reports
// Alexa.Presentation.APL in context.System.device.supportedInterfaces. APL 1.8 components only
// (Container, Frame, Image, Text, Video), so older Echo Show models render them too.
// https://developer.amazon.com/docs/alexa-presentation-language/apl-interface.html

const VERSION='1.8';
const INK='#0f1626',CARD='#ffffff',MUTED='#5f6470',BLUE='#2c62ed',AMBER='#ffc23d';
export const SUGGESTIONS=['How much rice is available?','Where is the toor dal?',"Reconcile today's inventory and draft a restock",'Is paneer high in protein?','Play an inventory tip','Play the demo video'];

export const supportsApl=(body:any)=>!!body?.context?.System?.device?.supportedInterfaces?.['Alexa.Presentation.APL'];

function render(token:string,items:any[],background?:string){
 return {type:'Alexa.Presentation.APL.RenderDocument',token,document:{type:'APL',version:VERSION,theme:'dark',mainTemplate:{parameters:['payload'],items:[{type:'Container',width:'100vw',height:'100vh',items:[
  ...(background?[{type:'Image',source:background,width:'100vw',height:'100vh',scale:'best-fill',position:'absolute',opacity:0.35}]:[{type:'Frame',width:'100vw',height:'100vh',position:'absolute',backgroundColor:INK}]),
  {type:'Container',width:'100vw',height:'100vh',paddingLeft:'5vw',paddingRight:'5vw',paddingTop:'4vh',paddingBottom:'4vh',items:[
   {type:'Text',text:'StoreYog · Little India Grocery',fontSize:'22dp',color:AMBER,fontWeight:'700'},...items]}]}]}}};
}

// Opening screen: who the assistant is and what to try.
export function welcomeScreen(origin:string){
 return render('welcome',[
  {type:'Text',text:'Hello, I am your Virtual Store Assistant!',fontSize:'40dp',fontWeight:'800',color:'#ffffff',paddingTop:'3vh'},
  {type:'Text',text:'You can ask me:',fontSize:'24dp',color:'#dfe6f5',paddingTop:'3vh'},
  ...SUGGESTIONS.map(s=>({type:'Text',text:'“'+s+'”',fontSize:'26dp',color:'#ffffff',paddingTop:'1.5vh'})),
  {type:'Text',text:'Synthetic demo store · simulated orders',fontSize:'16dp',color:'#aeb7c9',paddingTop:'4vh'}],
 origin+'/alexa/media/welcome.jpg');
}

// Any answer: what was asked, and what StoreYog said.
export function answerScreen(question:string,answer:string){
 return render('answer',[
  {type:'Text',text:question,fontSize:'22dp',color:'#aeb7c9',paddingTop:'3vh',maxLines:2},
  {type:'Text',text:answer,fontSize:'32dp',color:'#ffffff',fontWeight:'600',paddingTop:'2vh',maxLines:8}]);
}

// Shelf photo with the owner's yellow arrow at the published marker position.
export function shelfScreen(item:{name:string;available:boolean;location?:string;photo:{url:string;marker?:{x:number;y:number}}},answer:string,origin:string){
 const marker=item.photo.marker;
 return render('shelf',[{type:'Container',direction:'row',width:'90vw',height:'82vh',paddingTop:'2vh',items:[
  {type:'Container',width:'54vw',height:'78vh',items:[
   {type:'Image',source:origin+'/alexa/media/photo/'+(item.photo.url.split('/').pop()||'')+'.jpg',width:'54vw',height:'78vh',scale:'best-fill'},
   ...(marker?[{type:'Frame',position:'absolute',left:`${Math.round(marker.x*100)}%`,top:`${Math.max(0,Math.round(marker.y*100)-12)}%`,items:[{type:'Text',text:'⬇',fontSize:'64dp',color:AMBER}]}]:[])]},
  {type:'Container',width:'34vw',paddingLeft:'3vw',items:[
   {type:'Text',text:item.name,fontSize:'40dp',fontWeight:'800',color:'#ffffff'},
   {type:'Text',text:item.available?'IN STOCK':'OUT OF STOCK',fontSize:'20dp',fontWeight:'700',color:item.available?'#5ee08a':'#ff8a80',paddingTop:'1vh'},
   {type:'Text',text:item.location||'',fontSize:'24dp',color:'#dfe6f5',paddingTop:'2vh',maxLines:4},
   {type:'Text',text:answer,fontSize:'22dp',color:'#ffffff',paddingTop:'3vh',maxLines:6}]}]}]);
}

// Demo video, autoplaying; when it ends the device sends a UserEvent so the conversation can continue.
export function videoScreen(origin:string){
 return {type:'Alexa.Presentation.APL.RenderDocument',token:'video',document:{type:'APL',version:VERSION,theme:'dark',mainTemplate:{parameters:['payload'],items:[{type:'Container',width:'100vw',height:'100vh',items:[
  {type:'Video',id:'demoVideo',width:'100vw',height:'100vh',scale:'best-fit',autoplay:true,audioTrack:'foreground',
   source:[{url:origin+'/alexa/media/demo.mp4'}],onEnd:[{type:'SendEvent',arguments:['videoEnded']}]}]}]}}};
}

// Audio guide card: what is playing (the audio itself plays through the spoken response).
export function guideScreen(guide:{id:string;title:string;category:string},total:number){
 const label={inventory:'Inventory guide',business:'Small business guide',food:'Food and nutrition guide'}[guide.category]||'Guide';
 return render('guide',[
  {type:'Text',text:`${label} · ${Number(guide.id)} of ${total}`,fontSize:'22dp',color:'#aeb7c9',paddingTop:'4vh'},
  {type:'Text',text:guide.title,fontSize:'44dp',fontWeight:'800',color:'#ffffff',paddingTop:'2vh'},
  {type:'Text',text:'Original StoreYog audio · voiced with Kokoro',fontSize:'20dp',color:'#dfe6f5',paddingTop:'3vh'},
  {type:'Text',text:'Say “next tip”, ask about a product, or say “stop”.',fontSize:'22dp',color:AMBER,paddingTop:'5vh'}]);
}
