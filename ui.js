import {pullDistance, shouldRefresh, isClosingSwipe} from './lib/gestures.js';

const $ = selector => document.querySelector(selector);
export function closeMenu() { if ($('#mobile-menu')?.open) $('#mobile-menu').close(); }

let masonryObserver;
export function layoutNews() {
  masonryObserver?.disconnect();
  const news = $('#news');
  for (const story of news.querySelectorAll('.story')) story.style.gridRowEnd = '';
  if (!news.classList.contains('mosaic') || !('ResizeObserver' in window)) return;
  const measure = story => {
    const style = getComputedStyle(news);
    const row = parseFloat(style.gridAutoRows), gap = parseFloat(style.rowGap);
    const span = Math.ceil((story.getBoundingClientRect().height + gap) / (row + gap));
    if (Number.isFinite(span) && span > 0) story.style.gridRowEnd = `span ${span}`;
  };
  masonryObserver = new ResizeObserver(entries => entries.forEach(entry => measure(entry.target)));
  news.querySelectorAll('.story').forEach(story => {measure(story);masonryObserver.observe(story);});
}

export function initInterface({openPanel, refresh}) {
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

  let installPrompt;
  const installed=()=>matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
  const installButton=$('#install-app');
  installButton.hidden=installed();
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;installButton.hidden=installed();});
  window.addEventListener('appinstalled',()=>{installPrompt=null;installButton.hidden=true;});
  installButton.onclick=async()=>{
    closeMenu();
    if(installPrompt){const prompt=installPrompt;installPrompt=null;await prompt.prompt();await prompt.userChoice;}
    else openPanel('install');
  };
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}
