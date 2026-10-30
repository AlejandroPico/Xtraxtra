const CACHE = 'extra-extra-v8';
const ROOT = new URL('./', self.location.href);
const FILES = ['./','index.html','styles.css','app.js','ui.js','lib/news.js','lib/gestures.js','lib/search.js','lib/edition.js','lib/preferences.js','lib/feeds.js','lib/reading-tools.js','lib/translation.js','lib/reader-tools.js','lib/library-view.js','lib/daily-tools.js','lib/story-analysis.js','lib/story-store.js','lib/coverage-view.js','lib/geography.js','lib/world-territories.js','lib/media-panel.js','favicon.png','favicon-32.png','favicon.ico','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png','data/sources.json','data/news.json'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(path=>new Request(new URL(path,ROOT).href,{cache:'no-cache'})))).then(()=>self.skipWaiting()));
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
      // Revalidate the HTTP cache as well as our offline cache after a deployment.
      const response=await fetch(event.request,{cache:'no-cache'});
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

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const client=windows.find(c=>{const url=new URL(c.url);return url.origin===ROOT.origin&&url.pathname.startsWith(ROOT.pathname);});
    if(client){await client.focus();client.postMessage({type:'extra-extra-alerts'});}
    else await self.clients.openWindow(new URL('./?view=alerts',ROOT).href);
  })());
});
