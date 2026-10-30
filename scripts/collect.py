"""Fetch publisher RSS/Atom only; no article scraping, proxy, or paywall handling."""
import concurrent.futures
import datetime as dt
import email.utils
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 4_000_000
MAX_AGE = dt.timedelta(days=7)


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'iframe'):
            self.skip += 1
        if tag in ('p', 'br', 'div', 'li', 'h2', 'h3') and not self.skip:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'iframe'):
            self.skip = max(0, self.skip - 1)
        if tag in ('p', 'div', 'li') and not self.skip:
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def clean(value, limit=18000):
    parser = PlainText()
    parser.feed(value or '')
    text = html.unescape(''.join(parser.parts))
    text = re.sub(r'[^\S\n]+', ' ', text)
    return re.sub(r'\n\s*\n+', '\n\n', text).strip()[:limit]


def safe_url(value, base=''):
    result = urllib.parse.urljoin(base, (value or '').strip())
    parsed = urllib.parse.urlparse(result)
    return result if parsed.scheme in ('https', 'http') and parsed.hostname and not parsed.username and not parsed.password else ''


def local(tag):
    return tag.rsplit('}', 1)[-1].lower()


def child_text(node, names):
    for name in names:
        for child in node:
            if local(child.tag) == name and 'search.yahoo.com/mrss' not in child.tag and child.text:
                return child.text
    return ''


def parse_date(value, now):
    try:
        date = email.utils.parsedate_to_datetime(value)
    except (ValueError, TypeError, IndexError):
        try:
            date = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        except (ValueError, TypeError):
            return None
    if date.tzinfo is None:
        date = date.replace(tzinfo=dt.timezone.utc)
    date = date.astimezone(dt.timezone.utc)
    return min(date, now) if date <= now + dt.timedelta(minutes=10) else None


def parse_feed(raw, source, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    declarations = re.sub(rb'<!\[CDATA\[.*?\]\]>', b'', raw, flags=re.DOTALL).upper()
    if b'<!DOCTYPE' in declarations or b'<!ENTITY' in declarations:
        raise ValueError('El feed contiene declaraciones XML no admitidas')
    root = ET.fromstring(raw)
    nodes = [node for node in root.iter() if local(node.tag) in ('item', 'entry')]
    if local(root.tag) not in ('rss', 'feed', 'rdf'):
        raise ValueError('La respuesta no es un feed RSS o Atom')
    articles, seen = [], set()
    for item in nodes[:100]:
        title = clean(child_text(item, ['title']), 400)
        link = child_text(item, ['link'])
        if not link:
            link = next((el.get('href') for el in item if local(el.tag) == 'link' and el.get('rel', 'alternate') == 'alternate'), '')
        link = safe_url(link, source['url'])
        if not title or not link or link in seen:
            continue
        seen.add(link)
        date = parse_date(child_text(item, ['pubdate', 'published', 'date']), now)
        modified = parse_date(child_text(item, ['updated', 'modified']), now)
        latest = max(d for d in [date, modified] if d) if date or modified else None
        if latest and now - latest > MAX_AGE:
            continue
        summary_raw = child_text(item, ['description', 'summary'])
        body_raw = child_text(item, ['encoded', 'content'])
        description, body = clean(summary_raw), clean(body_raw)
        summary = (description or body).split('\n')[0][:550]
        if not body and len(description) > len(summary) + 120:
            body = description
        image = ''
        for element in item.iter():
            kind = local(element.tag)
            if kind in ('thumbnail', 'content', 'enclosure'):
                mime = element.get('type', '')
                if kind == 'thumbnail' or element.get('medium') == 'image' or mime.startswith('image/') or (kind == 'content' and element.get('url', '').lower().split('?')[0].endswith(('.jpg', '.png', '.webp', '.jpeg'))):
                    image = safe_url(element.get('url'), link)
                    if image:
                        break
        if not image:
            match = re.search(r'<img[^>]+src=[\"\']([^\"\']+)', body_raw or summary_raw, re.I)
            if match:
                image = safe_url(html.unescape(match[1]), link)
        references = []
        for match in re.finditer(r'<a\b[^>]*href=[\"\']([^\"\']+)[\"\'][^>]*>(.*?)</a>', body_raw or summary_raw, re.I | re.S):
            reference = safe_url(html.unescape(match[1]), link)
            if reference and reference != link:
                references.append({'url': reference, 'label': clean(match[2], 180), 'relation': 'link'})
            if len(references) >= 16:
                break
        origin = next((el for el in item if local(el.tag) == 'source'), None)
        if origin is not None and origin.get('url'):
            reference = safe_url(origin.get('url'), link)
            if reference:
                references.insert(0, {'url': reference, 'label': clean(''.join(origin.itertext()), 180), 'relation': 'source'})
        authors = [clean(child_text(el, ['name']) or ''.join(el.itertext()), 160) for el in item if local(el.tag) in ('creator', 'author')]
        categories = [clean(el.text, 100) for el in item if local(el.tag) == 'category' and 'search.yahoo.com/mrss' not in el.tag and el.text]
        articles.append({
            'id': hashlib.sha256(link.encode()).hexdigest()[:20],
            'title': title, 'url': link, 'source': source['id'],
            'language': source['language'], 'published': date.isoformat() if date else None,
            'updated': modified.isoformat() if modified else None, 'authors': authors[:8], 'references': references[:16],
            'sourceLabel': clean(''.join(origin.itertext()), 160) if origin is not None else '',
            'editorialType': clean(child_text(item, ['type']), 80),
            'summary': summary or body[:550], 'content': body if len(body) > len(summary) + 120 else '',
            'image': image, 'imageCredit': ' · '.join(clean(n.text, 180) for n in item.iter() if local(n.tag) == 'credit' and 'search.yahoo.com/mrss' in n.tag)[:240], 'imageCaption': next((clean(n.text, 360) for n in item.iter() if local(n.tag) == 'description' and 'search.yahoo.com/mrss' in n.tag), ''), 'categories': categories[:8],
        })
        if len(articles) >= 45:
            break
    return articles


def fetch_source(source, previous):
    now = dt.datetime.now(dt.timezone.utc)
    try:
        request = urllib.request.Request(source['feed'], headers={
            'User-Agent': 'ExtraExtra/1.0 (+https://github.com/AlejandroPico/Xtraxtra)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9',
        })
        with urllib.request.urlopen(request, timeout=18) as response:
            raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError('El feed supera el tamaño permitido')
        articles = parse_feed(raw, source, now)
        if not articles:
            raise ValueError('El feed no contiene noticias recientes')
        return articles, {'state': 'ok', 'count': len(articles), 'checked': now.isoformat(), 'lastSuccess': now.isoformat()}
    except Exception as error:
        articles = [article for article in previous.get('articles', []) if article['source'] == source['id'] and (article.get('updated') or article.get('published')) and now - dt.datetime.fromisoformat(article.get('updated') or article['published']) <= MAX_AGE]
        old = previous.get('status', {}).get(source['id'], {})
        return articles, {'state': 'stale' if articles else 'error', 'count': len(articles), 'checked': now.isoformat(), 'lastSuccess': old.get('lastSuccess'), 'message': str(error)[:180]}


def main():
    sources = json.loads((ROOT / 'data/sources.json').read_text(encoding='utf-8'))
    path = ROOT / 'data/news.json'
    previous = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    articles, status = [], {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(fetch_source, source, previous): source for source in sources}
        for future in concurrent.futures.as_completed(futures):
            source = futures[future]
            items, health = future.result()
            articles.extend(items)
            status[source['id']] = health
            print(f"{source['name']}: {health['state']} ({len(items)})", flush=True)
    if not articles:
        raise SystemExit('Ninguna fuente disponible: se conserva el archivo anterior.')
    articles.sort(key=lambda article: article.get('published') or '', reverse=True)
    result = {'version': 1, 'generated': dt.datetime.now(dt.timezone.utc).isoformat() if any(s['state'] == 'ok' for s in status.values()) else previous.get('generated'), 'checked': dt.datetime.now(dt.timezone.utc).isoformat(), 'articles': articles, 'status': status}
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    temp.replace(path)
    print(f'Total: {len(articles)} noticias; {sum(s["state"] == "ok" for s in status.values())}/{len(sources)} fuentes disponibles')


if __name__ == '__main__':
    main()
