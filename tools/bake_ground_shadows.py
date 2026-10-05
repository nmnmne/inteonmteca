"""Offline soft surface masks, generated from actual scene-depth assets."""
import base64, functools, hashlib, io, json, threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image, ImageFilter
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parents[1]
out = root/'yard/data/shadows/ground'
out.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*_): pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page()
        page.goto(f'http://127.0.0.1:{server.server_port}/tools/')
        page.evaluate("async()=>{window.groundBaker=await(await import('./bake_ground_shadows.js')).prepareGround(2048)}")
        manifest={'kind':'offline-ground-illumination','resolution':2048,'mobileResolution':1024,'presets':[]}
        for index in range(12):
            row=page.evaluate('(i)=>groundBaker.bake(i)',index)
            image=Image.open(io.BytesIO(base64.b64decode(row.pop('png')))).convert('L').filter(ImageFilter.GaussianBlur(1.25))
            row['file']=f'ground-{index:02}.png';row['mobileFile']=f'ground-{index:02}-mobile.png'
            image.save(out/row['file'],optimize=True)
            image.resize((1024,1024),Image.Resampling.LANCZOS).save(out/row['mobileFile'],optimize=True)
            row['sha256']=hashlib.sha256((out/row['file']).read_bytes()).hexdigest()
            row['mobileSha256']=hashlib.sha256((out/row['mobileFile']).read_bytes()).hexdigest()
            manifest['presets'].append(row)
            print(index,(out/row['file']).stat().st_size,flush=True)
        (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
        browser.close()
finally:
    server.shutdown();server.server_close()
