import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesSearch,parseSearch,activeMutes,isMuted} from '../lib/search.js';
import {calendarKey,clusterDay,dayLabel,diversify,organizeEdition} from '../lib/edition.js';
import {readingPreferences,sanitizeFrontpages,readingEstimate} from '../lib/preferences.js';
import {filterArticles} from '../lib/news.js';

test('Búsqueda OR y exclusiones globales, incluidas frases entre comillas',()=>{
  const query='energía o electricidad, pero sin fútbol';
  assert.equal(matchesSearch('El precio de la energía',query),true);
  assert.equal(matchesSearch('La electricidad baja',query),true);
  assert.equal(matchesSearch('Energía y fútbol',query),false);
  assert.equal(matchesSearch('El precio del gas',query),false);
  assert.equal(matchesSearch('Castilla y León estrena tren','"Castilla y León" -huelga'),true);
  assert.equal(matchesSearch('Castilla y León tiene huelga','"Castilla y León" -huelga'),false);
  assert.deepEqual(parseSearch('sin fútbol').groups,[]);
});
test('Solo las guardadas incluyen todo el texto al buscar',()=>{
  const article={id:'a',title:'Titular',summary:'Extracto',content:'Aquí aparece una palabra secreta',source:'one',language:'es',published:new Date().toISOString()};
  const filters={query:'secreta',sources:['one'],read:[]};
  assert.equal(filterArticles([article],filters,[]).length,0);
  assert.equal(filterArticles([article],{...filters,searchContent:true},[]).length,1);
});
test('Los silencios caducan y los permanentes se pueden conservar',()=>{
  const now=10000,mutes=[{text:'Ucrania',until:now+10},{text:'fútbol',until:null},{text:'viejo',until:now-1},{text:'malo',until:'Infinity'}];
  assert.equal(activeMutes(mutes,now).length,2);
  assert.equal(isMuted({title:'La situación en Ucrania',summary:''},mutes,now),true);
  assert.equal(isMuted({title:'La situación en Ucrania',summary:''},mutes,now+11),false);
});
test('Ayer depende del calendario, aunque hayan pasado menos de 24 horas',()=>{
  const now=new Date(2026,9,29,1),yesterday=new Date(2026,9,28,23,55);
  assert.ok(dayLabel(calendarKey(yesterday),now).startsWith('Ayer'));
  assert.equal(dayLabel(calendarKey(now),now),'Hoy');
  assert.equal(dayLabel('unknown',now),'Sin fecha de publicación');
});
const cluster=(id,source,published)=>({id,articles:[{id,title:'Titular '+id,source,published,summary:'',language:'es'}]});
test('Las ediciones no mezclan noticias antiguas entre las de hoy',()=>{
  const now=new Date(2026,9,29,12).getTime();
  const today=cluster('today','a',new Date(2026,9,29,0,10).toISOString());
  const yesterday=cluster('yesterday','b',new Date(2026,9,28,23,59).toISOString());
  const unknown=cluster('unknown','c',null);
  yesterday.articles.push({...yesterday.articles[0],source:'d'});
  const groups=organizeEdition([unknown,yesterday,today],{now});
  assert.deepEqual(groups.map(g=>g.clusters[0].id),['today','yesterday','unknown']);
  assert.equal(clusterDay(unknown),'unknown');
});
test('La diversidad alterna medios sin perder ninguna noticia',()=>{
  const list=[cluster('a','one'),cluster('b','one'),cluster('c','one'),cluster('d','two'),cluster('e','two')];
  const result=diversify(list,{sourceLimit:1});
  assert.deepEqual(result.map(c=>c.id),['a','d','b','e','c']);
  assert.deepEqual(diversify(list.slice(0,3),{sourceLimit:1}).map(c=>c.id),['a','b','c']);
});
test('Las preferencias antiguas reciben valores válidos y los importados se limitan',()=>{
  assert.equal(readingPreferences({}).lineHeight,1.8);
  assert.equal(readingPreferences({readerWidth:9000,lineHeight:-1,density:'bad'}).readerWidth,960);
  assert.equal(readingPreferences({readerWidth:null}).readerWidth,680);
  assert.equal(readingPreferences({readerWidth:'invalid'}).readerWidth,680);
  assert.equal(sanitizeFrontpages([null,{name:'bad'}]).length,0);
  const page=sanitizeFrontpages([{id:'p',name:'Ciencia',sources:['one',null],filters:{query:'ciencia o espacio'}}])[0];
  assert.deepEqual(page.sources,['one']);assert.equal(page.filters.query,'ciencia o espacio');
});
test('La duración diferencia un extracto de un texto más largo',()=>{
  assert.deepEqual(readingEstimate({summary:'Un texto breve'}),{minutes:1,excerpt:true});
  assert.deepEqual(readingEstimate({content:'palabra '.repeat(450)}),{minutes:3,excerpt:false});
  assert.equal(readingEstimate({}),null);
});
