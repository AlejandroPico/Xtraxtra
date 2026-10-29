import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {pullDistance,shouldRefresh,isClosingSwipe} from '../lib/gestures.js';

test('Actualizar exige un arrastre vertical suficiente; no consume gestos horizontales',()=>{
  assert.equal(pullDistance({x:20,y:0},{x:120,y:40}),0);
  assert.equal(pullDistance({x:20,y:100},{x:20,y:20}),0);
  assert.equal(shouldRefresh(pullDistance({x:20,y:0},{x:22,y:70})),false);
  assert.equal(shouldRefresh(pullDistance({x:20,y:0},{x:22,y:150})),true);
  assert.equal(pullDistance({x:0,y:0},{x:0,y:1000}),110);
});
test('El menú se cierra hacia la izquierda y permite desplazarse por sus opciones',()=>{
  assert.equal(isClosingSwipe({x:220,y:80},{x:120,y:90}),true);
  assert.equal(isClosingSwipe({x:120,y:80},{x:220,y:90}),false);
  assert.equal(isClosingSwipe({x:220,y:80},{x:170,y:300}),false);
});
test('La aplicación instala iconos PNG reales, incluido el de iOS y el adaptable',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../manifest.webmanifest',import.meta.url)));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'./');assert.equal(manifest.id,'./');
  for(const icon of manifest.icons){
    const png=readFileSync(new URL('../'+icon.src,import.meta.url));
    assert.equal(png.toString('ascii',1,4),'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`,icon.sizes);
  }
  const apple=readFileSync(new URL('../icons/apple-touch-icon.png',import.meta.url));
  assert.equal(apple.readUInt32BE(16),180);
  assert.ok(manifest.icons.some(icon=>icon.purpose==='maskable'));
});
test('La caché conserva la edición sin multiplicar entradas por los parámetros de actualización',async()=>{
  const handlers={},cached=new Map();let offline=false;
  const cache={
    addAll:async urls=>{for(const url of urls){const path=new URL(url).pathname.slice('/Xtraxtra/'.length)||'index.html';assert.ok(existsSync(new URL('../'+path,import.meta.url)),path);cached.set(url,new Response(path));}},
    match:async key=>cached.get(typeof key==='string'?key:key.url)?.clone(),
    put:async(key,value)=>cached.set(typeof key==='string'?key:key.url,value),
  };
  const sandbox={URL,Request,Response,caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},fetch:async()=>{if(offline)throw new Error('offline');return new Response('latest news');},self:{location:{href:'https://example.test/Xtraxtra/service-worker.js'},addEventListener:(type,handler)=>handlers[type]=handler,skipWaiting:async()=>{},clients:{claim:async()=>{}}}};
  vm.runInNewContext(readFileSync(new URL('../service-worker.js',import.meta.url),'utf8'),sandbox);
  let installed;handlers.install({waitUntil:promise=>installed=promise});await installed;
  const request=async url=>{let response;handlers.fetch({request:new Request(url),respondWith:promise=>response=promise});return response;};
  await request('https://example.test/Xtraxtra/data/news.json?t=1');
  const count=cached.size;
  await request('https://example.test/Xtraxtra/data/news.json?t=2');assert.equal(cached.size,count);
  offline=true;
  assert.equal(await(await request('https://example.test/Xtraxtra/data/news.json?t=3')).text(),'latest news');
  assert.equal(await(await request('https://example.test/Xtraxtra/')).text(),'index.html');
  assert.equal(await request('https://example.test/OtherProject/'),undefined);
});
