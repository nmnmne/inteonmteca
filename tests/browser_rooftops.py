"""Check roof textures and perches in the live desktop and mobile courtyard."""
import os
from playwright.sync_api import sync_playwright


BASE = os.getenv("INTEON_BASE_URL", "http://127.0.0.1:8080").rstrip("/")


def check(browser, path, mobile):
    page = browser.new_page(viewport={"width": 390 if mobile else 1280, "height": 844 if mobile else 800},
                            is_mobile=mobile, has_touch=mobile)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if "Shader Error" in msg.text else None)
    def observe_pigeons(route):
        route.fulfill(content_type="text/javascript",body="""
          import {createRoofPigeons as make} from '/yard/roof-pigeons.js?original';
          export function createRoofPigeons(perches) {
            return window.rooftopBirds=make(perches);
          }
        """)
    page.route("**/yard/roof-pigeons.js", observe_pigeons)
    page.goto(BASE + path, wait_until="domcontentloaded")
    page.wait_for_url(BASE + "/")
    page.wait_for_selector("body[data-yard-backdrop=live]", state="attached", timeout=60000)
    page.evaluate("""async () => {
      const {Scene} = await import('/yard/vendor/three.module.js');
      const previous = Scene.prototype.onAfterRender;
      Scene.prototype.onAfterRender = function(renderer,scene,camera,...args) {
        previous.call(this,renderer,scene,camera,...args);
        if (this.getObjectByName('roof-pigeons') && renderer.domElement.closest('[data-yard-layer]')) {
          Object.assign(window,{roofScene:this,roofRenderer:renderer,streetCamera:camera});
          Scene.prototype.onAfterRender=previous;
        }
      };
    }""")
    page.wait_for_function("""() => ['roof-house-14','roof-parapet-house-14','roof-electric-kiosk'].every(name => {
      const material=window.roofScene?.getObjectByName(name)?.material;
      return material?.map?.image?.naturalWidth && material.bumpMap?.image?.naturalWidth;
    })""", timeout=45000)
    result = page.evaluate("""async () => {
      const scene=window.roofScene;
      const layout=await fetch('/yard/data/site-layout.json').then(r=>r.json());
      const {createRoofPerches}=await import('/yard/roof-geometry.js');
      const {Raycaster,Vector3,PerspectiveCamera,WebGLRenderTarget}=await import('/yard/vendor/three.module.js');
      const ray=new Raycaster(), down=new Vector3(0,-1,0), feet=new Vector3();
      const pigeons=scene.getObjectByName('perched-rock-pigeons');
      const roofs=layout.buildings.concat(layout.utilityStructures).map(b=>scene.getObjectByName('roof-'+b.id));
      const rim=scene.getObjectByName('roof-parapet-house-14');
      const perches=createRoofPerches(layout);
      scene.updateMatrixWorld(true);
      const seated=perches.every(p=>{
        const deck=scene.getObjectByName('roof-'+p.houseId);
        ray.set(feet.set(p.x,p.y+.025,p.z),down);
        const hit=ray.intersectObjects([rim,deck],false)[0];
        return hit && Math.abs(hit.point.y-p.y)<.003;
      });
      const source=mesh=>new URL(mesh.material.map.image.currentSrc || mesh.material.map.image.src).pathname.split('/').pop();
      const p=perches.find(p=>p.houseId==='house-14'), camera=new PerspectiveCamera(35,1,.03,300);
      camera.position.set(p.x+.85,p.y+.58,p.z+.85);
      camera.lookAt(p.x,p.y+.10,p.z);
      const size=192, rt=new WebGLRenderTarget(size,size), previous=roofRenderer.getRenderTarget();
      const snapshot=()=>{
        roofRenderer.render(scene,camera);
        const bytes=new Uint8Array(size*size*4);
        roofRenderer.readRenderTargetPixels(rt,0,0,size,size,bytes);
        return bytes;
      };
      let birdPixels=0;
      const visible=pigeons.visible;
      try {
        rooftopBirds.update(0,camera);
        roofRenderer.setRenderTarget(rt);
        const on=snapshot();
        pigeons.visible=false;
        const off=snapshot();
        for(let i=0;i<on.length;i+=4) {
          if(Math.max(...[0,1,2].map(c=>Math.abs(on[i+c]-off[i+c])))>2) birdPixels++;
        }
      } finally {
        pigeons.visible=visible; rooftopBirds.update(0,streetCamera);
        roofRenderer.setRenderTarget(previous); rt.dispose();
      }
      return {houses:layout.buildings.length, roofs:roofs.filter(Boolean).length, seated, birdPixels, count:perches.length,
        allHouses:layout.buildings.every(b=>perches.some(p=>p.houseId===b.id)),
        pigeonMesh:pigeons?.isInstancedMesh, capacity:pigeons?.instanceMatrix.count,
        materials:[source(roofs[0]),source(rim),source(scene.getObjectByName('roof-electric-kiosk'))]};
    }""")
    assert result["houses"] == 8 and result["roofs"] == 9 and result["allHouses"] and result["seated"], result
    assert result["pigeonMesh"] and result["capacity"] >= result["count"] > result["houses"], result
    assert result["birdPixels"] > 50, result
    assert result["materials"] == ["roof-felt-color.webp", "roof-coping-color.webp", "roof-zinc-color.webp"], result
    assert not errors, errors
    print(path, "mobile" if mobile else "desktop", result, flush=True)
    page.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        with playwright.chromium.launch(channel="msedge", headless=True) as browser:
            check(browser, "/", False)
            check(browser, "/yard/index.html", True)
