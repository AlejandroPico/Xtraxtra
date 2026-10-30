import {languages,feedURL,parseOPML,sourceSettings,plainText} from './feeds.js';
import {normalize,escapeHTML as esc,categories} from './news.js';

export function createMediaPanel(ctx) {
  const $=s=>document.querySelector(s),settings=()=>ctx.settings(),sources=()=>ctx.sources();
  let repairID='',candidates=[];
  function commit(){ctx.persist();ctx.changed();}
  function folder(name) {
    const clean=String(name||'').trim().slice(0,60);if(!clean)return '';
    const existing=settings().folders.find(f=>normalize(f.name)===normalize(clean));if(existing)return existing.id;
    if(settings().folders.length>=30)return '';
    const f={id:'folder-'+crypto.randomUUID(),name:clean};settings().folders.push(f);return f.id;
  }
  function options(list,first){return `<option value="">${first}</option>`+list.map(([id,label])=>`<option value="${esc(id)}">${esc(label)}</option>`).join('');}
  function render() {
    $('#panel-content').innerHTML=`<details class="media-add"><summary>Añadir un medio</summary><form id="add-feed"><label class="settings-field"><span>Web del medio o dirección RSS</span><input id="feed-address" type="url" required maxlength="2048" placeholder="https://…"></label><label class="settings-field"><span>Nombre del medio (opcional)</span><input type="text" id="feed-name" maxlength="100" placeholder="Nombre para tu lista"></label><div class="catalog-filters"><label class="settings-field"><span>Idioma si el RSS no lo indica</span><select id="feed-language">${Object.entries(languages).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label><label class="settings-field"><span>Especialidad</span><select id="feed-category">${categories.map(c=>`<option>${esc(c)}</option>`).join('')}</select></label><label class="settings-field"><span>Territorio del medio</span><input type="text" id="feed-region" maxlength="80" placeholder="Opcional"></label><label class="settings-field"><span>Carpeta</span><select id="feed-folder">${options(settings().folders.map(f=>[f.id,f.name]),'Sin carpeta')}</select></label></div><button class="outline-button" id="find-feeds" type="submit">Buscar canales RSS</button></form><p id="feed-feedback" class="small-note" role="status"></p><div id="feed-candidates"></div></details>
    <details class="media-add"><summary>Carpetas e importación</summary><form id="folder-form" class="inline-form"><label class="settings-field"><span>Nombre de la carpeta</span><input type="text" id="folder-name" maxlength="60" required></label><button type="submit">Crear carpeta</button></form><div class="panel-actions"><label class="settings-field"><span>Carpeta que quieres eliminar</span><select id="folder-delete">${options(settings().folders.map(f=>[f.id,f.name]),'Elegir carpeta')}</select></label><button id="delete-folder">Eliminar carpeta</button></div><p class="small-note">Eliminar una carpeta conserva sus medios.</p><div class="panel-actions"><button id="import-opml">Importar OPML</button><button id="export-opml">Exportar mis medios</button></div><input id="opml-file" type="file" accept=".opml,.xml,text/xml" hidden><p id="opml-result" class="small-note" role="status"></p></details>
    <label class="settings-field"><span>Buscar en el catálogo</span><input id="source-search" class="source-search" type="search" placeholder="Medio, territorio o especialidad…"></label><div class="catalog-filters"><label class="settings-field"><span>Carpeta</span><select id="catalog-folder">${options([['@selected','Mis medios seleccionados'],['@priority','Medios prioritarios'],['@none','Sin carpeta'],...settings().folders.map(f=>[f.id,f.name])],'Todas las carpetas')}</select></label><label class="settings-field"><span>Idioma</span><select id="catalog-language">${options(Object.entries(languages),'Todos los idiomas')}</select></label><label class="settings-field"><span>Territorio del medio</span><select id="catalog-region">${options([...new Set(sources().map(s=>s.region))].sort((a,b)=>a.localeCompare(b,'es')).map(r=>[r,r]),'Todos los territorios')}</select></label><label class="settings-field"><span>Especialidad</span><select id="catalog-category">${options(categories.map(c=>[c,c]),'Todas las especialidades')}</select></label><label class="settings-field"><span>Tipo de fuente</span><select id="catalog-kind">${options([['primary','Fuentes primarias'],['personal','Añadidos por mí'],['press','Prensa y publicaciones']],'Todas las fuentes')}</select></label><label class="settings-field"><span>Texto en el RSS</span><select id="catalog-text">${options([['extended','Con texto ampliado'],['excerpt','Titulares o extractos']],'Cualquier cantidad de texto')}</select></label></div><div class="panel-actions"><button id="select-all">Seleccionar resultados</button><button id="select-none">Desmarcar resultados</button><button id="select-es">En español</button></div><p id="catalog-count" class="small-note" role="status"></p><div id="source-list"></div><p class="small-note">La estrella da prioridad al medio al ordenar por relevancia. Las carpetas, RSS añadidos y preferencias se guardan en este navegador. El texto disponible depende de cada RSS.</p>`;
    $('#source-search').oninput=draw;
    document.querySelectorAll('.catalog-filters select').forEach(s=>s.onchange=draw);
    $('#select-all').onclick=()=>{ctx.select([...new Set([...ctx.selected(),...matching().map(s=>s.id)])]);draw();};
    $('#select-none').onclick=()=>{const ids=new Set(matching().map(s=>s.id));ctx.select(ctx.selected().filter(id=>!ids.has(id)));draw();};
    $('#select-es').onclick=()=>{ctx.select(sources().filter(s=>s.language==='es').map(s=>s.id));draw();};
    $('#folder-form').onsubmit=e=>{e.preventDefault();const id=folder($('#folder-name').value);if(!id){ctx.notify('Puedes crear hasta 30 carpetas.');return;}commit();render();ctx.notify('Carpeta creada.');};
    $('#delete-folder').onclick=()=>{const id=$('#folder-delete').value;if(!id)return;settings().folders=settings().folders.filter(f=>f.id!==id);for(const key of Object.keys(settings().assignments))if(settings().assignments[key]===id)delete settings().assignments[key];commit();render();};
    $('#add-feed').onsubmit=findFeeds;
    $('#export-opml').onclick=exportOPML;
    $('#import-opml').onclick=()=>$('#opml-file').click();$('#opml-file').onchange=importOPML;
    draw();
  }
  function matching() {
    const query=normalize($('#source-search')?.value||''),get=id=>$('#'+id)?.value||'';
    const content=new Set(ctx.data().articles.filter(a=>a.content&&a.content.length>a.summary.length+100).map(a=>a.source));
    return sources().filter(s=>normalize(s.name+' '+s.region+' '+s.category).includes(query)&&(!get('catalog-language')||s.language===get('catalog-language'))&&(!get('catalog-region')||s.region===get('catalog-region'))&&(!get('catalog-category')||s.category===get('catalog-category'))&&(!get('catalog-kind')||(s.kind||'press')===get('catalog-kind'))&&(!get('catalog-text')||(get('catalog-text')==='extended'?content.has(s.id):!content.has(s.id)))&&(!get('catalog-folder')||(get('catalog-folder')==='@selected'?ctx.selected().includes(s.id):get('catalog-folder')==='@priority'?settings().priorities[s.id]:get('catalog-folder')==='@none'?!settings().assignments[s.id]:settings().assignments[s.id]===get('catalog-folder'))));
  }
  function draw() {
    if(!$('#source-list'))return;
    const region=$('#catalog-region'),previousRegion=region.value;region.innerHTML=options([...new Set(sources().map(s=>s.region))].sort((a,b)=>a.localeCompare(b,'es')).map(r=>[r,r]),'Todos los territorios');region.value=previousRegion;
    const list=matching();$('#catalog-count').textContent=`${list.length} ${list.length===1?'medio':'medios'} · ${ctx.selected().length} seleccionados`;
    $('#source-list').innerHTML=list.map(s=>{
      const h=ctx.data().status[s.id],state=h?.state||'pending',priority=!!settings().priorities[s.id],f=settings().assignments[s.id];
      return `<div class="source-card"><div class="source-row"><label><input type="checkbox" data-source="${esc(s.id)}" ${ctx.selected().includes(s.id)?'checked':''}><span class="source-info"><span>${esc(s.name)}</span><small>${esc(s.region)} · ${esc(s.language.toUpperCase())} · ${esc(s.category)}${s.kind==='primary'?' · Fuente primaria':''}</small></span></label><button class="source-priority" data-priority="${esc(s.id)}" aria-pressed="${priority}" aria-label="Priorizar ${esc(s.name)}">${priority?'★':'☆'}</button><span class="health ${state}">${state==='ok'?h.count+' noticias':state==='stale'?'Edición anterior':state==='pending'?'Sin comprobar':'No disponible'}</span></div><details class="source-diagnostic"><summary>Opciones y estado de ${esc(s.name)}</summary><p class="small-note">${esc(h?.message||'')}${h?.checked?` · Comprobado ${esc(ctx.date(h.checked))}`:''}${h?.lastSuccess?` · Última recogida correcta ${esc(ctx.date(h.lastSuccess))}`:''}</p><p class="feed-url">${esc(s.feed)}</p><label class="settings-field"><span>Carpeta de ${esc(s.name)}</span><select data-folder="${esc(s.id)}">${options(settings().folders.map(f=>[f.id,f.name]),'Sin carpeta').replace(`value="${esc(f||'')}"`,`value="${esc(f||'')}" selected`)}</select></label><div class="panel-actions"><button data-check="${esc(s.id)}">Comprobar RSS</button><button data-repair="${esc(s.id)}">Buscar RSS alternativos</button><a href="${esc(feedURL(s.url))}" target="_blank" rel="noopener noreferrer">Visitar medio ↗</a>${s.id.startsWith('custom-')?`<button data-remove-source="${esc(s.id)}">Eliminar medio</button>`:''}</div><div data-repair-result="${esc(s.id)}" role="status"></div></details></div>`;
    }).join('')||'<p class="small-note">No hay medios con estos filtros.</p>';
    $('#source-list').querySelectorAll('[data-source]').forEach(n=>n.onchange=()=>{ctx.select(n.checked?[...new Set([...ctx.selected(),n.dataset.source])]:ctx.selected().filter(id=>id!==n.dataset.source));$('#catalog-count').textContent=`${matching().length} medios · ${ctx.selected().length} seleccionados`;});
    $('#source-list').querySelectorAll('[data-priority]').forEach(n=>n.onclick=()=>{settings().priorities[n.dataset.priority]=!settings().priorities[n.dataset.priority];commit();draw();});
    $('#source-list').querySelectorAll('[data-folder]').forEach(n=>n.onchange=()=>{settings().assignments[n.dataset.folder]=n.value;commit();if($('#catalog-folder').value)draw();});
    $('#source-list').querySelectorAll('[data-check]').forEach(n=>n.onclick=async()=>{n.disabled=true;n.textContent='Comprobando…';await ctx.refreshSource(n.dataset.check);draw();});
    $('#source-list').querySelectorAll('[data-repair]').forEach(n=>n.onclick=()=>repair(n));
    $('#source-list').querySelectorAll('[data-remove-source]').forEach(n=>n.onclick=()=>{const id=n.dataset.removeSource;settings().custom=settings().custom.filter(s=>s.id!==id);delete settings().overrides[id];delete settings().priorities[id];delete settings().assignments[id];ctx.removeSource(id);commit();draw();});
  }
  async function findFeeds(event) {
    event.preventDefault();const address=feedURL($('#feed-address').value);if(!address){ctx.notify('Introduce una dirección web válida.');return;}
    const button=$('#find-feeds'),feedback=$('#feed-feedback'),container=$('#feed-candidates');button.disabled=true;feedback.textContent='Buscando canales RSS…';container.innerHTML='';
    try{const result=await ctx.api('discover',address);candidates=result.feeds||[];feedback.textContent=candidates.length?`${candidates.length===1?'1 canal encontrado':candidates.length+' canales encontrados'}. Elige los que quieras añadir.`:'La web no anuncia un RSS accesible. Prueba su dirección RSS directamente.';
      container.innerHTML=candidates.map((c,i)=>`<div class="feed-candidate"><span>${esc(plainText(c.title)||new URL(c.url).hostname)}<small>${esc(c.url)}</small></span><button data-add-candidate="${i}">Añadir</button></div>`).join('');
      container.querySelectorAll('[data-add-candidate]').forEach(n=>n.onclick=async()=>{n.disabled=true;try{const c=candidates[Number(n.dataset.addCandidate)];const source=add({feed:c.url,name:$('#feed-name').value.trim()||plainText(c.title),url:address,language:$('#feed-language').value,region:$('#feed-region').value,category:$('#feed-category').value},$('#feed-folder').value);if(source){await ctx.refreshSource(source.id);draw();n.textContent='Añadido';}}catch(error){feedback.textContent=error.message;n.disabled=false;}});
    }catch(error){feedback.textContent=error.message;}finally{button.disabled=false;}
  }
  function add(entry,folderID='',silent=false) {
    const existing=[...sources(),...settings().custom].find(s=>feedURL(s.feed)===feedURL(entry.feed));let s=existing;
    if(!s){if(settings().custom.length>=120)throw new Error('Puedes añadir hasta 120 RSS personales.');s={...entry,id:'custom-'+crypto.randomUUID(),language:entry.language||'es',region:entry.region||'Sin especificar',category:entry.category||'Actualidad',name:entry.name||new URL(entry.feed).hostname,kind:'personal'};settings().custom.push(s);}
    if(folderID)settings().assignments[s.id]=folderID;if(!silent){ctx.select([...new Set([...ctx.selected(),s.id])]);commit();}return s;
  }
  async function repair(button) {
    repairID=button.dataset.repair;const id=repairID,source=sources().find(s=>s.id===id),output=document.querySelector(`[data-repair-result="${CSS.escape(id)}"]`);button.disabled=true;output.textContent='Buscando otros canales publicados por el medio…';
    try{const result=await ctx.api('discover',source.url),feeds=(result.feeds||[]).filter(f=>f.url!==source.feed);output.innerHTML=feeds.length?feeds.map((f,i)=>`<div class="feed-candidate"><span>${esc(plainText(f.title))}<small>${esc(f.url)}</small></span><button data-replacement="${i}">Usar este RSS</button></div>`).join(''):'No se han encontrado otros RSS accesibles en esta web.';
      output.querySelectorAll('[data-replacement]').forEach(n=>n.onclick=async()=>{settings().overrides[id]=feeds[Number(n.dataset.replacement)].url;commit();n.disabled=true;await ctx.refreshSource(id);draw();ctx.notify('Dirección RSS actualizada para este navegador.');});
    }catch(error){output.textContent=error.message;}finally{button.disabled=false;}
  }
  async function importOPML(event) {
    const file=event.target.files[0];if(!file)return;const output=$('#opml-result');
    try{if(file.size>1000000)throw new Error('El OPML supera 1 MB.');const entries=parseOPML(await file.text());if(!entries.length)throw new Error('El OPML no contiene direcciones RSS válidas.');
      let added=0,existing=0,skipped=0;const importedIDs=[];for(const entry of entries){const known=sources().some(s=>feedURL(s.feed)===entry.feed);try{const source=add(entry,folder(entry.folder),true);importedIDs.push(source.id);known?existing++:added++;}catch{skipped++;}}
      // Sanitize imported names, URLs and folder associations before persisting.
      ctx.replaceSettings(sourceSettings(settings()));commit();ctx.select([...new Set([...ctx.selected(),...importedIDs])]);render();const details=$('#opml-result').closest('details');details.open=true;$('#opml-result').textContent=`${added} RSS nuevos, ${existing} ya existentes${skipped?`, ${skipped} omitidos por el límite de 120 RSS personales`:''}. Se comprobarán al actualizar la portada.`;ctx.refresh();
    }catch(error){output.textContent=error.message;}
  }
  function exportOPML() {
    const outline=s=>`<outline type="rss" text="${esc(s.name)}" xmlUrl="${esc(s.feed)}" htmlUrl="${esc(s.url)}"/>`,selected=sources().filter(s=>ctx.selected().includes(s.id));
    let body=selected.filter(s=>!settings().assignments[s.id]).map(outline).join('\n');
    for(const f of settings().folders){const items=selected.filter(s=>settings().assignments[s.id]===f.id);if(items.length)body+=`\n<outline text="${esc(f.name)}">${items.map(outline).join('\n')}</outline>`;}
    ctx.download('extra-extra-medios.opml',`<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>Extra Extra</title></head><body>${body}</body></opml>`,'text/xml');
  }
  return {render,draw};
}
