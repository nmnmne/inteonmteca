"""Check the physical asphalt and visible fracture relief in the running courtyard."""
import os
from playwright.sync_api import sync_playwright


def check(browser, mobile):
    page = browser.new_page(viewport={"width":390 if mobile else 1280,"height":844}, is_mobile=mobile, has_touch=mobile)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if "Shader Error" in msg.text else None)
    page.add_init_script("Date.now=()=>Date.UTC(2026,10,20,12,6,45)")
    def capture(route):
        route.fulfill(content_type="text/javascript", body="""
          import {createSolarLighting as make} from '/yard/solar-lighting.js?original';
          export function createSolarLighting(renderer,yard,...args) {
            window.roadTest={renderer,...yard}; return make(renderer,yard,...args);
          }
        """)
    page.route("**/yard/solar-lighting.js", capture)
    page.goto(os.getenv("INTEON_BASE_URL","http://127.0.0.1:8080"), wait_until="domcontentloaded")
    page.wait_for_function("""() => window.roadTest?.scene.getObjectByName('road-zhandova-courtyard-drive')
      ?.material?.aoMap?.image?.naturalWidth && roadTest.scene.getObjectByName('courtyard-puddles')?.material.visible""", timeout=60000)
    result = page.evaluate("""async () => {
      const {renderer,scene,edgeEffect}=roadTest, T=await import('/yard/vendor/three.module.js');
      const roads=scene.children.filter(node=>node.name.startsWith('road-'));
      const material=roads[0].material, mapped=material.aoMap;
      // A dry junction beside a bench, with water along the left/right edges.
      const camera=new T.PerspectiveCamera(45,1,.06,360);
      camera.position.set(22.34,.82,50.46); camera.lookAt(20.91,.022,51.28);
      camera.updateMatrixWorld(); edgeEffect.update(22.34,50.46,.82,0);
      const size=160, target=new T.WebGLRenderTarget(size,size), previous=renderer.getRenderTarget();
      target.texture.colorSpace=T.SRGBColorSpace;
      const flat=new T.DataTexture(new Uint8Array([255,0,118,255]),1,1);
      flat.needsUpdate=true;
      const frame=()=>{
        const pixels=new Uint8Array(size*size*4);
        renderer.render(scene,camera); renderer.readRenderTargetPixels(target,0,0,size,size,pixels);
        return pixels;
      };
      try {
        renderer.setRenderTarget(target);
        const actual=frame();
        material.aoMap=flat;
        const baseline=frame();
        let fissurePixels=0, maxDrop=0;
        for(let i=0;i<actual.length;i+=4) {
          const drop=baseline[i+1]-actual[i+1];
          if(drop>5) fissurePixels++;
          maxDrop=Math.max(drop,maxDrop);
        }
        return {roads:roads.length,shared:roads.every(road=>road.material===material),fissurePixels,maxDrop};
      } finally {
        material.aoMap=mapped; renderer.setRenderTarget(previous); target.dispose(); flat.dispose();
      }
    }""")
    assert result["roads"] == 15 and result["shared"], result
    assert result["fissurePixels"] > 50 and result["maxDrop"] > 8, result
    assert not errors, errors
    print("mobile" if mobile else "desktop", result, flush=True)
    page.close()


if __name__ == "__main__":
    with sync_playwright() as p, p.chromium.launch(channel="msedge",headless=True) as browser:
        check(browser,False)
        check(browser,True)
