import test from 'node:test';
import assert from 'node:assert/strict';
import {pageMetadata} from './page-metadata.mjs';
const page=node=>'<html><head><script type="application/ld+json">'+JSON.stringify(node)+'</script></head><body>Texto que no debe extraerse</body></html>';
test('Lee acceso y género declarados sin devolver el cuerpo del artículo',()=>{
 const result=pageMetadata(page({'@type':'OpinionNewsArticle',headline:'Opinión',url:'https://example.org/news',isAccessibleForFree:true,datePublished:'2026-10-30T10:00:00Z',dateModified:'2026-10-30T11:00:00Z',author:{name:'Autora'},articleBody:'TEXTO PRIVADO'}),'https://example.org/news');
 assert.equal(result.access,'open');assert.equal(result.type,'opinion');assert.deepEqual(result.authors,['Autora']);assert.equal(result.updated,'2026-10-30T11:00:00.000Z');assert.ok(!JSON.stringify(result).includes('TEXTO PRIVADO'));
});
test('Distingue acceso restringido y patrocinado y conserva citas seguras',()=>{
 const result=pageMetadata(page({'@type':'AdvertiserContentArticle',headline:'Artículo',isAccessibleForFree:false,citation:[{url:'https://doi.org/10.123/example',name:'Estudio'},'javascript:alert(1)'],isBasedOn:'https://university.example.org/study'}),'https://example.org/news');
 assert.equal(result.access,'restricted');assert.equal(result.type,'sponsored');assert.equal(result.references.length,2);assert.equal(result.references[0].relation,'citation');
});
test('No asigna el acceso de otro artículo enlazado a la página inspeccionada',()=>{
 const result=pageMetadata(page({'@type':'WebPage',url:'https://example.org/news',itemListElement:{'@type':'NewsArticle',url:'https://example.org/other',headline:'Otra noticia',isAccessibleForFree:true}}),'https://example.org/news');
 assert.equal(result.access,'unknown');assert.equal(result.type,'unknown');assert.deepEqual(result.references,[]);
});
test('Tolera JSON-LD roto sin ejecutar scripts y admite metadatos de fechas en la cabecera',()=>{
 const result=pageMetadata('<head><script type="application/ld+json">{not json}</script><script>throw new Error("no")</script><meta property="article:modified_time" content="2026-10-30T11:00:00Z"></head>','https://example.org/news');
 assert.equal(result.access,'unknown');assert.equal(result.updated,'2026-10-30T11:00:00.000Z');
});
