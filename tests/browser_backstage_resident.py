"""Check the resident's screen and world position as its three forms take turns."""
import math
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
      import {{facadeNormal}} from '/yard/facade-frame.js';
      export function createAutoWalk(layout,options) {{
        const walk=make(layout,options), home=walk.update(0);
        const outside={{...home,x:Math.min(...layout.walkable.map(p=>p[0]))-72,y:5,
                        pitch:0,yaw:Math.PI/2,roll:0}};
        const ring=layout.buildings.find(h=>h.id==='house-46-1').footprint;
        const house={{...home,x:ring.reduce((s,p)=>s+p[0],0)/ring.length,
          z:ring.reduce((s,p)=>s+p[1],0)/ring.length,y:3}};
        const [a,b]=ring, [nx,nz]=facadeNormal(a,b,ring);
        const besideWall = distance => ({{...home,
          x:(a[0]+b[0])/2+nx*distance,z:(a[1]+b[1])/2+nz*distance,
          y:1.4,pitch:-.14,yaw:Math.atan2(nx,-nz),roll:0}});
        const seat=besideWall(5);
        const visit=options.flock.visit;
        window.orbQA={{place:'home', seat, setVisit(active) {{
          Object.assign(visit, {{kind:active?'crows':null,phase:active?'sitting':'idle',
            x:seat.x,y:0,z:seat.z,yaw:seat.yaw+Math.PI,amount:active?1:0}});
        }}}};
        const views={{home,house,outside, yard:besideWall(.25), insideWall:besideWall(-.15)}};
        return {{...walk, update:()=>{{
          if(orbQA.expected) orbQA.before=orbQA.sample();
          return views[orbQA.place];
        }}}};
      }}
    """)


def transfer(page, place, visit, expected, *, world=False):
    page.evaluate("""([place,visit,expected]) => {
      const qa=orbQA;
      qa.transfer=null;
      qa.expected=expected;
      qa.setVisit(visit);
      qa.place=place;
    }""", [place, visit, expected])
    page.wait_for_function("orbQA.transfer", timeout=10000)
    result = page.evaluate("orbQA.transfer")
    before, after = result["before"], result["after"]
    assert before["form"] in {"room", "yard", "orb"} and before["form"] != after["form"], result
    # A real camera move changes the projection of a stationary courtyard body.
    coordinates = "world" if world else "screen"
    distance = math.dist(before[coordinates], after[coordinates])
    assert distance <= (.025 if world else 3), (coordinates, distance, result)
    return round(distance, 3)


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
        const room=document.querySelector('.room-resident');
        const body=orbQA.actor.getObjectByName('resident-body');
        orbQA.sample=()=>{
          if(!room.hidden){
            const r=room.getBoundingClientRect();
            return {form:'room',screen:[r.x+r.width/2,r.y+r.height/2]};
          }
          const mesh=orb.visible ? orb : body;
          const point=new T.Vector3().setFromMatrixPosition(mesh.matrixWorld);
          const world=point.toArray(), ndc=point.project(camera);
          const r=renderer.domElement.getBoundingClientRect();
          return {form:orb.visible?'orb':orbQA.actor.visible?'yard':'hidden',world,
            screen:[r.left+(ndc.x+1)*r.width/2,r.top+(1-ndc.y)*r.height/2]};
        };
        scene.onAfterRender=function(...args){
          previous.call(this,...args);
          if(!orbQA.expected) return;
          const after=orbQA.sample();
          if(after.form===orbQA.expected){
            orbQA.transfer={before:orbQA.before,after};
            orbQA.expected=null;
          }
        };
      };
    }""")
    page.wait_for_function("orbQA.orb && !orbQA.orb.visible && !orbQA.actor.visible")
    overlay = page.locator(".room-resident")
    assert overlay.is_visible()
    jumps = {"room -> orb (px)": transfer(page, "outside", False, "orb")}
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
    jumps["orb -> room (px)"] = transfer(page, "home", False, "room")
    page.wait_for_function("""!orbQA.orb.visible && !orbQA.actor.visible &&
                              !document.querySelector('.room-resident[data-in-backstage]')""")
    assert overlay.is_visible()
    page.evaluate("orbQA.place='yard'")
    page.wait_for_function("orbQA.scene.userData.virtuality<.45 && !orbQA.actor.visible")
    jumps["room -> yard (px)"] = transfer(page, "yard", True, "yard")
    # Let the visitor reach its seat before measuring the body on either side
    # of a small camera move through the facade.
    page.wait_for_function("""Math.hypot(orbQA.actor.position.x-orbQA.seat.x,
        orbQA.actor.position.z-orbQA.seat.z)<.015""", timeout=15000)
    jumps["yard -> orb (m)"] = transfer(page, "insideWall", True, "orb", world=True)
    # The visitor can walk while behind the facade. The return uses the new
    # position of the visible orb, rather than the body's previous seat.
    page.evaluate("orbQA.seat.x+=.4; orbQA.setVisit(true)")
    page.wait_for_function("""Math.abs(orbQA.sample().world[0]-orbQA.seat.x)<.015""", timeout=10000)
    jumps["orb -> yard (m)"] = transfer(page, "yard", True, "yard", world=True)
    jumps["yard -> room (px)"] = transfer(page, "yard", False, "room")
    jumps["returned room -> orb (px)"] = transfer(page, "house", False, "orb")
    page.wait_for_function("""orbQA.scene.userData.cityBackstage===0 && orbQA.scene.userData.virtuality===1 &&
        orbQA.orb.visible && !orbQA.actor.visible && document.querySelector('.room-resident[hidden]')""")
    page.emulate_media(reduced_motion="reduce")
    page.wait_for_selector("body[data-yard-backdrop=still]")
    assert overlay.is_visible() and overlay.get_attribute("data-in-backstage") is None
    assert not errors, errors
    print("mobile" if mobile else "desktop", pixels, jumps, flush=True)
    page.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        with playwright.chromium.launch(channel="msedge",headless=True) as browser:
            check(browser,False)
            check(browser,True)
