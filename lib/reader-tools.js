import {escapeHTML as esc,safeURL} from './news.js';
import {translationLanguages,speechChunks} from './reading-tools.js';

export function createReaderTools(ctx){
  let article=null,result=null,original=true,job=null,generation=0,utterance=null,playing=false,paused=false;
  const synth=ctx.synth??globalThis.speechSynthesis,Utterance=ctx.Utterance??globalThis.SpeechSynthesisUtterance;
  const $=s=>document.querySelector(s);
  const voices=()=>synth?.getVoices()||[];
  function status(message){const node=$('#reader-tool-status');if(node)node.textContent=message;}
  function stop(){generation++;synth?.cancel();utterance=null;playing=false;paused=false;audioState();}
  function audioState(){const play=$('#speech-play'),pause=$('#speech-pause'),stop=$('#speech-stop');if(play){play.disabled=playing;pause.disabled=!playing;stop.disabled=!playing;pause.hidden=!playing;stop.hidden=!playing;pause.textContent=paused?'Continuar':'Pausar';}}
  function detach(){job?.abort();job=null;stop();article=null;result=null;}
  function attach(value){
    detach();article=value;original=true;
    const settings=ctx.settings();
    $('#reader-extensions').innerHTML=`<div class="reader-utility"><div class="panel-actions audio-actions"><button id="speech-play" ${!synth||!Utterance?'disabled':''}>Escuchar</button><button id="speech-pause" disabled hidden>Pausar</button><button id="speech-stop" disabled hidden>Detener</button></div>${value.language!==settings.target?`<div class="panel-actions"><button id="reader-translate">Traducir al ${esc(translationLanguages[settings.target].toLowerCase())}</button><button id="reader-original" hidden>Ver original</button><label class="check-row"><input id="reader-bilingual" type="checkbox" ${settings.bilingual?'checked':''}> Lectura bilingüe</label></div><p class="small-note">${settings.engine==='local'?'Traducción en el dispositivo, si el navegador y el idioma lo permiten. Puede descargar un modelo.':'MyMemory recibe el texto que pides traducir. Gratis con límite diario; las lecturas largas se traducen por fragmentos.'} Ajustes en Lectura → Idiomas y audio.</p>`:''}<p class="small-note" id="reader-tool-status" role="status">${!synth?'Este navegador no ofrece lectura en voz alta.':''}</p></div>`;
    $('#speech-play').onclick=play;$('#speech-pause').onclick=()=>{if(paused){synth.resume();paused=false;}else{synth.pause();paused=true;}audioState();};$('#speech-stop').onclick=()=>{stop();status('Lectura detenida.');};
    if($('#reader-translate'))$('#reader-translate').onclick=translate;
    if($('#reader-original'))$('#reader-original').onclick=()=>{original=!original;stop();drawText();};
    if($('#reader-bilingual'))$('#reader-bilingual').onchange=e=>{settings.bilingual=e.target.checked;ctx.persist();if(result)drawText();};
    $('#reader-content').querySelector('[data-zoom-image]')?.addEventListener('click',()=>openImage(value));
  }
  function drawText(){
    if(!article)return;const root=$('#article-text'),settings=ctx.settings();
    const paragraphs=text=>String(text||'El medio solo comparte el titular.').split(/\n+/).filter(Boolean).map(p=>`<p>${esc(p)}</p>`).join('');
    if(original||!result){root.className='reader-text';root.lang=article.language;root.innerHTML=paragraphs(article.content||article.summary);$('#reader-content h1').textContent=article.title;}
    else{
      root.lang=result.target;root.className=settings.bilingual?'reader-text bilingual-text':'reader-text';
      root.innerHTML=(settings.bilingual?`<div class="bilingual-head"><span>Original · ${esc(article.language.toUpperCase())}</span><span>Traducción · ${esc(result.target.toUpperCase())}</span></div>`:'')+result.parts.map(p=>settings.bilingual?`<div class="bilingual-row"><p lang="${esc(article.language)}">${esc(p.original)}</p><p lang="${esc(result.target)}">${esc(p.translated)}</p></div>`:`<p>${esc(p.translated)}</p>`).join('')+(result.partial?'<p class="small-note">Fragmento traducido. El texto completo disponible permanece en «Ver original».</p>':'');
      $('#reader-content h1').textContent=settings.bilingual?article.title:result.title;
      if(settings.bilingual)root.insertAdjacentHTML('afterbegin',`<p class="translated-heading" lang="${esc(result.target)}">${esc(result.title)}</p>`);
    }
    $('#reader-content h1').lang=original||settings.bilingual?article.language:result.target;
    $('#reader-original').hidden=!result;$('#reader-original').textContent=original?'Ver traducción':'Ver original';
    status(original?'Texto original.':`Traducción automática${result.partial?' de un fragmento':''} · ${result.engine==='local'?'dispositivo':'MyMemory'}.`);
  }
  async function translate(){
    if(!article||job)return;const current=article,button=$('#reader-translate'),settings={...ctx.settings()};
    job=new AbortController();const controller=job;button.disabled=true;status('Preparando traducción…');
    try{const prepared=ctx.engine.prepare(current.language,settings.target,settings.engine);prepared.catch(()=>{});const translated=await ctx.engine.article(current,{signal:controller.signal,prepared,onProgress:(i,n)=>{if(article===current)status(`Traduciendo ${i+1}/${n} fragmentos…`);}});if(article===current&&!controller.signal.aborted){result=translated;original=false;stop();drawText();}}
    catch(error){if(!controller.signal.aborted&&article===current)status(error.message||'No se ha podido traducir. Se conserva el original.');}
    finally{if(job===controller)job=null;if(button.isConnected)button.disabled=false;}
  }
  function play(){
    if(!article||!synth||!Utterance)return;stop();playing=true;const token=generation,settings=ctx.settings(),translated=result&&!original;
    const text=translated?result.title+'. '+result.parts.map(p=>p.translated).join('\n'):article.title+'. '+(article.content||article.summary||''),lang=translated?result.target:article.language;
    const chunks=speechChunks(text);let index=0;
    const available=voices(),chosen=available.find(v=>v.voiceURI===settings.voice)||available.find(v=>v.localService&&v.lang.toLowerCase().startsWith(lang))||available.find(v=>v.lang.toLowerCase().startsWith(lang));
    function speak(){if(token!==generation||!ctx.isOpen())return;if(index>=chunks.length){playing=false;utterance=null;audioState();status('Lectura terminada.');if(settings.audioNext&&ctx.canNext()){ctx.next();play();}return;}
      utterance=new Utterance(chunks[index++]);utterance.lang=lang;utterance.rate=settings.rate;if(chosen)utterance.voice=chosen;
      utterance.onend=speak;utterance.onerror=e=>{if(token!==generation||e.error==='canceled'||e.error==='interrupted')return;stop();status('La voz no está disponible. Elige otra en Lectura → Idiomas y audio.');};
      synth.speak(utterance);audioState();status(`Escuchando ${index}/${chunks.length}${chosen&&!chosen.localService?' · voz en línea':''}.`);
    }speak();
  }
  function openImage(value){
    const url=safeURL(value.image);if(!url)return;const dialog=$('#image-dialog'),name=ctx.source(value).name;
    $('#image-view').innerHTML=`<img src="${esc(url)}" alt="${esc(value.imageCaption||'Fotografía de '+name)}" referrerpolicy="no-referrer"><figcaption>${value.imageCaption?`<p>${esc(value.imageCaption)}</p>`:''}<p>${value.imageCredit?'Crédito indicado en RSS: '+esc(value.imageCredit):'El RSS no indica el crédito de esta fotografía.'}</p><a href="${esc(safeURL(value.url))}" target="_blank" rel="noopener noreferrer">Ver la publicación de ${esc(name)} ↗</a></figcaption>`;
    dialog.classList.remove('image-zoomed');$('#image-zoom').textContent='Ampliar';if(!dialog.open)dialog.showModal();
  }
  $('#close-image').onclick=()=>$('#image-dialog').close();$('#image-zoom').onclick=()=>{const zoom=$('#image-dialog').classList.toggle('image-zoomed');$('#image-zoom').textContent=zoom?'Ajustar':'Ampliar';};
  $('#image-dialog').addEventListener('click',e=>{if(e.target===$('#image-dialog'))$('#image-dialog').close();});
  $('#reader').addEventListener('close',detach);window.addEventListener('pagehide',()=>{detach();ctx.engine.destroy();});
  return {attach,detach,voices,translate};
}
