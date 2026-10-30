import test from 'node:test';
import assert from 'node:assert/strict';
import {publicURL,isPublicAddress,advertisedFeeds,looksLikeFeed,handleRSS,retrieve,getFeed} from './rss-service.mjs';
test('El servicio rechaza destinos privados, credenciales, puertos y esquemas extraños',()=>{
 for(const url of ['http://127.0.0.1','http://2130706433','http://0x7f000001','http://[::1]','http://localhost','http://metadata.internal','https://user:pw@example.org','https://example.org:444','file:///etc/passwd'])assert.throws(()=>publicURL(url),url);
 assert.equal(publicURL('/rss','https://www.bbc.com'),'https://www.bbc.com/rss');
 for(const ip of ['10.0.0.2','172.16.0.1','192.168.1.2','169.254.169.254','100.64.1.2','127.0.0.1','::1','fe80::1','2001:db8::1'])assert.equal(isPublicAddress(ip),false,ip);
 assert.equal(isPublicAddress('1.1.1.1'),true);assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
});
test('Descubrimiento de RSS y Atom: enlaces relativos y sin duplicados',()=>{
 const html='<link rel="alternate" type="application/rss+xml" href="/rss" title="Noticias"><link rel="alternate" type="application/atom+xml" href="/atom"><link rel="alternate" type="application/rss+xml" href="/rss">';
 assert.deepEqual(advertisedFeeds(html,'https://example.org').map(f=>f.url),['https://example.org/rss','https://example.org/atom']);
 assert.equal(looksLikeFeed('<html><body>No RSS</body></html>'),false);assert.equal(looksLikeFeed('<!DOCTYPE rss><rss/>'),false);assert.equal(looksLikeFeed('<rss><channel><description><![CDATA[<!DOCTYPE html>]]></description></channel></rss>'),true);
});
test('CORS permite el portal, rechaza otros orígenes y no abre escritura',async()=>{
 let r=await handleRSS(new Request('https://service.example.org/api/health',{headers:{Origin:'https://alejandropico.github.io'}}),'health');assert.equal(r.status,200);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://alejandropico.github.io');
 r=await handleRSS(new Request('https://service.example.org/api/health',{headers:{Origin:'https://unrelated.example.org'}}),'health');assert.equal(r.status,403);
 r=await handleRSS(new Request('https://service.example.org/api/feed',{method:'POST'}),'feed');assert.equal(r.status,405);
});
test('Comprueba DNS y redirecciones, limita tamaño, reutiliza la caché diez minutos y conserva la edición si falla el medio',async()=>{
 const original=globalThis.fetch,clock=Date.now;let network=0,fail=false,mode='rss';
 globalThis.fetch=async url=>{const u=String(url);if(u.startsWith('https://cloudflare-dns.com'))return Response.json({Answer:[{type:1,data:mode==='private'?'10.0.0.1':'1.1.1.1'}]});network++;if(fail)throw new Error('Origen caído');if(mode==='redirect')return new Response(null,{status:302,headers:{Location:'http://127.0.0.1/secret'}});return new Response('<rss><channel><title>Test</title></channel></rss>');};
 try{
  mode='private';await assert.rejects(retrieve('https://private.example.org/rss'),/pública/);assert.equal(network,0);
  mode='redirect';await assert.rejects(retrieve('https://redirect.example.org/rss'),/públicas/);
  mode='rss';await assert.rejects(retrieve('https://large.example.org/rss',5),/tamaño/);
  network=0;const a=await getFeed('https://feed.example.org/rss'),b=await getFeed('https://feed.example.org/rss');assert.equal(a.cached,false);assert.equal(b.cached,true);assert.equal(network,1);
  Date.now=()=>clock()+601000;fail=true;const stale=await getFeed('https://feed.example.org/rss');assert.equal(stale.stale,true);assert.equal(stale.fetchedAt,a.fetchedAt);assert.match(stale.error,/caído/);
 }finally{globalThis.fetch=original;Date.now=clock;}
});
