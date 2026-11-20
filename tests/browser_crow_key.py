"""Look at the key and its double through the actual roaming camera, including portrait."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_crow_flock import BASE, OBSERVE, observe_walk
from courtyard_phase import fixed_courtyard_phase


def check(browser, mobile):
    page=browser.new_page(viewport={"width":390 if mobile else 1200,"height":844 if mobile else 800},
                          is_mobile=mobile,has_touch=mobile)
    errors=[]
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if "Shader Error" in m.text else None)
    page.route("**/yard/auto-walk.js*",observe_walk)
    # Choose the performance, leaving staging, choreography, camera and renderer live.
    page.route("**/yard/crow-story-deck.js*", lambda route: route.fulfill(
        content_type="text/javascript",
        body="""export function createCrowStoryDeck() {
          return {next: () => ({opening:'knock',middle:['echo','lookout','relay'],ending:'gift'})};
        }"""))
    fixed_courtyard_phase(page, "2026-06-21T11:04:00")
    page.goto(BASE+"/",wait_until="domcontentloaded")
    page.wait_for_function("window.crowQA && document.body.dataset.yardBackdrop==='live'",timeout=60000)
    page.evaluate(OBSERVE)
    page.wait_for_function("crowQA.frames>0")
    # Stop at the moment the free-standing door and both keys can be seen.
    page.evaluate("""() => {
      const q=crowQA;
      for(let i=0;i<3600;i++) {
        q.walk.update(.1);
        const s=q.flock.keyStory;
        if (s?.phase==='middle' && s.scene==='echo' && s.door>.99 && s.echoScale>.85) return;
      }
      throw Error('The echo scene never staged the key and its double during the walk');
    }""")
    page.wait_for_function("crowQA.frame.scene.getObjectByName('crow-key-double')?.visible",timeout=15000)
    result=page.evaluate("""async () => {
      const T=await import('/yard/vendor/three.module.js');
      const {scene,camera,renderer}=crowQA.frame;
      const group=scene.getObjectByName('crows-thirteenth-door');
      const width=renderer.domElement.width,height=renderer.domElement.height;
      const target=new T.WebGLRenderTarget(width,height);
      const previous=renderer.getRenderTarget();
      const time=performance.now(), clock=Object.getOwnPropertyDescriptor(performance,'now');
      const pixels=() => {
        renderer.render(scene,camera);
        const buffer=new Uint8Array(width*height*4);
        renderer.readRenderTargetPixels(target,0,0,width,height,buffer);
        return buffer;
      };
      try {
        Object.defineProperty(performance,'now',{configurable:true,value:()=>time});
        renderer.setRenderTarget(target);
        const full=pixels(),counts={};
        for(const name of ['crow-brass-key','crow-key-double','crow-key-doorway']) {
          const mesh=group.getObjectByName(name);
          mesh.visible=false;const off=pixels();mesh.visible=true;
          let n=0;
          for(let i=0;i<full.length;i+=4) if(Math.abs(full[i]-off[i])+Math.abs(full[i+1]-off[i+1])+Math.abs(full[i+2]-off[i+2])>14) n++;
          counts[name]=n;
        }
        return counts;
      } finally {
        if(clock) Object.defineProperty(performance,'now',clock); else delete performance.now;
        target.dispose();renderer.setRenderTarget(previous);
      }
    }""")
    assert result["crow-brass-key"]>=3 and result["crow-key-double"]>=2 and result["crow-key-doorway"]>=60,result
    assert not errors,errors
    if folder:=os.getenv("INTEON_CROW_KEY_SHOTS"):
        out=Path(folder)
        out.mkdir(parents=True,exist_ok=True)
        page.screenshot(path=out / ("key-portrait.jpg" if mobile else "key-landscape.jpg"),type="jpeg",quality=91)
    print("portrait" if mobile else "landscape",result,flush=True)
    page.close()


if __name__=="__main__":
    with sync_playwright() as playwright:
        with playwright.chromium.launch(channel="msedge",headless=True) as browser:
            check(browser,False)
            check(browser,True)
