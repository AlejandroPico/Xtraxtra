import {languages,sourceSettings,mergeSources,keepNewerFeed,parseFeed,feedMetadata,readSnapshots,saveSnapshot,removeSnapshot} from './lib/feeds.js';
import {territories,matchesTerritory} from './lib/geography.js';
import {createMediaPanel} from './lib/media-panel.js';
import { categories, normalize, categoryOf, groupArticles, score, relatedTopics, filterArticles, safeURL, escapeHTML as esc } from './lib/news.js';
import { initInterface, closeMenu, layoutNews } from './ui.js';
import {activeMutes,isMuted} from './lib/search.js';
import {calendarKey,clusterDay,dayLabel,organizeEdition} from './lib/edition.js';
import {readingPreferences,sanitizeFrontpages,readingEstimate} from './lib/preferences.js';

const $ = selector => document.querySelector(selector);
const icons = {
  rss:'<path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  filter:'<path d="M3 4h18l-7 8v7l-4 2v-9z"/>', type:'<path d="M4 5h13M10.5 5v15M6 20h9M16 12h5M18.5 12v8"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  install:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>', refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/>',
  bookmark:'<path d="M6 4h12v17l-6-4-6 4z"/>', grid:'<rect x="3" y="3" width="7" height="11" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="18" width="7" height="3" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  cards:'<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/><path d="M3 10h7M14 10h7"/>',
  list:'<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>', search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="M16 16l5 5"/>',
  close:'<path d="M6 6l12 12M18 6L6 18"/>', arrow:'<path d="M7 17L17 7M7 7h10v10"/>', check:'<path d="M5 12l4 4L19 6"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.info}</svg>`;
const hydrateIcons = (root = document) => root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
let storageWarning = false;
function readStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function writeStorage(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { if (!storageWarning) { storageWarning = true; toast('El navegador no permite guardar más datos. Tus cambios solo durarán esta sesión.'); } } }
const initial = readStorage('extra-extra:preferences', {});
const fonts = { Georgia:'Georgia,serif', Palatino:'"Palatino Linotype",Palatino,serif', Cambria:'Cambria,Georgia,serif', Sistema:'system-ui,sans-serif', Arial:'Arial,sans-serif', Verdana:'Verdana,sans-serif' };
const prefs = {
  ...readingPreferences(initial),
  theme:['auto','morning','afternoon','night'].includes(initial.theme) ? initial.theme : 'auto',
  view:['mosaic','cards','list'].includes(initial.view) ? initial.view : 'mosaic',
  font:fonts[initial.font] ? initial.font : 'Georgia', size:Math.min(28,Math.max(15,Number(initial.size) || 19)),
  images:initial.images !== false, group:initial.group !== false,
  nearby:territories.some(t=>t.id===initial.nearby)?initial.nearby:'',
  sources:Array.isArray(initial.sources) ? initial.sources.filter(s => typeof s === 'string') : null,
};
let catalog=[],mediaSettings=sourceSettings(readStorage('extra-extra:media',{}));
let liveBusy=false,lastLiveCheck=0,liveTimer,automaticTimer,serviceProblem='',liveProgress='',pendingLive=false;
const RSS_API='https://xtraxtra-rss-apico.alejandropico.chatgpt.site/api';
const AUTO_REFRESH=10*60000;
let sources = [], data = { articles:[], status:{} }, visibleClusters = [], allClusters = [], limit = 36;
let read = readStorage('extra-extra:read', []); if (!Array.isArray(read)) read = [];
let saved = readStorage('extra-extra:saved', []); if (!Array.isArray(saved)) saved = [];
saved = saved.filter(item => item && typeof item.id === 'string' && typeof item.title === 'string' && safeURL(item.url));
const filters = { query:'', category:'Actualidad', language:'', territory:'', hours:0, unread:false, topic:null, topicName:'' };
let savedOnly = false, panelName = '', currentArticle = null, currentCluster = null, toastTimer, searchTimer, sortOrder = 'relevance';
let frontpages=sanitizeFrontpages(readStorage('extra-extra:frontpages',[]));
let mutes=activeMutes(Array.isArray(readStorage('extra-extra:mutes',[]))?readStorage('extra-extra:mutes',[]):[]);
let activeFrontpage='',loadingMore=false,lastCalendarDay=calendarKey(new Date());

function persist() { writeStorage('extra-extra:preferences', prefs); }
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 4200); }
function applyAppearance() {
  const hour = new Date().getHours();
  $('#edition-date').textContent=new Intl.DateTimeFormat('es',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
  const theme = prefs.theme === 'auto' ? (hour >= 7 && hour < 17 ? 'morning' : hour >= 17 && hour < 21 ? 'afternoon' : 'night') : prefs.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--reader-font', fonts[prefs.font]);
  document.documentElement.style.setProperty('--heading-font', fonts[prefs.font]);
  document.documentElement.style.setProperty('--reading-size', `${prefs.size}px`);
  document.body.classList.toggle('hide-images', !prefs.images);
  document.documentElement.dataset.density=prefs.density;
  document.documentElement.classList.toggle('high-contrast',prefs.highContrast);
  document.body.classList.toggle('large-controls',prefs.largeControls);
  document.body.classList.toggle('no-motion',prefs.reduceMotion);
  for(const [property,value] of Object.entries({'--reader-leading':prefs.lineHeight,'--reader-width':prefs.readerWidth+'px','--reader-margin':prefs.readerMargin+'px','--paragraph-gap':prefs.paragraphGap+'em'}))document.documentElement.style.setProperty(property,value);
  $('meta[name=theme-color]').content = {morning:'#f8f6f1',afternoon:'#f2e7d5',night:'#171e2b'}[theme];
  if ($('#group')) $('#group').checked = prefs.group;
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', button.dataset.view === prefs.view));
}
function relativeTime(date) {
  if (!date) return 'Sin fecha';
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(date)) / 60000));
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  if (minutes < 1440) return `Hace ${Math.floor(minutes / 60)} h`;
  return new Intl.DateTimeFormat('es', {day:'numeric',month:'short'}).format(new Date(date));
}
function dateLabel(date) {
  return date ? new Intl.DateTimeFormat('es', { day:'numeric',month:'long',hour:'2-digit',minute:'2-digit' }).format(new Date(date)) : 'El medio no indica la fecha';
}
const sourceFor = article => sources.find(s => s.id === article.source) || {name:article.sourceName || article.source, category:'Actualidad'};
const isSaved = article => saved.some(s => s.id === article.id);
function saveArticle(article) {
  if (isSaved(article)) { saved = saved.filter(s => s.id !== article.id); toast('Retirada de Leer después.'); }
  else { saved.unshift({...article, sourceName:sourceFor(article).name}); toast('Guardada para leer después.'); }
  writeStorage('extra-extra:saved', saved);
  const scroll = window.scrollY;
  render(); window.scrollTo(0, scroll);
  if (currentArticle) updateReaderSave();
}
function updateReaderSave() {
  $('#reader-save').setAttribute('aria-pressed', isSaved(currentArticle));
  $('#reader-save').setAttribute('aria-label', isSaved(currentArticle) ? 'Retirar de Leer después' : 'Guardar para leer después');
  $('#reader-pending').disabled=!read.includes(currentArticle.id);
}
function renderCategories() {
  $('#categories').innerHTML = categories.map((category,i) => `<button data-category="${esc(category)}" aria-pressed="${filters.category === category}">${i === 0 ? 'Portada' : esc(category)}</button>`).join('');
}
function resetFilters() {
  activeFrontpage='';
  Object.assign(filters, {query:'', category:'Actualidad', language:'', territory:'', hours:0, unread:false, topic:null, topicName:''});
  if ($('#search')) $('#search').value = ''; limit = 36; renderCategories(); render();
}
function activeFilters() {
  const labels = [savedOnly&&'Leer después',filters.query && `«${filters.query}»`,filters.territory&&territories.find(t=>t.id===filters.territory)?.name,prefs.nearby&&`Cerca de ${territories.find(t=>t.id===prefs.nearby)?.name}`, filters.language && `Idioma: ${filters.language.toUpperCase()}`, filters.hours && `Últimas ${filters.hours} h`, filters.unread && 'Sin leer', filters.topicName, prefs.sources?.length !== sources.length && `${prefs.sources?.length || 0} medios`,activeMutes(mutes).length&&`${activeMutes(mutes).length} silencios`].filter(Boolean);
  const container = $('#active-filters');
  container.hidden = !labels.length;
  container.innerHTML = labels.map(label => `<span class="chip">${esc(label)}</span>`).join('') + (labels.length ? '<button id="clear-filters">Limpiar filtros</button>' : '');
  $('#filter-dot').hidden = !labels.length;
}
function renderTopics() {
  const topics = relatedTopics(data.articles.filter(a => prefs.sources?.includes(a.source)&&!isMuted(a,mutes)));
  $('#topics').innerHTML = topics.slice(0,8).map((topic,i) => `<button data-topic="${i}" aria-pressed="${filters.topicName === topic.name}">${esc(topic.name)} <small>${topic.count}</small></button>`).join('') || '<span class="small-note">Los temas aparecerán según las noticias disponibles.</span>';
  $('#topics').querySelectorAll('[data-topic]').forEach(button => button.addEventListener('click', () => {
    const topic = topics[Number(button.dataset.topic)];
    const off = topic.name === filters.topicName;
    filters.topic = off ? null : topic.pattern; filters.topicName = off ? '' : topic.name; limit = 36; render();
  }));
}
function storyHTML(cluster, i) {
  const article = cluster.articles[0], source = sourceFor(article);
  const count = new Set(cluster.articles.map(a => a.source)).size;
  const category = categoryOf(article, source);
  const summary = article.summary.replace(/\s+/g,' ');
  const image = safeURL(article.image);
  const hasImage = image && prefs.images;
  const time = relativeTime(article.published).replace('Hace ', '');
  return `<article class="story ${read.includes(article.id) ? 'is-read' : ''}" data-id="${esc(article.id)}">
    <div class="story-media ${hasImage ? '' : 'no-image'}">
      ${hasImage ? `<button class="story-photo" data-open="${esc(article.id)}" aria-label="Leer: ${esc(article.title)}" tabindex="-1"><img class="story-image" src="${esc(image)}" alt="" loading="${i < 5 ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer"></button>` : ''}
      <button class="story-save" data-save="${esc(article.id)}" aria-label="${isSaved(article) ? 'Retirar de Leer después' : 'Guardar para leer después'}: ${esc(article.title)}" aria-pressed="${isSaved(article)}">${icon('bookmark')}</button>
      ${count > 1 ? `<button class="coverage" data-open="${esc(article.id)}" aria-label="Comparar ${count} medios: ${esc(article.title)}">${count} medios · Comparar ↗</button>` : ''}
    </div>
    <div class="story-body"><div class="story-meta"><span class="source-mark" aria-hidden="true">${esc(source.name.replace(/^(El |La |The )/,'').slice(0,2))}</span><span class="source-name">${esc(source.name)}</span><span aria-hidden="true">·</span><time datetime="${esc(article.published || '')}" title="${esc(dateLabel(article.published))}">${time}</time>${article.language !== 'es' ? `<span class="language-tag">${esc(article.language.toUpperCase())}</span>` : ''}<span class="story-section">${esc(category)}</span></div>
    <h3><button data-open="${esc(article.id)}" lang="${esc(article.language)}">${esc(article.title)}</button></h3>
    ${summary ? `<p class="story-summary" lang="${esc(article.language)}">${esc(summary)}</p>` : ''}
    </div></article>`;
}
function connectStoryImages(root) {
  root.querySelectorAll('img').forEach(img=>{
    if(img.dataset.errorBound)return;
    img.dataset.errorBound='true';
    img.addEventListener('error',()=>{const media=img.closest('.story-media');if(media){media.classList.add('no-image');img.closest('.story-photo')?.remove();}},{once:true});
  });
}
function appendStories(clusters) {
  const news=$('#news');
  for(const cluster of clusters) {
    const key=clusterDay(cluster);
    let group=[...news.querySelectorAll('.day-group')].find(group=>group.dataset.day===key);
    if(!group){
      group=document.createElement('section');group.className='day-group';group.dataset.day=key;
      const heading=document.createElement('h2');heading.className=key===calendarKey(new Date())?'sr-only':'day-separator';heading.textContent=dayLabel(key);group.append(heading);
      const grid=document.createElement('div');grid.className=`news-group ${prefs.view}`;group.append(grid);news.append(group);
    }
    group.querySelector('.news-group').insertAdjacentHTML('beforeend',storyHTML(cluster,news.querySelectorAll('.story').length));
  }
  connectStoryImages(news);layoutNews();
  $('#feed-status').textContent=`${news.querySelectorAll('.story').length} de ${allClusters.length} noticias cargadas`;
}
function loadMoreStories() {
  if(loadingMore||!prefs.sources||limit>=allClusters.length||document.querySelector('dialog[open]'))return;
  loadingMore=true;
  requestAnimationFrame(()=>{
    const previous=limit;limit=Math.min(limit+30,allClusters.length);
    const more=allClusters.slice(previous,limit);visibleClusters=allClusters.slice(0,limit);appendStories(more);
    loadingMore=false;
    if(limit<allClusters.length && $('#load-sentinel').getBoundingClientRect().top<innerHeight+800)setTimeout(loadMoreStories,80);
  });
}
function render() {
  if(!prefs.sources)return;
  const base=savedOnly?saved:data.articles;
  const filtered=filterArticles(base,{...filters,sources:savedOnly?[...new Set([...prefs.sources,...saved.map(a=>a.source)])]:prefs.sources,read,mutes,searchContent:savedOnly},sources);
  allClusters=organizeEdition(groupArticles(filtered,prefs.group),{order:sortOrder,priority:cluster=>(cluster.articles.some(a=>mediaSettings.priorities[a.source])?1.3:1)*(prefs.nearby&&cluster.articles.some(a=>matchesTerritory(a,prefs.nearby))?1.4:1),sourceLimit:prefs.sourceLimit,topicLimit:prefs.topicLimit,categoryFor:article=>categoryOf(article,sourceFor(article))}).flatMap(day=>day.clusters);
  visibleClusters=allClusters.slice(0,limit);
  $('#news').className=`news ${prefs.view}`;$('#news').setAttribute('aria-busy','false');
  $('#section-title').textContent=savedOnly?'Leer después':filters.topicName||(filters.category==='Actualidad'?'Portada':filters.category);
  $('#story-count').textContent=`${allClusters.length} noticias`;
  $('#saved-count').textContent=saved.length||'';
  $('#saved-toggle').setAttribute('aria-pressed',savedOnly);
  $('#saved-toggle').setAttribute('aria-label',savedOnly?'Volver a portada':'Ver noticias para leer después');
  $('#news').innerHTML='';appendStories(visibleClusters);
  if(!allClusters.length)$('#news').innerHTML=`<div class="empty-state"><h3>${savedOnly?'No hay noticias guardadas.':!prefs.sources.length?'Selecciona algún medio.':'No hay resultados.'}</h3><p>${savedOnly?'Usa el marcador de una noticia para leerla después.':!prefs.sources.length?'Escoge los medios de tu portada.':'Prueba otra búsqueda o cambia los filtros.'}</p><button class="outline-button" ${!prefs.sources.length?'data-panel="sources"':'id="reset-empty"'}>${!prefs.sources.length?'Elegir medios':'Limpiar filtros'}</button></div>`;
  const last=data.generated?new Intl.DateTimeFormat('es',{hour:'2-digit',minute:'2-digit'}).format(new Date(data.generated)):'—';
  const available=Object.values(data.status).filter(s=>s.state==='ok').length;
  $('#update-status').textContent=liveProgress||`Actualizado ${last} · ${available}/${sources.length} medios · ${allClusters.length} noticias`;
  $('#mobile-menu-status').textContent=`${data.generated?`Actualizado ${dateLabel(data.generated)}`:'Sin edición'} · ${available}/${sources.length} medios · ${allClusters.length} noticias`;
  const stale=data.generated&&Date.now()-Date.parse(data.generated)>20*60000;
  $('#notice').hidden=!stale&&!serviceProblem&&navigator.onLine;
  if(!navigator.onLine)$('#notice').textContent='Sin conexión. Mostrando la última edición guardada.';
  else if(stale)$('#notice').textContent=liveBusy?'Comprobando los RSS para actualizar la edición…':`La última recogida correcta es del ${dateLabel(data.generated)}. ${serviceProblem||'Pulsa Actualizar portada para reintentar.'}`;
  else if(serviceProblem)$('#notice').textContent=serviceProblem;
  $('#update-status').title=`Edición del ${dateLabel(data.generated)}. ${sources.length-available} fuentes no disponibles; consulta Medios.`;
  activeFilters();renderTopics();
  if(panelName==='sources'&&$('#panel').open)mediaPanel.draw();
  if(limit<allClusters.length && $('#load-sentinel').getBoundingClientRect().top<innerHeight+800)setTimeout(loadMoreStories,80);
}
async function rssAPI(operation,url) {
  let response;
  try{response=await fetch(`${RSS_API}/${operation}?url=${encodeURIComponent(url||'')}`,{signal:AbortSignal.timeout(operation==='discover'?45000:20000),cache:'no-store',credentials:'omit'});}catch{throw new Error('No se ha podido conectar con el servicio RSS. Conservamos la última edición disponible.');}
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result)throw new Error(result?.error||'El servicio RSS no está disponible.');
  return result;
}
function currentArticles(id) {return data.articles.filter(a=>a.source===id&&(!a.published||Date.now()-Date.parse(a.published)<7*86400000));}
async function refreshSource(id) {
  const source=sources.find(s=>s.id===id);if(!source)return false;
  const checked=new Date().toISOString();
  try{
    const response=await rssAPI('feed',source.feed),previous=data.status[id],kept=currentArticles(id);
    if(kept.length&&keepNewerFeed(previous,{feed:source.feed,lastSuccess:response.fetchedAt},catalog.find(s=>s.id===id)?.feed)){
      // The shared edition can be newer than an edge cache. Do not roll it back.
      const health={...previous,feed:source.feed,checked,...(response.stale?{state:'stale',message:response.error||'El medio no ha respondido.'}:{})};
      data.status[id]=health;await saveSnapshot({id,feed:source.feed,articles:kept,health}).catch(()=>{});return health.state==='ok';
    }
    const articles=await parseFeed(response.xml,source);
    if(!articles.length)throw new Error('El RSS responde, pero no contiene publicaciones de los últimos siete días.');
    const health={state:response.stale?'stale':'ok',feed:source.feed,count:articles.length,checked,lastSuccess:response.fetchedAt,message:response.error||''};
    // Source might have been removed or repaired while the request was in flight.
    if(!sources.some(s=>s.id===id&&s.feed===source.feed))return false;
    data.articles=[...data.articles.filter(a=>a.source!==id),...articles];data.status[id]=health;
    const personal=mediaSettings.custom.find(s=>s.id===id);
    if(personal){const metadata=feedMetadata(response.xml,source.feed);if(metadata.language)personal.language=metadata.language;if(metadata.url)personal.url=metadata.url;writeStorage('extra-extra:media',mediaSettings);sources=mergeSources(catalog,mediaSettings);}
    await saveSnapshot({id,feed:source.feed,articles,health}).catch(()=>{});
    return !response.stale;
  }catch(error){const kept=currentArticles(id),previous=data.status[id];data.articles=[...data.articles.filter(a=>a.source!==id),...kept];data.status[id]={state:kept.length?'stale':'error',count:kept.length,checked,lastSuccess:previous?.lastSuccess,message:error.message};return false;}
}
function scheduleAutomatic(){
  clearTimeout(automaticTimer);if(document.hidden)return;
  automaticTimer=setTimeout(()=>{if(!document.hidden)loadNews();},Math.max(1000,AUTO_REFRESH-(Date.now()-lastLiveCheck)));
}
function queueLive(){clearTimeout(liveTimer);liveTimer=setTimeout(()=>liveRefresh(),500);}
async function liveRefresh(manual=false,ids=null) {
  if(liveBusy){pendingLive=true;return;}
  if(!navigator.onLine){render();if(manual)toast('Sin conexión. Mostrando la última edición guardada.');return;}
  const targets=(ids||prefs.sources||[]).filter(id=>sources.some(s=>s.id===id));
  if(!targets.length){lastLiveCheck=Date.now();render();scheduleAutomatic();return;}
  lastLiveCheck=Date.now();clearTimeout(automaticTimer);liveBusy=true;serviceProblem='';$('#refresh').disabled=true;let completed=0,success=0,index=0;
  const previousIDs=new Set(data.articles.map(a=>a.id));
  if(!data.generated||Date.now()-Date.parse(data.generated)>20*60000){$('#notice').hidden=false;$('#notice').textContent='Comprobando los RSS para actualizar la edición…';}
  const progress=()=>{liveProgress=`Actualizando medios ${completed}/${targets.length}…`;$('#update-status').textContent=liveProgress;$('#mobile-menu-status').textContent=liveProgress;};progress();
  try{
    const workers=Array.from({length:Math.min(5,targets.length)},async()=>{while(index<targets.length){const id=targets[index++];if(await refreshSource(id))success++;completed++;progress();}});
    await Promise.all(workers);
    if(success){
      // Never mark an all-failed collection as a new edition.
      const dates=targets.map(id=>data.status[id]).filter(h=>h?.state==='ok').map(h=>Date.parse(h.lastSuccess)).filter(Number.isFinite);
      if(dates.length)data.generated=new Date(Math.max(Date.parse(data.generated)||0,Math.min(...dates))).toISOString();
      await saveSnapshot({id:'@edition',generated:data.generated}).catch(()=>{});
    }else serviceProblem='No se han podido comprobar los RSS. Se conserva la última edición; consulta el estado de los medios.';
    const newCount=data.articles.filter(a=>!previousIDs.has(a.id)).length;
    if(manual)toast(success?`${success} medios comprobados. ${newCount?newCount+' noticias nuevas.':'Sin noticias nuevas.'}`:serviceProblem);
  }finally{liveBusy=false;liveProgress='';$('#refresh').disabled=false;render();if(panelName==='sources'&&$('#panel').open)mediaPanel.draw();scheduleAutomatic();if(pendingLive){pendingLive=false;queueLive();}}
}
async function loadNews(manual=false) {
  if(catalog.length){await liveRefresh(manual);return;}
  $('#refresh').disabled=true;
  try {
    const [catalogResponse,newsResponse]=await Promise.all([fetch(`data/sources.json?t=${Date.now()}`,{cache:'no-store'}),fetch(`data/news.json?t=${Date.now()}`,{cache:'no-store'})]);
    if(!catalogResponse.ok||!newsResponse.ok)throw new Error();
    catalog=await catalogResponse.json();data=await newsResponse.json();
    if(!Array.isArray(catalog)||!Array.isArray(data.articles))throw new Error();
    sources=mergeSources(catalog,mediaSettings);
    prefs.sources=prefs.sources===null?sources.map(s=>s.id):prefs.sources.filter(id=>sources.some(s=>s.id===id));
    const snapshots=await readSnapshots();
    for(const snapshot of snapshots){
      if(snapshot.id==='@edition'){if(Date.parse(snapshot.generated)>Date.parse(data.generated))data.generated=snapshot.generated;continue;}
      const source=sources.find(s=>s.id===snapshot.id&&s.feed===snapshot.feed);
      if(source&&Array.isArray(snapshot.articles)&&Date.parse(snapshot.health?.lastSuccess)>=(Date.parse(data.status[source.id]?.lastSuccess)||0)){
        data.articles=[...data.articles.filter(a=>a.source!==source.id),...snapshot.articles.filter(a=>!a.published||Date.now()-Date.parse(a.published)<7*86400000)];data.status[source.id]=snapshot.health;
      }
    }
    render();
    const stale=!data.generated||Date.now()-Date.parse(data.generated)>=AUTO_REFRESH;
    if(stale||mediaSettings.custom.length||Object.keys(mediaSettings.overrides).length||manual)await liveRefresh(manual);
    else lastLiveCheck=Date.parse(data.generated);
  }catch{
    $('#news').setAttribute('aria-busy','false');$('#notice').hidden=false;$('#notice').textContent='No se ha podido descargar la portada. Comprueba tu conexión y pulsa Actualizar portada para reintentar.';
    if(!data.articles.length)$('#news').innerHTML='<div class="empty-state"><h3>Edición no disponible.</h3><p>Vuelve a actualizar en unos instantes.</p></div>';
  }finally{$('#refresh').disabled=false;if(!lastLiveCheck)lastLiveCheck=Date.now();scheduleAutomatic();}
}
const mediaPanel=createMediaPanel({
  sources:()=>sources,data:()=>data,settings:()=>mediaSettings,selected:()=>prefs.sources||[],
  persist:()=>writeStorage('extra-extra:media',mediaSettings),replaceSettings:value=>mediaSettings=value,
  changed:()=>{sources=mergeSources(catalog,mediaSettings);persist();render();},
  select:ids=>{const newly=ids.filter(id=>!prefs.sources?.includes(id));prefs.sources=[...new Set(ids)];persist();limit=36;render();if(newly.length)queueLive();},
  removeSource:id=>{prefs.sources=prefs.sources.filter(s=>s!==id);data.articles=data.articles.filter(a=>a.source!==id);delete data.status[id];removeSnapshot(id);},
  refreshSource:async id=>{const result=await refreshSource(id);render();return result;},api:rssAPI,notify:toast,date:dateLabel,download,refresh:queueLive
});
function renderSourcesPanel(){mediaPanel.render();}
function openPanel(name) {
  closeMenu();
  panelName = name;
  const titles = {sources:'Medios',filters:'Filtros y presentación',appearance:'Lectura',about:'Acerca de Extra Extra',search:'Buscar noticias',install:'Instalar Extra Extra'};
  $('#panel-title').textContent = titles[name];
  if (name === 'sources') renderSourcesPanel();
  if (name === 'filters') renderFiltersPanel();
  if (name === 'appearance') renderAppearancePanel();
  if (name === 'about') renderAboutPanel();
  if (name === 'search') renderSearchPanel();
  if (name === 'install') $('#panel-content').innerHTML = '<p><b>Android:</b> abre esta web en Chrome y usa su menú → Instalar aplicación o Añadir a pantalla de inicio.</p><p><b>iPhone / iPad:</b> abre la web en Safari → Compartir → Añadir a pantalla de inicio. Mantén activado «Abrir como app» si aparece.</p><p class="small-note">La aplicación guarda la última edición consultada para poder leerla sin conexión. Las noticias nuevas y las fotografías requieren conexión.</p>';
  if (!$('#panel').open) $('#panel').showModal();
  if (name === 'search') $('#search').focus();
}
function renderSearchPanel() {
  $('#panel-content').innerHTML = `<label class="settings-field"><span>Buscar por titular, texto o medio${savedOnly?' (incluye el texto completo guardado)':''}</span><input id="search" class="source-search" type="search" placeholder="Buscar noticias…" aria-label="Buscar noticias" value="${esc(filters.query)}"></label><p class="small-note">Combina términos con «o», excluye con «sin» o «-», y usa comillas para frases. Ejemplo: energía o electricidad sin fútbol.</p><p id="search-results" class="small-note" role="status">${allClusters.length} resultados</p><div class="panel-actions"><button id="clear-search">Borrar búsqueda</button><button id="show-search-results">Ver resultados</button></div>`;
  $('#search').oninput = event => { clearTimeout(searchTimer);searchTimer=setTimeout(()=>{filters.query=event.target.value;limit=36;render();$('#search-results').textContent=`${allClusters.length} resultados`;},120); };
  $('#search').onkeydown = event => {if(event.key==='Enter'){clearTimeout(searchTimer);filters.query=event.target.value;limit=36;render();$('#panel').close();window.scrollTo({top:0});}};
  $('#clear-search').onclick=()=>{clearTimeout(searchTimer);filters.query='';$('#search').value='';render();$('#search-results').textContent=`${allClusters.length} resultados`;$('#search').focus();};
  $('#show-search-results').onclick=()=>{clearTimeout(searchTimer);filters.query=$('#search').value;limit=36;render();$('#panel').close();window.scrollTo({top:0});};
}
function renderFiltersPanel() {
  $('#panel-content').innerHTML = `<div class="settings-field"><label>Presentación</label><div class="choice-row">${[['mosaic','Mosaico'],['cards','Tarjetas'],['list','Lista']].map(([id,label])=>`<button data-view="${id}" aria-pressed="${prefs.view===id}">${icon(id==='mosaic'?'grid':id)}${label}</button>`).join('')}</div></div><div class="settings-field"><label for="sort">Ordenar noticias</label><select id="sort"><option value="relevance">Por relevancia</option><option value="newest">Más recientes</option><option value="coverage">Más cobertura</option></select></div><div class="settings-field"><label for="filter-period">Cuándo se publicaron</label><select id="filter-period"><option value="0">Toda la edición (hasta 7 días)</option><option value="6">Últimas 6 horas</option><option value="24">Últimas 24 horas</option><option value="72">Últimos 3 días</option></select></div><div class="settings-field"><label for="filter-language">Idioma original</label><select id="filter-language"><option value="">Todos los idiomas</option><option value="es">Español</option><option value="ca">Catalán</option><option value="gl">Gallego</option><option value="eu">Euskera</option><option value="pt">Portugués</option><option value="it">Italiano</option><option value="en">Inglés</option><option value="fr">Francés</option><option value="de">Alemán</option></select></div><label class="check-row"><input id="group" type="checkbox" ${prefs.group?'checked':''}> Agrupar coberturas similares</label><label class="check-row"><input id="filter-saved" type="checkbox" ${savedOnly?'checked':''}> Solo noticias para leer después</label><label class="check-row"><input id="filter-unread" type="checkbox" ${filters.unread?'checked':''}> Solo noticias sin leer</label><div class="panel-actions"><button id="filter-reset">Restablecer filtros</button><button id="apply-filters">Ver noticias</button></div>`;
  $('#sort').value=sortOrder;
  $('#group').onchange=event=>{prefs.group=event.target.checked;persist();limit=36;render();};
  $('#sort').onchange=event=>{sortOrder=event.target.value;limit=36;render();};
    $('#filter-saved').onchange=event=>{savedOnly=event.target.checked;limit=36;render();};
  $('#filter-period').value = filters.hours;
  $('#filter-language').value = filters.language;
  $('#filter-period').onchange = event => { filters.hours=Number(event.target.value);limit=36;render(); };
  $('#filter-language').onchange = event => { filters.language=event.target.value;limit=36;render(); };
  $('#filter-unread').onchange = event => { filters.unread=event.target.checked;limit=36;render(); };
  $('#filter-reset').onclick = () => { resetFilters(); renderFiltersPanel(); };
  $('#apply-filters').onclick=()=>{$('#panel').close();window.scrollTo({top:0});};
  renderPersonalTools();
  renderTerritoryTools();
}
function renderTerritoryTools() {
  const options=first=>`<option value="">${first}</option>`+territories.map(t=>`<option value="${t.id}">${t.parent?'↳ ':''}${esc(t.name)}</option>`).join('');
  $('#filter-language').closest('.settings-field').insertAdjacentHTML('afterend',`<label class="settings-field"><span>Territorio de la noticia</span><select id="filter-territory">${options('Todos los territorios')}</select></label><label class="settings-field"><span>Dar prioridad a noticias cercanas</span><select id="nearby-territory">${options('Sin zona preferida')}</select></label><p class="small-note">La zona se elige manualmente. El territorio se detecta por menciones en el titular y el extracto, sin usar el país del periódico. Puede haber errores. La cercanía influye en el orden por relevancia.</p>`);
  $('#filter-territory').value=filters.territory;$('#nearby-territory').value=prefs.nearby;
  $('#filter-territory').onchange=e=>{filters.territory=e.target.value;limit=36;render();};
  $('#nearby-territory').onchange=e=>{prefs.nearby=e.target.value;persist();limit=36;render();};
}
function renderPersonalTools() {
  $('#panel-content').querySelector('.settings-field').insertAdjacentHTML('afterend',`<label class="settings-field"><span>Densidad de las fichas</span><select id="density">${[['compact','Compacta'],['normal','Normal'],['comfortable','Amplia']].map(([value,label])=>`<option value="${value}" ${prefs.density===value?'selected':''}>${label}</option>`).join('')}</select></label>`);
  $('#density').onchange=event=>{prefs.density=event.target.value;persist();applyAppearance();layoutNews();};
  const choices=(value)=>[[0,'Sin límite'],[1,'1 consecutiva'],[2,'2 consecutivas'],[3,'3 consecutivas']].map(([number,label])=>`<option value="${number}" ${value===number?'selected':''}>${label}</option>`).join('');
  const container=document.createElement('div');container.className='personal-tools';
  container.innerHTML=`<details><summary>Portadas personales</summary><p class="small-note">Guarda medios, sección, búsqueda, idioma, período, orden y diversidad.</p><label class="settings-field"><span>Abrir portada guardada</span><select id="frontpage-select"><option value="">Portada actual</option>${frontpages.map(p=>`<option value="${esc(p.id)}" ${p.id===activeFrontpage?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><label class="settings-field"><span>Nombre de la portada</span><input id="frontpage-name" type="text" maxlength="60" placeholder="Por ejemplo, Ciencia" value="${esc(frontpages.find(p=>p.id===activeFrontpage)?.name||'')}"></label><div class="panel-actions"><button id="save-frontpage">Guardar portada actual</button><button id="remove-frontpage" ${activeFrontpage?'':'disabled'}>Eliminar portada</button></div></details><details><summary>Silenciar temas</summary><p class="small-note">Oculta noticias cuyo titular o extracto contenga estas palabras.</p><label class="settings-field"><span>Palabra o frase</span><input id="mute-text" type="text" maxlength="80" placeholder="Tema que quieres silenciar"></label><label class="settings-field"><span>Duración del silencio</span><select id="mute-duration"><option value="24">24 horas</option><option value="168">Una semana</option><option value="0">Hasta que lo quite</option></select></label><div class="panel-actions"><button id="add-mute">Silenciar</button></div><div class="mute-list">${activeMutes(mutes).map((mute,i)=>`<div class="mute-row"><span>${esc(mute.text)}<small>${mute.until?`Hasta ${dateLabel(mute.until)}`:'Sin fecha de fin'}</small></span><button data-remove-mute="${i}" aria-label="Dejar de silenciar ${esc(mute.text)}">Quitar</button></div>`).join('')||'<p class="small-note">No hay temas silenciados.</p>'}</div></details><details><summary>Diversidad de la portada</summary><p class="small-note">Alterna medios y temas cuando haya alternativas. No oculta noticias. Se aplica dentro de cada día.</p><label class="settings-field"><span>Noticias seguidas del mismo medio</span><select id="source-limit">${choices(prefs.sourceLimit)}</select></label><label class="settings-field"><span>Noticias seguidas de la misma sección</span><select id="topic-limit">${choices(prefs.topicLimit)}</select></label></details>`;
  $('#apply-filters').closest('.panel-actions').before(container);
  $('#frontpage-select').onchange=event=>{
    activeFrontpage=event.target.value;const page=frontpages.find(p=>p.id===activeFrontpage);if(!page)return;
    prefs.sources=page.sources.filter(id=>sources.some(s=>s.id===id));prefs.group=page.group;prefs.sourceLimit=page.sourceLimit;prefs.topicLimit=page.topicLimit;
    Object.assign(filters,page.filters,{topic:null,topicName:''});sortOrder=page.order;savedOnly=false;limit=36;persist();renderCategories();render();renderFiltersPanel();
  };
  $('#save-frontpage').onclick=()=>{
    const name=$('#frontpage-name').value.trim();if(!name){toast('Escribe un nombre para la portada.');return;}
    const existing=frontpages.find(p=>normalize(p.name)===normalize(name));
    if(!existing&&frontpages.length>=30){toast('Puedes guardar hasta 30 portadas.');return;}
    const entry={id:existing?.id||`page-${Date.now()}`,name,sources:[...(prefs.sources||[])],filters:{query:filters.query,category:filters.category,language:filters.language,territory:filters.territory,hours:filters.hours,unread:filters.unread},group:prefs.group,order:sortOrder,sourceLimit:prefs.sourceLimit,topicLimit:prefs.topicLimit};
    frontpages=frontpages.filter(p=>p.id!==entry.id);frontpages.push(entry);activeFrontpage=entry.id;writeStorage('extra-extra:frontpages',frontpages);renderFiltersPanel();toast('Portada guardada.');
  };
  $('#remove-frontpage').onclick=()=>{frontpages=frontpages.filter(p=>p.id!==activeFrontpage);activeFrontpage='';writeStorage('extra-extra:frontpages',frontpages);renderFiltersPanel();toast('Portada eliminada.');};
  $('#add-mute').onclick=()=>{
    const text=$('#mute-text').value.trim();if(text.length<2){toast('Escribe al menos dos caracteres.');return;}
    mutes=activeMutes(mutes).filter(m=>normalize(m.text)!==normalize(text));if(mutes.length>=40){toast('Puedes mantener hasta 40 silencios activos.');return;}
    const duration=Number($('#mute-duration').value);mutes.push({text,until:duration?Date.now()+duration*3600000:null});writeStorage('extra-extra:mutes',mutes);limit=36;render();renderFiltersPanel();toast('Tema silenciado.');
  };
  container.querySelectorAll('[data-remove-mute]').forEach(button=>button.onclick=()=>{mutes=activeMutes(mutes);mutes.splice(Number(button.dataset.removeMute),1);writeStorage('extra-extra:mutes',mutes);render();renderFiltersPanel();});
  for(const [id,key] of [['source-limit','sourceLimit'],['topic-limit','topicLimit']])$('#'+id).onchange=event=>{prefs[key]=Number(event.target.value);persist();limit=36;render();};
}
function renderAppearancePanel() {
  $('#panel-content').innerHTML = `<div class="settings-field"><label>Tema</label><div class="choice-row">${[['auto','Auto'],['morning','Mañana'],['afternoon','Tarde'],['night','Noche']].map(([id,label])=>`<button data-theme="${id}" aria-pressed="${prefs.theme===id}">${label}</button>`).join('')}</div><p>Auto: mañana de 7 a 17 h, tarde de 17 a 21 h y noche el resto.</p></div><div class="settings-field"><label for="font">Tipografía</label><select id="font">${Object.keys(fonts).map(font=>`<option ${prefs.font===font?'selected':''}>${font}</option>`).join('')}</select></div><div class="settings-field"><label for="font-size">Tamaño de lectura <span id="size-output">${prefs.size} px</span></label><input id="font-size" type="range" min="15" max="28" value="${prefs.size}"><p>Se aplica al texto del lector.</p></div><label class="check-row"><input id="show-images" type="checkbox" ${prefs.images?'checked':''}> Mostrar imágenes en la portada</label><div class="panel-actions"><button id="export-settings">Exportar preferencias y guardadas</button><button id="import-settings">Importar copia</button></div><input id="settings-file" type="file" accept=".json,application/json" hidden><p class="small-note">Tus medios, guardadas y lecturas se guardan en este navegador.</p>`;
  document.querySelectorAll('[data-theme]').forEach(button => { if (button.tagName === 'BUTTON') button.onclick = () => { prefs.theme=button.dataset.theme;persist();applyAppearance();renderAppearancePanel(); }; });
  $('#font').onchange = event => { prefs.font=event.target.value;persist();applyAppearance(); };
  $('#font-size').oninput = event => { prefs.size=Number(event.target.value);$('#size-output').textContent=`${prefs.size} px`;persist();applyAppearance(); };
  $('#show-images').onchange = event => { prefs.images=event.target.checked;persist();applyAppearance();render(); };
  $('#export-settings').onclick = () => download('extra-extra-copia.json',JSON.stringify({version:1,preferences:prefs,saved,read,frontpages,mutes,media:mediaSettings},null,2),'application/json');
  $('#import-settings').onclick = () => $('#settings-file').click();
  $('#settings-file').onchange = importSettings;
  const ranges=[['line-height','Interlineado','lineHeight',1.3,2.4,.1,''],['reader-width','Ancho del texto','readerWidth',440,960,20,' px'],['reader-margin','Márgenes del lector','readerMargin',12,64,2,' px'],['paragraph-gap','Separación entre párrafos','paragraphGap',.4,2,.1,' em']];
  $('#show-images').closest('label').insertAdjacentHTML('beforebegin',`<details class="reading-options"><summary>Distribución del texto</summary>${ranges.map(([id,label,key,min,max,step,suffix])=>`<div class="settings-field"><label for="${id}">${label} <output id="${id}-output">${prefs[key]}${suffix}</output></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${prefs[key]}"></div>`).join('')}</details><details class="reading-options"><summary>Accesibilidad</summary><label class="check-row"><input id="high-contrast" type="checkbox" ${prefs.highContrast?'checked':''}> Alto contraste</label><label class="check-row"><input id="large-controls" type="checkbox" ${prefs.largeControls?'checked':''}> Controles de mayor tamaño</label><label class="check-row"><input id="reduce-motion" type="checkbox" ${prefs.reduceMotion?'checked':''}> Reducir animaciones</label></details>`);
  for(const [id,,key,,, ,suffix] of ranges)$('#'+id).oninput=event=>{prefs[key]=Number(event.target.value);$('#'+id+'-output').textContent=prefs[key]+suffix;persist();applyAppearance();};
  for(const [id,key] of [['high-contrast','highContrast'],['large-controls','largeControls'],['reduce-motion','reduceMotion']])$('#'+id).onchange=event=>{prefs[key]=event.target.checked;persist();applyAppearance();layoutNews();};
}
function renderAboutPanel() {
  $('#panel-content').innerHTML = `<div class="about-hero"><img src="favicon.png" alt="Un joven con boina alza un periódico"><p>Extra Extra</p></div><div class="about-copy"><p>Antes alguien recorría las calles con un periódico en alto y un «¡Extra, extra!». Hoy las noticias llegan desde todas partes. Este proyecto quiere devolverles un lugar sencillo y tranquilo.</p><p>Un pequeño homenaje a los lectores RSS y a Google Currents: eliges tus medios, reúnes sus noticias y lees a tu ritmo. Sin una cuenta, sin una portada impuesta.</p><p>Extra Extra es gratuito y de código abierto. Las noticias y fotografías pertenecen a sus respectivos autores. Mostramos lo que el medio distribuye en su RSS: a veces un extracto, a veces más texto. Siempre encontrarás el enlace a la publicación original. El proyecto no elimina muros de pago ni garantiza acceso gratuito a todos los artículos.</p><p>La recogida en GitHub está programada cada 10 minutos, aunque sus ejecuciones pueden retrasarse. Al abrir la web y mientras la lees, un servicio de apoyo comprueba los RSS cada 10 minutos. Si una fuente falla, se conserva su última edición y se indica en Medios. Solo se consulta el contenido público distribuido en RSS.</p></div><div class="install-control"><button id="install-app" class="outline-button">Instalar en el móvil</button></div><div class="about-links"><a href="https://github.com/AlejandroPico/Xtraxtra" target="_blank" rel="noopener noreferrer">Código de Extra Extra <span>↗</span></a><a href="https://alejandropico.github.io/Portfolio/" target="_blank" rel="noopener noreferrer">Portfolio de Alejandro Pico <span>↗</span></a></div>`;
}
function download(name, contents, mime) {
  const url=URL.createObjectURL(new Blob([contents],{type:mime}));
  const a=document.createElement('a'); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importSettings(event) {
  const file=event.target.files[0];if(!file)return;
  try {
    if(file.size>8000000)throw new Error();
    const backup=JSON.parse(await file.text());
    if(backup.version!==1 || !backup.preferences || !Array.isArray(backup.saved))throw new Error();
    const p=backup.preferences;
    if(backup.media){const imported=sourceSettings(backup.media);mediaSettings=sourceSettings({custom:[...mediaSettings.custom,...imported.custom],folders:[...mediaSettings.folders,...imported.folders],assignments:{...mediaSettings.assignments,...imported.assignments},priorities:{...mediaSettings.priorities,...imported.priorities},overrides:{...mediaSettings.overrides,...imported.overrides}});sources=mergeSources(catalog,mediaSettings);writeStorage('extra-extra:media',mediaSettings);}
    if(territories.some(t=>t.id===p.nearby)||p.nearby==='')prefs.nearby=p.nearby;
    Object.assign(prefs,readingPreferences({...prefs,...p}));
    if(Array.isArray(backup.frontpages))frontpages=sanitizeFrontpages([...frontpages,...backup.frontpages]);
    if(Array.isArray(backup.mutes))mutes=[...new Map(activeMutes([...mutes,...backup.mutes]).map(m=>[normalize(m.text),m])).values()].slice(-40);
    writeStorage('extra-extra:frontpages',frontpages);writeStorage('extra-extra:mutes',mutes);
    if(['auto','morning','afternoon','night'].includes(p.theme))prefs.theme=p.theme;
    if(['mosaic','cards','list'].includes(p.view))prefs.view=p.view;
    if(fonts[p.font])prefs.font=p.font;
    if(Number.isFinite(p.size))prefs.size=Math.max(15,Math.min(28,p.size));
    if(Array.isArray(p.sources))prefs.sources=p.sources.filter(id=>sources.some(s=>s.id===id));
    for(const key of ['images','group'])if(typeof p[key]==='boolean')prefs[key]=p[key];
    const valid=backup.saved.filter(a=>a && typeof a.id==='string' && typeof a.title==='string' && typeof a.source==='string' && typeof a.summary==='string' && safeURL(a.url)).map(a=>({...a,content:typeof a.content==='string'?a.content:'',language:languages[a.language]?a.language:'es',published:Number.isFinite(Date.parse(a.published))?a.published:null,image:safeURL(a.image),categories:Array.isArray(a.categories)?a.categories:[]}));
    saved=[...new Map([...saved,...valid].map(a=>[a.id,a])).values()];
    if(Array.isArray(backup.read))read=[...new Set([...read,...backup.read.filter(id=>typeof id==='string')])].slice(-5000);
    persist();writeStorage('extra-extra:saved',saved);writeStorage('extra-extra:read',read);applyAppearance();render();renderAppearancePanel();toast('Copia importada. Tu quiosco ya está preparado.');
  }catch{toast('No se ha podido importar esta copia de Extra Extra.');}
}
function openReader(id, cluster = null) {
  const found=cluster || allClusters.find(c=>c.articles.some(a=>a.id===id));
  const article=found?.articles.find(a=>a.id===id) || saved.find(a=>a.id===id);
  if(!article)return;
  currentArticle=article;currentCluster=found || {articles:[article]};
  if(!read.includes(id)){read.push(id);read=read.slice(-5000);writeStorage('extra-extra:read',read);}
  drawReader();
  if(!$('#reader').open)$('#reader').showModal();
  $('#reader').scrollTop=0;
  // Keep the visible card in place until closing the reader, especially in unread mode.
}
function drawReader(translated = null) {
  const a=currentArticle,s=sourceFor(a),cluster=currentCluster;
  const text=translated?.text || a.content || a.summary;
  const image=safeURL(a.image);
  const estimate=readingEstimate(a);
  const readingTime=estimate?` · ≈${estimate.minutes} min de lectura${estimate.excerpt?' del extracto':''}`:'';
  const translateURL=`https://translate.google.com/translate?sl=auto&tl=es&u=${encodeURIComponent(a.url)}`;
  $('#reader-content').innerHTML=`<div class="reader-meta">${esc(s.name)} · ${esc(dateLabel(a.published))} · ${esc(a.language.toUpperCase())}${readingTime}</div><h1 lang="${translated?'es':esc(a.language)}">${esc(translated?.title||a.title)}</h1>${image&&prefs.images?`<img class="reader-image" src="${esc(image)}" alt="" referrerpolicy="no-referrer">`:''}<p class="reader-excerpt">${a.content?'Texto distribuido por el medio en su RSS. Puede no incluir el artículo completo.':'Extracto distribuido por el medio. Continúa en la publicación original para leer el artículo.'}${translated?' Traducción automática al español.':''}</p><div class="reader-text" lang="${translated?'es':esc(a.language)}">${String(text||'Este medio solo ha compartido el titular.').split(/\n+/).filter(Boolean).map(p=>`<p>${esc(p)}</p>`).join('')}</div><div class="reader-links"><a class="primary-link" href="${esc(safeURL(a.url))}" target="_blank" rel="noopener noreferrer">Leer en ${esc(s.name)} ${icon('arrow')}</a>${a.language!=='es'?`<button id="translate-local" class="outline-button">${translated?'Ver original':'Traducir al español'}</button><a href="${esc(translateURL)}" target="_blank" rel="noopener noreferrer" class="text-button">Abrir traducción web ↗</a>`:''}</div><p id="translation-status" class="small-note" role="status">${a.language!=='es'?'La traducción local depende del navegador. La alternativa web abre Google Translate y comparte con él la URL del artículo. Los límites de acceso del medio pueden seguir aplicándose.':''}</p>${cluster.articles.length>1?`<section class="coverage-list"><h2>Coberturas de la noticia</h2><p class="small-note">Agrupación automática por similitud de titulares. Puedes desactivarla en Filtros.</p>${cluster.articles.map(other=>`<button data-coverage-id="${esc(other.id)}"><small>${esc(sourceFor(other).name)} · ${relativeTime(other.published)}</small><span>${esc(other.title)}</span></button>`).join('')}</section>`:''}`;
  $('#reader-content').querySelector('img')?.addEventListener('error',event=>event.target.remove(),{once:true});
  $('#reader-content').querySelectorAll('[data-coverage-id]').forEach(button=>button.onclick=()=>openReader(button.dataset.coverageId,cluster));
  if($('#translate-local'))$('#translate-local').onclick=()=>translated?drawReader():translateArticle();
  updateReaderSave();
}
async function translateArticle() {
  const article=currentArticle;
  if(!('Translator' in window)){$('#translation-status').textContent='Este navegador no ofrece traducción local. Puedes usar «Abrir traducción web» o la función de traducir de tu navegador.';return;}
  const button=$('#translate-local');button.disabled=true;
  $('#translation-status').textContent='Preparando traducción en tu dispositivo. Puede ser necesario descargar el modelo de idioma…';
  let translator;
  try {
    // create() is invoked within the click activation; some browsers require it.
    translator=await window.Translator.create({sourceLanguage:article.language,targetLanguage:'es'});
    const [title,text]=await Promise.all([translator.translate(article.title),translator.translate(article.content||article.summary)]);
    if(currentArticle.id===article.id)drawReader({title,text});
  }catch{if(currentArticle.id===article.id)$('#translation-status').textContent='La traducción local no está disponible para este idioma o dispositivo. Prueba la traducción web.';}
  finally{translator?.destroy();if(button.isConnected)button.disabled=false;}
}

initInterface({openPanel,refresh:()=>loadNews(true),loadMore:loadMoreStories});
hydrateIcons();applyAppearance();renderCategories();
$('#edition-date').textContent=new Intl.DateTimeFormat('es',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
document.addEventListener('click',event=>{
  const panel=event.target.closest('[data-panel]');if(panel){openPanel(panel.dataset.panel);return;}
  const category=event.target.closest('[data-category]');if(category){activeFrontpage='';filters.category=category.dataset.category;filters.topic=null;filters.topicName='';limit=36;renderCategories();render();return;}
  const view=event.target.closest('[data-view]');if(view){prefs.view=view.dataset.view;persist();applyAppearance();render();return;}
  const open=event.target.closest('[data-open]');if(open){openReader(open.dataset.open);return;}
  const save=event.target.closest('[data-save]');if(save){const a=data.articles.find(a=>a.id===save.dataset.save)||saved.find(a=>a.id===save.dataset.save);if(a)saveArticle(a);return;}
  if(event.target.closest('#clear-filters,#reset-empty')){resetFilters();if(!prefs.sources.length){prefs.sources=sources.map(s=>s.id);persist();render();}}
});
document.addEventListener('change',event=>{if(event.target.matches('#sort,#group,#filter-saved,#filter-period,#filter-language,#filter-unread,#filter-territory,#nearby-territory,#source-limit,#topic-limit,[data-source]')){activeFrontpage='';if($('#frontpage-select'))$('#frontpage-select').value='';}});
document.addEventListener('input',event=>{if(event.target.id==='search')activeFrontpage='';});
$('#close-panel').onclick=()=>$('#panel').close();
$('#close-reader').onclick=()=>$('#reader').close();
$('#reader').addEventListener('close',()=>render());
for(const dialog of [$('#panel'),$('#reader')])dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
$('#reader-save').onclick=()=>currentArticle&&saveArticle(currentArticle);
$('#reader-pending').onclick=()=>{if(!currentArticle)return;read=read.filter(id=>id!==currentArticle.id);if(!isSaved(currentArticle))saved.unshift({...currentArticle,sourceName:sourceFor(currentArticle).name});writeStorage('extra-extra:read',read);writeStorage('extra-extra:saved',saved);updateReaderSave();render();toast('Marcada como pendiente en Leer después.');};
$('#saved-toggle').onclick=()=>{closeMenu();savedOnly=!savedOnly;resetFilters();window.scrollTo({top:0});};

$('#refresh').onclick=()=>loadNews(true);
document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!$('dialog[open]')){event.preventDefault();openPanel('search');}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){applyAppearance();if(!liveBusy&&Date.now()-lastLiveCheck>=AUTO_REFRESH)loadNews();else if(!liveBusy)scheduleAutomatic();}});

setInterval(()=>{applyAppearance();const today=calendarKey(new Date()),active=activeMutes(mutes);if(active.length!==mutes.length||today!==lastCalendarDay){mutes=active;lastCalendarDay=today;writeStorage('extra-extra:mutes',mutes);render();}},60000);
loadNews();
