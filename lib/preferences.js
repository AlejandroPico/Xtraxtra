export function clamp(value,min,max,fallback){const number=(typeof value==='number'||typeof value==='string'&&value.trim()!=='')?Number(value):NaN;return Number.isFinite(number)?Math.min(max,Math.max(min,number)):fallback;}
export function readingPreferences(input={}) {
  return {
    lineHeight:clamp(input.lineHeight,1.3,2.4,1.8),readerWidth:clamp(input.readerWidth,440,960,680),
    readerMargin:clamp(input.readerMargin,12,64,36),paragraphGap:clamp(input.paragraphGap,.4,2,1.1),
    density:['compact','normal','comfortable'].includes(input.density)?input.density:'normal',
    highContrast:input.highContrast===true,largeControls:input.largeControls===true,reduceMotion:input.reduceMotion===true,
    sourceLimit:[0,1,2,3].includes(input.sourceLimit)?input.sourceLimit:0,topicLimit:[0,1,2,3].includes(input.topicLimit)?input.topicLimit:0,
  };
}
export function sanitizeFrontpages(input) {
  if(!Array.isArray(input))return [];
  const pages=input.filter(p=>p && typeof p.id==='string' && typeof p.name==='string' && p.filters && Array.isArray(p.sources)).map(p=>({
    id:p.id.slice(0,80),name:p.name.slice(0,60),sources:p.sources.filter(s=>typeof s==='string').slice(0,300),
    filters:{query:String(p.filters.query||'').slice(0,600),category:String(p.filters.category||'Actualidad'),language:String(p.filters.language||''),territory:String(p.filters.territory||'').slice(0,30),kind:['news','opinion','sponsored','unknown'].includes(p.filters.kind)?p.filters.kind:'',hours:clamp(p.filters.hours,0,168,0),unread:p.filters.unread===true},
    group:p.group!==false,order:['relevance','newest','coverage'].includes(p.order)?p.order:'relevance',...readingPreferences(p),
  }));
  return [...new Map(pages.map(page=>[page.id,page])).values()].slice(-30);
}
export function readingEstimate(article) {
  const count=String(article.content||article.summary||'').trim().match(/\S+/g)?.length||0;
  return count?{minutes:Math.max(1,Math.ceil(count/220)),excerpt:!article.content}:null;
}
