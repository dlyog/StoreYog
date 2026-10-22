const $=selector=>document.querySelector(selector);
let endpoint='';
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4500);}
function safeLink(value){try{const url=new URL(value,location.origin);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}}
async function loadConnections(){
 try{const r=await fetch('/api/judge');if(!r.ok)throw new Error('Connection details unavailable');const data=await r.json();
  const storeUrl=safeLink(data.storeUrl);if(storeUrl)document.querySelectorAll('[data-store-link]').forEach(a=>a.href=storeUrl);
  const consoleUrl=safeLink(data.consoleUrl),healthUrl=safeLink(data.healthUrl);endpoint=safeLink(data.mcpUrl)||'';
  if(data.judgeDemoLogin)document.querySelector('[data-console-access]').textContent='Judge access preconfigured';
  if(consoleUrl)document.querySelectorAll('[data-console-link]').forEach(a=>{a.href=consoleUrl;});if(healthUrl)$('#health-link').href=healthUrl;
  $('#server-status').textContent=data.online?'MCP server is online · tools require a store key':'MCP service is unavailable · explore the project below';$('#server-status-dot').style.background=data.online?'#69a885':'#c49e60';
 }catch{$('#server-status').textContent='Live status unavailable · explore the demo below';$('#server-status-dot').style.background='#b6b8be';}
}
$('#copy-endpoint').addEventListener('click',async()=>{if(!endpoint){toast('The server address is still loading. Please try again.');return;}try{await navigator.clipboard.writeText(endpoint);toast('MCP endpoint copied. A store Bearer key is required to connect.');}catch{toast(`MCP endpoint: ${endpoint}`);}});
const video=$('#demo-video');
document.querySelectorAll('[data-play-demo]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();history.replaceState(null,'','#demo');$('#demo').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});video.play().catch(()=>toast('Press play on the video to start the demo.'));}));
video.addEventListener('error',()=>toast('The optional video export is not available here. You can try the live simulator or owner workspace.'));
void loadConnections();
