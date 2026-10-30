import datetime as dt
import importlib.util
from pathlib import Path
import unittest
import tempfile
import json
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('collect', Path(__file__).resolve().parents[1] / 'scripts/collect.py')
collect = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collect)
NOW = dt.datetime(2026, 10, 29, 12, tzinfo=dt.timezone.utc)
SOURCE = {'id': 'test', 'url': 'https://example.org/', 'language': 'es'}
class FeedTests(unittest.TestCase):
    def test_rss_content_and_images(self):
        xml = b'''<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/"><channel><item><title>News &amp; more</title><link>https://example.org/article</link><pubDate>Thu, 29 Oct 2026 10:00:00 GMT</pubDate><description>Brief</description><content:encoded><![CDATA[<p>First paragraph.</p><script>bad()</script><p>Second paragraph with enough words to be longer than the summary by the minimum allowed length so the content field is stored faithfully from the original RSS feed.</p>]]></content:encoded><media:thumbnail url="https://example.org/image.jpg"/></item></channel></rss>'''
        a = collect.parse_feed(xml, SOURCE, NOW)[0]
        self.assertEqual(a['title'], 'News & more')
        self.assertIn('First paragraph.', a['content'])
        self.assertNotIn('bad()', a['content'])
        self.assertEqual(a['image'], 'https://example.org/image.jpg')
    def test_doctype_inside_cdata_is_plain_content(self):
        xml = b'<rss><channel><item><title>Safe</title><link>https://example.org/safe</link><description><![CDATA[<!DOCTYPE html><p>Inert description</p>]]></description></item></channel></rss>'
        article = collect.parse_feed(xml, SOURCE, NOW)[0]
        self.assertIn('Inert description', article['summary'])
    def test_publication_update_authors_and_original_references(self):
        xml = b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Updated article</title><link href="/updated"/><published>2026-10-29T08:00:00Z</published><updated>2026-10-29T10:00:00Z</updated><author><name>Reuters</name></author><summary>&lt;a href="https://university.example.org/study"&gt;Original study&lt;/a&gt;</summary></entry></feed>'
        article = collect.parse_feed(xml, SOURCE, NOW)[0]
        self.assertEqual(article['published'], '2026-10-29T08:00:00+00:00')
        self.assertEqual(article['updated'], '2026-10-29T10:00:00+00:00')
        self.assertEqual(article['authors'], ['Reuters'])
        self.assertEqual(article['references'][0]['url'], 'https://university.example.org/study')
    def test_updated_only_is_not_reported_as_publication(self):
        article = collect.parse_feed(b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Only updated</title><link href="/updated"/><updated>2026-10-29T10:00:00Z</updated></entry></feed>', SOURCE, NOW)[0]
        self.assertIsNone(article['published'])
        self.assertEqual(article['updated'], '2026-10-29T10:00:00+00:00')
    def test_atom_without_date(self):
        a = collect.parse_feed(b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom</title><link href="/atom"/><summary>Text</summary></entry></feed>', SOURCE, NOW)[0]
        self.assertIsNone(a['published'])
        self.assertEqual(a['url'], 'https://example.org/atom')
    def test_old_dates(self):
        self.assertEqual(collect.parse_feed(b'<rss><channel><item><title>Old</title><link>https://example.org/old</link><pubDate>Thu, 01 Jan 2026 10:00:00 GMT</pubDate></item></channel></rss>', SOURCE, NOW), [])
    def test_html_and_entities(self):
        for xml in [b'<html><body>Not RSS</body></html>', b'<!DOCTYPE rss [<!ENTITY x "bad">]><rss/>']:
            with self.assertRaises(ValueError): collect.parse_feed(xml, SOURCE, NOW)
        self.assertEqual(collect.safe_url('javascript:alert(1)'), '')
    def test_photo_credit_is_separate_from_article_text(self):
        xml = b'<rss xmlns:media="http://search.yahoo.com/mrss/"><channel><item><title>Noticia</title><link>https://example.org/photo</link><description>Extracto real</description><media:content url="https://example.org/photo.jpg"><media:credit>AFP</media:credit><media:description>Pie de foto</media:description></media:content></item></channel></rss>'
        article = collect.parse_feed(xml, SOURCE, NOW)[0]
        self.assertEqual(article['imageCredit'], 'AFP')
        self.assertEqual(article['imageCaption'], 'Pie de foto')
        self.assertEqual(article['summary'], 'Extracto real')
        self.assertEqual(article['content'], '')
    def test_duplicates_and_future_date(self):
        xml = b'<rss><channel><item><title>A</title><link>https://example.org/a</link><pubDate>Thu, 29 Oct 2026 15:00:00 GMT</pubDate></item><item><title>B</title><link>https://example.org/a</link></item></channel></rss>'
        result = collect.parse_feed(xml, SOURCE, NOW)
        self.assertEqual(len(result), 1)
        self.assertIsNone(result[0]['published'])
    def test_failed_feed_retains_recent_articles_and_success_date(self):
        recent = dt.datetime.now(dt.timezone.utc).isoformat()
        previous = {'articles': [
            {'id': 'recent', 'source': 'test', 'published': recent},
            {'id': 'old', 'source': 'test', 'published': '2020-01-01T00:00:00+00:00'},
            {'id': 'other', 'source': 'other', 'published': recent},
        ], 'status': {'test': {'lastSuccess': recent}}}
        with patch.object(collect.urllib.request, 'urlopen', side_effect=TimeoutError('Timeout')):
            articles, health = collect.fetch_source({**SOURCE, 'feed': 'https://example.org/rss'}, previous)
        self.assertEqual([a['id'] for a in articles], ['recent'])
        self.assertEqual(health['state'], 'stale')
        self.assertEqual(health['lastSuccess'], recent)
    def test_all_failed_collection_does_not_advance_edition_date(self):
        previous = {'generated': NOW.isoformat(), 'articles': [{'source': 'test', 'title': 'Anterior', 'published': NOW.isoformat()}], 'status': {}}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data').mkdir()
            (root / 'data/sources.json').write_text(json.dumps([{'id': 'test', 'name': 'Test'}]), encoding='utf-8')
            (root / 'data/news.json').write_text(json.dumps(previous), encoding='utf-8')
            with patch.object(collect, 'ROOT', root), patch.object(collect, 'fetch_source', return_value=(previous['articles'], {'state': 'stale', 'count': 1})):
                collect.main()
            result = json.loads((root / 'data/news.json').read_text(encoding='utf-8'))
            self.assertEqual(result['generated'], previous['generated'])
            self.assertIn('checked', result)
if __name__ == '__main__': unittest.main()
