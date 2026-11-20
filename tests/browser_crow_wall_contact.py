"""Measure the cut across an animated wing against the actual house 14 facade."""
import json
import os
from playwright.sync_api import sync_playwright


BASE = os.environ.get("INTEON_BASE_URL", "http://127.0.0.1:8080").rstrip("/")


def observe_models(route):
    url = route.request.url
    if "qa-original" in url:
        route.continue_()
        return
    source = url + ("&" if "?" in url else "?") + "qa-original"
    route.fulfill(content_type="text/javascript", body=f"""
        import {{createCrowModels as create}} from {json.dumps(source)};
        export * from {json.dumps(source)};
        export function createCrowModels(...args) {{
          const models = create(...args);
          window.wallCrowQA = {{models, create}};
          return models;
        }}
    """)


MEASURE = """async mobile => {
  const T = await import('/yard/vendor/three.module.js');
  const qa = window.wallCrowQA, {renderer, facade} = qa;
  const {models} = qa, control = qa.create();
  const originalParent = models.group.parent;
  const scene = new T.Scene();
  scene.background = new T.Color(0x5b6268);
  scene.add(new T.HemisphereLight(0xddedff,0xb38e69,1.7));
  const wall = facade.clone();
  facade.matrixWorld.decompose(wall.position,wall.quaternion,wall.scale);
  scene.add(wall, models.group, control.group);
  const n = new T.Vector3(0,0,1).applyQuaternion(wall.quaternion);
  const tangent = new T.Vector3(n.z,0,-n.x);
  const origin = wall.position.clone();
  // A section of the real masonry above doors, graffiti and balcony fittings.
  origin.y = 10;
  const at = (d,y=0,t=0) => origin.clone().addScaledVector(n,d)
      .addScaledVector(tangent,t).add(new T.Vector3(0,y,0));
  const daylight = mobile ? .25 : 1, yaw = Math.atan2(n.z,n.x);
  const flock = Array.from({length:13},(_,id)=>({
    id,x:1000+id,y:10,z:1000,yaw,mode:'glide',airborne:1,wingPhase:0,bank:0,speed:0,gaitPhase:0
  }));
  function place(id,d,y) {
    const p = at(d,y);
    Object.assign(flock[id], {x:p.x,y:p.y,z:p.z});
  }
  place(2,.94,.7);

  const width=560, height=380, span=2.4, halfHeight=span*height/width/2;
  const camera = new T.OrthographicCamera(-span/2,span/2,halfHeight,-halfHeight,.05,15);
  function sideView() {
    camera.position.copy(at(.47,.68,-2.6));
    camera.lookAt(at(.40,.30));
    camera.updateMatrixWorld();
  }
  sideView();
  const target = new T.WebGLRenderTarget(width,height,{depthBuffer:true});
  const previousTarget=renderer.getRenderTarget();
  function render(which) {
    models.group.visible = which === 'contact';
    control.group.visible = which === 'control';
    renderer.render(scene,camera);
    const pixels = new Uint8Array(width*height*4);
    renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
    return pixels;
  }
  const difference = (a,b,i) => Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));
  function pose(distance, folded=false) {
    place(1,distance,0);
    Object.assign(flock[1],{mode:folded?'perch':'glide',airborne:folded?0:1});
    for (const model of [models,control]) model.update(flock,5,0,daylight);
  }
  function compare() {
    const bare=render('bare'), natural=render('control'), contact=render('contact');
    const projected = at(.1).project(camera);
    const cutX=(projected.x+1)*width*.5;
    const splitY=(at(.4,.4).project(camera).y+1)*height*.5;
    const result={natural:0,other:0,near:0,beyond:0,seam:0,changed:0,otherChanged:0,outside:0};
    for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
      const i=(y*width+x)*4;
      if (difference(natural,bare,i)<5) continue;
      if (y>splitY) result.other++; else result.natural++;
      if (difference(natural,contact,i)<9) continue;
      result.changed++;
      if (y>splitY) {result.otherChanged++;continue;}
      // Less than a centimetre of projection uncertainty across this oblique wing.
      const distance=.10+(x+.5-cutX)*span/width;
      if (distance>.13) result.outside++;
      if (distance>=.015 && distance<.075) result.near++;
      if (distance<.015) result.beyond++;
      if (Math.abs(distance-.1)<.019 && contact[i+1]>100 && contact[i+1]>natural[i+1]+35) result.seam++;
    }
    return result;
  }
  try {
    renderer.setRenderTarget(target);
    pose(.94);
    const before=compare();
    pose(.30);
    const cut=compare();
    pose(.30,true);
    const folded=compare();
    pose(.94);
    const after=compare();
    // From the courtyard, the same textured wall must occlude the whole bird
    // after it passes inside. Compare with the physical wall temporarily lifted.
    camera.position.copy(at(3,.35)); camera.lookAt(at(0,.35)); camera.updateMatrixWorld();
    pose(-.95); place(2,100,100); models.update(flock,5,0,daylight);
    function ink() {
      const off=render('bare'), on=render('contact');
      let changed=0;
      for(let i=0;i<on.length;i+=4) if(difference(off,on,i)>9) changed++;
      return changed;
    }
    const hidden=ink();
    wall.visible=false;
    const uncovered=ink();
    return {before,cut,folded,after,hidden,uncovered,depth:facade.material.depthTest && facade.material.depthWrite};
  } finally {
    models.group.visible=true; originalParent.add(models.group);
    control.dispose(); renderer.setRenderTarget(previousTarget); target.dispose();
  }
}"""


def check(browser, mobile):
    page = browser.new_page(viewport={"width": 390 if mobile else 1440, "height": 844 if mobile else 900},
                            is_mobile=mobile, has_touch=mobile)
    errors=[]
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if "Shader Error" in message.text else None)
    page.route("**/yard/crow-models.js*", observe_models)
    page.goto(BASE + "/", wait_until="domcontentloaded")
    page.wait_for_selector("body[data-yard-backdrop=live]", state="attached", timeout=60000)
    page.evaluate("""async () => {
      const {Scene} = await import('/yard/vendor/three.module.js');
      const previous = Scene.prototype.onAfterRender;
      Scene.prototype.onAfterRender = function(renderer,...args) {
        previous.call(this,renderer,...args);
        const facade=this.getObjectByName('music-wall');
        if (facade && renderer.domElement.closest('[data-yard-layer]')) {
          Object.assign(window.wallCrowQA,{renderer,facade}); Scene.prototype.onAfterRender=previous;
        }
      };
    }""")
    page.wait_for_function("window.wallCrowQA?.facade")
    r=page.evaluate(MEASURE,mobile)
    assert not errors, errors
    assert r["before"]["natural"]>100 and r["before"]["changed"]==0, r
    assert r["cut"]["natural"]>200 and r["cut"]["other"]>150, r
    assert r["cut"]["near"]>12 and r["cut"]["seam"]>5 and r["cut"]["outside"]==0, r
    assert r["cut"]["otherChanged"]==0 and r["folded"]["changed"]==0 and r["after"]["changed"]==0, r
    assert r["depth"] and r["hidden"]==0 and r["uncovered"]>120, r
    print("mobile" if mobile else "desktop", r, flush=True)
    page.close()


if __name__ == "__main__":
    with sync_playwright() as pw:
        with pw.chromium.launch(channel="msedge",headless=True) as browser:
            check(browser,False)
            check(browser,True)
