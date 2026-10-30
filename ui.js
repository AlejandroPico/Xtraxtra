import {pullDistance, shouldRefresh, isClosingSwipe} from './lib/gestures.js';
import {swipeAction} from './lib/reading-tools.js';

const $ = selector => document.querySelector(selector);
export function closeMenu() { if ($('#mobile-menu')?.open) $('#mobile-menu').close(); }

let masonryObserver;
export function layoutNews() {
  masonryObserver?.disconnect();
  const news = $('#news');
  for (const story of news.querySelectorAll('.story')) story.style.gridRowEnd = '';
  if (!news.classList.contains('mosaic') || !('ResizeObserver' in window)) return;
  const measure = story => {
    const style = getComputedStyle(story.closest('.news-group') || news);
    const row = parseFloat(style.gridAutoRows), gap = parseFloat(style.rowGap);
    const span = Math.ceil((story.getBoundingClientRect().height + gap) / (row + gap));
    if (Number.isFinite(span) && span > 0) story.style.gridRowEnd = `span ${span}`;
  };
  masonryObserver = new ResizeObserver(entries => entries.forEach(entry => measure(entry.target)));
  news.querySelectorAll('.story').forEach(story => {measure(story);masonryObserver.observe(story);});
}

export function initInterface({openPanel, refresh, loadMore, gestureSettings=()=>({swipeLeft:"none",swipeRight:"none"}),cardAction=()=>{}}) {
  const mobile = matchMedia('(max-width: 760px)'), menu = $('#mobile-menu'), trigger = $('#menu-toggle');
  function syncTools() {
    closeMenu();
    $(mobile.matches ? '#mobile-tools-host' : '#desktop-tools-host').append($('#tools'));
  }
  syncTools();mobile.addEventListener('change',syncTools);
  trigger.onclick = () => {
    menu.showModal();trigger.setAttribute('aria-expanded','true');
  };
  $('#close-menu').onclick = closeMenu;
  $('#menu-favicon').onclick = closeMenu;
  menu.addEventListener('close',()=>trigger.setAttribute('aria-expanded','false'));
  menu.addEventListener('click',event=>{if(event.target===menu){const box=menu.getBoundingClientRect();if(event.clientX>box.right)closeMenu();}});
  $('#menu-refresh').onclick=()=>{closeMenu();refresh();};
  let swipe;
  menu.addEventListener('touchstart',event=>{if(event.touches.length===1)swipe={x:event.touches[0].clientX,y:event.touches[0].clientY};},{passive:true});
  menu.addEventListener('touchend',event=>{
    if(swipe && event.changedTouches.length && isClosingSwipe(swipe,{x:event.changedTouches[0].clientX,y:event.changedTouches[0].clientY}))closeMenu();
    swipe=null;
  },{passive:true});

  let start=null,distance=0,pulling=false;
  const indicator=$('#pull-refresh');
  function resetPull(){start=null;distance=0;pulling=false;indicator.hidden=true;indicator.style.removeProperty('--pull');}
  document.addEventListener('touchstart',event=>{
    if(mobile.matches && window.scrollY<=0 && !document.querySelector('dialog[open]') && event.touches.length===1 && !event.target.closest('input,select,.categories,.topics,.tools,#menu-toggle,.story-save,.coverage,.edition button')){
      start={x:event.touches[0].clientX,y:event.touches[0].clientY};
    }else start=null;
  },{passive:true});
  document.addEventListener('touchmove',event=>{
    if(!start || event.touches.length!==1)return;
    const end={x:event.touches[0].clientX,y:event.touches[0].clientY};
    // Give ordinary horizontal swipes and scrolling back to the browser.
    if(!pulling && ((Math.abs(end.x-start.x)>18 && Math.abs(end.x-start.x)>(end.y-start.y)*.7) || end.y<start.y-8)){start=null;return;}
    distance=pullDistance(start,end);
    if(distance>0){pulling=true;if(event.cancelable)event.preventDefault();indicator.hidden=false;indicator.style.setProperty('--pull',`${Math.min(distance,80)}px`);$('#pull-label').textContent=shouldRefresh(distance)?'Suelta para actualizar':'Arrastra para actualizar';}
    else if(pulling){indicator.hidden=true;}
  },{passive:false});
  document.addEventListener('touchend',()=>{
    const ready=pulling && shouldRefresh(distance);resetPull();if(ready)refresh();
  },{passive:true});
  document.addEventListener('touchcancel',resetPull,{passive:true});

  let cardSwipe=null,ignoreClick=null;
  const clearCard=()=>{if(cardSwipe){cardSwipe.card.style.removeProperty('--swipe-x');delete cardSwipe.card.dataset.swiping;}cardSwipe=null;};
  document.addEventListener('touchstart',event=>{
    if(document.querySelector('dialog[open]')||event.touches.length!==1||event.target.closest('.story-save,.coverage,a,input,select'))return;
    const settings=gestureSettings(),card=event.target.closest('.story');if(!card||settings.swipeLeft==='none'&&settings.swipeRight==='none')return;
    cardSwipe={card,x:event.touches[0].clientX,y:event.touches[0].clientY,horizontal:false};
  },{passive:true});
  document.addEventListener('touchmove',event=>{
    if(!cardSwipe||event.touches.length!==1)return;const dx=event.touches[0].clientX-cardSwipe.x,dy=Math.abs(event.touches[0].clientY-cardSwipe.y);
    if(!cardSwipe.horizontal&&dy>16&&dy>Math.abs(dx)){clearCard();return;}
    if(Math.abs(dx)>20&&Math.abs(dx)>dy*1.7){const action=dx<0?gestureSettings().swipeLeft:gestureSettings().swipeRight;if(action==='none')return;cardSwipe.horizontal=true;if(event.cancelable)event.preventDefault();cardSwipe.card.style.setProperty('--swipe-x',Math.max(-70,Math.min(70,dx*.5))+'px');cardSwipe.card.dataset.swiping='true';}
  },{passive:false});
  document.addEventListener('touchend',event=>{
    if(!cardSwipe)return;const previous=cardSwipe,end=event.changedTouches[0],action=end&&previous.horizontal?swipeAction(previous,{x:end.clientX,y:end.clientY},gestureSettings()):'none';clearCard();
    if(action!=='none'){if(event.cancelable)event.preventDefault();ignoreClick={id:previous.card.dataset.id,until:Date.now()+700};cardAction(previous.card.dataset.id,action);}
  },{passive:false});
  document.addEventListener('touchcancel',clearCard,{passive:true});
  document.addEventListener('click',event=>{if(ignoreClick&&Date.now()<ignoreClick.until&&event.target.closest('.story')?.dataset.id===ignoreClick.id){event.preventDefault();event.stopImmediatePropagation();ignoreClick=null;}},true);

  let installPrompt;
  const installed=()=>matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
  const installState=()=>{const button=$('#install-app');if(button)button.hidden=installed();};
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;installState();});
  window.addEventListener('appinstalled',()=>{installPrompt=null;installState();});
  document.addEventListener('click',async event=>{
    if(!event.target.closest('#install-app'))return;
    closeMenu();
    if(installPrompt){const prompt=installPrompt;installPrompt=null;await prompt.prompt();await prompt.userChoice;}
    else openPanel('install');
  });
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))loadMore();},{rootMargin:'0px 0px 800px 0px'});
    observer.observe($('#load-sentinel'));
  }else{
    window.addEventListener('scroll',()=>{if($('#load-sentinel').getBoundingClientRect().top<innerHeight+800)loadMore();},{passive:true});
  }
  // An observer may have fired while a modal was open. Resume at its close.
  document.addEventListener('close',()=>requestAnimationFrame(()=>{if($('#load-sentinel').getBoundingClientRect().top<innerHeight+800)loadMore();}),true);
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}
