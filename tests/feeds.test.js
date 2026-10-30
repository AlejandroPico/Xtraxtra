import test from 'node:test';
import assert from 'node:assert/strict';
import {feedURL,sourceSettings,mergeSources,keepNewerFeed,articleID} from '../lib/feeds.js';
import {articleTerritories,matchesTerritory} from '../lib/geography.js';
import {organizeEdition} from '../lib/edition.js';

test('RSS personales: conserva idiomas, carpetas y prioridades y rechaza direcciones ejecutables',()=>{
  const result=sourceSettings({custom:[{id:'custom-one',name:'Diario',feed:'https://example.org/rss',language:'eu'},{id:'custom-two',feed:'javascript:alert(1)'}],folders:[{id:'local',name:'Local'}],assignments:{'custom-one':'local',bad:'missing'},priorities:{'custom-one':true,bad:'true'},overrides:{news:'https://example.org/updated',bad:'file:///secret'}});
  assert.equal(result.custom.length,1);assert.equal(result.custom[0].language,'eu');assert.deepEqual(result.assignments,{'custom-one':'local'});assert.deepEqual(result.priorities,{'custom-one':true});assert.equal(result.overrides.bad,undefined);
  assert.equal(mergeSources([{id:'news',feed:'https://example.org/rss'}],result)[0].feed,'https://example.org/updated');
});
test('Las direcciones RSS se normalizan, sin credenciales ni fragmentos',()=>{
  assert.equal(feedURL('https://user:password@example.org/rss'),'');assert.equal(feedURL('file:///etc/passwd'),'');assert.equal(feedURL('/rss#section','https://example.org/'),'https://example.org/rss');
});
test('Una caché de RSS anterior no sustituye noticias más recientes ni impide reparar un feed',()=>{
  const feed='https://example.org/rss',previous={lastSuccess:'2026-10-30T02:10:00Z'},older={feed,lastSuccess:'2026-10-30T02:05:00Z'};
  assert.equal(keepNewerFeed(previous,older,feed),true);
  assert.equal(keepNewerFeed(previous,{...older,lastSuccess:'2026-10-30T02:12:00Z'},feed),false);
  assert.equal(keepNewerFeed(previous,{...older,feed:'https://example.org/new-rss'},feed),false);
});
test('La huella de una noticia es compatible con el recolector de Python',async()=>{
  assert.equal(await articleID('https://example.org/news'),'613455beda145c1523ce');
});
test('El territorio se obtiene del texto de la noticia y nunca del origen del periódico',()=>{
  const item={title:'Inundaciones en Málaga',summary:'Más avisos para Andalucía',categories:[],source:'bbc',region:'Reino Unido'};
  assert.deepEqual(articleTerritories(item).sort(),['es','es-an']);assert.equal(matchesTerritory(item,'uk'),false);
  assert.deepEqual(articleTerritories({title:'Resultados trimestrales de la compañía',summary:'',categories:[],region:'España'}),[]);
  assert.equal(matchesTerritory({title:'Noticias sobre vietnamitas',summary:''},'in'),false);
});
test('El lugar preferido y los medios prioritarios influyen dentro de cada día, sin alterar el orden cronológico elegido',()=>{
  const now=Date.parse('2026-10-30T12:00:00Z'),make=(id,published)=>({id,articles:[{id,source:id,published}]});
  const recent=make('recent','2026-10-30T11:50:00Z'),preferred=make('preferred','2026-10-30T11:30:00Z'),old=make('old','2026-10-29T12:00:00Z');
  const priority=c=>c.id==='preferred'||c.id==='old'?2:1;
  assert.equal(organizeEdition([recent,preferred,old],{now,priority})[0].clusters[0].id,'preferred');
  assert.equal(organizeEdition([recent,preferred,old],{now,priority,order:'newest'})[0].clusters[0].id,'recent');
  assert.equal(organizeEdition([recent,preferred,old],{now,priority}).at(-1).clusters[0].id,'old');
});
