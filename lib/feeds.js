export const languages={es:'Español',ca:'Catalán',gl:'Gallego',eu:'Euskera',en:'Inglés',fr:'Francés',de:'Alemán',pt:'Portugués',it:'Italiano'};
export function feedURL(value,base) {
  if(typeof value!=='string'||!value.trim())return '';
  try{const u=new URL(value,base);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.href.length>2048)return '';u.hash='';return u.href;}catch{return '';}
}
export function sourceSettings(input={}) {
  const folders=(Array.isArray(input.folders)?input.folders:[]).filter(f=>f&&typeof f.id==='string'&&typeof f.name==='string').map(f=>({id:f.id.slice(0,80),name:f.name.trim().slice(0,60)})).filter(f=>f.id&&f.name);
  const custom=(Array.isArray(input.custom)?input.custom:[]).filter(s=>s&&typeof s.id==='string'&&s.id.startsWith('custom-')&&feedURL(s.feed)).map(s=>({id:s.id.slice(0,80),name:String(s.name||'Mi medio').slice(0,100),feed:feedURL(s.feed),url:feedURL(s.url)||new URL(s.feed).origin,language:languages[s.language]?s.language:'es',region:String(s.region||'Sin especificar').slice(0,80),category:String(s.category||'Actualidad').slice(0,60),kind:'personal'}));
  const cleanMap=(object,valid)=>Object.fromEntries(Object.entries(object&&typeof object==='object'?object:{}).filter(([k,v])=>k.length<=80&&k!=='__proto__'&&valid(v)).slice(0,300));
  return {custom:[...new Map(custom.map(s=>[s.feed,s])).values()].slice(0,120),folders:[...new Map(folders.map(f=>[f.id,f])).values()].slice(0,30),assignments:cleanMap(input.assignments,v=>folders.some(f=>f.id===v)),priorities:cleanMap(input.priorities,v=>v===true),overrides:cleanMap(input.overrides,v=>typeof v==='string'&&!!feedURL(v))};
}
export function mergeSources(catalog,settings){return [...catalog,...settings.custom.filter(s=>!catalog.some(c=>c.id===s.id||feedURL(c.feed)===s.feed))].map(s=>({...s,feed:settings.overrides[s.id]||s.feed}));}
export function keepNewerFeed(previous,incoming,originalFeed){return (previous?.feed||originalFeed)===incoming.feed&&Date.parse(previous?.lastSuccess)>Date.parse(incoming.lastSuccess);}
export function plainText(html,limit=18000) {
  const template=document.createElement('template');template.innerHTML=String(html||'');
  template.content.querySelectorAll('script,style,iframe,object,embed,svg,math').forEach(n=>n.remove());
  template.content.querySelectorAll('br,p,div,li,h2,h3').forEach(n=>n.before(document.createTextNode('\n')));
  return (template.content.textContent||'').replace(/[^\S\n]+/g,' ').replace(/\n\s*\n+/g,'\n\n').trim().slice(0,limit);
}
const child=(node,names)=>[...node.children].find(n=>names.includes(n.localName.toLowerCase())&&!/search.yahoo.com\/mrss/.test(n.namespaceURI||''));
const value=(node,names)=>child(node,names)?.textContent||'';
function markup(node){if(!node)return '';return node.children.length?[...node.childNodes].map(n=>new XMLSerializer().serializeToString(n)).join(''):node.textContent;}
export function parseXML(text,root) {
  if(/<!DOCTYPE|<!ENTITY/i.test(text.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g,'')))throw new Error('El archivo contiene declaraciones XML no admitidas.');
  const xml=new DOMParser().parseFromString(text,'application/xml');
  if(xml.querySelector('parsererror')||root&&!root.includes(xml.documentElement.localName.toLowerCase()))throw new Error('El archivo no tiene el formato esperado.');
  return xml;
}
export async function articleID(url){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(url));return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,20);}
export function feedMetadata(text,base) {
  const xml=parseXML(text,['rss','feed','rdf']),channel=xml.querySelector('channel')||xml.documentElement;
  const language=(value(channel,['language'])||xml.documentElement.getAttribute('xml:lang')||'').toLowerCase().split(/[-_]/)[0];
  const link=[...channel.children].find(n=>n.localName==='link'&&(!n.getAttribute('rel')||n.getAttribute('rel')==='alternate'));
  return {language:languages[language]?language:'',url:feedURL(link?.getAttribute('href')||link?.textContent,base)};
}
export async function parseFeed(text,source,now=Date.now()) {
  const xml=parseXML(text,['rss','feed','rdf']),channel=xml.querySelector('channel')||xml.documentElement;
  const declared=(value(channel,['language'])||xml.documentElement.getAttribute('xml:lang')||source.language||'es').toLowerCase().split(/[-_]/)[0];
  const language=languages[declared]?declared:source.language||'es';
  const nodes=[...xml.getElementsByTagNameNS('*','item'),...xml.getElementsByTagNameNS('*','entry')].slice(0,500);
  const articles=[];
  for(const item of nodes) {
    const title=plainText(value(item,['title']),500),links=[...item.children].filter(n=>n.localName==='link'),link=links.find(n=>!n.getAttribute('rel')||n.getAttribute('rel')==='alternate');
    const url=feedURL(link?.getAttribute('href')||link?.textContent||value(item,['guid']),source.url||source.feed);if(!title||!url)continue;
    const timestamp=Date.parse(value(item,['pubdate','published','date'])),modified=Date.parse(value(item,['updated','modified']));
    const latest=Number.isFinite(modified)?Math.max(modified,Number.isFinite(timestamp)?timestamp:0):timestamp;
    if(Number.isFinite(latest)&&latest<now-7*86400000)continue;
    const published=Number.isFinite(timestamp)&&timestamp<=now+600000?new Date(Math.min(timestamp,now)).toISOString():null;
    const updated=Number.isFinite(modified)&&modified<=now+600000?new Date(Math.min(modified,now)).toISOString():null;
    const rawBody=markup(child(item,['encoded','content']))||markup(child(item,['description','summary']));
    const template=document.createElement('template');template.innerHTML=rawBody;
    const references=[...template.content.querySelectorAll('a[href]')].map(a=>({url:feedURL(a.getAttribute('href'),url),label:plainText(a.textContent,180),relation:'link'})).filter(r=>r.url&&r.url!==url).slice(0,16);
    const origin=child(item,['source']);if(origin?.getAttribute('url'))references.unshift({url:feedURL(origin.getAttribute('url'),url),label:plainText(origin.textContent,180),relation:'source'});
    const authors=[...item.children].filter(n=>['creator','author'].includes(n.localName.toLowerCase())).map(n=>plainText(n.querySelector('name')?.textContent||n.textContent,160)).filter(Boolean).slice(0,8);
    const description=plainText(markup(child(item,['description','summary']))),body=plainText(markup(child(item,['encoded','content'])));
    const media=[...item.getElementsByTagName('*')].find(n=>['thumbnail','content','enclosure'].includes(n.localName)&&n.getAttribute('url')&&(!n.getAttribute('type')||n.getAttribute('type').startsWith('image/')));
    const photoCredit=[...item.getElementsByTagNameNS('*','credit')].filter(n=>/search.yahoo.com\/mrss/.test(n.namespaceURI||'')).map(n=>plainText(n.textContent,180)).filter(Boolean).join(' · ').slice(0,240);
    const photoCaption=[...item.getElementsByTagNameNS('*','description')].find(n=>/search.yahoo.com\/mrss/.test(n.namespaceURI||''))?.textContent||template.content.querySelector('figcaption')?.textContent||'';
    const bodyImage=(markup(child(item,['encoded','content','description']))||'').match(/<img\b[^>]*src=["']([^"']+)/i)?.[1];
    articles.push({id:await articleID(url),title,url,source:source.id,language,published,updated,authors,sourceLabel:origin?.textContent?.trim().slice(0,160)||'',references,editorialType:value(item,['type']).slice(0,80),summary:(description||body).slice(0,550),content:body,imageCredit:photoCredit,imageCaption:plainText(photoCaption,360),image:feedURL(media?.getAttribute('url')||bodyImage,source.url||source.feed),categories:[...item.children].filter(n=>n.localName==='category'&&!/search.yahoo.com\/mrss/.test(n.namespaceURI||'')).map(n=>n.getAttribute('term')||n.textContent).slice(0,12)});
  }
  return [...new Map(articles.map(a=>[a.url,a])).values()].sort((a,b)=>(b.published||'').localeCompare(a.published||'')).slice(0,45);
}
export function parseOPML(text) {
  const xml=parseXML(text,['opml']),feeds=[];
  for(const n of xml.querySelectorAll('outline')) {
    const feed=feedURL(n.getAttribute('xmlUrl'));if(!feed)continue;
    const path=[];let parent=n.parentElement;while(parent?.localName==='outline'){const name=parent.getAttribute('text')||parent.getAttribute('title');if(name)path.unshift(name);parent=parent.parentElement;}
    feeds.push({feed,name:(n.getAttribute('text')||n.getAttribute('title')||new URL(feed).hostname).slice(0,100),url:feedURL(n.getAttribute('htmlUrl'))||new URL(feed).origin,folder:path.join(' / ').slice(0,60)});
  }
  const seen=new Set();return feeds.filter(f=>{if(seen.has(f.feed))return false;seen.add(f.feed);return true;});
}
export async function openFeedDatabase(){return new Promise((resolve,reject)=>{const request=indexedDB.open('extra-extra-feeds',3);request.onupgradeneeded=()=>{for(const name of ['snapshots','observations','follows','translations'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'});};request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Cierra otras pestañas de Extra Extra para actualizar su almacenamiento.'));});}
const database=openFeedDatabase;
export async function readSnapshots(){try{const db=await database();return await new Promise(resolve=>{const request=db.transaction('snapshots').objectStore('snapshots').getAll();request.onsuccess=()=>{db.close();resolve(request.result);};request.onerror=()=>{db.close();resolve([]);};});}catch{return [];}}
export async function saveSnapshot(snapshot){const db=await database();await new Promise((resolve,reject)=>{const t=db.transaction('snapshots','readwrite');t.objectStore('snapshots').put(snapshot);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);}).finally(()=>db.close());}
export async function removeSnapshot(id){try{const db=await database(),t=db.transaction('snapshots','readwrite');t.objectStore('snapshots').delete(id);t.oncomplete=()=>db.close();t.onerror=()=>db.close();}catch{}}
