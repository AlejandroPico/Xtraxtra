const normalized = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
// OR joins groups; exclusions apply to the whole expression. Quoted phrases stay intact.
export function parseSearch(query = '') {
  const text = normalized(query).slice(0,600).replace(/\bpero\s+sin\b/g,' sin ').replace(/[,;()]/g,' ');
  const terms = text.match(/-?"[^"]+"|-?[^\s"]+/g) || [];
  const groups=[[]], excluded=[];
  let negate=false;
  for(const token of terms.slice(0,70)) {
    if(['sin','not'].includes(token)){negate=true;continue;}
    if(['o','or','|'].includes(token) && !negate){if(groups.at(-1).length)groups.push([]);continue;}
    if(['y','and','pero'].includes(token) && !negate)continue;
    const negative=negate || token.startsWith('-');
    const value=token.replace(/^-/, '').replace(/^"|"$/g,'').trim();
    if(value)(negative?excluded:groups.at(-1)).push(value);
    negate=false;
  }
  return {groups:groups.filter(group=>group.length),excluded};
}
export function matchesSearch(text, query) {
  const parsed=typeof query==='string'?parseSearch(query):query;
  const haystack=normalized(text);
  return !parsed.excluded.some(term=>haystack.includes(term)) && (!parsed.groups.length || parsed.groups.some(group=>group.every(term=>haystack.includes(term))));
}
export function activeMutes(mutes=[], now=Date.now()) {
  return mutes.filter(mute=>mute && typeof mute.text==='string' && mute.text.trim().length>=2 && (mute.until===null || (Number.isFinite(Number(mute.until))&&Number(mute.until)>now)))
    .map(mute=>({text:mute.text.trim().slice(0,80),until:mute.until===null?null:Number(mute.until)}));
}
export function isMuted(article,mutes=[],now=Date.now()) {
  const text=normalized(article.title+' '+article.summary);
  return activeMutes(mutes,now).some(mute=>text.includes(normalized(mute.text.trim())));
}
