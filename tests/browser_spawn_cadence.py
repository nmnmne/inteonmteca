"""Real Edge acceptance for daily/ten-outing spawn reset and 5s/2s cadence."""
import json
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8080/'
OUT = Path(tempfile.mkdtemp(prefix='inteon-spawn-cadence-'))
report = {}
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    context = browser.new_context(viewport={'width':1440,'height':900})
    context.add_init_script('''(() => {
      const RealDate = Date;
      window.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [Number(localStorage.getItem('__test-day')) || new RealDate(2026,9,29,12).getTime()])); }
        static now() { return Number(localStorage.getItem('__test-day')) || new RealDate(2026,9,29,12).getTime(); }
      };
    })();''')
    page = context.new_page()
    page.goto(BASE, wait_until='load')
    page.evaluate('''() => {
      for(let i=0;i<9;i++) inteonStreet.noteExit();
      inteonStreet.savePose({x:42,z:-2.5,yaw:1,pitch:.1});
      inteonStreet.endVisit();
    }''')
    def enter():
        page.locator('#street-link').click()
        page.wait_for_url('**/yard/', timeout=20000)
        page.wait_for_function('window.__yard && document.documentElement.dataset.yardReady === "true"', timeout=30000)
    def body():
        return page.evaluate('({body:{...__yard.body},base:__yard.layout.spawn,visits:inteonStreet.visits()})')
    def fail_preview():
        before = page.evaluate('Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith("inteonmteca-street-")))')
        def unavailable(route):
            route.fulfill(status=200, content_type='text/html', body='<body class="yard-unavailable"></body>')
        page.route('**/yard/?portal-preview=1', unavailable)
        page.locator('#street-link').click()
        page.wait_for_function('!inteonPortal.busy && document.querySelector("#street-link").title.includes("ещё раз")')
        after = page.evaluate('Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith("inteonmteca-street-")))')
        assert page.url == BASE, page.url
        assert after == before, {'before':before,'after':after}
        page.unroute('**/yard/?portal-preview=1', unavailable)
        return {'visits':page.evaluate('inteonStreet.visits()'),'pose':page.evaluate('inteonStreet.resumePose()')}
    failed_tenth = fail_preview()
    assert failed_tenth['visits'] == 9 and failed_tenth['pose']['x'] == 42, failed_tenth
    enter()
    tenth = body()
    assert tenth['visits'] == 10 and tenth['body']['x'] == 42, tenth
    page.reload(wait_until='load')
    page.wait_for_function('window.__yard')
    reloaded = body()
    assert reloaded['visits'] == 10 and reloaded['body']['x'] == 42, reloaded
    page.goto(BASE, wait_until='load')
    failed_eleventh = fail_preview()
    assert failed_eleventh['visits'] == 10 and failed_eleventh['pose']['x'] == 42, failed_eleventh
    enter()
    eleventh = body()
    assert eleventh['visits'] == 11 and eleventh['body']['x'] == eleventh['base']['x'] and eleventh['body']['z'] == eleventh['base']['z'], eleventh
    page.evaluate('''() => {
      Object.assign(__yard.body,{x:42,z:-2.5});
      inteonStreet.savePose(__yard.body);
      localStorage.setItem('__test-day', String(new Date(2026,9,30,0,0,1).getTime()));
      inteonStreet.savePose(__yard.body);
    }''')
    assert page.evaluate('inteonStreet.resumePose()') is None, 'midnight periodic save cannot undo reset'
    page.goto(BASE, wait_until='load')
    enter()
    daily = body()
    assert daily['visits'] == 1 and daily['body']['x'] == daily['base']['x'] and daily['body']['z'] == daily['base']['z'], daily
    report['spawn'] = {'failedTenth':failed_tenth,'tenth':tenth,'reload':reloaded,'failedEleventh':failed_eleventh,'eleventh':eleventh,'nextDay':daily}
    context.close()

    context = browser.new_context(viewport={'width':1440,'height':900})
    context.add_init_script('''window.__phases=[]; window.addEventListener('inteon-ambient-change',()=>{
      __phases.push({at:performance.now(),phase:document.documentElement.dataset.ambientPhase,
        duration:document.documentElement.style.getPropertyValue('--ambient-freeze-duration')});
    });''')
    page = context.new_page()
    page.goto(BASE, wait_until='load')
    page.bring_to_front()
    page.wait_for_function('__phases.length >= 5', timeout=25000)
    phases = page.evaluate('__phases.slice(0,5)')
    for before, after in zip(phases,phases[1:]):
        expected = 5000 if before['phase']=='running' else 2000
        assert abs(after['at']-before['at']-expected)<500, phases
    report['phases'] = phases
    page.wait_for_function('window.inteonAlternateLogo?.show(12)', timeout=45000)
    page.wait_for_timeout(400)
    assert page.locator('.alternate-wordmark').evaluate('(e)=>getComputedStyle(e).filter') == 'brightness(0.82)'
    page.screenshot(path=str(OUT/'lime-12.png'))
    page.evaluate('inteonAlternateLogo.hide()')
    page.wait_for_function('window.inteonAlternateLogo?.show(1)', timeout=45000)
    page.wait_for_timeout(400)
    assert page.locator('.alternate-wordmark').evaluate('(e)=>getComputedStyle(e).filter') == 'none'
    page.evaluate('inteonAlternateLogo.hide()')
    assert page.evaluate('inteonAlternateLogo.activeVariant') is None
    report['logo'] = {'limeVariant':12,'filter':'brightness(0.82)','otherVariant':1,'otherFilter':'none','restored':True}
    context.close()
    browser.close()
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':report,'artifacts':str(OUT)},ensure_ascii=False,indent=2))
