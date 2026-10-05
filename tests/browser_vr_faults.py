"""Injected failure/OS constraints, followed by real media retry in Edge."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path(__file__).parent / 'artifacts/vr-player'
results = {}
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    ctx = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.route('https://**/*', lambda r:r.abort())
    page.add_init_script('''const originalPlay=HTMLMediaElement.prototype.play;let deny=true;
      HTMLMediaElement.prototype.play=function(){if(deny){deny=false;return Promise.reject(new DOMException('QA denial','NotAllowedError'))}return originalPlay.call(this)};
      localStorage.setItem('inteonmteca-playback',JSON.stringify({audio:'media/God Is Dead/Матт - God Is Dead.flac',title:'God Is Dead',time:18,paused:false,origin:'yard',playingIntent:true}));''')
    page.goto('http://127.0.0.1:8080/')
    page.wait_for_function('playbackStatus.dataset.state === "error"')
    assert page.evaluate('player.paused && inteonPlayback.read().playingIntent && player.currentTime >= 17')
    assert page.locator('#immersive-play-icon').get_attribute('data-state') == 'paused'
    assert page.locator('#active-player').is_visible()
    page.screenshot(path=str(out/'autoplay-blocked.png'))
    page.locator('#immersive-play').tap()
    page.wait_for_function('!player.paused && player.currentTime>18 && immersivePlayIcon.dataset.state === "playing"')
    results['injectedAutoplayDenialAndRealRetry'] = True
    ctx.close()

    ctx = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.route('https://**/*', lambda r:r.abort())
    page.route('**/media/**', lambda r:r.abort())
    page.goto('http://127.0.0.1:8080/')
    page.locator('.track-select').first.tap()
    page.wait_for_function('playbackStatus.dataset.state === "error"')
    assert page.locator('#immersive-play-icon').get_attribute('data-state') == 'paused'
    assert page.locator('#active-player').is_visible()
    page.screenshot(path=str(out/'audio-error.png'))
    results['audioNetworkFailureHasNoFalsePlayingIcon'] = True
    ctx.close()

    ctx = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.route('https://**/*', lambda r:r.abort())
    page.add_init_script('''Object.defineProperty(HTMLMediaElement.prototype,'volume',{get(){return 1},set(){}});''')
    page.goto('http://127.0.0.1:8080/')
    assert page.locator('#track-volume').is_hidden()
    assert page.locator('#volume-note').is_visible()
    page.locator('#chat-hint').tap()
    page.evaluate('''Object.defineProperty(visualViewport,'height',{value:360,configurable:true});visualViewport.dispatchEvent(new Event('resize'));''')
    for selector in ['#chat-input','#chat-close']:
        box = page.locator(selector).bounding_box()
        assert box['y'] >= 0 and box['y'] + box['height'] <= 360, box
    page.screenshot(path=str(out/'keyboard-viewport-simulated.png'))
    page.keyboard.press('Escape')
    assert page.locator('#active-player').is_visible()
    results['injectedSystemVolumeConstraint'] = True
    results['simulatedKeyboardViewport'] = True
    ctx.close()
    browser.close()
(out/'faults.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(json.dumps(results, indent=2))
