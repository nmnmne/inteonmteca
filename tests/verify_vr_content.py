"""Compare protected copy/assets with the handoff and this continuation's snapshot."""
import hashlib
import json
import re
import subprocess
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests/artifacts/vr-final'
current = (ROOT / 'index.html').read_text(encoding='utf-8')
handoff = (ROOT / '.hermes/plans/2026-10-04-vr-player/hour-start-snapshot/index.html').read_text(encoding='utf-8')
start = (OUT / 'start/index.html').read_text(encoding='utf-8')
head = subprocess.check_output(['git', 'show', 'HEAD:index.html'], cwd=ROOT).decode('utf-8')

def seo(source):
    return {
        'title': re.findall(r'<title>.*?</title>', source, re.S),
        'meta': re.findall(r'<meta\b[^>]*>', source),
        'canonical': re.findall(r'<link rel="canonical"[^>]*>', source),
        'jsonld': re.findall(r'<script type="application/ld\+json">(.*?)</script>', source, re.S),
        'hidden': re.findall(r'<p class="visually-hidden">(.*?)</p>', source, re.S),
    }

def copy(source):
    values = re.findall(r'<p class="(?:topline|label|ours|text) matrix-text">(.*?)</p>|<h1>(.*?)</h1>', source, re.S)
    return sorted(' '.join(unescape(re.sub(r'<[^>]+>', ' ', ''.join(v))).split()) for v in values)

assert seo(current) == seo(handoff) == seo(start) == seo(head), 'SEO text changed'
assert copy(current) == copy(handoff) == copy(start), 'Approved brand copy changed'
logo = lambda s: re.search(r'<svg\b[^>]*\bid="logo-vector".*?</svg>', s, re.S).group(0)
assert logo(current) == logo(handoff) == logo(start) == logo(head), 'Original logo changed'
protected = json.loads((OUT / 'protected-before.json').read_text(encoding='utf-8-sig'))
for row in protected:
    assert hashlib.sha256(Path(row['Path']).read_bytes()).hexdigest().upper() == row['Hash'], row['Path']
assert not subprocess.check_output(['git', 'diff', '--', 'playlist.json', 'playlist-data.js', 'media', 'robots.txt', 'sitemap.xml'], cwd=ROOT)
result = {'seoIdenticalToHEADAndBothSnapshots': True, 'approvedCopyIdentical': True,
          'originalLogoIdentical': True, 'protectedFilesHashChecked': len(protected), 'brandCopy': copy(current)}
(OUT / 'content-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
