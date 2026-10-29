import test from 'node:test';
import assert from 'node:assert/strict';
import { filterArticles, groupArticles, score, categoryOf, safeURL, escapeHTML, relatedTopics } from '../lib/news.js';
const now = Date.parse('2026-10-29T12:00:00Z');
const make = (id, title, source='one', more={}) => ({id,title,source,url:`https://example.com/${id}`,language:'es',published:new Date(now).toISOString(),summary:'',categories:[],...more});
test('Agrupa coberturas equivalentes; se puede desactivar',()=>{
  const a=make('a','El Gobierno anuncia elecciones generales para el próximo noviembre');
  const b=make('b','El Gobierno anuncia elecciones generales el próximo noviembre','two');
  assert.equal(groupArticles([a,b]).length,1);assert.equal(groupArticles([a,b])[0].articles.length,2);
  assert.equal(groupArticles([a,b],false).length,2);
});
test('No mezcla accidentes con cifras distintas o fechas lejanas',()=>{
  const a=make('a','Un accidente de tren deja 15 muertos en Toledo');
  const b=make('b','Un accidente de tren deja 27 muertos en Toledo','two');
  const c=make('c',a.title,'two',{published:'2026-10-25T12:00:00Z'});
  assert.equal(groupArticles([a,b,c]).length,3);
  assert.equal(groupArticles([a,make('d',a.title.replace('Toledo','Madrid'),'two')]).length,2);
});
test('Una URL duplicada no genera dos noticias',()=>{const a=make('a','Una noticia');assert.equal(groupArticles([a,a]).length,1);});
test('La prioridad usa medios distintos y actualidad',()=>{
  const a=make('a','Titular'),b=make('b','Titular','two'),c=make('c','Titular');
  assert.ok(score({articles:[a,b]},now)>score({articles:[a,c]},now));
  assert.ok(score({articles:[a]},now)>score({articles:[{...a,published:'2026-10-28T12:00:00Z'}]},now));
});
test('Combina búsqueda sin tildes, medio, idioma, fecha y sin leer',()=>{
  const a=make('a','La economía y la inflación'),b=make('b','La economía cambia','two');
  const f={query:'economia inflacion',sources:['one'],read:[],hours:24,unread:true,language:'es'};
  assert.deepEqual(filterArticles([a,b],f,[],now),[a]);
  assert.equal(filterArticles([a],{...f,read:['a']},[],now).length,0);
  assert.equal(filterArticles([a],{...f,sources:[]},[],now).length,0);
});
test('Detecta categorías y asuntos específicos',()=>{
  assert.equal(categoryOf(make('a','La NASA lanza un telescopio')), 'Ciencia');
  assert.equal(categoryOf(make('a','Las elecciones al Congreso')), 'Política');
  assert.equal(relatedTopics([make('a','Accidente de tren en Toledo'),make('b','El tren sufre un accidente')])[0].name,'Accidentes ferroviarios');
});
test('Rechaza enlaces ejecutables y escapa contenido ajeno',()=>{
  assert.equal(safeURL('javascript:alert(1)'),'');assert.equal(safeURL('https://user:pass@example.com'),'');
  assert.equal(safeURL('https://example.com/'),'https://example.com/');
  assert.equal(escapeHTML('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
});
