import {escapeHTML as esc,safeURL} from './news.js';
import {canonicalURL} from './story-analysis.js';
import {calendarKey} from './edition.js';
import {quietNow,digestDue,digestEdition,newAlerts,sanitizeDigests} from './reading-tools.js';

export function createDailyTools(ctx){
  const loaded=ctx.read()||{},safeItem=a=>a&&typeof a.title==='string'&&safeURL(a.url);
  const state={digests:(Array.isArray(loaded.digests)?loaded.digests:[]).filter(d=>d&&/^\d{4}-\d{2}-\d{2}$/.test(d.day)&&Array.isArray(d.items)).slice(-7).map(d=>({...d,items:d.items.filter(safeItem).slice(0,8)})),seen:(Array.isArray(loaded.seen)?loaded.seen:[]).filter(v=>typeof v==='string'&&safeURL(v)).slice(-4000),pending:(Array.isArray(loaded.pending)?loaded.pending:[]).filter(safeItem).slice(-40),inbox:(Array.isArray(loaded.inbox)?loaded.inbox:[]).filter(g=>g&&Array.isArray(g.items)).slice(-10).map(g=>({...g,items:g.items.filter(safeItem).slice(0,40)})),lastDelivery:Number(loaded.lastDelivery)||0,armed:loaded.armed===true};
  let busy=false,selectedDay=calendarKey(new Date());
  const persist=()=>ctx.persist(state),$=s=>document.querySelector(s);
  state.digests=sanitizeDigests(state.digests);
  const selected=()=>state.digests.find(d=>d.day===selectedDay);
  function arm(){state.seen=ctx.articles().map(a=>canonicalURL(a.url));state.pending=[];state.armed=true;persist();}
  function compact(a){return {id:a.id,title:a.title,url:a.url,source:a.source,sourceName:ctx.source(a).name,published:a.published,updated:a.updated,summary:a.summary||'',language:a.language||'es'};}
  function generate(day=calendarKey(new Date())){
    const digest=digestEdition(ctx.articles(),{day,sourceFor:ctx.source,categoryFor:ctx.category});
    if(!digest.items.length){ctx.notify('No hay noticias con fecha de ese día en tus medios seleccionados.');return null;}
    state.digests=state.digests.filter(d=>d.day!==day);state.digests.push(digest);state.digests=state.digests.sort((a,b)=>a.day.localeCompare(b.day)).slice(-7);selectedDay=day;persist();return digest;
  }
  async function check(){
    if(busy)return;busy=true;
    try{
      const run=async()=>{
      const latest=ctx.read()||{};state.seen=[...new Set([...state.seen,...(Array.isArray(latest.seen)?latest.seen:[])])].slice(-4000);
      if(Number(latest.lastDelivery)>state.lastDelivery){state.lastDelivery=latest.lastDelivery;state.inbox=latest.inbox||state.inbox;const delivered=new Set(state.inbox.flatMap(g=>g.items.map(a=>canonicalURL(a.url))));state.pending=state.pending.filter(a=>!delivered.has(canonicalURL(a.url)));}
      state.digests=sanitizeDigests([...state.digests,...(Array.isArray(latest.digests)?latest.digests:[])]);
      const settings=ctx.settings(),articles=ctx.articles(),today=calendarKey(new Date());
      if(digestDue(settings,state.digests.some(d=>d.day===today)?today:'')&&articles.length){if(generate())ctx.notify('Tu resumen de hoy está disponible en Al día.');}
      if(!settings.alertsEnabled){state.pending=[];return;}
      if(!state.armed){arm();return;}
      const seen=new Set(state.seen),news=newAlerts(articles,seen,settings,{followed:a=>ctx.followed(a)});
      for(const a of articles)seen.add(canonicalURL(a.url));state.seen=[...seen].slice(-4000);
      const activeURLs=new Set(articles.map(a=>canonicalURL(a.url)));
      const pending=new Map(newAlerts(state.pending.filter(a=>activeURLs.has(canonicalURL(a.url))),new Set(),settings,{followed:a=>ctx.followed(a)}).map(a=>[canonicalURL(a.url),a]));for(const a of news)pending.set(canonicalURL(a.url),compact(a));state.pending=[...pending.values()].slice(-40);persist();
      if(!state.pending.length||quietNow(settings)||Date.now()-state.lastDelivery<settings.alertInterval*60000)return;
      const group={id:crypto.randomUUID(),time:new Date().toISOString(),items:[...state.pending]};state.inbox.push(group);state.inbox=state.inbox.slice(-10);state.pending=[];state.lastDelivery=Date.now();persist();
      const message=`${group.items.length} ${group.items.length===1?'noticia coincide':'noticias coinciden'} con tus avisos. Consulta Al día.`;ctx.notify(message);
      if(settings.systemAlerts&&globalThis.Notification?.permission==='granted'){
        try{const registration=await navigator.serviceWorker?.getRegistration();if(!registration?.active)throw new Error();await registration.showNotification('Extra Extra · '+group.items.length+' novedades',{body:group.items.slice(0,2).map(a=>a.title).join('\n').slice(0,250),icon:new URL('../icons/icon-192.png',import.meta.url).href,tag:'extra-extra-news',data:{view:'alerts'}});}
        catch{ctx.notify('El sistema no ha mostrado el aviso. Las novedades siguen en Al día.');}
      }
      };
      if(navigator.locks?.request)await navigator.locks.request('extra-extra-daily-updates',run);else await run();
    }finally{busy=false;}
  }
  function render(){
    const root=$('#panel-content'),s=ctx.settings(),digest=selected(),date=day=>new Intl.DateTimeFormat('es',{day:'numeric',month:'long'}).format(new Date(day+'T12:00:00'));
    root.innerHTML=`<div class="daily-actions panel-actions"><button id="generate-digest">Actualizar resumen de hoy</button>${digest?'<button id="export-digest">Descargar resumen</button>':''}</div><label class="settings-field"><span>Edición del resumen</span><select id="digest-day"><option value="${calendarKey(new Date())}">Hoy</option>${state.digests.filter(d=>d.day!==calendarKey(new Date())).slice().reverse().map(d=>`<option value="${d.day}" ${selectedDay===d.day?'selected':''}>${date(d.day)}</option>`).join('')}</select></label><p class="small-note">Selección de hasta ocho historias de tus medios, con extractos RSS y fuentes. No genera hechos ni resúmenes con IA. Se conservan siete ediciones en este navegador.</p>${digest?`<p class="small-note">Preparado ${ctx.date(digest.createdAt)}</p><div class="digest-items">${digest.items.map(a=>`<section class="digest-item"><small>${esc(a.category)} · ${esc(a.sourceName)}</small><h3><button data-digest-open="${esc(a.id)}">${esc(a.title)}</button></h3><p>${esc(a.excerpt)}</p><a href="${esc(safeURL(a.url))}" target="_blank" rel="noopener noreferrer">${esc(a.sourceName)} ↗</a>${a.references?.length?`<div class="digest-references">${a.references.map(r=>safeURL(r.url)?`<a href="${esc(safeURL(r.url))}" target="_blank" rel="noopener noreferrer">${esc(r.sourceName)} ↗</a>`:'').join('')}</div>`:''}</section>`).join('')}</div>`:'<p>No hay un resumen preparado para este día.</p>'}<details class="reading-options"><summary>Resumen diario automático</summary><label class="check-row"><input type="checkbox" id="digest-enabled" ${s.digestEnabled?'checked':''}> Preparar al abrir o mantener abierta la web después de esta hora</label><label class="settings-field"><span>Hora local</span><input id="digest-time" type="time" value="${s.digestTime}"></label></details><details class="reading-options" id="alert-options"><summary>Avisos selectivos</summary><p class="small-note">Funcionan mientras Extra Extra está abierta y el navegador permite actualizarla. No hay envíos con la aplicación cerrada. En iPhone los avisos del sistema requieren instalar la web en pantalla de inicio. Se respetan tus medios seleccionados y silencios.</p><label class="settings-field"><span>Palabras o búsqueda (admite «o», «sin» y comillas)</span><input type="text" id="alert-query" maxlength="300" value="${esc(s.alertQuery)}" placeholder="Por ejemplo: terremoto o elecciones"></label><label class="check-row"><input type="checkbox" id="alert-followed" ${s.alertFollowed?'checked':''}> Nuevas coberturas de historias que sigo</label><fieldset class="alert-sources"><legend>O cualquiera de estos medios</legend>${ctx.sources().map(source=>`<label class="check-row"><input type="checkbox" data-alert-source="${esc(source.id)}" ${s.alertSources.includes(source.id)?'checked':''}> ${esc(source.name)}</label>`).join('')}</fieldset><label class="check-row"><input type="checkbox" id="alerts-enabled" ${s.alertsEnabled?'checked':''}> Activar avisos dentro de Extra Extra</label><div class="panel-actions"><button id="enable-system-alerts">Activar avisos del sistema</button><button id="disable-system-alerts" ${s.systemAlerts?'':'disabled'}>Desactivar avisos del sistema</button></div><p class="small-note" id="notification-status" role="status">${!('Notification' in globalThis)?'Este navegador no ofrece avisos del sistema.':Notification.permission==='denied'?'El navegador ha bloqueado las notificaciones. Puedes cambiarlo en sus ajustes.':s.systemAlerts?'Avisos del sistema activados.':'No se solicitará permiso hasta que pulses Activar avisos del sistema.'}</p><label class="check-row"><input type="checkbox" id="quiet-enabled" ${s.quietEnabled?'checked':''}> Horario de descanso</label><div class="time-pair"><label class="settings-field"><span>Desde</span><input type="time" id="quiet-start" value="${s.quietStart}"></label><label class="settings-field"><span>Hasta</span><input type="time" id="quiet-end" value="${s.quietEnd}"></label></div><p class="small-note">Horas locales. Las coincidencias esperan hasta acabar el descanso; horas iguales silencian todo el día.</p><label class="settings-field"><span>Agrupar avisos durante</span><select id="alert-interval">${[5,15,30,60,120].map(n=>`<option value="${n}" ${n===s.alertInterval?'selected':''}>${n} minutos</option>`).join('')}</select></label></details><details class="reading-options"><summary>Bandeja de avisos (${state.inbox.reduce((n,g)=>n+g.items.length,0)})</summary>${state.pending.length?`<p class="small-note">${state.pending.length} coincidencias pendientes de agrupar o de terminar el descanso.</p>`:''}${state.inbox.slice().reverse().map(group=>`<section class="alert-group"><p class="small-note">${ctx.date(group.time)}</p>${group.items.map(a=>`<p><a href="${esc(safeURL(a.url))}" target="_blank" rel="noopener noreferrer">${esc(a.title)} ↗</a><small> · ${esc(a.sourceName)}</small></p>`).join('')}</section>`).join('')||'<p class="small-note">Todavía no hay avisos.</p>'}</details>`;
    $('#generate-digest').onclick=()=>{generate();render();};$('#digest-day').value=selectedDay;$('#digest-day').onchange=e=>{selectedDay=e.target.value;render();};
    if($('#export-digest'))$('#export-digest').onclick=()=>{const d=selected();ctx.download(`extra-extra-${d.day}.txt`,`${date(d.day)} · Extra Extra\n\n`+d.items.map(a=>`${a.title}\n${a.excerpt}\n${a.sourceName}: ${a.url}${a.references?.length?'\n'+a.references.map(r=>`${r.sourceName}: ${r.url}`).join('\n'):''}`).join('\n\n'),'text/plain;charset=utf-8');};
    root.querySelectorAll('[data-digest-open]').forEach(b=>b.onclick=()=>{const digest=selected(),row=digest?.items.find(a=>a.id===b.dataset.digestOpen);if(row)ctx.open(row,digest.items);});
    for(const [id,key] of [['digest-enabled','digestEnabled'],['alert-followed','alertFollowed'],['quiet-enabled','quietEnabled']])$('#'+id).onchange=e=>{s[key]=e.target.checked;ctx.save();};
    for(const [id,key] of [['digest-time','digestTime'],['quiet-start','quietStart'],['quiet-end','quietEnd'],['alert-query','alertQuery'],['alert-interval','alertInterval']])$('#'+id).onchange=e=>{s[key]=key==='alertInterval'?Number(e.target.value):e.target.value;ctx.save();};
    root.querySelectorAll('[data-alert-source]').forEach(input=>input.onchange=()=>{s.alertSources=[...root.querySelectorAll('[data-alert-source]:checked')].map(n=>n.dataset.alertSource);ctx.save();});
    const valid=()=>!!(s.alertQuery.trim()||s.alertSources.length||s.alertFollowed);
    $('#alerts-enabled').onchange=e=>{if(e.target.checked&&!valid()){e.target.checked=false;ctx.notify('Elige una búsqueda, un medio o historias seguidas para tus avisos.');return;}s.alertsEnabled=e.target.checked;if(s.alertsEnabled)arm();else{state.pending=[];persist();}ctx.save();};
    $('#enable-system-alerts').onclick=async()=>{
      const node=$('#notification-status');if(!valid()){node.textContent='Elige antes qué noticias deben avisarte.';return;}if(!('Notification' in globalThis)){node.textContent='Avisos del sistema no disponibles. Puedes usar la bandeja dentro de Extra Extra.';return;}
      try{const permission=await Notification.requestPermission();if(permission==='granted'){if(!s.alertsEnabled)arm();s.alertsEnabled=true;s.systemAlerts=true;ctx.save();render();$('#alert-options').open=true;}else node.textContent='No se ha concedido permiso. No activamos avisos del sistema.';}catch{node.textContent='No se ha podido solicitar permiso en este navegador.';}
    };
    $('#disable-system-alerts').onclick=()=>{s.systemAlerts=false;ctx.save();render();$('#alert-options').open=true;};
  }
  function importDigests(rows){state.digests=sanitizeDigests([...state.digests,...rows]);persist();}
  return {render,check,arm,state,generate,importDigests};
}
