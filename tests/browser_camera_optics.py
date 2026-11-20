"""Compare real WebGL frames at the same pose with and without camera exposure."""
import os
from playwright.sync_api import sync_playwright

base = os.environ.get("INTEON_BASE_URL", "http://127.0.0.1:8080").rstrip("/")


def verify(browser):
    page = browser.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if 'Shader Error' in m.text else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(base + '/robots.txt')
    measured = page.evaluate("""async () => {
      const T=await import('/yard/vendor/three.module.js');
      const {createCameraOptics}=await import('/yard/camera-optics.js');
      const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true,antialias:false});
      renderer.setSize(420,240,false);
      const lens=createCameraOptics(renderer), scene=new T.Scene();
      const camera=new T.PerspectiveCamera(65,420/240,.1,100);
      scene.background=new T.Color(0x404955);
      for(const [x,z,scale] of [[-.84,-2,1],[6.72,-16,8]]) {
        const surface=new T.Mesh(new T.PlaneGeometry(1.6*scale,2.3*scale),new T.ShaderMaterial({
          vertexShader:'varying vec2 t; void main(){t=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
          fragmentShader:`varying vec2 t; void main(){
            float k=.13+.58*step(.50,fract(t.x*22.)); gl_FragColor=vec4(k,k,k,1.);
            #include <colorspace_fragment>
          }`,
        }));
        surface.position.set(x,0,z); scene.add(surface);
      }
      const gl=renderer.getContext();
      function snap() {
        const pixels=new Uint8Array(420*240*4); gl.readPixels(0,0,420,240,gl.RGBA,gl.UNSIGNED_BYTE,pixels); return pixels;
      }
      function shoot(start, dt=.033, still=false) {
        lens.reset(); camera.position.x=start; lens.render(scene,camera,0,8,still);
        camera.position.x=0; lens.render(scene,camera,dt,8,still); return snap();
      }
      const raw=shoot(0), facets=shoot(-.002), motion=shoot(-.15), paused=shoot(-.15,.033,true), cut=shoot(-8);
      function difference(a,b,x0,x1) {
        let total=0,changed=0,count=0;
        for(let y=44;y<195;y++)for(let x=x0;x<x1;x++) {
          const i=(y*420+x)*4, delta=Math.abs(a[i]-b[i]); total+=delta; changed+=Number(delta>2); count++;
        }
        return {mean:total/count,changed:changed/count};
      }
      const data={near:difference(raw,facets,80,190),far:difference(raw,facets,230,340),
        moving:difference(raw,motion,80,190),still:difference(raw,paused,80,340),cut:difference(raw,cut,80,340)};
      lens.dispose();renderer.dispose();return data;
    }""")
    assert not errors, errors
    assert measured['near']['mean'] > .8 and measured['far']['mean'] < .6, measured
    assert measured['moving']['mean'] > 1.5 * measured['near']['mean'], measured
    assert measured['still']['mean'] == measured['cut']['mean'] == 0, measured
    print(measured, flush=True)
    page.close()


if __name__ == '__main__':
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='msedge', args=['--enable-unsafe-swiftshader'])
        verify(browser)
        browser.close()
