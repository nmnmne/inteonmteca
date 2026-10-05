"""Native media ended (seek near EOF), boundary stop + home handoff + manual next."""
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

class QuietHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        file = Path(self.translate_path(self.path))
        requested = self.headers.get('Range', '')
        if file.is_file() and requested.startswith('bytes='):
            start, _, end = requested[6:].partition('-')
            size = file.stat().st_size
            start = int(start or 0); end = min(int(end) if end else size-1, size-1)
            self.send_response(206)
            self.send_header('Content-Type', self.guess_type(str(file)))
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.send_header('Content-Length', str(end-start+1))
            self.end_headers()
            with file.open('rb') as stream:
                stream.seek(start)
                self.wfile.write(stream.read(end-start+1))
        else: super().do_GET()
    def log_message(self, *_): pass
    def handle(self):
        try: super().handle()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError): pass

root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(root)))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True, args=['--autoplay-policy=no-user-gesture-required'])
        page = browser.new_page(viewport={'width': 1000, 'height': 800})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        url = f'http://127.0.0.1:{server.server_port}'
        def saved(): return page.evaluate('inteonPlayback.read()')
        def ready(): page.wait_for_function('!!window.__yard')
        def cross():
            page.evaluate('__yard.body.x=163; __yard.body.z=0')
            page.wait_for_timeout(200)
            page.evaluate('__yard.body.x=165; __yard.body.z=0')
            page.wait_for_function('document.querySelector("audio").currentTime>.1 && !document.querySelector("audio").paused && inteonPlayback.read()?.stopAtEnd')
        def end():
            page.evaluate('''() => { const a=document.querySelector('audio'); window.nativeEnded=0;
              a.addEventListener('ended', e=> { if(e.isTrusted) window.nativeEnded++; }, {once:true});
              a.playbackRate=8; a.currentTime=Math.max(0,a.duration-10); }''')
            try: page.wait_for_function('window.nativeEnded===1', timeout=30000)
            except Exception:
                print(page.evaluate('''() => {const a=document.querySelector('audio');return {src:a.src,time:a.currentTime,duration:a.duration,paused:a.paused,ended:a.ended,seeking:a.seeking,ready:a.readyState,error:a.error?.message,events:window.nativeEnded};}'''), flush=True)
                raise
            page.wait_for_timeout(250)
        page.goto(url+'/yard/'); ready(); cross()
        initial = saved(); assert initial['stopAtEnd'] and initial['origin']=='yard'
        bonus = page.evaluate('JSON.parse(localStorage.getItem("inteonmteca-street-walk-v1"))')
        end()
        assert saved()['audio']==initial['audio'], saved()
        assert not saved()['playingIntent'] and saved()['paused'], saved()
        assert page.evaluate('JSON.parse(localStorage.getItem("inteonmteca-street-walk-v1")).deadline')==bonus['deadline']
        # Explicit next cancels boundary single-track policy and advances at EOF.
        page.keyboard.press('BracketRight')
        page.wait_for_function('document.querySelector("audio").currentTime>.1')
        manual = saved(); assert not manual['stopAtEnd']
        end(); page.wait_for_function('!document.querySelector("audio").paused')
        assert saved()['audio']!=manual['audio']
        # A second boundary selection retains the original daily bonus.
        cross()
        assert page.evaluate('JSON.parse(localStorage.getItem("inteonmteca-street-walk-v1")).deadline')==bonus['deadline']
        page.goto(url+'/index.html')
        page.wait_for_function('document.querySelector("audio").currentTime>.1 && !document.querySelector("audio").paused')
        home = saved(); assert home['stopAtEnd'] and home['origin']=='yard', home
        end()
        assert saved()['audio']==initial['audio'], saved()
        assert not saved()['playingIntent'] and saved()['paused'], saved()
        assert saved()['origin']=='yard' and saved()['stopAtEnd'], saved()
        page.reload()
        page.wait_for_function('document.querySelector("audio").readyState>=1')
        assert page.evaluate('document.querySelector("audio").paused')
        assert not saved()['playingIntent']
        assert not errors, errors
        print(json.dumps({'yardNativeEndedStops':True,'manualNativeEndedAdvances':True,'homeHandoffNativeEndedStops':True,'reloadRemainsPaused':True,'dailyBonusNotRetriggered':True,'pageErrors':errors}))
        browser.close()
finally:
    server.shutdown(); server.server_close()
