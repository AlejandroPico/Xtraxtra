import {articleTime} from './story-analysis.js';
import {score} from './news.js';
export function calendarKey(value) {
  const date=new Date(value);
  return Number.isFinite(date.getTime())?`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`:'unknown';
}
export function clusterDay(cluster) {
  const timestamp=Math.max(...cluster.articles.map(article=>articleTime(article)));
  return timestamp?calendarKey(timestamp):'unknown';
}
export function dayLabel(key, now=new Date()) {
  if(key==='unknown')return 'Sin fecha de publicación';
  if(key===calendarKey(now))return 'Hoy';
  const yesterday=new Date(now);yesterday.setDate(yesterday.getDate()-1);
  const label=new Intl.DateTimeFormat('es',{weekday:'long',day:'numeric',month:'long'}).format(new Date(key+'T12:00:00'));
  return key===calendarKey(yesterday)?`Ayer · ${label}`:label.charAt(0).toUpperCase()+label.slice(1);
}
export function diversify(clusters,{sourceLimit=0,topicLimit=0,categoryFor=()=>''}={}) {
  if(!sourceLimit&&!topicLimit)return [...clusters];
  const queue=[...clusters],result=[];
  let previousSource='',previousTopic='',sourceRun=0,topicRun=0;
  while(queue.length) {
    const eligible=(cluster,withTopic=true)=>{
      const source=cluster.articles[0].source,topic=categoryFor(cluster.articles[0]);
      return (!sourceLimit || source!==previousSource || sourceRun<sourceLimit) && (!withTopic || !topicLimit || topic!==previousTopic || topicRun<topicLimit);
    };
    let index=queue.findIndex(cluster=>eligible(cluster));
    if(index<0)index=queue.findIndex(cluster=>eligible(cluster,false));
    if(index<0)index=0;
    const [cluster]=queue.splice(index,1),source=cluster.articles[0].source,topic=categoryFor(cluster.articles[0]);
    sourceRun=source===previousSource?sourceRun+1:1;topicRun=topic===previousTopic?topicRun+1:1;
    previousSource=source;previousTopic=topic;result.push(cluster);
  }
  return result;
}
export function organizeEdition(clusters,{order='relevance',now=Date.now(),priority=()=>1,...diversity}={}) {
  const groups=new Map();
  for(const cluster of clusters){const key=clusterDay(cluster);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(cluster);}
  return [...groups.keys()].sort((a,b)=>a==='unknown'?1:b==='unknown'?-1:b.localeCompare(a)).map(key=>{
    const items=groups.get(key);
    items.sort((a,b)=>order==='newest'?Math.max(...b.articles.map(articleTime))-Math.max(...a.articles.map(articleTime))
      :order==='coverage'?new Set(b.articles.map(a=>a.source)).size-new Set(a.articles.map(a=>a.source)).size||score(b,now)*priority(b)-score(a,now)*priority(a):score(b,now)*priority(b)-score(a,now)*priority(a));
    return {key,label:dayLabel(key,new Date(now)),clusters:diversify(items,diversity)};
  });
}
