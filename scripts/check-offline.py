#!/usr/bin/env python3
"""Audit the shipped offline resources; --write refreshes the local inventory."""
from pathlib import Path
from html.parser import HTMLParser
import argparse, json, os, re

ROOT = Path(__file__).resolve().parents[1]
FOLDERS = ('escudos', 'camisas', 'camisas2', 'icons', 'flags')
parser = argparse.ArgumentParser()
parser.add_argument('--write', action='store_true')
args = parser.parse_args()
if args.write:
    renamed = []
    for path in (ROOT / 'assets').rglob('*'):
        if path.is_file() and any(0xDC80 <= ord(ch) <= 0xDCFF for ch in path.name):
            target = path.with_name(os.fsencode(path.name).decode('cp1252'))
            if target.exists(): raise SystemExit(f'Asset name conflict: {target}')
            renamed.append({'old_bytes_hex': os.fsencode(str(path.relative_to(ROOT))).hex(), 'new': str(target.relative_to(ROOT))})
            path.rename(target)
    if renamed:
        backup = ROOT / '.backups/before-offline/renamed-assets.json'
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_text(json.dumps(renamed, ensure_ascii=False, indent=2) + '\n')
    inventory = {folder: sorted(p.name for p in (ROOT / 'assets' / folder).iterdir() if p.is_file()) for folder in FOLDERS}
    (ROOT / 'data/assets_data.js').write_text('// Local asset inventory. Regenerate with python3 scripts/check-offline.py --write.\nwindow.BRASFOOT_ASSETS = ' + json.dumps(inventory, ensure_ascii=False) + ';\n')
    print(f'Inventory refreshed; {len(renamed)} filenames normalized to UTF-8.')

class Resources(HTMLParser):
    def __init__(self): super().__init__(); self.paths=[]; self.csp=''
    def handle_starttag(self, tag, attributes):
        attrs=dict(attributes)
        if tag in ('script','img','audio','source','link'):
            value=attrs.get('src') or attrs.get('href')
            if value: self.paths.append(value)
        if tag=='meta' and attrs.get('http-equiv','').lower()=='content-security-policy': self.csp=attrs.get('content','')

html=Resources();html.feed((ROOT/'index.html').read_text())
errors=[]
for path in html.paths:
    if re.match(r'^(?:[a-z]+:)?//', path, re.I): errors.append(f'External resource: {path}')
    elif not (ROOT/path).is_file():errors.append(f'Missing resource: {path}')
if "connect-src 'none'" not in html.csp:errors.append('Missing offline connection policy.')
for relative in ('app.js', *(str(p.relative_to(ROOT)) for p in sorted((ROOT/'src/engine').glob('*.js')))):
    if re.search(r'\b(?:fetch\s*\(|XMLHttpRequest\b|WebSocket\b|EventSource\b)',(ROOT/relative).read_text()):errors.append(f'Network API in runtime: {relative}')
for resource in re.findall(r'url\([\'"]?([^\)\'\"]+)',(ROOT/'style.css').read_text()):
    if not (ROOT/resource).is_file():errors.append(f'Nonlocal/missing CSS resource: {resource}')
manifest_file=ROOT/'data/assets_data.js'
if not manifest_file.exists(): errors.append('Missing local asset inventory.')
else:
    manifest=json.loads(manifest_file.read_text().split('window.BRASFOOT_ASSETS = ',1)[1].rsplit(';',1)[0])
    for folder,names in manifest.items():
        for name in names:
            if not (ROOT/'assets'/folder/name).is_file():errors.append(f'Missing inventory asset: {folder}/{name}')
    for name in ('escudo.png','camisat40.png','camisar40.png','camisaVazia.png','ball.png'):
        if name not in manifest['icons']:errors.append(f'Missing local fallback: {name}')
    teams=json.loads((ROOT/'data/teams.json').read_text())
    for folder,field in [('escudos','shield'),('camisas','shirt'),('camisas2','shirt')]:
        found=sum(t[field] in manifest[folder] for t in teams)
        print(f'{folder}: {found}/{len(teams)} original images; local fallback for the rest.')
if errors:raise SystemExit('\n'.join(errors))
print('PASS: runtime scripts, styles, images, audio, local inventory and network policy are offline.')
