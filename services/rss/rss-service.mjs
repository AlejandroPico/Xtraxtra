import {pageMetadata} from './page-metadata.mjs';
// Public RSS and publisher metadata only. Never forward cookies or credentials.
export const FRESH_MS=600000;
const memory=new Map();
let memoryBytes=0;
const memorySize=value=>(value.xml?.length||0)*2+1024;
const origins=new Set(['https://alejandropico.github.io','http://127.0.0.1:4173','http://localhost:4173']);
export function publicURL(value,base) {
  let u;try{u=new URL(value,base);}catch{throw new Error('Dirección no válida.');}
  const h=u.hostname.toLowerCase();
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||u.href.length>2048||!h.includes('.')||!/^[a-z0-9.-]+$/.test(h)||/^[\d.]+$/.test(h)||/(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/.test(h))throw new Error('Solo se admiten webs públicas sin credenciales ni puertos especiales.');
  u.hash='';return u.href;
}
export function isPublicAddress(ip) {
  if(ip.includes(':'))return /^(?:2|3)[0-9a-f]{0,3}:/i.test(ip)&&!/^2001:(?:db8|0|10|20):/i.test(ip)&&!/^2002:/i.test(ip);
  const p=ip.split('.').map(Number);if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
  return !(p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&(p[1]===168||p[1]===0||p[1]===2)||p[0]===100&&p[1]>=64&&p[1]<=127||p[0]===198&&(p[1]===18||p[1]===19||p[1]===51)||p[0]===203&&p[1]===0&&p[2]===113);
}
async function checkDNS(host,signal) {
  const r=await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`,{headers:{Accept:'application/dns-json'},signal});
  if(!r.ok)throw new Error('No se ha podido comprobar el dominio.');
  const data=await r.json(),ips=(data.Answer||[]).filter(a=>a.type===1||a.type===28);
  if(!ips.length||ips.some(a=>!isPublicAddress(a.data)))throw new Error('El dominio no corresponde a una web pública accesible.');
}
export async function retrieve(value,maxBytes=4000000,headOnly=false) {
  let url=publicURL(value);const signal=AbortSignal.timeout(14000);
  for(let i=0;i<=4;i++) {
    await checkDNS(new URL(url).hostname,signal);
    const r=await fetch(url,{redirect:'manual',signal,headers:{'User-Agent':'ExtraExtra/2.0 (+https://github.com/AlejandroPico/Xtraxtra)',Accept:'application/rss+xml,application/atom+xml,application/xml,text/xml,text/html;q=0.8'}});
    if([301,302,303,307,308].includes(r.status)){await r.body?.cancel();url=publicURL(r.headers.get('Location'),url);continue;}
    if(!r.ok){await r.body?.cancel();throw new Error(`El servidor responde HTTP ${r.status}.`);}
    const reader=r.body?.getReader();if(!reader)throw new Error('Respuesta vacía.');
    let length=0,tail='';const chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;chunks.push(value);if(headOnly){const part=tail+new TextDecoder().decode(value);tail=part.slice(-20);if(length>=maxBytes||/<\/head\s*>/i.test(part)){await reader.cancel();break;}}else if(length>maxBytes){await reader.cancel();throw new Error('El canal supera el tamaño permitido.');}}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const hint=new TextDecoder().decode(bytes.slice(0,300)),charset=r.headers.get('content-type')?.match(/charset=["']?([\w-]+)/i)?.[1]||hint.match(/<\?xml[^>]*encoding=["']([^"']+)/i)?.[1]||'utf-8';
    let text;try{text=new TextDecoder(charset).decode(bytes);}catch{text=new TextDecoder().decode(bytes);}
    return {url,text};
  }
  throw new Error('Demasiadas redirecciones.');
}
export function looksLikeFeed(text){return !/<!DOCTYPE|<!ENTITY/i.test(text.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g,''))&&/<(?:rss\b|feed\b|rdf:RDF\b)/i.test(text.slice(0,3000))&&!/<html\b/i.test(text.slice(0,1000));}
function titleOf(text){return (text.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1]||'Canal RSS').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,'').slice(0,160);}
async function keyFor(url){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(url));return new Request('https://rss-cache.invalid/'+Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join(''));}
async function readCache(k){try{if(globalThis.caches?.default)return await (await caches.default.match(k))?.json();}catch{}return memory.get(k.url);}
async function writeCache(k,v){try{if(globalThis.caches?.default){await caches.default.put(k,new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=86400'}}));return;}}catch{}if(memory.has(k.url)){memoryBytes-=memorySize(memory.get(k.url));memory.delete(k.url);}
  const size=memorySize(v);while(memory.size&&(memory.size>=32||memoryBytes+size>12*1024*1024)){const first=memory.keys().next().value;memoryBytes-=memorySize(memory.get(first));memory.delete(first);}
  if(size<=12*1024*1024){memory.set(k.url,v);memoryBytes+=size;}}
export async function getFeed(value) {
  const url=publicURL(value),key=await keyFor(url),old=await readCache(key),now=Date.now();
  if(old&&now-Date.parse(old.fetchedAt)<FRESH_MS)return {...old,cached:true,stale:false};
  if(old?.lastAttempt&&now-old.lastAttempt<60000)return {...old,cached:true,stale:true};
  try {
    const r=await retrieve(url);if(!looksLikeFeed(r.text))throw new Error('La dirección no ofrece un RSS o Atom válido.');
    const v={url:r.url,xml:r.text,title:titleOf(r.text),fetchedAt:new Date().toISOString()};await writeCache(key,v);return {...v,cached:false,stale:false};
  }catch(error){if(old&&now-Date.parse(old.fetchedAt)<86400000){const v={...old,lastAttempt:now,error:error.name==='TimeoutError'?'El medio ha tardado demasiado en responder.':error.message};await writeCache(key,v);return {...v,cached:true,stale:true};}throw error;}
}
export function advertisedFeeds(html,base) {
  const results=[],attr=(tag,name)=>tag.match(new RegExp('\\b'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i'))?.slice(1).find(v=>v!==undefined)||'';
  for(const tag of html.match(/<link\b[^>]*>/gi)||[]) {
    if(!/alternate/i.test(attr(tag,'rel'))||!/(rss|atom)/i.test(attr(tag,'type')))continue;
    try{const url=publicURL(attr(tag,'href').replace(/&amp;/g,'&'),base);if(!results.some(x=>x.url===url))results.push({url,title:attr(tag,'title').slice(0,160)});}catch{}
  }
  if(!results.length)for(const tag of html.match(/<a\b[^>]*>/gi)||[]) {
    const href=attr(tag,'href');if(!/(?:feed|rss|\.xml)(?:\/|\?|$)/i.test(href))continue;
    try{const url=publicURL(href.replace(/&amp;/g,'&'),base);if(!results.some(x=>x.url===url))results.push({url,title:''});}catch{}
    if(results.length>=6)break;
  }
  return results.slice(0,6);
}
export async function discover(value) {
  const r=await retrieve(publicURL(value));if(looksLikeFeed(r.text))return [{url:r.url,title:titleOf(r.text)}];
  const candidates=advertisedFeeds(r.text,r.url);
  if(!candidates.length){const site=new URL(r.url);for(const path of ['/feed/','/rss/','/index.xml'])candidates.push({url:new URL(path,site.origin).href,title:''});}
  const checked=await Promise.all(candidates.map(async c=>{try{const feed=await getFeed(c.url);return {url:c.url,title:c.title||feed.title};}catch{return null;}}));return checked.filter(Boolean);
}
export async function inspectPage(value){
  const url=publicURL(value),key=await keyFor('metadata:'+url),old=await readCache(key);
  if(old&&Date.now()-Date.parse(old.checkedAt)<15*60000)return {...old,cached:true};
  try{const page=await retrieve(url,1500000,true),result={url:page.url,checkedAt:new Date().toISOString(),...pageMetadata(page.text,page.url)};await writeCache(key,result);return result;}
  catch(error){if(old)return {...old,stale:true,error:error.message};throw error;}
}
export async function handleRSS(request,operation) {
  const origin=request.headers.get('Origin'),own=new URL(request.url).origin;
  const headers={'Content-Type':'application/json;charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store',Vary:'Origin'};
  if(origin&&(origins.has(origin)||origin===own))headers['Access-Control-Allow-Origin']=origin;
  else if(origin)return Response.json({error:'Origen no permitido.'},{status:403,headers});
  headers['Access-Control-Allow-Methods']='GET, OPTIONS';
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='GET')return Response.json({error:'Método no permitido.'},{status:405,headers});
  try {
    if(operation==='health')return Response.json({service:'Extra Extra RSS',refreshMinutes:10},{headers});
    const value=new URL(request.url).searchParams.get('url');if(!value)throw new Error('Falta la dirección del canal o de la web.');
    return Response.json(operation==='discover'?{feeds:await discover(value)}:operation==='inspect'?await inspectPage(value):await getFeed(value),{headers});
  }catch(error){return Response.json({error:error.name==='TimeoutError'?'El medio ha tardado demasiado en responder.':String(error.message).slice(0,240)},{status:422,headers});}
}
