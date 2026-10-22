const $=selector=>document.querySelector(selector);
const film=$('#demo-video');
// "Watch the film" scrolls to the YouTube embed and starts it (the click is the user gesture autoplay needs).
document.querySelectorAll('[data-play-demo]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();history.replaceState(null,'','#film');$('#film').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});if(!film.src.includes('autoplay=1'))film.src+='&autoplay=1';}));
