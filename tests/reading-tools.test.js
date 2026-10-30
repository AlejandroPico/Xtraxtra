import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeLibrary,libraryMatches,personalTags,sanitizeComfort,sanitizeDigests,quietNow,digestDue,digestEdition,newAlerts,swipeAction,splitUTF8,speechChunks,translationParts} from '../lib/reading-tools.js';
import {createTranslationEngine} from '../lib/translation.js';
import {calendarKey} from '../lib/edition.js';

const now=new Date(2026,9,30,12).getTime();
const article=(id,source='one',extra={})=>({id,title:'Investigación científica '+id,summary:'Texto de la investigación '+id,url:'https://example.org/'+id,source,language:'en',published:new Date(now-3600000).toISOString(),...extra});
test('Colecciones y etiquetas: importación acotada, pertenencia múltiple y búsquedas sin tildes',()=>{
  const library=sanitizeLibrary({collections:[{id:'c1',name:'Trabajo'},{id:'c2',name:'Ciencia'}],items:{a:{collections:['c1','missing','c2','c1'],tags:['Tecnología','tecnologia',' Revisar ']}}});
  assert.deepEqual(library.items.a,{collections:['c1','c2'],tags:['tecnologia','Revisar']});
  assert(libraryMatches({id:'a'},library,{collection:'c2',tag:'REVISAR'}));assert(!libraryMatches({id:'a'},library,{collection:'@none'}));assert(libraryMatches({id:'b'},library,{collection:'@none'}));
  assert.equal(personalTags(Array.from({length:40},(_,i)=>'tag'+i)).length,12);
});
test('Importar ajustes nunca concede ni activa avisos del sistema',()=>{
  const input={alertsEnabled:true,systemAlerts:true,target:'invalid',rate:9,swipeLeft:'delete',swipeRight:'pending'};
  const settings=sanitizeComfort(input,true);assert.equal(settings.alertsEnabled,false);assert.equal(settings.systemAlerts,false);assert.equal(settings.target,'es');assert.equal(settings.rate,1.8);assert.equal(settings.swipeLeft,'none');assert.equal(settings.swipeRight,'pending');assert.equal(sanitizeComfort(null).engine,'local');
});
test('Descanso local: cruza medianoche, respeta límites y permite silenciar todo el día',()=>{
  const settings=sanitizeComfort({quietStart:'22:00',quietEnd:'08:00'}),at=(h,m=0)=>new Date(2026,9,30,h,m);
  assert(quietNow(settings,at(22)));assert(quietNow(settings,at(7,59)));assert(!quietNow(settings,at(8)));assert(!quietNow(settings,at(21,59)));
  assert(quietNow({...settings,quietStart:'12:00',quietEnd:'12:00'},at(16)));assert(!quietNow({...settings,quietEnabled:false},at(23)));
});
test('El resumen automático solo vence después de su hora y una vez por día de calendario',()=>{
  const settings=sanitizeComfort({digestEnabled:true,digestTime:'08:15'}),date=new Date(2026,9,30,8,15);
  assert(digestDue(settings,'',date));assert(!digestDue(settings,calendarKey(date),date));assert(!digestDue(settings,'',new Date(2026,9,30,8,14)));assert(!digestDue({...settings,digestEnabled:false},'',date));
});
test('El resumen conserva extractos y enlaces, agrupa un suceso y reparte los medios',()=>{
  const title='El presidente disuelve el Parlamento y convoca elecciones en España';
  const articles=[article('e1','one',{title}),article('e2','two',{title}),article('e3','two',{title}),article('tech','one',{title:'Apple presenta una nueva versión de su teléfono'}),article('space','three',{title:'La NASA investiga un nuevo planeta'}),article('old','four',{published:new Date(now-86400000).toISOString()})];
  const digest=digestEdition(articles,{day:calendarKey(new Date(now)),now,sourceFor:a=>({name:'Medio '+a.source})});
  assert.equal(digest.items.length,3);assert(!digest.items.some(a=>a.id==='old'));assert.equal(digest.items.filter(a=>a.title===title).length,1);assert.equal(digest.items.find(a=>a.title===title).references.length,1);assert(digest.items.every(a=>a.url.startsWith('https://')&&a.excerpt));
});
test('Las copias del resumen descartan enlaces ejecutables y limitan ediciones y referencias',()=>{
  const rows=Array.from({length:10},(_,i)=>({day:'2026-10-'+String(i+1).padStart(2,'0'),items:[{...article('a'),excerpt:'Texto',references:[{url:'javascript:alert(1)'},{url:'https://example.org/ref',sourceName:'Fuente'}]},{...article('bad'),url:'data:text/html,a'}]}));
  const restored=sanitizeDigests(rows);assert.equal(restored.length,7);assert.equal(restored[0].items.length,1);assert.equal(restored[0].items[0].references.length,1);
});
test('Los avisos seleccionan solo novedades recientes, sin repetir URL ni notificar toda la edición',()=>{
  const settings=sanitizeComfort({alertsEnabled:true,alertQuery:'nasa o terremoto sin simulacro',alertSources:['selected'],alertFollowed:true});
  const articles=[article('a','one',{title:'La NASA anuncia una misión'}),article('seen','one',{title:'Terremoto en Japón'}),article('old','selected',{published:new Date(now-25*3600000).toISOString()}),article('source','selected'),article('follow'),article('none'),article('drill','one',{title:'Simulacro de terremoto'}),article('a','other',{title:'La NASA anuncia una misión',url:'https://example.org/a?utm_source=x'})];
  assert.deepEqual(newAlerts(articles,new Set(['https://example.org/seen']),settings,{now,followed:a=>a.id==='follow'}).map(a=>a.id),['a','source','follow']);
  assert.deepEqual(newAlerts(articles,new Set(),sanitizeComfort({alertsEnabled:true}),{now}),[]);
});
test('Los gestos exigen recorrido horizontal claro y conservan la acción elegida por dirección',()=>{
  const s={swipeLeft:'save',swipeRight:'pending'},start={x:100,y:100};
  assert.equal(swipeAction(start,{x:10,y:105},s),'save');assert.equal(swipeAction(start,{x:190,y:105},s),'pending');assert.equal(swipeAction(start,{x:110,y:220},s),'none');assert.equal(swipeAction(start,{x:45,y:100},s),'none');
});
test('Fragmentos de traducción y voz conservan Unicode y no rebasan los bytes permitidos',()=>{
  const text=('Árbol, 東京 y 🗞️. '+ 'palabra'.repeat(80)+' ').repeat(8),chunks=splitUTF8(text);
  assert.equal(chunks.join(''),text);assert(chunks.every(c=>new TextEncoder().encode(c).length<=480));assert(speechChunks(text).every(c=>new TextEncoder().encode(c).length<=220));
  assert.equal(translationParts(article('a','one',{content:'a'.repeat(5000)}),'mymemory').partial,true);assert.equal(translationParts(article('a','one',{content:'a'.repeat(5000)}),'local').partial,false);
});
test('MyMemory utiliza solo consulta, respeta bytes, reutiliza traducciones y no envía datos antes del clic',async()=>{
  let settings=sanitizeComfort({engine:'mymemory'}),usage={},calls=[];
  const engine=createTranslationEngine({settings:()=>settings,readUsage:()=>usage,saveUsage:v=>usage=v,fetcher:async url=>{calls.push(new URL(url));return {ok:true,json:async()=>({responseStatus:200,responseData:{translatedText:'Texto traducido'}})};}});
  await engine.ready;assert.equal(calls.length,0);const a=article('one','source',{title:'A headline',summary:'A short news excerpt'});
  await engine.article(a,{full:false});assert.equal(calls.length,2);assert.equal(engine.peekCard(a).title,'Texto traducido');await engine.article(a,{full:false});assert.equal(calls.length,2);
  assert(calls.every(url=>url.pathname==='/get'&&new TextEncoder().encode(url.searchParams.get('q')).length<=500));assert(usage.count>0);
});
test('El límite de traducción detiene la petición antes de consumir más cuota',async()=>{
  let calls=0,usage={day:new Date().toISOString().slice(0,10),count:4498};const engine=createTranslationEngine({settings:()=>sanitizeComfort({engine:'mymemory'}),readUsage:()=>usage,saveUsage:v=>usage=v,fetcher:async()=>{calls++;throw new Error();}});
  await assert.rejects(engine.article(article('limit'),{full:false}),/límite/);assert.equal(calls,0);
});
test('La traducción local prepara el modelo desde la acción y no usa un servicio externo',async()=>{
  let preparations=0,calls=0;const engine=createTranslationEngine({settings:()=>sanitizeComfort(),readUsage:()=>({}),saveUsage:()=>assert.fail(),fetcher:()=>assert.fail(),native:()=>({create:()=>{preparations++;return Promise.resolve({translate:async text=>{calls++;return 'ES '+text;},destroy:()=>{}});}})});
  const prepared=engine.prepare('en','es','local');assert.equal(preparations,1);const result=await engine.article(article('native'),{prepared});assert(result.title.startsWith('ES '));assert.equal(calls,2);engine.destroy();
});
