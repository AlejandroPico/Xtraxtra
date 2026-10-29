import { categories, normalize, categoryOf, groupArticles, score, relatedTopics, filterArticles, safeURL, escapeHTML as esc } from './lib/news.js';
import { initInterface, closeMenu, layoutNews } from './ui.js';

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
  theme:['auto','morning','afternoon','night'].includes(initial.theme) ? initial.theme : 'auto',
  view:['mosaic','cards','list'].includes(initial.view) ? initial.view : 'mosaic',
  font:fonts[initial.font] ? initial.font : 'Georgia', size:Math.min(28,Math.max(15,Number(initial.size) || 19)),
  images:initial.images !== false, group:initial.group !== false,
  sources:Array.isArray(initial.sources) ? initial.sources.filter(s => typeof s === 'string') : null,
};
let sources = [], data = { articles:[], status:{} }, visibleClusters = [], allClusters = [], limit = 36;
let read = readStorage('extra-extra:read', []); if (!Array.isArray(read)) read = [];
let saved = readStorage('extra-extra:saved', []); if (!Array.isArray(saved)) saved = [];
saved = saved.filter(item => item && typeof item.id === 'string' && typeof item.title === 'string' && safeURL(item.url));
const filters = { query:'', category:'Actualidad', language:'', hours:0, unread:false, topic:null, topicName:'' };
let savedOnly = false, panelName = '', currentArticle = null, currentCluster = null, toastTimer, searchTimer, sortOrder = 'relevance';

function persist() { writeStorage('extra-extra:preferences', prefs); }
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 4200); }
function applyAppearance() {
  const hour = new Date().getHours();
  const theme = prefs.theme === 'auto' ? (hour >= 7 && hour < 17 ? 'morning' : hour >= 17 && hour < 21 ? 'afternoon' : 'night') : prefs.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--reader-font', fonts[prefs.font]);
  document.documentElement.style.setProperty('--heading-font', fonts[prefs.font]);
  document.documentElement.style.setProperty('--reading-size', `${prefs.size}px`);
  document.body.classList.toggle('hide-images', !prefs.images);
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
}
function renderCategories() {
  $('#categories').innerHTML = categories.map((category,i) => `<button data-category="${esc(category)}" aria-pressed="${filters.category === category}">${i === 0 ? 'Portada' : esc(category)}</button>`).join('');
}
function resetFilters() {
  Object.assign(filters, {query:'', category:'Actualidad', language:'', hours:0, unread:false, topic:null, topicName:''});
  if ($('#search')) $('#search').value = ''; limit = 36; renderCategories(); render();
}
function activeFilters() {
  const labels = [filters.query && `«${filters.query}»`, filters.language && `Idioma: ${filters.language.toUpperCase()}`, filters.hours && `Últimas ${filters.hours} h`, filters.unread && 'Sin leer', filters.topicName, prefs.sources?.length !== sources.length && `${prefs.sources?.length || 0} medios`].filter(Boolean);
  const container = $('#active-filters');
  container.hidden = !labels.length;
  container.innerHTML = labels.map(label => `<span class="chip">${esc(label)}</span>`).join('') + (labels.length ? '<button id="clear-filters">Limpiar filtros</button>' : '');
  $('#filter-dot').hidden = !labels.length;
}
function renderTopics() {
  const topics = relatedTopics(data.articles.filter(a => prefs.sources?.includes(a.source)));
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
function render() {
  if (!prefs.sources) return;
  const base = savedOnly ? saved : data.articles;
  const filtered = filterArticles(base, {...filters, sources:savedOnly ? [...new Set([...prefs.sources,...saved.map(a=>a.source)])] : prefs.sources, read}, sources);
  allClusters = groupArticles(filtered, prefs.group);
  const sort = sortOrder;
  allClusters.sort((a,b) => sort === 'newest' ? (Date.parse(b.articles[0].published)||0) - (Date.parse(a.articles[0].published)||0) : sort === 'coverage' ? new Set(b.articles.map(a=>a.source)).size - new Set(a.articles.map(a=>a.source)).size || score(b)-score(a) : score(b)-score(a));
  visibleClusters = allClusters.slice(0, limit);
  $('#news').className = `news ${prefs.view}`;
  $('#news').setAttribute('aria-busy','false');
  $('#section-title').textContent = savedOnly ? 'Leer después' : filters.topicName || (filters.category === 'Actualidad' ? 'Portada' : filters.category);
  $('#story-count').textContent = `${allClusters.length} ${allClusters.length === 1 ? 'historia' : 'historias'}`;
  $('#saved-count').textContent = saved.length || '';
  $('#saved-toggle').setAttribute('aria-pressed', savedOnly);
  $('#saved-toggle').setAttribute('aria-label', savedOnly ? 'Volver a portada' : 'Ver noticias para leer después');
  $('#news').innerHTML = visibleClusters.map(storyHTML).join('') || `<div class="empty-state"><h3>${savedOnly ? 'No hay noticias guardadas.' : !prefs.sources.length ? 'Selecciona algún medio.' : 'No hay resultados.'}</h3><p>${savedOnly ? 'Usa el marcador de una noticia para leerla después.' : !prefs.sources.length ? 'Escoge los medios de tu portada.' : 'Prueba otra búsqueda o cambia los filtros.'}</p><button class="outline-button" ${!prefs.sources.length ? 'data-panel="sources"' : 'id="reset-empty"'}>${!prefs.sources.length ? 'Elegir medios' : 'Limpiar filtros'}</button></div>`;
  $('#news').querySelectorAll('img').forEach(img => img.addEventListener('error', () => { const media = img.closest('.story-media');media.classList.add('no-image');img.closest('.story-photo').remove(); }, {once:true}));
  $('#load-more').hidden = allClusters.length <= limit;
  $('#end-note').textContent = allClusters.length ? `${Math.min(limit,allClusters.length)} de ${allClusters.length} historias` : '';
  const last = data.generated ? new Intl.DateTimeFormat('es',{hour:'2-digit',minute:'2-digit'}).format(new Date(data.generated)) : '—';
  const available = Object.values(data.status).filter(s=>s.state==='ok').length;
  $('#update-status').textContent = `Actualizado ${last} · ${available}/${sources.length} medios`;
  $('#mobile-menu-status').textContent = `${data.generated ? `Actualizado ${dateLabel(data.generated)}` : 'Sin edición'} · ${available}/${sources.length} medios`;
  const stale = data.generated && Date.now() - Date.parse(data.generated) > 60 * 60000;
  const failed = sources.length - available;
  $('#notice').hidden = !stale && navigator.onLine;
  if (!navigator.onLine) $('#notice').textContent = 'Sin conexión. Mostrando la última edición guardada.';
  else if (stale) $('#notice').textContent = `La última edición es del ${dateLabel(data.generated)}. La recogida puede estar retrasada.`;
  $('#update-status').title = `Edición del ${dateLabel(data.generated)}. ${failed} fuentes no disponibles; consulta Medios.`;
  activeFilters(); renderTopics(); layoutNews();
}
async function loadNews(manual = false) {
  const refresh = $('#refresh'); refresh.disabled = true;
  try {
    const [catalogResponse, newsResponse] = await Promise.all([fetch(`data/sources.json?t=${Date.now()}`,{cache:'no-store'}),fetch(`data/news.json?t=${Date.now()}`,{cache:'no-store'})]);
    if (!catalogResponse.ok || !newsResponse.ok) throw new Error('No se pudo descargar la edición.');
    const catalog = await catalogResponse.json(), edition = await newsResponse.json();
    if (!Array.isArray(catalog) || !Array.isArray(edition.articles)) throw new Error('La edición no tiene el formato esperado.');
    const previous = data.generated;
    sources = catalog; data = edition;
    prefs.sources = prefs.sources === null ? sources.map(s=>s.id) : prefs.sources.filter(id=>sources.some(s=>s.id===id));
    render();
    if (manual) toast(!navigator.onLine ? 'Sin conexión. Mostrando la última edición guardada.' : previous === data.generated ? 'No hay una edición más reciente.' : 'Portada actualizada.');
  } catch(error) {
    $('#news').setAttribute('aria-busy','false');
    $('#notice').hidden = false;
    $('#notice').textContent = 'No se ha podido descargar la portada. Comprueba tu conexión y pulsa Actualizar portada para reintentar.';
    if (!data.articles.length) {
      $('#news').innerHTML = '<div class="empty-state"><h3>Edición no disponible.</h3><p>La edición no está disponible. Vuelve a actualizar en unos instantes.</p></div>';
      $('#update-status').textContent = 'Sin conexión con la edición';
    }
  } finally { refresh.disabled = false; }
}
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
  $('#panel-content').innerHTML = `<label class="settings-field"><span>Buscar por titular, texto o medio</span><input id="search" class="source-search" type="search" placeholder="Buscar noticias…" aria-label="Buscar noticias" value="${esc(filters.query)}"></label><p id="search-results" class="small-note" role="status">${allClusters.length} resultados</p><div class="panel-actions"><button id="clear-search">Borrar búsqueda</button><button id="show-search-results">Ver resultados</button></div>`;
  $('#search').oninput = event => { clearTimeout(searchTimer);searchTimer=setTimeout(()=>{filters.query=event.target.value;limit=36;render();$('#search-results').textContent=`${allClusters.length} resultados`;},120); };
  $('#search').onkeydown = event => {if(event.key==='Enter'){clearTimeout(searchTimer);filters.query=event.target.value;limit=36;render();$('#panel').close();window.scrollTo({top:0});}};
  $('#clear-search').onclick=()=>{clearTimeout(searchTimer);filters.query='';$('#search').value='';render();$('#search-results').textContent=`${allClusters.length} resultados`;$('#search').focus();};
  $('#show-search-results').onclick=()=>{clearTimeout(searchTimer);filters.query=$('#search').value;limit=36;render();$('#panel').close();window.scrollTo({top:0});};
}
function renderSourcesPanel() {
  $('#panel-content').innerHTML = `<p>Selecciona los medios que quieres ver.</p><input id="source-search" class="source-search" type="search" placeholder="Buscar medio o país…" aria-label="Buscar medios"><div class="panel-actions"><button id="select-all">Seleccionar todos</button><button id="select-none">Ninguno</button><button id="select-es">En español</button></div><div id="source-list"></div><details><summary>Añadir medios e importar suscripciones</summary><p>Puedes importar una lista OPML de tu antiguo lector. Se seleccionarán los feeds que coincidan con el catálogo. Para incorporar otro medio a la recogida gratuita, añade su RSS a <a href="https://github.com/AlejandroPico/Xtraxtra/edit/main/data/sources.json" target="_blank" rel="noopener noreferrer">sources.json en el repositorio ↗</a>. La siguiente edición lo recogerá para todos.</p><div class="panel-actions"><button id="import-opml">Importar OPML</button><button id="export-opml">Exportar mis medios</button></div><input type="file" id="opml-file" accept=".opml,.xml,text/xml" hidden><p id="opml-result" role="status" class="small-note"></p></details><p class="small-note">«No disponible» indica que el feed falla o no ofrece noticias recientes. Las selecciones se guardan solo en este navegador.</p>`;
  drawSourceList();
  $('#source-search').addEventListener('input', drawSourceList);
  $('#select-all').onclick = () => setSources(sources.map(s=>s.id));
  $('#select-none').onclick = () => setSources([]);
  $('#select-es').onclick = () => setSources(sources.filter(s=>s.language==='es').map(s=>s.id));
  $('#export-opml').onclick = exportOPML;
  $('#import-opml').onclick = () => $('#opml-file').click();
  $('#opml-file').onchange = importOPML;
}
function setSources(ids) { prefs.sources = ids; persist(); render(); drawSourceList(); }
function drawSourceList() {
  const search = normalize($('#source-search')?.value || '');
  $('#source-list').innerHTML = sources.filter(source=>normalize(source.name+' '+source.region).includes(search)).map(source => {
    const health = data.status[source.id];
    const state = health?.state || 'error';
    return `<div class="source-row"><label><input type="checkbox" data-source="${esc(source.id)}" ${prefs.sources?.includes(source.id)?'checked':''}><span class="source-info"><span>${esc(source.name)}</span><small>${esc(source.region)} · ${esc(source.language.toUpperCase())} · ${esc(source.category)}</small></span></label><span class="health ${state}" title="${esc(health?.lastSuccess ? `Última recogida correcta: ${dateLabel(health.lastSuccess)}` : 'El RSS no ha respondido correctamente')}">${state==='ok' ? `${health.count} noticias` : state==='stale' ? 'Edición anterior' : 'No disponible'}</span><a href="${esc(safeURL(source.url))}" target="_blank" rel="noopener noreferrer" aria-label="Visitar ${esc(source.name)}">↗</a></div>`;
  }).join('') || '<p class="small-note">No hay medios con ese nombre.</p>';
  $('#source-list').querySelectorAll('[data-source]').forEach(input => input.onchange = () => {
    prefs.sources = input.checked ? [...new Set([...prefs.sources,input.dataset.source])] : prefs.sources.filter(id=>id!==input.dataset.source);
    persist(); limit=36; render();
  });
}
function renderFiltersPanel() {
  $('#panel-content').innerHTML = `<div class="settings-field"><label>Presentación</label><div class="choice-row">${[['mosaic','Mosaico'],['cards','Tarjetas'],['list','Lista']].map(([id,label])=>`<button data-view="${id}" aria-pressed="${prefs.view===id}">${icon(id==='mosaic'?'grid':id)}${label}</button>`).join('')}</div></div><div class="settings-field"><label for="sort">Ordenar noticias</label><select id="sort"><option value="relevance">Por relevancia</option><option value="newest">Más recientes</option><option value="coverage">Más cobertura</option></select></div><div class="settings-field"><label for="filter-period">Cuándo se publicaron</label><select id="filter-period"><option value="0">Toda la edición (hasta 7 días)</option><option value="6">Últimas 6 horas</option><option value="24">Últimas 24 horas</option><option value="72">Últimos 3 días</option></select></div><div class="settings-field"><label for="filter-language">Idioma original</label><select id="filter-language"><option value="">Todos los idiomas</option><option value="es">Español</option><option value="en">Inglés</option><option value="fr">Francés</option><option value="de">Alemán</option></select></div><label class="check-row"><input id="group" type="checkbox" ${prefs.group?'checked':''}> Agrupar coberturas similares</label><label class="check-row"><input id="filter-saved" type="checkbox" ${savedOnly?'checked':''}> Solo noticias para leer después</label><label class="check-row"><input id="filter-unread" type="checkbox" ${filters.unread?'checked':''}> Solo noticias sin leer</label><div class="panel-actions"><button id="filter-reset">Restablecer filtros</button><button id="apply-filters">Ver noticias</button></div>`;
  $('#sort').value=sortOrder;
  $('#sort').onchange=event=>{sortOrder=event.target.value;limit=36;render();};
    $('#filter-saved').onchange=event=>{savedOnly=event.target.checked;limit=36;render();};
  $('#filter-period').value = filters.hours;
  $('#filter-language').value = filters.language;
  $('#filter-period').onchange = event => { filters.hours=Number(event.target.value);limit=36;render(); };
  $('#filter-language').onchange = event => { filters.language=event.target.value;limit=36;render(); };
  $('#filter-unread').onchange = event => { filters.unread=event.target.checked;limit=36;render(); };
  $('#filter-reset').onclick = () => { resetFilters(); renderFiltersPanel(); };
  $('#apply-filters').onclick=()=>{$('#panel').close();window.scrollTo({top:0});};
}
function renderAppearancePanel() {
  $('#panel-content').innerHTML = `<div class="settings-field"><label>Tema</label><div class="choice-row">${[['auto','Auto'],['morning','Mañana'],['afternoon','Tarde'],['night','Noche']].map(([id,label])=>`<button data-theme="${id}" aria-pressed="${prefs.theme===id}">${label}</button>`).join('')}</div><p>Auto: mañana de 7 a 17 h, tarde de 17 a 21 h y noche el resto.</p></div><div class="settings-field"><label for="font">Tipografía</label><select id="font">${Object.keys(fonts).map(font=>`<option ${prefs.font===font?'selected':''}>${font}</option>`).join('')}</select></div><div class="settings-field"><label for="font-size">Tamaño de lectura <span id="size-output">${prefs.size} px</span></label><input id="font-size" type="range" min="15" max="28" value="${prefs.size}"><p>Se aplica al texto del lector.</p></div><label class="check-row"><input id="show-images" type="checkbox" ${prefs.images?'checked':''}> Mostrar imágenes en la portada</label><div class="panel-actions"><button id="export-settings">Exportar preferencias y guardadas</button><button id="import-settings">Importar copia</button></div><input id="settings-file" type="file" accept=".json,application/json" hidden><p class="small-note">Tus medios, guardadas y lecturas se guardan en este navegador.</p>`;
  document.querySelectorAll('[data-theme]').forEach(button => { if (button.tagName === 'BUTTON') button.onclick = () => { prefs.theme=button.dataset.theme;persist();applyAppearance();renderAppearancePanel(); }; });
  $('#font').onchange = event => { prefs.font=event.target.value;persist();applyAppearance(); };
  $('#font-size').oninput = event => { prefs.size=Number(event.target.value);$('#size-output').textContent=`${prefs.size} px`;persist();applyAppearance(); };
  $('#show-images').onchange = event => { prefs.images=event.target.checked;persist();applyAppearance();render(); };
  $('#export-settings').onclick = () => download('extra-extra-copia.json',JSON.stringify({version:1,preferences:prefs,saved,read},null,2),'application/json');
  $('#import-settings').onclick = () => $('#settings-file').click();
  $('#settings-file').onchange = importSettings;
}
function renderAboutPanel() {
  $('#panel-content').innerHTML = `<div class="about-hero"><img src="favicon.svg" alt="Un joven con boina alza un periódico"><p>Extra Extra</p></div><div class="about-copy"><p>Antes alguien recorría las calles con un periódico en alto y un «¡Extra, extra!». Hoy las noticias llegan desde todas partes. Este proyecto quiere devolverles un lugar sencillo y tranquilo.</p><p>Un pequeño homenaje a los lectores RSS y a Google Currents: eliges tus medios, reúnes sus noticias y lees a tu ritmo. Sin una cuenta, sin una portada impuesta.</p><p>Extra Extra es gratuito y de código abierto. Las noticias y fotografías pertenecen a sus respectivos autores. Mostramos lo que el medio distribuye en su RSS: a veces un extracto, a veces más texto. Siempre encontrarás el enlace a la publicación original. El proyecto no elimina muros de pago ni garantiza acceso gratuito a todos los artículos.</p><p>Las ediciones se recogen aproximadamente cada 20 minutos mediante GitHub Actions. Los horarios pueden retrasarse. La fecha de edición y el estado de cada fuente están a la vista.</p></div><div class="about-links"><a href="https://github.com/AlejandroPico/Xtraxtra" target="_blank" rel="noopener noreferrer">Código de Extra Extra <span>↗</span></a><a href="https://alejandropico.github.io/Portfolio/" target="_blank" rel="noopener noreferrer">Portfolio de Alejandro Pico <span>↗</span></a><a href="https://github.com/AlejandroPico" target="_blank" rel="noopener noreferrer">Otros proyectos <span>↗</span></a></div>`;
}
function download(name, contents, mime) {
  const url=URL.createObjectURL(new Blob([contents],{type:mime}));
  const a=document.createElement('a'); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportOPML() {
  const xmlEsc = value => esc(value);
  const outlines=sources.filter(s=>prefs.sources.includes(s.id)).map(s=>`    <outline type="rss" text="${xmlEsc(s.name)}" title="${xmlEsc(s.name)}" xmlUrl="${xmlEsc(s.feed)}" htmlUrl="${xmlEsc(s.url)}"/>`).join('\n');
  download('extra-extra-medios.opml',`<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>Mi quiosco · Extra Extra</title></head><body>\n${outlines}\n</body></opml>`,'text/xml');
}
async function importOPML(event) {
  const file=event.target.files[0]; if (!file) return;
  if(file.size>1000000){toast('La lista OPML es demasiado grande (máximo 1 MB).');return;}
  const xml=new DOMParser().parseFromString(await file.text(),'text/xml');
  if(xml.querySelector('parsererror') || !xml.querySelector('opml')) { toast('Este archivo no es una lista OPML válida.');return; }
  const feeds=[...xml.querySelectorAll('outline[xmlUrl]')].map(o=>({url:o.getAttribute('xmlUrl'),name:o.getAttribute('text')||o.getAttribute('title')||o.getAttribute('xmlUrl')}));
  const match=feeds.map(f=>sources.find(s=>s.feed.replace(/\/$/,'')===f.url.replace(/\/$/,''))).filter(Boolean);
  prefs.sources=[...new Set([...prefs.sources,...match.map(s=>s.id)])];persist();render();drawSourceList();
  const missing=feeds.filter(f=>!sources.some(s=>s.feed.replace(/\/$/,'')===f.url.replace(/\/$/,'')));
  $('#opml-result').textContent=`${match.length} medios reconocidos y seleccionados. ${missing.length ? `Pendientes de añadir al catálogo: ${missing.map(f=>f.name).join(', ')}.` : 'Todos están en el catálogo.'}`;
}
async function importSettings(event) {
  const file=event.target.files[0];if(!file)return;
  try {
    if(file.size>8000000)throw new Error();
    const backup=JSON.parse(await file.text());
    if(backup.version!==1 || !backup.preferences || !Array.isArray(backup.saved))throw new Error();
    const p=backup.preferences;
    if(['auto','morning','afternoon','night'].includes(p.theme))prefs.theme=p.theme;
    if(['mosaic','cards','list'].includes(p.view))prefs.view=p.view;
    if(fonts[p.font])prefs.font=p.font;
    if(Number.isFinite(p.size))prefs.size=Math.max(15,Math.min(28,p.size));
    if(Array.isArray(p.sources))prefs.sources=p.sources.filter(id=>sources.some(s=>s.id===id));
    for(const key of ['images','group'])if(typeof p[key]==='boolean')prefs[key]=p[key];
    const valid=backup.saved.filter(a=>a && typeof a.id==='string' && typeof a.title==='string' && typeof a.source==='string' && typeof a.summary==='string' && safeURL(a.url)).map(a=>({...a,content:typeof a.content==='string'?a.content:'',language:['es','en','fr','de'].includes(a.language)?a.language:'es',published:Number.isFinite(Date.parse(a.published))?a.published:null,image:safeURL(a.image),categories:Array.isArray(a.categories)?a.categories:[]}));
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
  const translateURL=`https://translate.google.com/translate?sl=auto&tl=es&u=${encodeURIComponent(a.url)}`;
  $('#reader-content').innerHTML=`<div class="reader-meta">${esc(s.name)} · ${esc(dateLabel(a.published))} · ${esc(a.language.toUpperCase())}</div><h1 lang="${translated?'es':esc(a.language)}">${esc(translated?.title||a.title)}</h1>${image&&prefs.images?`<img class="reader-image" src="${esc(image)}" alt="" referrerpolicy="no-referrer">`:''}<p class="reader-excerpt">${a.content?'Texto distribuido por el medio en su RSS. Puede no incluir el artículo completo.':'Extracto distribuido por el medio. Continúa en la publicación original para leer el artículo.'}${translated?' Traducción automática al español.':''}</p><div class="reader-text" lang="${translated?'es':esc(a.language)}">${String(text||'Este medio solo ha compartido el titular.').split(/\n+/).filter(Boolean).map(p=>`<p>${esc(p)}</p>`).join('')}</div><div class="reader-links"><a class="primary-link" href="${esc(safeURL(a.url))}" target="_blank" rel="noopener noreferrer">Leer en ${esc(s.name)} ${icon('arrow')}</a>${a.language!=='es'?`<button id="translate-local" class="outline-button">${translated?'Ver original':'Traducir al español'}</button><a href="${esc(translateURL)}" target="_blank" rel="noopener noreferrer" class="text-button">Abrir traducción web ↗</a>`:''}</div><p id="translation-status" class="small-note" role="status">${a.language!=='es'?'La traducción local depende del navegador. La alternativa web abre Google Translate y comparte con él la URL del artículo. Los límites de acceso del medio pueden seguir aplicándose.':''}</p>${cluster.articles.length>1?`<section class="coverage-list"><h2>Coberturas de la noticia</h2><p class="small-note">Agrupación automática por similitud de titulares. Puedes desactivarla en Filtros.</p>${cluster.articles.map(other=>`<button data-coverage-id="${esc(other.id)}"><small>${esc(sourceFor(other).name)} · ${relativeTime(other.published)}</small><span>${esc(other.title)}</span></button>`).join('')}</section>`:''}`;
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

initInterface({openPanel,refresh:()=>loadNews(true)});
hydrateIcons();applyAppearance();renderCategories();
$('#edition-date').textContent=new Intl.DateTimeFormat('es',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
document.addEventListener('click',event=>{
  const panel=event.target.closest('[data-panel]');if(panel){openPanel(panel.dataset.panel);return;}
  const category=event.target.closest('[data-category]');if(category){filters.category=category.dataset.category;filters.topic=null;filters.topicName='';limit=36;renderCategories();render();return;}
  const view=event.target.closest('[data-view]');if(view){prefs.view=view.dataset.view;persist();applyAppearance();render();return;}
  const open=event.target.closest('[data-open]');if(open){openReader(open.dataset.open);return;}
  const save=event.target.closest('[data-save]');if(save){const a=data.articles.find(a=>a.id===save.dataset.save)||saved.find(a=>a.id===save.dataset.save);if(a)saveArticle(a);return;}
  if(event.target.closest('#clear-filters,#reset-empty')){resetFilters();if(!prefs.sources.length){prefs.sources=sources.map(s=>s.id);persist();render();}}
});
$('#close-panel').onclick=()=>$('#panel').close();
$('#close-reader').onclick=()=>$('#reader').close();
$('#reader').addEventListener('close',()=>render());
for(const dialog of [$('#panel'),$('#reader')])dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
$('#reader-save').onclick=()=>currentArticle&&saveArticle(currentArticle);
$('#saved-toggle').onclick=()=>{closeMenu();savedOnly=!savedOnly;resetFilters();window.scrollTo({top:0});};
$('#load-more').onclick=()=>{limit+=36;render();};
$('#refresh').onclick=()=>loadNews(true);
document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!$('dialog[open]')){event.preventDefault();openPanel('search');}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){applyAppearance();if(!data.generated||Date.now()-Date.parse(data.generated)>20*60000)loadNews();}});
setInterval(()=>{if(!document.hidden&&!$('dialog[open]'))loadNews();},5*60000);
setInterval(applyAppearance,60000);
loadNews();
