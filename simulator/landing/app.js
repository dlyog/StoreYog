const $=selector=>document.querySelector(selector);
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4500);}
const video=$('#demo-video');
document.querySelectorAll('[data-play-demo]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();history.replaceState(null,'','#film');$('#film').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});video.play().catch(()=>toast('Press play on the video to start the film.'));}));
video.addEventListener('error',()=>toast('The film is not available here. You can try the live simulator or store app.'));
