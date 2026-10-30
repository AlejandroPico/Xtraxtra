import {normalize,safeURL,score,groupArticles} from './news.js';
import {calendarKey} from './edition.js';
import {articleTime,canonicalURL} from './story-analysis.js';
import {matchesSearch} from './search.js';

export const translationLanguages={es:'Español',en:'Inglés',ca:'Catalán',gl:'Gallego',eu:'Euskera',fr:'Francés',de:'Alemán',pt:'Portugués',it:'Italiano'};
export const gestureActions={none:'Sin acción',save:'Guardar o retirar de Leer después',read:'Marcar como leída',pending:'Guardar como pendiente',context:'Abrir coberturas',next:'Leer la siguiente noticia'};
export function personalTags(value){return [...new Map((Array.isArray(value)?value:String(value||'').split(',')).filter(v=>typeof v==='string').map(v=>v.trim().slice(0,36)).filter(Boolean).map(v=>[normalize(v),v])).values()].slice(0,12);}
export function sanitizeLibrary(value={}){
  const collections=[...new Map((Array.isArray(value?.collections)?value.collections:[]).filter(c=>c&&typeof c.id==='string'&&typeof c.name==='string'&&c.name.trim()).map(c=>[c.id.slice(0,80),{id:c.id.slice(0,80),name:c.name.trim().slice(0,60)}])).values()].slice(0,30);
  const ids=new Set(collections.map(c=>c.id)),items={};
  for(const [id,row] of Object.entries(value?.items&&typeof value.items==='object'?value.items:{}).slice(0,5000))if(row&&id.length<=120&&!['__proto__','constructor','prototype'].includes(id))items[id]={collections:[...new Set((Array.isArray(row.collections)?row.collections:[]).filter(v=>ids.has(v)))].slice(0,30),tags:personalTags(row.tags)};
  return {collections,items};
}
export function libraryMatches(article,library,{collection='',tag=''}={}){
  const row=library.items[article.id]||{collections:[],tags:[]};
  return (!collection||(collection==='@none'?!row.collections.length:row.collections.includes(collection)))&&(!tag||row.tags.some(t=>normalize(t)===normalize(tag)));
}
const clock=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?value:'08:00';
const clamp=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):fallback;
export function sanitizeComfort(value={},importing=false){
  value=value&&typeof value==='object'?value:{};
  return {target:translationLanguages[value.target]?value.target:'es',engine:value.engine==='mymemory'?'mymemory':'local',bilingual:value.bilingual===true,translatedCards:value.translatedCards===true,voice:String(value.voice||'').slice(0,200),rate:clamp(value.rate,.6,1.8,1),audioNext:value.audioNext===true,swipeLeft:gestureActions[value.swipeLeft]?value.swipeLeft:'none',swipeRight:gestureActions[value.swipeRight]?value.swipeRight:'none',digestEnabled:value.digestEnabled===true,digestTime:clock(value.digestTime||'08:00'),systemAlerts:!importing&&value.systemAlerts===true,alertsEnabled:!importing&&value.alertsEnabled===true,alertQuery:String(value.alertQuery||'').trim().slice(0,300),alertSources:[...new Set((Array.isArray(value.alertSources)?value.alertSources:[]).filter(v=>typeof v==='string').map(v=>v.slice(0,100)))].slice(0,150),alertFollowed:value.alertFollowed===true,quietEnabled:value.quietEnabled!==false,quietStart:clock(value.quietStart||'22:00'),quietEnd:clock(value.quietEnd||'08:00'),alertInterval:clamp(value.alertInterval,5,120,15)};
}
export function sanitizeDigests(value){
  if(!Array.isArray(value))return [];
  return [...new Map(value.filter(d=>d&&/^\d{4}-\d{2}-\d{2}$/.test(d.day)&&Number.isFinite(Date.parse(d.day))&&Array.isArray(d.items)).map(d=>[d.day,{day:d.day,createdAt:Number.isFinite(Date.parse(d.createdAt))?d.createdAt:new Date().toISOString(),items:d.items.filter(a=>a&&typeof a.id==='string'&&typeof a.title==='string'&&safeURL(a.url)).slice(0,8).map(a=>({id:a.id.slice(0,120),title:a.title.slice(0,500),url:safeURL(a.url),source:String(a.source||'').slice(0,100),sourceName:String(a.sourceName||a.source||'').slice(0,120),category:String(a.category||'Actualidad').slice(0,60),language:translationLanguages[a.language]?a.language:'es',excerpt:String(a.excerpt||'').slice(0,321),published:Number.isFinite(Date.parse(a.published))?a.published:null,updated:Number.isFinite(Date.parse(a.updated))?a.updated:null,references:(Array.isArray(a.references)?a.references:[]).filter(r=>r&&safeURL(r.url)).slice(0,5).map(r=>({url:safeURL(r.url),sourceName:String(r.sourceName||'Referencia').slice(0,120)}))}))}])).values()].sort((a,b)=>a.day.localeCompare(b.day)).slice(-7);
}
export function quietNow(settings,date=new Date()){
  if(!settings.quietEnabled)return false;
  const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3)),now=date.getHours()*60+date.getMinutes(),start=minutes(settings.quietStart),end=minutes(settings.quietEnd);
  return start===end|| (start<end?now>=start&&now<end:now>=start||now<end);
}
export function digestDue(settings,lastDay,date=new Date()){
  const time=date.getHours()*60+date.getMinutes(),[h,m]=settings.digestTime.split(':').map(Number);
  return settings.digestEnabled&&lastDay!==calendarKey(date)&&time>=h*60+m;
}
export function digestEdition(articles,{day=calendarKey(new Date()),sourceFor=a=>({name:a.source}),categoryFor=()=> 'Actualidad',limit=8,now=Date.now()}={}){
  const eligible=articles.filter(a=>articleTime(a)&&calendarKey(new Date(articleTime(a)))===day&&safeURL(a.url)),urls=new Set(),pool=groupArticles(eligible,true).map(c=>({...c.articles[0],digestScore:score(c,now),digestReferences:c.articles.slice(1).filter(a=>a.source!==c.articles[0].source).slice(0,5).map(a=>({url:a.url,sourceName:sourceFor(a).name}))})).sort((a,b)=>b.digestScore-a.digestScore),chosen=[],counts=new Map(),categories=new Map();
  while(pool.length&&chosen.length<limit){
    pool.sort((a,b)=>(counts.get(a.source)||0)-(counts.get(b.source)||0)||(categories.get(categoryFor(a))||0)-(categories.get(categoryFor(b))||0));
    const article=pool.shift(),url=canonicalURL(article.url);if(urls.has(url))continue;urls.add(url);
    const section=categoryFor(article);counts.set(article.source,(counts.get(article.source)||0)+1);categories.set(section,(categories.get(section)||0)+1);
    const excerpt=String(article.summary||article.content||'').replace(/\s+/g,' ').trim();
    chosen.push({id:article.id,title:String(article.title).slice(0,500),url:article.url,source:article.source,sourceName:sourceFor(article).name,language:article.language||'es',category:section,references:article.digestReferences,excerpt:excerpt.slice(0,320)+(excerpt.length>320?'…':''),published:article.published||null,updated:article.updated||null});
  }
  return {day,createdAt:new Date(now).toISOString(),items:chosen};
}
export function alertMatches(article,settings,{followed=false}={}){
  const query=!!settings.alertQuery&&matchesSearch(article.title+' '+(article.summary||''),settings.alertQuery),source=settings.alertSources.includes(article.source);
  return query||source||(settings.alertFollowed&&followed);
}
export function newAlerts(articles,seen,settings,{now=Date.now(),followed=()=>false}={}){
  if(!settings.alertsEnabled)return [];
  const urls=new Set();return articles.filter(a=>{const url=canonicalURL(a.url),date=articleTime(a);if(!url||urls.has(url)||seen.has(url)||!date||now-date>24*3600000||date>now+600000||!alertMatches(a,settings,{followed:followed(a)}))return false;urls.add(url);return true;});
}
export function swipeAction(start,end,settings){
  const dx=end.x-start.x,dy=Math.abs(end.y-start.y);if(Math.abs(dx)<75||Math.abs(dx)<dy*1.7)return 'none';return dx<0?settings.swipeLeft:settings.swipeRight;
}
export function splitUTF8(text,max=480){
  const result=[];let current='',size=0;const encoder=new TextEncoder();
  for(const char of String(text)){const bytes=encoder.encode(char).length;if(size+bytes>max){const space=current.lastIndexOf(' ');if(space>current.length*.5){result.push(current.slice(0,space+1));current=current.slice(space+1);size=encoder.encode(current).length;}else{result.push(current);current='';size=0;}}current+=char;size+=bytes;}
  if(current)result.push(current);return result;
}
export function speechChunks(text,max=220){return splitUTF8(String(text).replace(/\s+/g,' ').trim(),max).filter(t=>t.trim());}
export function translationParts(article,engine='local',full=true){
  const original=String(full?(article.content||article.summary||''):(article.summary||'').replace(/\s+/g,' '));
  const cap=full?(engine==='mymemory'?3800:18000):320;
  const text=original.slice(0,cap),parts=text.split(/\n+/).map(t=>t.trim()).filter(Boolean);
  return {title:String(article.title||'').slice(0,500),parts,partial:original.length>cap};
}
