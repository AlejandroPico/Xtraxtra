import {groupRelated,coverageMatch,variantGroups,contentKind,articleTime} from './story-analysis.js';
import {matchesTerritory} from './geography.js';
import {parseSearch,matchesSearch,isMuted} from './search.js';
export const categories = ['Actualidad', 'Política', 'Internacional', 'Economía', 'Sociedad', 'Tecnología', 'Ciencia', 'Cultura', 'Deportes', 'Tiempo'];
const rules = [
  ['Tiempo', /\b(meteorolog|aemet|borrasca|pronostico|prevision del tiempo|temperaturas|weather|storm|huracan|inundacion|terremoto|earthquake|flood)/],
  ['Deportes', /\b(futbol|liga|champions|fifa|tenis|baloncesto|nba|deport|mundial de|real madrid|barcelona fc|football|soccer)/],
  ['Tecnología', /\b(tecnolog|inteligencia artificial|openai|chatgpt|google|microsoft|apple|iphone|android|software|internet|ciber|chip|nvidia|robot|artificial intelligence)/],
  ['Ciencia', /\b(ciencia|cientific|investigador|nasa|espacial|astronom|telescopio|fisica|estudio revela|research|scientist|space|planet|biolog)/],
  ['Economía', /\b(economia|economic|inflacion|bolsa|ibex|banca|banco|hipoteca|mercado|pib|salario|empleo|paro|arancel|tariff|trade|stocks|finance|business)/],
  ['Política', /\b(politic|gobierno|congreso|senado|eleccion|presidente|sanchez|feijoo|ayuso|moncloa|diputado|parlamento|votacion|electoral|election|minister)/],
  ['Cultura', /\b(cultura|cine|pelicula|musica|literatura|novela|libro|festival|museo|arte|actor|actriz|cantante|cinema)/],
  ['Sociedad', /\b(sociedad|salud|hospital|medico|educacion|escuela|vivienda|accidente|tren|avion|suceso|policia|detenido|sanidad|health)/],
];
export const normalize = text => String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function categoryOf(article, source) {
  const explicit = (article.categories || []).map(normalize).join(' ');
  const title = normalize(article.title);
  return rules.find(([, regex]) => regex.test(title))?.[0]
    || rules.find(([, regex]) => regex.test(explicit))?.[0]
    || source?.category || 'Actualidad';
}
const stop = new Set(normalize('el la los las un una unos unas de del al a ante con contra desde durante en entre hacia hasta para por segun sin sobre tras y e o u que se su sus es son como mas pero ya muy no si este esta estos estas ese esa hay han ha ser sera tiene tras nuevo nueva nuevos nuevas hoy ultima hora directo directo ultima noticia noticias dice the a an of on at in to for from with and or is are be as by it its this that after before new says news live').split(' '));
export function tokens(title) {
  return new Set((normalize(title).match(/[a-z0-9]+/g) || []).filter(word => (word.length > 2 || /^\d+$/.test(word)) && !stop.has(word)));
}
export function similarity(a,b){return coverageMatch(a,b).score;}
export function groupArticles(articles,group=true){return groupRelated(articles,group);}
export function score(cluster, now = Date.now()) {
  const age = Math.max(0, (now - Math.max(...cluster.articles.map(a => articleTime(a)))) / 3600000);
  const diversity = Math.min(new Set(cluster.articles.map(a=>a.source)).size,variantGroups(cluster).length);
  return Math.exp(-age / 18) * (1 + Math.log2(diversity) * 0.65);
}
export function relatedTopics(articles) {
  const patterns = [
    ['Elecciones', /eleccion|electoral|election|votacion/], ['Vivienda', /vivienda|alquiler|hipoteca/],
    ['Inteligencia artificial', /inteligencia artificial|openai|chatgpt|artificial intelligence/],
    ['Inundaciones', /inundacion|riada|flood/], ['Terremotos', /terremoto|sismo|earthquake/],
    ['Accidentes ferroviarios', /(?:accidente|descarril|choque).*(?:tren|ferrovi|rail)|(?:tren|ferrovi|rail).*(?:accidente|descarril|choque)/],
    ['Accidentes aéreos', /(?:accidente|estrell|crash).*(?:avion|aereo|plane)|(?:avion|aereo|plane).*(?:accidente|estrell|crash)/],
    ['Ucrania', /ucrania|ukraine/], ['Oriente Próximo', /gaza|israel|iran|libano|lebanon/],
    ['Cambio climático', /cambio climatico|climate change|calentamiento global/], ['Espacio', /nasa|espacial|astronom|spacex|luna/],
  ];
  return patterns.map(([name, pattern]) => ({ name, pattern, count: articles.filter(a => pattern.test(normalize(a.title + ' ' + a.summary))).length })).filter(t => t.count >= 2).sort((a,b) => b.count - a.count);
}
export function filterArticles(articles, filters, sources, now = Date.now()) {
  const query = parseSearch(filters.query);
  return articles.filter(article => {
    const source = sources.find(s => s.id === article.source);
    return filters.sources.includes(article.source)
      && (!filters.category || filters.category === 'Actualidad' || categoryOf(article, source) === filters.category)
      && (!filters.language || article.language === filters.language)
      && (!filters.kind || contentKind(article).type===filters.kind)
      && matchesTerritory(article,filters.territory)
      && (!filters.hours || (article.published && now - Date.parse(article.published) <= filters.hours * 3600000))
      && (!filters.unread || !filters.read.includes(article.id))
      && (!filters.topic || filters.topic.test(normalize(article.title + ' ' + article.summary)))
      && !isMuted(article,filters.mutes || [],now)
      && matchesSearch(article.title+' '+article.summary+' '+(source?.name||'')+' '+(filters.searchContent?article.content||'':''),query);
  });
}
export function safeURL(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
export function escapeHTML(value = '') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
