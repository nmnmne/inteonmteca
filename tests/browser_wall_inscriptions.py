"""Check the hand-lettered wall in the homepage's actual opening camera."""
import base64
import os
from pathlib import Path

from playwright.sync_api import sync_playwright
from browser_ambient_route import BASE, expose_walker


def check(browser, mobile=False):
    viewport = {"width": 390, "height": 844} if mobile else {"width": 1440, "height": 900}
    page = browser.new_page(viewport=viewport, is_mobile=mobile, has_touch=mobile)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if "Shader Error" in msg.text else None)
    page.route("**/yard/auto-walk.js*", expose_walker)
    stamp = "2026-06-21T18:30:00Z" if mobile else "2026-06-21T08:30:00Z"
    page.add_init_script(f"Date.now = () => Date.parse('{stamp}') + performance.now()")
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector('body[data-yard-backdrop="live"]', timeout=60000)
    page.evaluate("""async () => {
      const T = await import('/yard/vendor/three.module.js');
      const previous = T.Scene.prototype.onAfterRender;
      T.Scene.prototype.onAfterRender = function(renderer,scene,camera,...rest) {
        previous.call(this,renderer,scene,camera,...rest);
        const logo = this.getObjectByName('music-logo');
        if (!logo?.userData.inkReady || !logo.getObjectByName('wall-marker-inscriptions')?.material.map.image?.width
            || this.userData.detailLoading.status !== 'ready') return;
        window.wallFrame = {T,renderer,scene,camera,logo};
        if (window.takeWallPhoto) {
          window.wallPhoto = renderer.domElement.toDataURL();
          window.takeWallPhoto = false;
        }
      };
    }""")
    page.wait_for_function("window.wallFrame", timeout=60000)
    if folder := os.environ.get("INTEON_MURAL_SHOTS"):
        path = Path(folder)
        if mobile:
            path = path / "mobile-evening"
        path.mkdir(parents=True, exist_ok=True)
        page.evaluate("window.takeWallPhoto = true")
        page.wait_for_function("window.wallPhoto")
        (path / "opening-inscriptions.png").write_bytes(base64.b64decode(page.evaluate("wallPhoto.split(',')[1]")))
        close_photo = page.evaluate("""() => {
          const {T,renderer,scene,logo}=wallFrame, camera=new T.PerspectiveCamera(
            56,renderer.domElement.width/renderer.domElement.height,.05,510);
          camera.position.copy(logo.localToWorld(new T.Vector3(-1.5,1.8,1.45)));
          camera.lookAt(logo.localToWorld(new T.Vector3(-1.5,1.8,-.17)));
          renderer.render(scene,camera);
          return renderer.domElement.toDataURL().split(',')[1];
        }""")
        (path / "close-inscriptions.png").write_bytes(base64.b64decode(close_photo))
    report = page.evaluate("""async () => {
      const {createWallInscriptions,wallLyricAt} = await import('/yard/wall-inscriptions.js');
      const {lyricSheets} = await import('/yard/wall-lyrics.js');
      const {T,renderer,scene,camera,logo} = wallFrame;
      const ink = logo.getObjectByName('wall-marker-inscriptions');
      const atlas = ink.material.map;
      const attr = ink.geometry.getAttribute('position');
      const slots = attr.count / 4, heights = [];
      let inOpeningView=0;
      for (let s=0; s<slots; s++) {
        const pts = Array.from({length:4}, (_,k)=>new T.Vector3().fromBufferAttribute(attr,s*4+k));
        heights.push(pts[0].distanceTo(pts[3]));
        const p=pts[0].clone().lerp(pts[2],.5).applyMatrix4(ink.matrixWorld).project(camera);
        if (Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))<1) inOpeningView++;
        const bounds = new T.Box3().setFromPoints(pts);
        if (bounds.min.x <= -7.56 || bounds.max.x >= 5.6 || bounds.min.y <= -1.9 ||
            (bounds.min.x < 4.1 && bounds.max.x > -4.1 && bounds.min.y < .825 && bounds.max.y > -.825))
          throw Error('Ink crosses a wall edge or the centre lettering: '+s);
        if (bounds.min.x < -6.739 && bounds.max.x > -7.289 && bounds.min.y < 3.05 && bounds.max.y > 2.35)
          throw Error('Ink crosses the house number plate: '+s);
      }
      const im = atlas.image, probe = document.createElement('canvas');
      probe.width=im.width; probe.height=im.height;
      const ctx=probe.getContext('2d');
      ctx.drawImage(im,0,0);
      const texels=ctx.getImageData(0,0,im.width,im.height).data;
      const titles = lyricSheets.flatMap(s=>s.titles);
      const repertoire = new Set(lyricSheets.flatMap(s=>s.lines));
      if (titles.length!==26 || repertoire.size!==648) throw Error('Unexpected lyric library');
      for (let i=0; i<slots; i++) {
        const shown = new Set(), period = lyricSheets.length*Math.max(...lyricSheets.map(s=>s.lines.length));
        for (let cycle=0;cycle<period;cycle++) shown.add(wallLyricAt(i,cycle).text);
        if (shown.size!==repertoire.size) throw Error('Incomplete rotation at position '+i);
      }
      for (let i=0; i<repertoire.size; i++) {
        let count=0;
        for (let y=Math.floor(i/16)*28; y<(Math.floor(i/16)+1)*28; y++) for(let x=(i%16)*128;x<(i%16+1)*128;x++)
          if (texels[(y*im.width+x)*4] > 64) count++;
        if (count<9) throw Error('Missing handwritten phrase: '+i);
      }
      // Render the pigment alone with the opening projection to measure its
      // motion independently of the moving water, central title and clouds.
      const isolated = new T.Scene(), copy = ink.clone();
      copy.matrixAutoUpdate = false;
      copy.matrix.copy(ink.matrixWorld);
      copy.onBeforeRender = (r,s,c)=>ink.onBeforeRender(r,scene,c);
      isolated.add(copy);
      const target = new T.WebGLRenderTarget(768,480);
      const oldTarget = renderer.getRenderTarget(), clear = renderer.getClearColor(new T.Color());
      const alpha = renderer.getClearAlpha(), now = performance.now();
      const oldNow = Object.getOwnPropertyDescriptor(performance,'now');
      function read(at) {
        Object.defineProperty(performance,'now',{configurable:true,value:()=>now+at*1000});
        renderer.render(isolated,camera);
        const pixels=new Uint8Array(768*480*4);
        renderer.readRenderTargetPixels(target,0,0,768,480,pixels);
        return pixels;
      }
      function changed(a,b) { let n=0;for(let i=3;i<a.length;i+=4) if(Math.abs(a[i]-b[i])>12) n++;return n; }
      try {
        renderer.setRenderTarget(target); renderer.setClearColor(0,0);
        const a=read(0), revision=atlas.version, indices=ink.geometry.getAttribute('lyricTile');
        const selected=Array.from(indices.array);
        read(0);
        const stableAtlas=revision===atlas.version, moving=changed(a,read(2)), switched=changed(a,read(21));
        const frozen = createWallInscriptions(true,{matches:true});
        const spare=frozen.material.map;
        frozen.material.map=atlas;
        copy.material = frozen.material;
        copy.onBeforeRender = (r,s,c)=>frozen.onBeforeRender(r,scene,c);
        const still=changed(read(0),read(21));
        spare.dispose();frozen.geometry.dispose();frozen.material.dispose();
        heights.sort((a,b)=>a-b);
        return {slots,inOpeningView,heightM:heights[Math.floor(slots/2)], maxHeightM:heights.at(-1),
                calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
                tracks:titles.length,lines:repertoire.size,moving,switched,still,
                stableAtlas:stableAtlas && atlas.version===revision,
                refreshed:selected.some((v,i)=>v!==indices.array[i]),atlasBytes:im.width*im.height};
      } finally {
        if (oldNow) Object.defineProperty(performance,'now',oldNow); else delete performance.now;
        renderer.setRenderTarget(oldTarget);renderer.setClearColor(clear,alpha);target.dispose();
      }
    }""")
    page.close()
    assert report["slots"] > 222 and report["inOpeningView"] >= (35 if mobile else 80), report
    assert .35 < report["heightM"] < .48 and report["maxHeightM"] > .55, report
    assert report["calls"] == 1 and report["triangles"] == 2*report["slots"], report
    assert report["moving"] > 50 and report["switched"] > 280, report
    assert report["still"] == 0 and report["stableAtlas"] and report["refreshed"] and not errors, (report, errors)
    print("mobile evening" if mobile else "desktop daylight", report, flush=True)


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        check(browser)
        check(browser, mobile=True)
        browser.close()
