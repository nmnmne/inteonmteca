"""Check the hand-lettered wall in the homepage's actual opening camera."""
import base64
import os
from pathlib import Path

from courtyard_phase import fixed_courtyard_phase
from playwright.sync_api import sync_playwright
from browser_ambient_route import BASE, expose_walker


def check(browser, mobile=False):
    viewport = {"width": 390, "height": 844} if mobile else {"width": 1440, "height": 900}
    page = browser.new_page(viewport=viewport, is_mobile=mobile, has_touch=mobile)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if "Shader Error" in msg.text else None)
    page.route("**/yard/auto-walk.js*", expose_walker)
    # In the courtyard's 20-minute day these instants are 18:30 and 08:30 UTC.
    stamp = "2026-06-21T00:15:25Z" if mobile else "2026-06-21T00:07:05Z"
    fixed_courtyard_phase(page)
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
        if (window.wallFrame && window.wallFrame.camera !== camera) return;
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
        if not mobile:
            wall_photo = page.evaluate("""() => {
              const {T,renderer,scene,logo}=wallFrame, camera=new T.PerspectiveCamera(
                59,renderer.domElement.width/renderer.domElement.height,.05,510);
              camera.position.copy(logo.localToWorld(new T.Vector3(-3.8,3.8,13.8)));
              camera.lookAt(logo.localToWorld(new T.Vector3(-.9,4.0,0)));
              renderer.render(scene,camera);
              return renderer.domElement.toDataURL().split(',')[1];
            }""")
            (path / "graffiti.png").write_bytes(base64.b64decode(wall_photo))
    report = page.evaluate(r"""async () => {
      const {createWallInscriptions,readWallInscription} = await import('/yard/wall-inscriptions.js');
      const {mixWallPhrase,separateWallPhrase,wallFragments,wallTranslation,wallEcho,
        inkGroups,inkPasses,inkAtlasColumns:cols,inkCellWidth:width,inkCellHeight:height} =
          await import('/yard/wall-ink-codec.js');
      const {lyricSheets} = await import('/yard/wall-lyrics.js');
      const {T,renderer,scene,camera,logo} = wallFrame;
      const ink = logo.getObjectByName('wall-marker-inscriptions');
      if (ink.userData.bakedShadowCaster !== false || logo.userData.bakedShadowCaster !== false)
        throw Error('Flat paint must stay out of the baked building geometry');
      const atlas = ink.material.map;
      const attr = ink.geometry.getAttribute('position');
      const ids = ink.geometry.getAttribute('inscription'), slotVertices=[];
      const slots = ink.userData.inscriptionCount, heights = [];
      for (let v=0; v<attr.count; v++) {
        const slot=ids.getX(v);
        if (slot>=0) (slotVertices[slot]??=[]).push(v);
      }
      const ranges = Array.from({length:14},()=>new Set());
      let inOpeningView=0, curved=0;
      for (let s=0; s<slots; s++) {
        const pts = slotVertices[s].map(v=>new T.Vector3().fromBufferAttribute(attr,v));
        heights.push(pts[0].distanceTo(pts[1]));
        const spine=[];
        for (let k=0;k<pts.length;k+=2) spine.push(pts[k].clone().lerp(pts[k+1],.5));
        const chord=new T.Line3(spine[0],spine.at(-1)), tmp=new T.Vector3();
        if (spine.some(p=>chord.closestPointToPoint(p,true,tmp).distanceTo(p)>.012)) curved++;
        const center=spine[Math.floor(spine.length/2)];
        const p=center.clone().applyMatrix4(ink.matrixWorld).project(camera);
        if (Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))<1) inOpeningView++;
        const bounds = new T.Box3().setFromPoints(pts);
        for (const point of spine) {
          const row=Math.floor(point.y+1.9);
          if (ranges[row]) ranges[row].add(Math.floor(point.x+7.56));
        }
        if (bounds.min.x <= -7.56 || bounds.max.x >= 5.6 || bounds.min.y <= -1.9 ||
            bounds.max.y > 14) throw Error('Ink crosses a wall edge: '+s);
      }
      // Check the actual triangles so a curved ribbon can wrap around a corner.
      const mask=(x1,y1,x2,y2)=>new T.Box3(new T.Vector3(x1,y1,-1),new T.Vector3(x2,y2,1));
      const keepClear=[mask(-4.1,-.825,4.1,.825),mask(-7.289,2.35,-6.739,3.05)];
      const triangle=new T.Triangle(), index=ink.geometry.index;
      for(let i=0;i<index.count;i+=3) {
        [triangle.a,triangle.b,triangle.c].forEach((v,k)=>v.fromBufferAttribute(attr,index.getX(i+k)));
        if(keepClear.some(box=>box.intersectsTriangle(triangle))) throw Error('Ink covers the logo or number plate');
      }
      const im = atlas.image, probe = document.createElement('canvas');
      probe.width=im.width; probe.height=im.height;
      const ctx=probe.getContext('2d');
      ctx.drawImage(im,0,0);
      const texels=ctx.getImageData(0,0,im.width,im.height).data;
      const titles = lyricSheets.flatMap(s=>s.titles);
      const repertoire = [...new Set(lyricSheets.flatMap(s=>s.lines))];
      if (titles.length!==26 || repertoire.length!==648) throw Error('Unexpected lyric library');
      // A novel pair makes a lookup into the song sheets insufficient for decoding.
      for (let key=0; key<256; key++) {
        const chunks=mixWallPhrase('ABCDEFGH','12345678',key);
        for (let i=0;i<8;i++) {
          const swap=(key >> i)&1;
          if (chunks[2*i+swap]!=='abcdefgh'[i] || chunks[2*i+1-swap]!=='12345678'[i])
            throw Error('Unexpected order of handwritten groups for key '+key);
        }
        const [a,b]=separateWallPhrase(chunks,key);
        if (a!=='abcdefgh' || b!=='12345678') throw Error('Cannot reverse key '+key);
      }
      const rows=Math.ceil(repertoire.length*inkPasses/cols);
      if(im.width!==cols*width || im.height!==rows*height || Math.max(im.width,im.height)>2048)
        throw Error('Unexpected atlas size');
      for (let i=0; i<repertoire.length; i++) for (let pass=0;pass<inkPasses;pass++) {
        const translation=wallTranslation(repertoire[i],pass), tile=i+pass*repertoire.length;
        if(!/[ȝʊøƞŋþλƛꝛʃʒɣ]/u.test(translation) || pass && translation===wallTranslation(repertoire[i],pass-1))
          throw Error('Clean or unchanged translation '+i+'/'+pass);
        wallFragments(translation).forEach((fragment,group)=>{
          if (!fragment.trim()) return;
          const startX=(tile%cols)*width+group*width/inkGroups, startY=Math.floor(tile/cols)*height;
          let count=0;
          for (let y=startY;y<startY+height;y++) for (let x=startX;x<startX+width/inkGroups;x++)
            if (texels[(y*im.width+x)*4]>64) count++;
          if (!count) throw Error('Missing handwritten group '+i+'/'+group+'/'+pass);
        });
      }
      const normalized=repertoire.map(line=>line.normalize('NFC').toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu,'').replace(/\s+/gu,' ').trim());
      const pairs=ink.geometry.getAttribute('lyricPair');
      const echoes=repertoire.map(wallEcho), passesSeen=new Set();
      if (echoes.filter((s,i)=>s!==normalized[i]).length < repertoire.length*.8)
        throw Error('Recovered echoes retain too much source detail');
      function snapshot(mesh, validate=false) {
        const attr=mesh.geometry.getAttribute('lyricPair');
        return Array.from({length:slots},(_,i)=>{
          const vertices=slotVertices[i], v=vertices[0], a=attr.getX(v), b=attr.getY(v), key=attr.getZ(v);
          if (validate) {
            const visible=mesh.userData.readInscription(i);
            const [first,second]=separateWallPhrase(visible.chunks,visible.key);
            const [paintA,paintB]=separateWallPhrase(visible.inkChunks,visible.key);
            passesSeen.add(visible.pass);
            if (a===b || visible.key!==key || visible.chunks.length!==16 ||
                first!==echoes[a] || second!==echoes[b] ||
                paintA!==wallTranslation(repertoire[a],visible.pass) || paintB!==wallTranslation(repertoire[b],visible.pass))
              throw Error('Paint or recovered echoes do not match both sources at '+i);
            for (const n of vertices)
              if (a!==attr.getX(n) || b!==attr.getY(n) || key!==attr.getZ(n))
                throw Error('Conflicting sources across a curved inscription');
          }
          return (a*repertoire.length+b)*256+key;
        });
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
      function setTime(at) {
        Object.defineProperty(performance,'now',{configurable:true,value:()=>now+at*1000});
      }
      function read(at) {
        setTime(at);
        renderer.render(isolated,camera);
        const pixels=new Uint8Array(768*480*4);
        renderer.readRenderTargetPixels(target,0,0,768,480,pixels);
        return pixels;
      }
      function changed(a,b) { let n=0;for(let i=3;i<a.length;i+=4) if(Math.abs(a[i]-b[i])>12) n++;return n; }
      try {
        renderer.setRenderTarget(target); renderer.setClearColor(0,0);
        const a=read(0), revision=atlas.version;
        const initial=snapshot(ink,true), ticks=Array(slots).fill(-1), periods=new Set(), used=new Set();
        const exposed=readWallInscription(0);
        if (!exposed || JSON.stringify(exposed)!==JSON.stringify(ink.userData.readInscription(0)) ||
            readWallInscription(slots)!==null) throw Error('Displayed inscription cannot be read back');
        let previous=initial, switchedAtThree=0;
        for (let tick=1; tick<=60; tick++) {
          setTime(tick/10); ink.onBeforeRender(renderer,scene,camera);
          const current=snapshot(ink,tick===60);
          for (let i=0;i<slots;i++) {
            if (tick===3 && current[i]!==initial[i]) switchedAtThree++;
            if (tick===20 && current[i]===initial[i]) throw Error('Unchanged mix after two seconds');
            if (current[i]===previous[i]) continue;
            if (ticks[i]>=0) periods.add(tick-ticks[i]);
            ticks[i]=tick;
            const v=slotVertices[i][0];
            used.add(pairs.getX(v));used.add(pairs.getY(v));
          }
          previous=current;
        }
        const moving=changed(a,read(6)), switched=changed(a,read(21));
        const frozen = createWallInscriptions(true,{matches:true});
        const spare=frozen.material.map;
        frozen.material.map=atlas;
        copy.geometry = frozen.geometry;
        copy.material = frozen.material;
        copy.onBeforeRender = (r,s,c)=>frozen.onBeforeRender(r,scene,c);
        const firstFrozen=snapshot(frozen,true);
        const still=changed(read(21),read(41)), frozenState=snapshot(frozen);
        const calls=renderer.info.render.calls, triangles=renderer.info.render.triangles;
        if (!frozenState.every((v,i)=>v===firstFrozen[i]) ||
            frozenState.every((v,i)=>v===initial[i])) throw Error('Invalid reduced-motion selection');
        // Give each source fragment a unique ink strength. Read the actual GPU
        // output back in screen order to verify that the pen draws the codec's mix.
        const stamp=new T.PlaneGeometry(2,2), strengths=new Uint8Array(cols*inkGroups*rows);
        function strength(pass,source,group) { return 35+pass*27+source*85+group*8; }
        for(let pass=0;pass<inkPasses;pass++) for(let source=0;source<2;source++) {
          const tile=pass*repertoire.length+source;
          const start=((rows-1-Math.floor(tile/cols))*cols+tile%cols)*inkGroups;
          for(let k=0;k<inkGroups;k++) strengths[start+k]=strength(pass,source,k);
        }
        const markers=new T.DataTexture(strengths,cols*inkGroups,rows,T.RedFormat);
        markers.needsUpdate=true;
        const pair=new T.Float32BufferAttribute(new Float32Array(12),3);
        stamp.setAttribute('lyricPair',pair);
        const slotId=new T.Float32BufferAttribute(new Float32Array(4),1);
        stamp.setAttribute('inscription',slotId);
        stamp.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(12).fill(1),3));
        const swatch=new T.Scene(), front=new T.OrthographicCamera(-1,1,1,-1,.1,5);
        front.position.z=1;
        const sample=new T.Mesh(stamp,frozen.material);
        frozen.material.map=markers;
        sample.onBeforeRender=(r,s,c)=>frozen.onBeforeRender(r,s,c);
        swatch.add(sample);
        const strip=new Uint8Array(768*4);
        const smooth=(lo,hi,x)=>{const t=Math.max(0,Math.min(1,(x-lo)/(hi-lo)));return t*t*(3-2*t);};
        const tested=new Set();
        for (let id=0; id<slots && tested.size<inkPasses; id++) {
          const period=8+(id*5)%8, phase=((id*13)%period)/period, pass=Math.floor(phase*inkPasses);
          if(tested.has(pass)) continue;
          tested.add(pass); slotId.array.fill(id); slotId.needsUpdate=true;
          const opacity=.81*(.43+.57*smooth(0,.16,phase)*(1-smooth(.82,1,phase)));
          for (const key of [0x69,0x96]) {
            for (let v=0;v<4;v++) pair.setXYZ(v,0,1,key);
            pair.needsUpdate=true;
            renderer.render(swatch,front);
            renderer.readRenderTargetPixels(target,0,240,768,1,strip);
            for (let i=0;i<16;i++) {
              const group=i>>1, second=(i & 1)^((key>>group) & 1);
              const alpha=opacity*strength(pass,second,group);
              if (Math.abs(strip[(i*48+24)*4+3]-alpha)>1.6)
                throw Error('GPU drew the wrong source fragment at strip '+i+' for key '+key);
            }
          }
        }
        if(tested.size!==inkPasses || passesSeen.size!==inkPasses) throw Error('Missing translation stage');
        markers.dispose();stamp.dispose();
        spare.dispose();frozen.geometry.dispose();frozen.material.dispose();
        heights.sort((a,b)=>a-b);
        return {slots,inOpeningView,heightM:heights[Math.floor(slots/2)], maxHeightM:heights.at(-1),
                curved, rowWidths:ranges.map(row=>row.size), expectedTriangles:index.count/3,
                calls,triangles,
                tracks:titles.length,lines:repertoire.length,moving,switched,still,
                stableAtlas:atlas.version===revision, seenLines:used.size, switchedAtThree,
                periods:[...periods].sort((a,b)=>a-b),atlasBytes:im.width*im.height};
      } finally {
        if (oldNow) Object.defineProperty(performance,'now',oldNow); else delete performance.now;
        renderer.setRenderTarget(oldTarget);renderer.setClearColor(clear,alpha);target.dispose();
      }
    }""")
    page.close()
    assert report["slots"] > 250 and report["inOpeningView"] >= (35 if mobile else 80), report
    assert .10 < report["heightM"] < .35 and report["maxHeightM"] > report["heightM"]*1.4, report
    assert report["curved"] > report["slots"]*.40, report
    widths = [width for width in report["rowWidths"] if width]
    assert max(widths)-min(widths) >= 7 and min(widths[-3:]) <= 4, report
    assert report["calls"] == 1 and report["triangles"] == report["expectedTriangles"], report
    assert report["moving"] > 50 and report["switched"] > 280, report
    assert 0 < report["switchedAtThree"] < report["slots"], report
    assert report["periods"] == list(range(8, 16)) and report["seenLines"] > 570, report
    assert report["still"] == 0 and report["stableAtlas"] and not errors, (report, errors)
    print("mobile evening" if mobile else "desktop daylight", report, flush=True)


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        check(browser)
        check(browser, mobile=True)
        browser.close()
