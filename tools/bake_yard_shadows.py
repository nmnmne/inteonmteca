"""Rebuild all 12 light-space depth textures from the actual scene (no runtime baker).
Requires Python pillow/playwright and installed Microsoft Edge. Run from any cwd.
"""
import base64
import argparse
import functools
import hashlib
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image
import io
ROOT = Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mobile', action='store_true')
    args = parser.parse_args()
    size = 1024 if args.mobile else 4096
    output = ROOT / 'yard/data/shadows'
    if args.mobile: output = output / 'mobile'
    output.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1',0), functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='msedge',headless=True)
            page = browser.new_page()
            errors=[]
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console',lambda m: errors.append(m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
            page.goto(f'http://127.0.0.1:{server.server_port}/tools/')
            meta=page.evaluate('''async size => { window.baker=await (await import('./bake_yard_shadows.js')).prepare(size);
                return {meshCount:baker.meshCount,instances:baker.instances,resolution:baker.resolution,bounds:baker.bounds}; }''',size)
            manifest={**meta,'format':'rgb24-depth','kind':'precomputed-projected-depth-not-UV-lightmaps','presets':[]}
            for index in range(12):
                row=page.evaluate('(i)=>baker.bake(i)',index)
                image=Image.open(io.BytesIO(base64.b64decode(row.pop('png')))).convert('RGB')
                row['file']=f'sun-{index:02d}.png'
                image.save(output/row['file'],optimize=True)
                row['bytes']=(output/row['file']).stat().st_size
                row['sha256']=hashlib.sha256((output/row['file']).read_bytes()).hexdigest()
                manifest['presets'].append(row)
                print(index,row['bytes'],row['metersPerTexel'],flush=True)
            assert not errors, errors
            sources = [*sorted((ROOT/'yard').glob('*.js')),ROOT/'yard/data/site-layout.json',Path(__file__).with_suffix('.js')]
            manifest['sourceHashes']={str(s.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(s.read_bytes()).hexdigest() for s in sources if s.name not in ('main.js','wall-player.js','boundary-music.js','quality.js','input-controller.js','navigation.js')}
            (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
            print(json.dumps({'meshCount':meta['meshCount'],'instances':meta['instances'],'totalBytes':sum(r['bytes'] for r in manifest['presets']),'errors':errors}))
            browser.close()
    finally:
        server.shutdown(); server.server_close()
if __name__=='__main__': main()
