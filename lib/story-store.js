import {openFeedDatabase} from './feeds.js';
import {canonicalURL,norm,coverageMatch,articleTime,storyTitleFor} from './story-analysis.js';

export const storyKey=article=>`${article.source}:${canonicalURL(article.url)}`;
const iso=value=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
function fingerprint(article){return norm(article.title)+'\n'+norm(article.content||article.summary).slice(0,6000);}
function materiallyChanged(before,after){
  if(before===after)return false;const [oldTitle,...oldBody]=before.split('\n'),[newTitle,...newBody]=after.split('\n');
  if(oldTitle!==newTitle)return true;
  const a=oldBody.join(' '),b=newBody.join(' ');if(!a||!b||a.startsWith(b)||b.startsWith(a))return false;
  return true;
}
export function observeArticle(previous,article,now=new Date().toISOString()){
  const signature=fingerprint(article),published=iso(article.published),updated=iso(article.updated);
  if(!previous)return {id:storyKey(article),firstSeen:now,lastSeen:now,published,updated,signature,publicMetadata:article.publicMetadata||null,events:[]};
  if(updated&&previous.updated&&Date.parse(updated)<Date.parse(previous.updated))return previous;
  const events=[...previous.events];
  if(materiallyChanged(previous.signature,signature))events.push({kind:'observed',at:now,title:String(article.title).slice(0,500),excerpt:String(article.summary||'').slice(0,300)});
  return {...previous,lastSeen:now,published:published||previous.published,updated:updated||previous.updated,publicMetadata:article.publicMetadata||previous.publicMetadata,signature,events:events.slice(-12)};
}
export function archivedArticle(article,sourceName=''){
  return {...article,id:String(article.id).slice(0,100),title:String(article.title).slice(0,500),source:String(article.source).slice(0,100),url:canonicalURL(article.url),summary:String(article.summary||'').slice(0,550),content:String(article.content||'').slice(0,6000),archivedExcerpt:String(article.content||'').length>6000,sourceName:sourceName||article.sourceName||article.source,authors:(article.authors||[]).filter(a=>typeof a==='string').slice(0,8),references:(article.references||[]).filter(r=>canonicalURL(r.url)).slice(0,8),categories:(article.categories||[]).filter(c=>typeof c==='string').slice(0,12)};
}
export function sanitizeWatches(input){
  if(!Array.isArray(input))return [];
  return input.filter(w=>w&&typeof w.id==='string'&&typeof w.title==='string'&&Array.isArray(w.articles)).map(w=>{
    const articles=w.articles.filter(a=>a&&typeof a.id==='string'&&typeof a.title==='string'&&typeof a.source==='string'&&a.url?.length<=2048&&canonicalURL(a.url)).slice(-40).map(a=>archivedArticle(a));
    const keys=new Set(articles.map(storyKey));
    return {id:w.id.slice(0,100),title:w.title.slice(0,120),created:iso(w.created)||new Date().toISOString(),articles,seeds:(Array.isArray(w.seeds)?w.seeds:articles.slice(0,3)).filter(a=>a&&typeof a.title==='string'&&canonicalURL(a.url)).slice(0,3).map(a=>archivedArticle(a)),seen:Object.fromEntries(Object.entries(w.seen||{}).filter(([k,v])=>keys.has(k)&&typeof v==='string').map(([k,v])=>[k,v.slice(0,7000)])),excluded:(Array.isArray(w.excluded)?w.excluded:[]).filter(s=>typeof s==='string').slice(-100)};
  }).filter(w=>w.articles.length).slice(-30);
}
export function belongsToWatch(watch,article){
  const key=storyKey(article);if(watch.excluded.includes(key))return false;
  if(watch.articles.some(a=>storyKey(a)===key))return true;
  if(articleTime(article)&&articleTime(article)<Date.parse(watch.created)-36*3600000)return false;
  return watch.seeds.some(seed=>coverageMatch(seed,article,{ignoreTime:true}).score>=.72);
}
export function watchUnread(watch){return watch.articles.filter(a=>watch.seen[storyKey(a)]!==fingerprint(a)).length;}
async function readAll(name){const db=await openFeedDatabase();return new Promise((resolve,reject)=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>{db.close();resolve(r.result);};r.onerror=()=>{db.close();reject(r.error);};});}
async function writeRows(name,rows,remove=[]){if(!rows.length&&!remove.length)return;const db=await openFeedDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(name,'readwrite'),store=tx.objectStore(name);for(const row of rows)store.put(row);for(const id of remove)store.delete(id);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error);};});}
export function createStoryStore({sourceName=a=>a.source,warn=()=>{}}={}){
  const observations=new Map();let watches=[],queue=Promise.resolve(),ready=false,warned=false;
  function storageError(){if(!warned){warned=true;warn('No se han podido guardar las historias en este navegador. Los cambios durarán esta sesión.');}}
  function enqueue(task){queue=queue.then(task).catch(storageError);return queue;}
  async function init(){try{const [history,stored]=await Promise.all([readAll('observations'),readAll('follows')]);for(const row of history)if(row?.id&&typeof row.signature==='string')observations.set(row.id,{...row,events:Array.isArray(row.events)?row.events.slice(-12):[]});watches=sanitizeWatches(stored);}catch{storageError();}ready=true;}
  async function observe(articles){return enqueue(async()=>{
    const now=new Date().toISOString(),changed=[];
    for(const article of articles){const id=storyKey(article),before=observations.get(id),row=observeArticle(before,article,now);observations.set(id,row);if(!before||row.signature!==before.signature||row.updated!==before.updated||row.publicMetadata?.checkedAt!==before.publicMetadata?.checkedAt)changed.push(row);}
    const stale=[...observations.values()].sort((a,b)=>Date.parse(b.lastSeen)-Date.parse(a.lastSeen)).slice(3000).map(r=>r.id);for(const id of stale)observations.delete(id);
    for(const watch of watches){const byKey=new Map(watch.articles.map(a=>[storyKey(a),a]));for(const article of articles)if(belongsToWatch(watch,article)){if([...byKey.values()].some(a=>canonicalURL(a.url)===canonicalURL(article.url)&&a.source!==article.source))continue;const row=observations.get(storyKey(article));byKey.set(storyKey(article),{...archivedArticle(article,sourceName(article)),firstSeen:row?.firstSeen,changes:row?.events||[]});}watch.articles=[...byKey.values()].sort((a,b)=>articleTime(a)-articleTime(b)).slice(-40);const keys=new Set(watch.articles.map(storyKey));watch.seen=Object.fromEntries(Object.entries(watch.seen).filter(([key])=>keys.has(key)));}
    await writeRows('observations',changed,stale);await writeRows('follows',watches);
  });}
  function follow(cluster){
    if(!ready)throw new Error('Las historias todavía se están cargando.');
    const existing=find(cluster);if(existing)return existing;
    if(watches.length>=30)throw new Error('Puedes seguir hasta 30 historias.');
    const now=new Date().toISOString(),articles=cluster.articles.slice(0,40).map(a=>{const row=observations.get(storyKey(a));return {...archivedArticle(a,sourceName(a)),firstSeen:row?.firstSeen,changes:row?.events||[]};});
    const watch={id:'story-'+crypto.randomUUID(),title:storyTitleFor(cluster),created:now,articles,seeds:articles.slice(0,3),seen:Object.fromEntries(articles.map(a=>[storyKey(a),fingerprint(a)])),excluded:[]};watches.push(watch);enqueue(()=>writeRows('follows',[watch]));return watch;
  }
  function find(cluster){return watches.find(w=>cluster.articles.some(a=>w.articles.some(b=>storyKey(a)===storyKey(b))));}
  function remove(id){watches=watches.filter(w=>w.id!==id);return enqueue(()=>writeRows('follows',[],[id]));}
  function seen(id,article=null){const watch=watches.find(w=>w.id===id);if(!watch)return;for(const a of article?[article]:watch.articles){const stored=watch.articles.find(b=>storyKey(a)===storyKey(b));watch.seen[storyKey(a)]=fingerprint(stored||archivedArticle(a));}return enqueue(()=>writeRows('follows',[watch]));}
  function exclude(id,key){const w=watches.find(w=>w.id===id);if(!w)return;w.excluded=[...new Set([...w.excluded,key])].slice(-100);w.articles=w.articles.filter(a=>storyKey(a)!==key);delete w.seen[key];return enqueue(()=>writeRows('follows',[w]));}
  function rename(id,title){const w=watches.find(w=>w.id===id);if(w&&title.trim()){w.title=title.trim().slice(0,120);return enqueue(()=>writeRows('follows',[w]));}}
  function importWatches(items){const imported=sanitizeWatches(items);watches=sanitizeWatches([...new Map([...watches,...imported].map(w=>[w.id,w])).values()]);return enqueue(()=>writeRows('follows',watches));}
  return {init,observe,follow,find,remove,seen,exclude,rename,importWatches,get watches(){return watches;},get ready(){return ready;},observation:article=>observations.get(storyKey(article))};
}
export function timelineFor(articles,observation=()=>null){
  const events=[],seen=new Set();
  for(const a of articles){const row=observation(a);if(a.published)events.push({kind:'published',at:a.published,article:a});
    if(a.updated&&Date.parse(a.updated)!==Date.parse(a.published))events.push({kind:'updated',at:a.updated,article:a});
    const meta=a.publicMetadata;
    if(meta?.published&&Date.parse(meta.published)!==Date.parse(a.published))events.push({kind:'web-published',at:meta.published,article:a});
    if(meta?.updated&&Date.parse(meta.updated)!==Date.parse(a.updated)&&Date.parse(meta.updated)!==Date.parse(meta.published))events.push({kind:'web-updated',at:meta.updated,article:a});
    const updated=a.updated||meta?.updated;
    for(const event of row?.events||a.changes||[])events.push({...event,article:a});
    if(!a.published&&!updated&&(row?.firstSeen||a.firstSeen))events.push({kind:'detected',at:row?.firstSeen||a.firstSeen,article:a});}
  return events.filter(e=>{const key=storyKey(e.article)+e.kind+e.at;if(!iso(e.at)||seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
}
