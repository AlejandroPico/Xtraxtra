import test from 'node:test';
import assert from 'node:assert/strict';
import {coverageMatch,groupRelated,variantGroups,agencyCredits,contentKind,uniqueDetails,rankingReasons} from '../lib/story-analysis.js';
import {observeArticle,timelineFor,sanitizeWatches,belongsToWatch,storyKey} from '../lib/story-store.js';
const now='2026-10-30T12:00:00Z';
const make=(id,title,more={})=>({id,title,url:'https://example.org/'+id,source:id,language:'es',published:now,summary:'',content:'',categories:[],...more});

test('Relaciona paráfrasis sobre un mismo suceso sin exigir titulares casi idénticos',()=>{
 const a=make('one','Pedro Sánchez convoca elecciones generales en España');
 const b=make('two','Sánchez anuncia nuevos comicios: habrá elecciones en España');
 assert.ok(coverageMatch(a,b).score>=.7);assert.equal(groupRelated([a,b]).length,1);
});
test('Relaciona español, inglés y francés por entidades y suceso, sin confundir otros protagonistas',()=>{
 const a=make('one','Pedro Sánchez convoca elecciones en España');
 const en=make('en','Sánchez calls elections in Spain',{language:'en'});
 const fr=make('fr','Sánchez annonce des élections en Espagne',{language:'fr'});
 assert.equal(groupRelated([a,en,fr]).length,1);
 assert.equal(coverageMatch(a,make('other','Macron announces elections in France',{language:'en'})).score,0);
});
test('Un tema y un nombre comunes no bastan: conserva separación por acción, cifras, lugar y tiempo',()=>{
 const a=make('one','Sánchez convoca elecciones en Madrid');
 for(const b of [make('other','Sánchez gana las elecciones en Madrid'),make('other','Sánchez convoca elecciones en Toledo'),make('other',a.title,{published:'2026-10-20T12:00:00Z'})])assert.equal(coverageMatch(a,b).score,0);
 assert.equal(coverageMatch(make('a','Un accidente de tren deja 15 muertos en Toledo'),make('b','Un accidente de tren deja 27 muertos en Toledo')).score,0);
});
test('Reconoce una relación municipio-provincia únicamente si el texto la declara',()=>{
 const a=make('a','Accidente de tren en Urda',{summary:'El siniestro ocurrió en Urda (Toledo).'}),b=make('b','El accidente de tren en Toledo');
 assert.ok(coverageMatch(a,b).score>0);
 assert.equal(coverageMatch({...a,summary:''},b).score,0);
});
test('Agrupa noticias tecnológicas entre idiomas y normaliza solo parámetros de seguimiento',()=>{
 assert.equal(groupRelated([make('a','La NASA lanza un telescopio'),make('b','NASA launches a telescope',{language:'en'})]).length,1);
 const a=make('a','Titular',{url:'https://example.org/story?id=2&utm_source=x'}),b=make('b','Titular',{url:'https://example.org/story?id=2'}),c=make('c','Titular diferente',{url:'https://example.org/story?id=3'});
 assert.equal(groupRelated([a,b,c],false).length,2);
});
test('Los textos coincidentes se detectan sobre el RSS, con créditos de agencia explícitos',()=>{
 const text='La misión científica presentó los resultados durante una rueda de prensa celebrada en el centro de investigación. '.repeat(12);
 const a=make('a','Una misión científica',{content:text,authors:['Agencia EFE']}),b=make('b','Los resultados de la misión',{content:text,authors:['EFE']}),c=make('c','Otro análisis',{content:'Otra información distinta sobre métodos y decisiones de científicos y universidades. '.repeat(20)});
 assert.equal(variantGroups({articles:[a,b,c]}).length,2);assert.equal(variantGroups({articles:[a,{...b,content:'Actualización: '+text}]}).length,1);assert.deepEqual(agencyCredits(a),['EFE']);
 assert.equal(variantGroups({articles:[make('x','Mismo titular'),make('y','Mismo titular')]}).length,2);
});
test('Distingue etiquetas editoriales sin asignar opinión o acceso por defecto',()=>{
 assert.equal(contentKind(make('a','La opinión de los vecinos cambia')).type,'unknown');
 assert.equal(contentKind(make('a','Patrocinadores del teatro')).type,'unknown');
 assert.equal(contentKind(make('a','Un titular',{categories:['Opinión']})).type,'opinion');
 assert.equal(contentKind(make('a','Un titular',{editorialType:'AdvertiserContentArticle'})).type,'sponsored');
 assert.equal(contentKind(make('a','Un titular',{publicMetadata:{type:'news',access:'restricted'}})).type,'news');
});
test('Los detalles propios son extractos literales y no hechos inventados',()=>{
 const own='Los equipos instalarán 24 sensores nuevos en los puentes del municipio antes de diciembre.',common='La investigación sigue abierta mientras se estudian las causas del incidente.';
 const a=make('a','Titular',{content:common+' '+own}),b=make('b','Titular',{content:common});
 assert.ok(uniqueDetails(a,[b]).includes(own));assert.deepEqual(uniqueDetails(b,[a]),[]);
});
test('Una observación local no se transforma en una fecha de actualización del editor',()=>{
 const a=make('a','Titular',{summary:'Primer texto disponible.'}),first=observeArticle(null,a,'2026-10-30T12:01:00Z');
 const next=observeArticle(first,{...a,title:'Titular corregido'},'2026-10-30T12:10:00Z');
 assert.equal(next.updated,null);assert.equal(next.events[0].kind,'observed');assert.equal(next.events[0].at,'2026-10-30T12:10:00Z');
 const same=observeArticle(next,{...a,title:'Titular corregido'},'2026-10-30T12:20:00Z');assert.equal(same.events.length,1);
});
test('La cronología diferencia publicaciones, actualizaciones y cambios detectados',()=>{
 const a=make('a','Titular',{updated:'2026-10-30T12:05:00Z'}),row=observeArticle(null,a,'2026-10-30T12:06:00Z'),next=observeArticle(row,{...a,title:'Otro titular'},'2026-10-30T12:10:00Z');
 const timeline=timelineFor([a],()=>next);assert.deepEqual(timeline.map(e=>e.kind),['published','updated','observed']);
});
test('El seguimiento guarda su semilla, admite novedades y respeta las exclusiones locales',()=>{
 const a=make('a','Sánchez convoca elecciones en España'),b=make('b','Sánchez calls elections in Spain',{language:'en'}),record={id:'story-one',title:'Elecciones',created:now,articles:[a],seeds:[a],excluded:[],seen:{}};
 assert.equal(belongsToWatch(record,b),true);assert.equal(belongsToWatch({...record,excluded:[storyKey(b)]},b),false);
 assert.equal(sanitizeWatches([record,{id:'bad',title:'Mal',articles:[{id:'bad',source:'bad',title:'X',url:'javascript:alert(1)'}]}]).length,1);
});
test('La explicación de prioridad refleja los factores y el orden elegidos',()=>{
 const reasons=rankingReasons({articles:[make('a','Titular')]},{now:Date.parse(now),prioritySources:{a:true},nearby:'es-md',nearbyMatches:true,order:'relevance',position:3});
 assert.match(reasons.join(' '),/Posición 3/);assert.match(reasons.join(' '),/1,3/);assert.match(reasons.join(' '),/1,4/);assert.match(reasons.join(' '),/relevancia/);const chronological=rankingReasons({articles:[make('a','Titular')]},{prioritySources:{a:true},order:'newest'});assert.ok(!chronological.join(' ').includes('×1,3'));
});
