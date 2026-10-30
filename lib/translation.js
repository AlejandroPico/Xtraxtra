import {openFeedDatabase} from './feeds.js';
import {splitUTF8,translationParts} from './reading-tools.js';

const keyFor=(text,source,target,engine)=>{let hash=2166136261;for(const c of text)hash=Math.imul(hash^c.codePointAt(0),16777619);return `${engine}:${source}:${target}:${text.length}:${hash>>>0}`;};
export function createTranslationEngine({settings,readUsage,saveUsage,fetcher=globalThis.fetch,native=()=>globalThis.Translator,decode=value=>value,warn=()=>{}}){
  const cache=new Map(),translators=new Map();let writeWarning=false;
  const ready=(async()=>{try{const db=await openFeedDatabase();await new Promise((resolve,reject)=>{const request=db.transaction('translations').objectStore('translations').getAll();request.onsuccess=()=>{for(const row of request.result)if(row&&typeof row.original==='string'&&typeof row.text==='string'&&Date.now()-row.at<30*86400000)cache.set(row.id,row);resolve();};request.onerror=()=>reject(request.error);}).finally(()=>db.close());}catch{}})();
  function cached(text,source,target,engine=settings().engine){if(source===target)return text;const row=cache.get(keyFor(text,source,target,engine));return row?.original===text?row.text:null;}
  async function put(original,text,source,target,engine){
    const row={id:keyFor(original,source,target,engine),original,text,at:Date.now()};cache.set(row.id,row);
    if(cache.size>400)for(const r of [...cache.values()].sort((a,b)=>a.at-b.at).slice(0,cache.size-400))cache.delete(r.id);
    try{const db=await openFeedDatabase();await new Promise((resolve,reject)=>{const transaction=db.transaction('translations','readwrite'),store=transaction.objectStore('translations');store.put(row);const request=store.getAll();request.onsuccess=()=>{for(const r of request.result.sort((a,b)=>b.at-a.at).slice(400))store.delete(r.id);};transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);}).finally(()=>db.close());}catch{if(!writeWarning){writeWarning=true;warn('La traducción se conserva solo durante esta sesión.');}}
  }
  function prepare(source,target=settings().target,engine=settings().engine){
    if(engine!=='local'||source===target)return Promise.resolve(null);
    const key=source+':'+target;
    if(!translators.has(key)){
      const api=native();if(!api)return Promise.reject(new Error('Este navegador no ofrece traducción local. Elige MyMemory en Lectura → Idiomas, o abre la traducción web.'));
      // Called directly by a click, before awaiting cache I/O, to retain activation.
      let creation;try{creation=api.create({sourceLanguage:source,targetLanguage:target});}catch(error){return Promise.reject(error);}
      const promise=Promise.resolve(creation).catch(error=>{translators.delete(key);throw error;});translators.set(key,promise);
    }
    return translators.get(key);
  }
  function usage(){const value=readUsage()||{},day=new Date().toISOString().slice(0,10);return value.day===day?{day,count:Math.max(0,Number(value.count)||0)}:{day,count:0};}
  async function translate(text,{source,target,engine,signal,prepared}={}){
    if(!text||source===target)return text;signal?.throwIfAborted();await ready;
    const hit=cached(text,source,target,engine);if(hit!==null)return hit;
    let result;
    if(engine==='local'){
      const translator=await (prepared||prepare(source,target,engine));signal?.throwIfAborted();result=await translator.translate(text,{signal});
    }else{
      const chunks=splitUTF8(text),translated=[];
      for(const chunk of chunks){
        signal?.throwIfAborted();const used=usage();if(used.count+chunk.length>4500)throw new Error('Se ha alcanzado el límite local de traducción gratuita de hoy. Puedes usar la traducción del navegador o la alternativa web.');
        // Charge attempts conservatively: a failed request may still count upstream.
        used.count+=chunk.length;saveUsage(used);
        const response=await fetcher(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${encodeURIComponent(source+'|'+target)}&mt=1`,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000),credentials:'omit',referrerPolicy:'no-referrer'});
        if(!response.ok)throw new Error('El servicio de traducción no responde. Conservamos el texto original.');
        const json=await response.json(),text=json.responseData?.translatedText;
        if(Number(json.responseStatus)!==200||typeof text!=='string'||/MYMEMORY WARNING|USED ALL AVAILABLE FREE TRANSLATIONS/i.test(text))throw new Error('MyMemory no puede traducir ahora: límite o idioma no disponible. Se conserva el original.');
        translated.push(decode(text));
      }
      result=translated.join(' ');
    }
    signal?.throwIfAborted();if(typeof result!=='string'||!result.trim())throw new Error('La traducción está vacía.');await put(text,result,source,target,engine);return result;
  }
  function peekCard(article){const s=settings(),p=translationParts(article,s.engine,false),title=cached(p.title,article.language,s.target),summary=cached(p.parts.join('\n'),article.language,s.target);return title!==null&&summary!==null?{title,summary,target:s.target,partial:p.partial}:null;}
  async function article(article,{full=true,signal,onProgress=()=>{},prepared=null}={}){
    const {target,engine}=settings(),source=article.language||'es',p=translationParts(article,engine,full),title=await translate(p.title,{source,target,engine,signal,prepared}),parts=[];
    for(let i=0;i<p.parts.length;i++){onProgress(i,p.parts.length);parts.push({original:p.parts[i],translated:await translate(p.parts[i],{source,target,engine,signal,prepared})});}
    return {title,parts,target,engine,partial:p.partial};
  }
  function destroy(){for(const promise of translators.values())promise.then(t=>t.destroy()).catch(()=>{});translators.clear();}
  return {ready,prepare,article,peekCard,cached,usage,destroy};
}
