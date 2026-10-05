"""Repeatable emulated mobile rendering audit; not a physical-device FPS test."""
import functools, json, sys, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass
    def copyfile(self, source, outputfile):
        try: super().copyfile(source, outputfile)
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError): pass

root = Path(__file__).resolve().parents[1]
out = Path.home() / 'render-cost-audit'
out.mkdir(exist_ok=True)
label = sys.argv[1] if len(sys.argv)>1 else 'current'
server = ThreadingHTTPServer(('127.0.0.1',0), functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
results=[]
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        for route in ['/', '/yard/']:
            mobile = not (len(sys.argv)>2 and sys.argv[2]=='desktop')
            context=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 900},device_scale_factor=3 if mobile else 2,is_mobile=mobile,has_touch=mobile)
            page=context.new_page()
            page.add_init_script("""const d=new Date();localStorage.setItem('inteonmteca-street-day',`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);localStorage.setItem('inteonmteca-street-rule','10..65');localStorage.setItem('inteonmteca-street-return-sec','65');""")
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
            page.route('https://**/*',lambda r:r.abort())
            page.goto(f'http://127.0.0.1:{server.server_port}'+route,wait_until='load')
            if 'yard' in route: page.wait_for_function('!!window.__yard')
            else: page.wait_for_selector('.track-select')
            page.wait_for_timeout(2000)
            cdp=context.new_cdp_session(page)
            cdp.send('Performance.enable')
            def metrics(): return {x['name']:x['value'] for x in cdp.send('Performance.getMetrics')['metrics']}
            for mode in (['idle','turning'] if 'yard' in route else ['idle']):
                if mode=='turning': page.evaluate('window.auditTurn=setInterval(()=>__yard.body.yaw+=.015,32)')
                page.evaluate('''() => {window.auditFrames=[];window.auditLast=0;window.auditStop=false;const tick=t=>{if(auditLast) auditFrames.push(t-auditLast);auditLast=t;if(!auditStop)requestAnimationFrame(tick)};requestAnimationFrame(tick);window.auditRenderStart=window.__yard?.renderer.info.render.frame||0;}''')
                before=metrics()
                page.wait_for_timeout(6000)
                after=metrics()
                sample=page.evaluate('''() => {auditStop=true;clearInterval(window.auditTurn);const a=auditFrames.sort((a,b)=>a-b);return {rafSamples:a.length,rafMedianMs:a[Math.floor(a.length/2)],rafP95Ms:a[Math.floor(a.length*.95)],rafOver50:a.filter(x=>x>50).length,renderedFrames:window.__yard?__yard.renderer.info.render.frame-auditRenderStart:null,canvas:window.__yard?{width:__yard.renderer.domElement.width,height:__yard.renderer.domElement.height,pixelRatio:__yard.renderer.getPixelRatio(),calls:__yard.renderer.info.render.calls,triangles:__yard.renderer.info.render.triangles}:null,overflow:document.documentElement.scrollWidth>innerWidth}}''')
                sample.update({'route':route,'mode':mode,'errors':list(errors),'seconds':after['Timestamp']-before['Timestamp']})
                sample['cdpDelta']={k:after[k]-before[k] for k in ['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount']}
                page.screenshot(path=str(out/f'{label}-{ "yard" if "yard" in route else "home"}-{mode}.png'))
                results.append(sample)
            context.close()
        browser.close()
finally:
    server.shutdown();server.server_close()
(out/f'{label}.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
