"""Cross the virtual perimeter with no flock visit, then return to the room."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright


BASE = os.getenv("INTEON_BASE_URL", "http://127.0.0.1:8080").rstrip("/")


def control_camera(route):
    source = route.request.url
    if "orb-test-source" in source:
        return route.continue_()
    source += ("&" if "?" in source else "?") + "orb-test-source"
    route.fulfill(content_type="text/javascript", body=f"""
      export * from '{source}';
      import {{createAutoWalk as make}} from '{source}';
      export function createAutoWalk(layout,options) {{
        const walk=make(layout,options), home=walk.update(0);
        const outside={{...home,x:Math.min(...layout.walkable.map(p=>p[0]))-72,y:5,
                        pitch:0,yaw:Math.PI/2,roll:0}};
        const ring=layout.buildings.find(h=>h.id==='house-46-1').footprint;
        const house={{...home,x:ring.reduce((s,p)=>s+p[0],0)/ring.length,
          z:ring.reduce((s,p)=>s+p[1],0)/ring.length,y:3}};
        window.orbQA={{place:'home'}};
        const views={{home,house,outside}};
        return {{...walk, update:()=>views[orbQA.place]}};
      }}
    """)


def check(browser, mobile):
    page = browser.new_page(viewport={"width": 390 if mobile else 1366, "height": 844 if mobile else 820},
                            is_mobile=mobile, has_touch=mobile)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if "Shader Error" in msg.text else None)
    page.route("**/yard/auto-walk.js*", control_camera)
    page.goto(BASE + "/", wait_until="domcontentloaded")
    page.wait_for_selector("body[data-yard-backdrop=live]", state="attached", timeout=75000)
    page.evaluate("""async () => {
      const T=await import('/yard/vendor/three.module.js'), previous=T.Scene.prototype.onAfterRender;
      T.Scene.prototype.onAfterRender=function(renderer,scene,camera,...args){
        previous.call(this,renderer,scene,camera,...args);
        const orb=scene.getObjectByName('resident-luminous-sphere');
        if(!orb || !renderer.domElement.closest('[data-yard-layer]')) return;
        Object.assign(orbQA,{scene,camera,renderer,orb,T,actor:scene.getObjectByName('courtyard-resident')});
        T.Scene.prototype.onAfterRender=previous;
      };
    }""")
    page.wait_for_function("orbQA.orb && !orbQA.orb.visible && !orbQA.actor.visible")
    overlay = page.locator(".room-resident")
    assert overlay.is_visible()
    page.evaluate("orbQA.place='outside'")
    page.wait_for_function("""orbQA.scene.userData.cityBackstage===1 && orbQA.orb.visible && !orbQA.actor.visible &&
                              document.querySelector('.room-resident[data-in-backstage][hidden]')""")
    pixels = page.evaluate("""() => {
      const {T,renderer,scene,camera,orb}=orbQA;
      const w=Math.min(700,renderer.domElement.width),h=Math.round(w/camera.aspect);
      const center=orb.position.clone().project(camera);
      const x=Math.round((center.x+1)*w*.5),y=Math.round((center.y+1)*h*.5);
      const previous=renderer.getRenderTarget(), rt=new T.WebGLRenderTarget(w,h);
      try {
        renderer.setRenderTarget(rt);
        const render=()=>{
          renderer.render(scene,camera);
          const pixels=new Uint8Array(w*h*4);
          renderer.readRenderTargetPixels(rt,0,0,w,h,pixels); return pixels;
        };
        const on=render(); orb.visible=false;
        const off=render();
        let lit=0, cool=0, peakGain=0;
        for(let j=Math.max(0,y-75); j<Math.min(h,y+75); j++) for(let i=Math.max(0,x-75);i<Math.min(w,x+75);i++){
          const p=(j*w+i)*4;
          const gain=Math.max(on[p]-off[p],on[p+1]-off[p+1],on[p+2]-off[p+2]);
          peakGain=Math.max(peakGain,gain);
          if(gain>15) {
            lit++;
            if(on[p+2]>on[p] && on[p+1]>on[p]) cool++;
          }
        }
        return {lit,cool,peakGain};
      } finally {orb.visible=true; renderer.setRenderTarget(previous); rt.dispose();}
    }""")
    assert pixels["lit"] > 60 and pixels["cool"] > pixels["lit"] * .7, pixels
    assert pixels["peakGain"] < 145, pixels
    if folder := os.environ.get("INTEON_ORB_SHOTS"):
        path = Path(folder)
        path.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=path / ("backstage-resident-phone.jpg" if mobile else "backstage-resident.jpg"),
                        type="jpeg",quality=91)
    # A simultaneous logo storm must not bring a second, physical body on screen.
    for phase in ("prepare", "burst", "end"):
        page.evaluate("""phase=>window.dispatchEvent(new CustomEvent('inteon-storm',
            {detail:{phase,x:innerWidth/2,y:innerHeight/2}}))""", phase)
        assert overlay.is_hidden() and page.locator(".resident-speech").is_hidden()
    page.evaluate("orbQA.place='home'")
    page.wait_for_function("""!orbQA.orb.visible && !orbQA.actor.visible &&
                              !document.querySelector('.room-resident[data-in-backstage]')""")
    assert overlay.is_visible()
    page.evaluate("orbQA.place='house'")
    page.wait_for_function("""orbQA.scene.userData.cityBackstage===0 && orbQA.scene.userData.virtuality===1 &&
        orbQA.orb.visible && !orbQA.actor.visible && document.querySelector('.room-resident[hidden]')""")
    page.emulate_media(reduced_motion="reduce")
    page.wait_for_selector("body[data-yard-backdrop=still]")
    assert overlay.is_visible() and overlay.get_attribute("data-in-backstage") is None
    assert not errors, errors
    print("mobile" if mobile else "desktop", pixels, "entry, storm, exit and disposal passed", flush=True)
    page.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        with playwright.chromium.launch(channel="msedge",headless=True) as browser:
            check(browser,False)
            check(browser,True)
