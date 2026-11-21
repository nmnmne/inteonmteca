"""Measure the backstage orb's own world path and the translucent trail on the GPU."""
import os
from playwright.sync_api import sync_playwright


def check(browser, base, width, height):
    page = browser.new_page(viewport={"width": width, "height": height}, ignore_https_errors=True)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda m: errors.append(m.text) if "Shader Error" in m.text else None)
    page.route("**/orb-trail-probe", lambda route: route.fulfill(body="<canvas></canvas>", content_type="text/html"))
    page.goto(base.rstrip("/")+"/orb-trail-probe")
    result = page.evaluate("""async () => {
      const T=await import('/yard/vendor/three.module.js');
      const {createResidentLayers}=await import('/yard/resident-layers.js');
      const canvas=document.querySelector('canvas');
      const renderer=new T.WebGLRenderer({canvas});
      const w=Math.round(innerWidth*.62),h=Math.round(innerHeight*.62);
      renderer.setSize(w,h,false);renderer.setClearColor(0x091121,1);
      const scene=new T.Scene(), camera=new T.PerspectiveCamera(64,w/h,.1,100);
      window.inteonRoom={canVisitCourtyard:()=>false,setInCourtyard(){}};
      const forms=createResidentLayers(scene,canvas),trail=scene.getObjectByName('resident-orb-trail');
      const orb=scene.getObjectByName('resident-luminous-sphere');
      const samples=[],arc=[];let distance=0;
      for(let i=0;i<=450;i++) {
        const x=i*.04;
        camera.position.set(x,2,.3*Math.sin(x*.56));
        forms.update(null,camera,1,1,.045);
        const v=orb.position.clone();
        if(i)distance+=v.distanceTo(samples[i-1]);
        samples.push(v);arc.push(distance);
      }
      const visible=trail.visible && orb.visible && !trail.material.depthWrite;
      const p=trail.geometry.getAttribute('position'),age=trail.geometry.getAttribute('ageM');
      const tail=new T.Vector3().fromBufferAttribute(p,0);
      const i=arc.findIndex(s=>s>=distance-10),u=(distance-10-arc[i-1])/(arc[i]-arc[i-1]);
      const cutoff=tail.distanceTo(samples[i-1].lerp(samples[i],u));
      const used=trail.geometry.drawRange.count/6+1;
      const head=new T.Vector3().fromBufferAttribute(p,2*(used-1));
      const error=head.distanceTo(orb.position), ages=[age.getX(0),age.getX(2*(used-1))];
      const target=new T.WebGLRenderTarget(w,h);target.texture.colorSpace=T.SRGBColorSpace;
      renderer.setRenderTarget(target);
      const spectator=camera.clone();spectator.position.set(head.x-5,2.5,12);
      spectator.lookAt(head.x-5,2,head.z);spectator.updateMatrixWorld();
      function pixels(show,camera){
        trail.visible=show;renderer.render(scene,camera);
        const data=new Uint8Array(4*w*h);renderer.readRenderTargetPixels(target,0,0,w,h,data);return data;
      }
      function compare(camera) {
        const off=pixels(false,camera), on=pixels(true,camera);
        let ink=0,max=0;
        for(let i=0;i<on.length;i+=4){
          const d=Math.max(Math.abs(off[i]-on[i]),Math.abs(off[i+1]-on[i+1]),Math.abs(off[i+2]-on[i+2]));
          if(d>4)ink++;max=Math.max(max,d);
        }
        return {ink,max};
      }
      const view=compare(camera),side=compare(spectator);
      camera.position.x+=25;forms.update(null,camera,1,1,.045);
      const snap=orb.visible && !trail.visible && trail.geometry.drawRange.count===0;
      forms.update(null,camera,1,0,.045);
      const hidden=!orb.visible && !trail.visible;
      forms.dispose();target.dispose();renderer.dispose();
      return {visible,cutoff,error,ages,view,side,snap,hidden};
    }""")
    assert not errors and result["visible"] and result["snap"] and result["hidden"], (result, errors)
    assert result["ages"] == [10, 0] and max(result["cutoff"], result["error"]) < .00001, result
    assert min(result["view"]["ink"], result["side"]["ink"]) > 20, result
    print(f"{width}×{height}", result, flush=True)
    page.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        options = {"args": ["--enable-unsafe-swiftshader"]}
        if os.environ.get("CHROMIUM_PATH"):
            options["executable_path"] = os.environ["CHROMIUM_PATH"]
        with playwright.chromium.launch(**options) as browser:
            url = os.environ.get("INTEON_BASE_URL","http://127.0.0.1:8080")
            for viewport in [(390,844),(1280,800)]:
                check(browser,url,*viewport)
