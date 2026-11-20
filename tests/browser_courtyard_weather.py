"""Render the local weather field and verify reduced-motion poster selection."""
import os
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

BASE = os.environ.get('INTEON_BASE_URL', 'http://127.0.0.1:8080').rstrip('/')


def particles(browser):
    page = browser.new_page(viewport={'width': 960, 'height': 640})
    errors = []
    page.on('console', lambda msg: errors.append(msg.text) if 'Shader Error' in msg.text else None)
    page.goto(BASE + '/robots.txt')
    result = page.evaluate("""async () => {
        const T=await import('/yard/vendor/three.module.js');
        const {addCourtyardWeather}=await import('/yard/courtyard-weather.js');
        const layout=await (await fetch('/yard/data/site-layout.json')).json();
        const scene=new T.Scene(), camera=new T.PerspectiveCamera(69,1.5,.05,90);
        addCourtyardWeather(scene,layout);
        const {count:leaves}=scene.getObjectByName('courtyard-fallen-leaves');
        const banks=scene.getObjectByName('courtyard-melting-snow').geometry.attributes.position.count;
        scene.children.filter(o=>o.name!=='courtyard-weather-fronts').forEach(o=>o.visible=false);
        const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true});
        renderer.setSize(480,320,false);
        const gl=renderer.getContext(), pixels=new Uint8Array(480*320*4);
        scene.userData.grassWind={value:0};
        function frame(x,t,v) {
            camera.position.set(x,1.7,0); camera.lookAt(x,1.7,-14);
            scene.userData.grassWind.value=t; scene.userData.virtuality=v;
            renderer.render(scene,camera);
            gl.readPixels(0,0,480,320,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
            let lit=0,hash=17;
            for(let i=0;i<pixels.length;i+=4) {
                if(pixels[i]+pixels[i+1]+pixels[i+2]>8) lit++;
                hash=Math.imul(hash,31)+pixels[i]|0;
            }
            return [lit,hash];
        }
        const samples=[0,15,30,45,60].map(x=>frame(x,8,0));
        const next=frame(0,10,0), virtual=frame(0,10,1);
        renderer.dispose();
        return {leaves,banks,samples,next,virtual};
    }""")
    assert not errors, errors
    assert result['leaves'] > 230 and result['banks'] > 300, result
    assert all(s[0] > 15 for s in result['samples']), result
    assert len({s[1] for s in result['samples']}) == 5, result
    assert result['next'][1] != result['samples'][0][1] and result['virtual'][0] == 0, result
    print('Rendered weather', result, flush=True)
    page.close()


def posters(browser):
    for mobile in [False, True]:
        page = browser.new_page(viewport={'width': 390 if mobile else 1120, 'height': 800}, reduced_motion='reduce')
        start = datetime(2026, 9, 22, 0, 2, 52, tzinfo=timezone.utc)
        page.clock.install(time=start)
        page.goto(BASE + '/#studio', wait_until='domcontentloaded')
        for phase, elapsed in [('dawn',0),('day',360),('dusk',700),('night',1080),('dawn',1440)]:
            # Let the site's own visible-tab timer update the still image.
            delta = round(start.timestamp()*1000 + elapsed*1000 - page.evaluate("Date.now()"))
            if delta > 0:
                page.clock.fast_forward(delta)
            size = 'mobile' if mobile else 'desktop'
            filename = f'spawn-{size}' + ('' if phase == 'day' else '-' + phase) + '.jpg'
            page.wait_for_function("""([phase,file]) => {
                const layer=document.querySelector('[data-yard-layer]'), img=layer?.querySelector('img');
                return layer?.dataset.solarPhase===phase && img.complete && img.naturalWidth>0 && img.currentSrc.endsWith(file);
            }""", arg=[phase,filename])
            assert page.locator('[data-yard-layer] canvas').count() == 0
        page.close()
    print('All eight static courtyard views loaded', flush=True)


if __name__ == '__main__':
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='msedge', args=['--enable-unsafe-swiftshader'])
        particles(browser)
        posters(browser)
        browser.close()
