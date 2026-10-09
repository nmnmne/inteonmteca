"""Real production yard, native autoplay denial, real FLAC, controlled local clock."""
import functools
import json
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass
    def handle(self):
        try: super().handle()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError): pass

root=Path(__file__).resolve().parents[1]
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True,args=['--autoplay-policy=user-gesture-required'])
        page=browser.new_page(viewport={'width':1280,'height':800})
        errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
        page.add_init_script('''const RealDate=Date;
          window.clockOffset=Number(sessionStorage.getItem('clockOffset')||0);
          window.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[RealDate.now()+window.clockOffset]));} static now(){return RealDate.now()+window.clockOffset;}};
          window.playAttempts=0; const play=HTMLMediaElement.prototype.play;
          HTMLMediaElement.prototype.play=function(...args){window.playAttempts++;return play.apply(this,args);};
        ''')
        url=f'http://127.0.0.1:{server.server_port}'
        page.goto(url+'/yard/')
        cdp=page.context.new_cdp_session(page)
        def evaluate(expression):
            return cdp.send('Runtime.evaluate',{'expression':expression,'userGesture':False,'returnByValue':True})['result'].get('value')
        def ready():
            for _ in range(200):
                if evaluate('!!window.__yard'):return
                time.sleep(.05)
            raise AssertionError('yard not ready')
        def pose(x):
            evaluate(f'__yard.body.x={x};__yard.body.z=0;');page.wait_for_timeout(150)
        def state():return json.loads(evaluate("localStorage.getItem('inteonmteca-street-walk-v1')"))
        ready();original_deadline=state()['deadline'];pose(163.9);assert evaluate('playAttempts')==0
        pose(164)
        for _ in range(80):
            if evaluate('!!document.querySelector("#yard-boundary-play") && !document.querySelector("#yard-boundary-play").hidden'):break
            time.sleep(.05)
        else:raise AssertionError('native denial retry not shown')
        assert evaluate('document.querySelector("audio").paused')
        assert not state().get('consumedDay'),state()
        assert not evaluate('navigator.userActivation.hasBeenActive')
        page.locator('#yard-boundary-play').click()
        page.wait_for_function('document.querySelector("audio").currentTime>.2 && !document.querySelector("audio").paused')
        first=state(); assert first['deadline']==original_deadline+240000
        assert evaluate('inteonStreet.seconds()')==260
        exact=page.evaluate('decodeURI(document.querySelector("audio").currentSrc)')
        assert exact.endswith('/media/God Is Dead/Матт - God Is Dead.flac')
        # Same active track remains uninterrupted, another active track is replaced.
        n=evaluate('playAttempts');pose(163);pose(165);assert evaluate('playAttempts')==n
        page.keyboard.press('BracketRight');page.wait_for_function('document.querySelector("audio").currentTime>.2')
        assert page.evaluate('decodeURI(document.querySelector("audio").src)')!=exact
        pose(163);pose(165);page.wait_for_function('document.querySelector("audio").currentTime>.2')
        assert page.evaluate('decodeURI(document.querySelector("audio").src)')==exact
        assert state()['deadline']==first['deadline']
        # Reload one device-clock minute later keeps exactly the same deadline.
        evaluate("sessionStorage.setItem('clockOffset','60000')")
        page.reload();ready();assert state()['deadline']==first['deadline']
        assert 0<state()['deadline']-evaluate('Date.now()')<200000
        # Actual home navigation forfeits, later switch still works without bonus.
        page.goto(url+'/index.html'); assert state()['ended'] and state()['deadline'] is None
        page.evaluate('inteonStreet.noteExit()');page.goto(url+'/yard/');ready()
        assert evaluate('inteonStreet.seconds()')==380
        ordinary=state()['deadline'];pose(163);pose(165)
        retry=page.locator('#yard-boundary-play')
        if retry.is_visible():retry.click()
        page.wait_for_function('!document.querySelector("audio").paused && document.querySelector("audio").currentTime>.2')
        assert state()['deadline']==ordinary and state()['consumedDay']==first['consumedDay']
        assert not errors,errors
        print(json.dumps({'nativeDenialNoBonus':True,'realFlacPlayback':exact,'otherActiveTrackReplaced':True,'sameTrackUninterrupted':True,'reloadDeadlinePreserved':True,'homeForfeits':True,'sameDayNoRepeat':True,'pageErrors':errors}))
        browser.close()
finally:
    server.shutdown();server.server_close()
