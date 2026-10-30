import {articleTerritories} from './geography.js';
import {worldTerritories} from './world-territories.js';

export const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const stop=new Set(norm('el la los las un una unos unas de del al a ante con contra desde durante en entre hacia hasta para por segun sin sobre tras y e o u que se su sus es son como mas pero ya muy no si este esta estos estas ese esa hay han ha ser sera tiene nuevo nueva nuevos nuevas hoy ultima hora directo noticia noticias dice the a an of on at in to for from with and or is are be as by it its this that after before new says news live le les des du au aux une et dans sur avec pour par est sont ce cette ses plus der die das den dem des ein eine einer und ist sind mit von zu im am bei als aus auf il lo gli della delle nel nella che con non da per una di um em dos das do no na os as com mais entre ao pelo uma o els les del dels amb les mes avui una i un es pel per una eta da du dira bat ere ren ko en ez berri une des ce cette leur qui dans pour plus une elkar dite dit berri azken albiste azkena politika gobierno govern gouvernement government regierung presidente president minister ministro announces announce announces said says declares declared calls call').split(' '));
const concepts=[
 ['election','elecciones|eleccion|eleccions|elections|election|electionen|wahlen|wahl|eleicoes|elezioni|hauteskunde'],
 ['call','convoca|convocan|convocar|convocatoria|anuncia|anuncian|announce|announces|announced|annonce|annoncent|annoncee|calls|called|declares|declara|appelle|ausgerufen|iragarri|deitu'],
 ['dissolve','disuelve|disolucion|dissolves|dissolution|dissout|dissol|auflosung'],
 ['train','tren|trenes|ferroviario|ferroviaria|ferrocarril|train|trains|rail|railway|zug|treno|trens|trena'],
 ['crash','accidente|accident|accidents|choque|colision|descarrila|descarrilamiento|crash|collision|derailment|derails|entgleist|unfall|incidente|istripu'],
 ['flood','inundacion|inundaciones|inundacions|riada|flood|floods|flooding|inondation|inondations|uberschwemmung|uholde'],
 ['quake','terremoto|terremotos|earthquake|quake|seisme|terratrèmol|terratremol|erdbeben|lurrikara'],
 ['death','muerto|muertos|fallecido|fallecidos|dead|deaths|killed|mort|morts|tote|morti|hildako'],
 ['injury','herido|heridos|injured|injuries|blesse|blesses|ferits|verletzte|zauritu'],
 ['strike','huelga|vaga|strike|greve|streik|sciopero|greba'],
 ['protest','protesta|protestas|manifestacion|protest|protests|demonstration|manifestation|kundgebung|protestak'],
 ['war','guerra|war|guerre|krieg|gerra'],['attack','ataque|atentado|attack|attacks|attentat|angriff|eraso'],
 ['ceasefire','alto el fuego|ceasefire|cessez le feu|waffenruhe|su etena'],
 ['inflation','inflacion|inflacio|inflation|inflazione|inflazioa'],['rate','tipos|tipo de interes|interest rate|rates|taux|zinsen|tassi|interes tasak'],
 ['raise','sube|subida|aumenta|eleva|raises|raise|hike|hausse|erhoht|igo'],['cut','baja|reduce|recorta|cuts|cut|baisse|senkt|jaitsi'],
 ['fine','multa|sancion|fine|fined|amende|bussgeld|isuna'],['launch','lanza|lanzamiento|presenta|presentan|launch|launches|unveils|releases|lancement|startet|lanca|jaurti'],['telescope','telescopio|telescope|telescopi|teleskop'],['phone','iphone|telefono|smartphone|smartphones'],
 ['space','espacial|espacio|space|espace|weltraum|espazo|espai|espazio'],['win','gana|vence|wins|won|remporte|gewinnt|irabazi'],
 ['investigation','investiga|investigacion|investigation|inquiry|enquete|ermittlung|ikerketa'],
 ['arrest','detenido|detienen|arrest|arrested|arrete|festgenommen|atxilotu'],
];
const alias=new Map();for(const [concept,terms] of concepts)for(const term of terms.split('|'))alias.set(norm(term),concept);
const phraseAliases=[...alias].filter(([term])=>term.includes(' '));
const generic=new Set([...stop,...alias.keys(),...alias.values(),'gobierno','parlamento','congreso','senado','says','nuevo','ultima','noticias','breaking','mundo','espana','spain','france','francia','reino','unido','estados','unidos','actualidad','internacional']);
export function canonicalURL(value){try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return '';url.hash='';for(const key of [...url.searchParams.keys()])if(/^utm_|^(?:fbclid|gclid|mc_cid|mc_eid)$/i.test(key))url.searchParams.delete(key);url.searchParams.sort();return url.href;}catch{return '';}}
export const articleTime=article=>Math.max(Date.parse(article.published)||0,Date.parse(article.updated)||0);
const shared=(a,b)=>{let n=0;for(const item of a)if(b.has(item))n++;return n;};
const signatures=new WeakMap();
const countryNames=new Map(worldTerritories.flatMap(([id,es,en])=>[[norm(es),id],[norm(en),id]]));
if(typeof Intl.DisplayNames==='function')for(const language of ['fr','de','pt','it','ca','gl','eu']){const display=new Intl.DisplayNames([language],{type:'region'});for(const [id] of worldTerritories){try{countryNames.set(norm(display.of(id.toUpperCase())),id);}catch{}}}
const cityAliases=new Map([['nueva york','new york'],['nueva delhi','new delhi'],['londres','london'],['pekin','beijing'],['moscu','moscow'],['kiev','kyiv'],['munich','munchen']]);
function placeName(value){const p=norm(value);if(cityAliases.has(p))return cityAliases.get(p);const country=countryNames.get(p);return country?'country:'+country:p;}
export function storySignature(article){
  if(signatures.has(article))return signatures.get(article);
  const title=norm(article.title),words=title.split(' ').filter(w=>w.length>2&&!stop.has(w)),meaning=new Set();
  for(const word of title.split(' '))if(alias.has(word))meaning.add(alias.get(word));
  for(const [phrase,concept] of phraseAliases)if((' '+title+' ').includes(' '+phrase+' '))meaning.add(concept);
  const names=new Set((String(article.title||'').match(/\b[A-ZÁÉÍÓÚÜÑÀÇ][\p{L}\p{N}'’-]{2,}/gu)||[]).map(norm).filter(w=>!generic.has(w)&&!/^\d+$/.test(w)));
  const locations=new Set([...String(article.title||'').matchAll(/\b(?:en|in|near|im|bei|em|a|au|à)\s+([A-ZÁÉÍÓÚÜÑÀÇ][\p{L}'’-]+(?:\s+[A-ZÁÉÍÓÚÜÑÀÇ][\p{L}'’-]+)?)/gu)].map(m=>placeName(m[1])).filter(w=>!generic.has(w)));
  const countries=null,regions=null;
  const value={url:canonicalURL(article.url),title,words:new Set(words),meaning,names,locations,countries,regions,numbers:new Set(title.match(/\b\d+(?:[.,]\d+)?\b/g)||[])};
  signatures.set(article,value);return value;
}
function explicitPlaceRelation(a,b,x,y){
  const text=String(a.title+' '+a.summary+' '+b.title+' '+b.summary).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const quote=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  for(const left of x)for(const right of y){if(left.startsWith('country:')||right.startsWith('country:'))continue;
    for(const [city,province] of [[left,right],[right,left]])if(new RegExp('\\b'+quote(city)+'\\s*(?:\\(\\s*'+quote(province)+'\\s*\\)|,?\\s*(?:en la )?provincia de '+quote(province)+'\\b)').test(text))return true;
  }
  return false;
}
function addGeography(s,article){if(s.countries)return;const ids=articleTerritories(article);s.countries=new Set(ids.filter(id=>!id.includes('-')));s.regions=new Set(ids.filter(id=>id.includes('-')));}
export function coverageMatch(a,b,{ignoreTime=false}={}){ 
  const x=storySignature(a),y=storySignature(b);
  if(x.url&&x.url===y.url)return {score:1,reason:'Mismo enlace'};
  if(!ignoreTime&&(!articleTime(a)||!articleTime(b)||Math.abs(articleTime(a)-articleTime(b))>36*3600000))return {score:0};
  const common=shared(x.words,y.words),names=shared(x.names,y.names),meaning=shared(x.meaning,y.meaning);
  if(x.numbers.size&&y.numbers.size&&!shared(x.numbers,y.numbers))return {score:0};
  const locationMatch=shared(x.locations,y.locations)||(x.locations.size&&y.locations.size&&explicitPlaceRelation(a,b,x.locations,y.locations)?1:0);
  if(x.locations.size&&y.locations.size&&!locationMatch)return {score:0};
  const lexical=common/(x.words.size+y.words.size-common||1),cross=a.language!==b.language;
  const lexicalMatch=!cross&&(x.title===y.title||common>=4&&lexical>=.43),semanticCandidate=meaning>=2&&(names||locationMatch||!cross&&meaning>=3);
  if(!lexicalMatch&&!semanticCandidate)return {score:0};
  addGeography(x,a);addGeography(y,b);
  if(x.countries.size&&y.countries.size&&!shared(x.countries,y.countries))return {score:0};
  if(x.regions.size&&y.regions.size&&!shared(x.regions,y.regions))return {score:0};
  if(!cross&&x.title===y.title)return {score:1,reason:'Titular coincidente'};
  if(!cross&&common>=4&&lexical>=.43)return {score:lexical,reason:'Titulares similares y fechas próximas'};
  const specific=names||locationMatch,country=shared(x.countries,y.countries);
  if(meaning>=2&&(specific||country&&meaning>=3)&&(!cross||names||locationMatch)){
    return {score:Math.min(.96,.66+Math.min(names,2)*.07+Math.min(meaning,4)*.025),reason:cross?'Entidades y suceso coincidentes entre idiomas':'Entidades y suceso coincidentes'};
  }
  return {score:0};
}
export function groupRelated(articles,enabled=true){
  const result=[],urls=new Set(),index=new Map();
  for(const article of [...articles].sort((a,b)=>articleTime(b)-articleTime(a))){
    const url=canonicalURL(article.url)||article.url;if(urls.has(url))continue;urls.add(url);
    if(!enabled){result.push({id:article.id,articles:[article],matches:[]});continue;}
    const s=storySignature(article),keys=[...s.words].map(w=>'w:'+w).concat([...s.meaning].map(w=>'m:'+w),[...s.names].map(w=>'n:'+w),[...s.locations].map(w=>'p:'+w));
    const candidates=new Map();if(enabled)for(const key of keys){const list=index.get(key);if(list?.size<=120)for(const i of list)candidates.set(i,(candidates.get(i)||0)+1);}
    let best=null,bestMatch={score:0};
    for(const [i] of [...candidates].sort((a,b)=>b[1]-a[1]).slice(0,120)){
      const match=coverageMatch(result[i].articles[0],article);if(match.score>bestMatch.score){best=i;bestMatch=match;}
    }
    const id=best===null?result.length:best;
    if(best===null)result.push({id:article.id,articles:[article],matches:[]});
    else{result[id].articles.push(article);result[id].matches.push({id:article.id,...bestMatch});}
    for(const key of keys){if(!index.has(key))index.set(key,new Set());index.get(key).add(id);}
  }
  return result;
}
export function storyTitleFor(cluster){
  const first=cluster.articles[0];if(!first)return 'Historia';
  const meaning=storySignature(first).meaning;
  const subject=meaning.has('train')&&meaning.has('crash')?'Accidente ferroviario':meaning.has('election')&&meaning.has('call')?'Convocatoria de elecciones':meaning.has('election')&&meaning.has('win')?'Resultados electorales':meaning.has('flood')?'Inundaciones':meaning.has('quake')?'Terremoto':meaning.has('strike')?'Huelga':null;
  const locations=new Map();for(const a of cluster.articles)for(const p of storySignature(a).locations)locations.set(p,(locations.get(p)||0)+1);
  const places=[...locations].sort((a,b)=>Number(a[0].startsWith('country:'))-Number(b[0].startsWith('country:'))||b[1]-a[1]);
  if(subject&&places.length){const place=places[0][0];let label=place.startsWith('country:')?worldTerritories.find(([id])=>id===place.slice(8))?.[1]:null;
    if(!label)for(const a of cluster.articles){const raw=[...String(a.title).matchAll(/\b(?:en|in|near|im|bei|em|a|au|à)\s+([A-ZÁÉÍÓÚÜÑÀÇ][\p{L}'’-]+(?:\s+[A-ZÁÉÍÓÚÜÑÀÇ][\p{L}'’-]+)?)/gu)].find(m=>placeName(m[1])===place);if(raw){label=raw[1];break;}}
    return `${subject} en ${label||place}`.slice(0,120);
  }
  return String(first.title).length>120?String(first.title).slice(0,117).trimEnd()+'…':String(first.title);
}
const bodyCache=new WeakMap(),variantCache=new WeakMap();
function bodySignature(article){
  if(bodyCache.has(article))return bodyCache.get(article);
  const words=norm(article.content||article.summary).split(' ').filter(Boolean).slice(0,500),shingles=new Set();
  for(let i=0;i<words.length-3;i++)shingles.add(words.slice(i,i+4).join(' '));
  const value={length:words.length,shingles};bodyCache.set(article,value);return value;
}
export function agencyCredits(article){
  const authors=[...(article.authors||[]),...(article.publicMetadata?.authors||[])].join(' ')+' '+(article.sourceLabel||'');
  const body=String(article.content||article.summary||'').slice(0,500);
  const text=authors+' '+(body.match(/(?:^|[(/—|])\s*(?:agencia\s+)?(?:EFE|Reuters|AFP|AP|Europa Press|DPA|ANSA)\b[^\n)]{0,40}/g)||[]).join(' ');
  return [...new Set((text.match(/\b(?:Europa Press|Reuters|AFP|EFE|DPA|ANSA|Associated Press|AP)\b/g)||[]).map(s=>s==='Associated Press'?'AP':s))];
}
export function variantGroups(cluster){
  if(variantCache.has(cluster))return variantCache.get(cluster);
  if(cluster.articles.length===1){const groups=[[cluster.articles[0]]];variantCache.set(cluster,groups);return groups;}
  const groups=[];
  for(const article of cluster.articles){const s=bodySignature(article);const group=groups.find(g=>{
    const other=bodySignature(g[0]);if(s.length<60||other.length<60)return false;
    const agreement=shared(s.shingles,other.shingles)/Math.min(s.shingles.size,other.shingles.size);
    return agreement>=.85;
  });if(group)group.push(article);else groups.push([article]);}
  variantCache.set(cluster,groups);return groups;
}
export function contentKind(article){
  const declared=article.publicMetadata?.type;
  if(declared&&declared!=='unknown')return {type:declared,basis:'Metadatos del medio',label:{news:'Información',opinion:'Opinión',sponsored:'Patrocinado'}[declared]};
  const tags=norm((article.categories||[]).join(' ')+' '+(article.editorialType||''));
  const prefix=norm(String(article.title||'').split(/[:|]/)[0]);
  const text=tags+' '+(/[:|]/.test(article.title)&&prefix.length<30?prefix:'');
  if(/\b(patrocinado|patrocinada|sponsored|advertorial|advertisercontentarticle|branded content|contenido ofrecido|publirreportaje)/.test(text))return {type:'sponsored',label:'Patrocinado',basis:'Etiqueta del RSS'};
  if(/\b(opinion|opinionnewsarticle|editorial|tribuna|columnista|columna|opinio|iritzia|commentary|commentisfree)\b/.test(text))return {type:'opinion',label:'Opinión',basis:'Etiqueta del RSS'};
  if(/\b(noticias|news|newsarticle|reportaje|informacion)\b/.test(tags))return {type:'news',label:'Información',basis:'Etiqueta del RSS'};
  return {type:'unknown',label:'Sin etiqueta editorial',basis:'El medio no lo especifica'};
}
export function referencesFor(article){
  const refs=[...(article.references||[]),...(article.publicMetadata?.references||[])];
  const urls=new Set(),own=canonicalURL(article.url);
  return refs.filter(r=>{const url=canonicalURL(r.url);if(!url||url===own||urls.has(url))return false;urls.add(url);return true;}).slice(0,16);
}
export function uniqueDetails(article,others){
  const raw=String(article.content||article.summary||'').slice(0,12000),otherText=others.map(a=>norm(a.content||a.summary)).join(' ');
  const sentences=raw.match(/[^.!?\n]+(?:[.!?]+|$)/g)||[];
  return sentences.map(s=>s.trim()).filter(s=>s.length>=55&&s.length<=500&&!/^(?:leer|read|continue|suscrib|publicidad|este articulo|this article)/i.test(s)).filter(s=>{
    const words=norm(s).split(' ').filter(w=>w.length>3&&!stop.has(w));
    if(words.length<7)return false;
    const absent=words.filter(w=>!(' '+otherText+' ').includes(' '+w+' '));
    return absent.length>=Math.max(3,words.length*.35);
  }).sort((a,b)=>(/\d/.test(b)?1:0)-(/\d/.test(a)?1:0)).slice(0,2);
}
export function rankingReasons(cluster,{now=Date.now(),prioritySources={},nearby='',nearbyMatches=false,order='relevance',position=null}={}){
  const texts=variantGroups(cluster),outlets=new Set(cluster.articles.map(a=>a.source)).size,time=Math.max(...cluster.articles.map(articleTime));
  const reasons=[time?`Última fecha del RSS: hace ${Math.max(0,Math.floor((now-time)/60000))} minutos.`:'El RSS no indica una fecha válida.',`${outlets} medios y ${texts.length} textos RSS diferenciados por comparación automática.`];
  if(cluster.articles.some(a=>prioritySources[a.source]))reasons.push(order==='newest'?'Un medio prioritario aporta cobertura; esa preferencia no altera el orden cronológico.':'Uno de tus medios prioritarios aporta cobertura: relevancia ×1,3.');
  if(nearby&&nearbyMatches)reasons.push(order==='newest'?'Coincide con tu zona preferida; esa preferencia no altera el orden cronológico.':'Coincide con tu zona preferida: relevancia ×1,4.');
  reasons.push(order==='newest'?'Orden elegido: más recientes.':order==='coverage'?'Orden elegido: más cobertura; la relevancia resuelve empates.':'Orden elegido: relevancia, combinando actualidad y textos distintos.');
  reasons.push('Los fragmentos RSS repetidos reducen el peso de la cobertura; se limita la aportación a un máximo por medio.');
  reasons.push('La ordenación respeta los grupos de hoy, ayer y días anteriores. Los límites de diversidad pueden alternar medios y secciones.');
  if(position)reasons.unshift(`Posición ${position} en la portada filtrada.`);
  return reasons;
}
