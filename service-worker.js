const CACHE = 'extra-extra-v4';
const ROOT = new URL('./', self.location.href);
const FILES = ['./','index.html','styles.css','app.js','ui.js','lib/news.js','lib/gestures.js','lib/search.js','lib/edition.js','lib/preferences.js','favicon.png','favicon-32.png','favicon.ico','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png','data/sources.json','data/news.json'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(path=>new URL(path,ROOT).href))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('extra-extra-') && key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET' || url.origin!==ROOT.origin || !url.pathname.startsWith(ROOT.pathname))return;
  const relative=url.pathname.slice(ROOT.pathname.length);
  if(!FILES.includes(relative) && relative!=='')return;
  const canonical=new Request(url.origin+url.pathname);
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(event.request);
      if(!response.ok)throw new Error('Unavailable');
      // A full device cache must not hide a successful network response.
      await cache.put(canonical,response.clone()).catch(()=>{});
      return response;
    }catch{
      const saved=await cache.match(canonical);
      return saved || new Response('Sin conexión. Abre Extra Extra con conexión para guardar una edición.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});
    }
  })());
});
