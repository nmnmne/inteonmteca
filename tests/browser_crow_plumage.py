"""Check individual birds at courtyard viewing distances with the real instanced shader."""
import os
from playwright.sync_api import sync_playwright


def check(browser, base, width, height):
    page = browser.new_page(viewport={"width": width, "height": height})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if "Shader Error" in msg.text else None)
    page.route("**/crow-plumage-test", lambda route: route.fulfill(body="<canvas></canvas>", content_type="text/html"))
    page.goto(base.rstrip("/") + "/crow-plumage-test")
    result = page.evaluate("""async () => {
      const T=await import('/yard/vendor/three.module.js');
      const {createCrowModels}=await import('/yard/crow-models.js');
      const {createCrowWallContact}=await import('/yard/crow-wall-contact.js');
      const layout=await (await fetch('/yard/data/site-layout.json')).json();
      const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'), alpha:true});
      const width=Math.round(innerWidth*.65), height=Math.round(innerHeight*.65);
      renderer.setSize(width,height,false);
      renderer.setClearColor(0,0);
      const scene=new T.Scene(), camera=new T.PerspectiveCamera(64,width/height,.1,40);
      const models=createCrowModels(createCrowWallContact(layout),18);
      scene.add(models.group,new T.HemisphereLight(0xffffff,0xe6e4e0,1.7));
      const sun=new T.DirectionalLight(0xfff5e6,1.1);
      sun.position.set(1,3,2); scene.add(sun);
      const mesh=models.group.getObjectByName('crow-plumage');
      models.group.getObjectByName('crow-contact-shadows').visible=false;
      const target=new T.WebGLRenderTarget(width,height);
      renderer.setRenderTarget(target);
      const pixels=new Uint8Array(4*width*height);
      const leader={id:0,mode:'walk',airborne:0,wingPhase:0,elapsed:0};
      const bird={x:0,y:.2,z:0,airborne:0,mode:'perch',bank:0,speed:0,
        yaw:0,wingPhase:0,gaitPhase:0,storyPose:{glance:0}};
      const at=layout.spawn;
      bird.x=at.x; bird.z=at.z;
      function draw() {
        renderer.render(scene,camera);
        renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
      }
      // Same pose, low mobile pixel budget and a distance of four metres.
      camera.position.set(at.x+3.7,1.18,at.z-1.22);
      camera.lookAt(at.x,.2,at.z);
      const ink=[], signatures=new Set(), glyphs=[];
      for(let id=1;id<=18;id++) {
        models.update([leader,{...bird,id}],1,0,1);
        models.group.getObjectByName('crow-contact-shadows').visible=false;
        draw();
        let count=0,hash=2166136261;
        const glyph=[];
        for(let p=0;p<pixels.length;p+=4) {
          if(pixels[p+3]<250)continue;
          count++; glyph.push([p,pixels[p],pixels[p+1],pixels[p+2]]);
          hash=Math.imul(hash^p,16777619);
          hash=Math.imul(hash^pixels[p],16777619);
        }
        ink.push(count); signatures.add(hash); glyphs.push(glyph);
      }
      const first=new Map(glyphs[0].map(([pixel,...rgb])=>[pixel,rgb]));
      const lighter=glyphs[1].filter(([p,...rgb])=>
        first.has(p) && first.get(p).reduce((sum,c,i)=>sum+Math.abs(c-rgb[i]),0)>24).length;
      function wingPixels(reduced) {
        models.update([{...leader,mode:'flap',wingPhase:Math.PI/2,airborne:1}],.1,0,1,null,null,reduced);
        draw();
        let count=0,center=0,left=0,right=0;
        for(let i=3;i<pixels.length;i+=4) {
          if(pixels[i]<250)continue;
          count++;
          const x=(i>>2)%width/width;
          if(x>.17 && x<.83) center++;
          if(x<.2)left++; else if(x>.8)right++;
        }
        return {count,center,left,right};
      }
      const wings=wingPixels(false), resting=wingPixels(true);
      const attributes=renderer.getContext().getParameter(renderer.getContext().MAX_VERTEX_ATTRIBS);
      const result={ink,signatures:signatures.size,lighter,wings,resting,attributes};
      target.dispose();models.dispose();renderer.dispose();
      return result;
    }""")
    assert not errors, errors
    assert result["signatures"] == 18 and min(result["ink"]) > 12, result
    assert result["lighter"] >= 6, result
    assert result["wings"]["center"] == 0 and min(result["wings"]["left"], result["wings"]["right"]) > 5, result
    assert result["resting"]["count"] == 0, result
    print(f"{width}×{height}", result, flush=True)
    page.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        options = {"args": ["--enable-unsafe-swiftshader"]}
        executable = os.environ.get("CHROMIUM_PATH")
        if executable:
            options["executable_path"] = executable
        with playwright.chromium.launch(**options) as browser:
            base = os.environ.get("INTEON_BASE_URL", "http://127.0.0.1:8080")
            check(browser, base, 390, 844)
            check(browser, base, 1280, 800)
