// Read publisher declarations only. Never return articleBody or page HTML.
const clean=value=>String(value||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,180);
function urlFor(value,base){if(typeof value!=='string'||!value.trim())return '';try{const u=new URL(value,base);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?(u.hash='',u.href):'';}catch{return '';}}
const date=value=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
export function pageMetadata(html,base){
  const nodes=[],seen=new Set(),references=[];let visited=0;
  function visit(value,depth=0){if(!value||typeof value!=='object'||depth>8||visited++>500)return;if(Array.isArray(value)){for(const v of value)visit(v,depth+1);return;}nodes.push(value);for(const [key,v] of Object.entries(value))if(key!=='articleBody'&&typeof v==='object')visit(v,depth+1);}
  for(const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    if(match[1].length>300000)continue;try{visit(JSON.parse(match[1]));}catch{}
  }
  const types=node=>(Array.isArray(node['@type'])?node['@type']:[node['@type']]).filter(Boolean).map(t=>String(t).split('/').pop());
  const articles=nodes.filter(n=>types(n).some(t=>/Article|BlogPosting|Reportage/.test(t)));
  // Metadata of another linked article must not override this article's declarations.
  const identity=n=>[n.url,n.mainEntityOfPage?.['@id'],typeof n.mainEntityOfPage==='string'?n.mainEntityOfPage:null].map(u=>urlFor(u,base)).filter(Boolean);
  const canonical=urlFor(base),own=articles.find(n=>identity(n).includes(canonical))||articles.find(n=>!identity(n).length&&typeof n.headline==='string');
  const declared=own?types(own):[],access=own?.isAccessibleForFree;
  let kind=declared.includes('AdvertiserContentArticle')?'sponsored':declared.includes('OpinionNewsArticle')?'opinion':declared.some(t=>['NewsArticle','ReportageNewsArticle','AnalysisNewsArticle'].includes(t))?'news':'unknown';
  const attr=(tag,name)=>tag.match(new RegExp('\\b'+name+'\\s*=\\s*["\']([^"\']*)["\']','i'))?.[1]||'';
  const meta={};for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const key=attr(tag,'property')||attr(tag,'name')||attr(tag,'itemprop');if(key)meta[key.toLowerCase()]=attr(tag,'content');}
  const free=access===true||access==='true'?'open':access===false||access==='false'?'restricted':meta.isaccessibleforfree==='true'?'open':meta.isaccessibleforfree==='false'?'restricted':'unknown';
  function reference(value,relation){for(const item of Array.isArray(value)?value:[value]){const url=urlFor(typeof item==='string'?item:item?.url||item?.['@id'],base);if(url&&url!==canonical&&!seen.has(url)){seen.add(url);references.push({url,label:clean(typeof item==='object'?item.name||new URL(url).hostname:new URL(url).hostname),relation});}}}
  if(own){reference(own.citation,'citation');reference(own.isBasedOn,'isBasedOn');}
  const authors=(Array.isArray(own?.author)?own.author:[own?.author]).map(a=>clean(typeof a==='string'?a:a?.name)).filter(Boolean).slice(0,8);
  if(!authors.length&&meta.author)authors.push(clean(meta.author));
  return {access:free,type:kind,authors,published:date(own?.datePublished||meta['article:published_time']),updated:date(own?.dateModified||meta['article:modified_time']),references:references.slice(0,12),basis:own?'JSON-LD del medio':'Metadatos públicos del medio'};
}
