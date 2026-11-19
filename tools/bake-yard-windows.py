"""Bake the courtyard sky and opposite buildings into the shared window probe."""
import base64
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


def main():
    handler = functools.partial(SimpleHTTPRequestHandler, directory=ROOT)
    with ThreadingHTTPServer(('127.0.0.1', 0), handler) as server, sync_playwright() as pw:
        Thread(target=server.serve_forever, daemon=True).start()
        browser = pw.chromium.launch(channel='msedge', headless=True)
        try:
            page = browser.new_page()
            page.goto(f'http://127.0.0.1:{server.server_port}/robots.txt')
            data = page.evaluate("""async () => {
                const T = await import('/yard/vendor/three.module.js');
                const {createYardScene} = await import('/yard/scene.js');
                const {lightingPresetForLayout} = await import('/yard/baked-lighting.js');
                const layout = await (await fetch('/yard/data/site-layout.json')).json();
                const loaded = new Promise((resolve, reject) => {
                    T.DefaultLoadingManager.onLoad = resolve;
                    T.DefaultLoadingManager.onError = url => {
                        if (!url.endsWith('/window-probe.jpg')) reject(new Error(url));
                    };
                });
                const {scene, edgeEffect} = createYardScene(layout, lightingPresetForLayout(layout, 2));
                await loaded;
                // Capture the surroundings once, without reflecting a previous capture.
                scene.traverse(o => { if (o.material?.envMap) o.material.envMap = null; });
                const renderer = new T.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
                renderer.setSize(512, 256, false);
                const target = new T.WebGLCubeRenderTarget(192);
                const probe = new T.CubeCamera(0.1, 510, target);
                probe.position.set(3, 5, 3);
                edgeEffect.update(probe.position.x, probe.position.z);
                probe.update(renderer, scene);
                const projection = new T.ShaderMaterial({
                    uniforms: {panorama: { value: target.texture }},
                    vertexShader: `varying vec2 coord;
                        void main() { coord = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
                    fragmentShader: `uniform samplerCube panorama;
                        varying vec2 coord;
                        void main() {
                            float azimuth = (coord.x - 0.5) * 6.2831853;
                            float altitude = (coord.y - 0.5) * 3.14159265;
                            vec3 dir = vec3(cos(azimuth)*cos(altitude), sin(altitude), sin(azimuth)*cos(altitude));
                            gl_FragColor = textureCube(panorama, dir);
                            #include <colorspace_fragment>
                        }`,
                });
                const screen = new T.Mesh(new T.PlaneGeometry(2, 2), projection);
                renderer.render(screen, new T.Camera());
                return renderer.domElement.toDataURL('image/jpeg', 0.88).split(',')[1];
            }""")
            target = ROOT / 'yard/assets/window-probe.jpg'
            target.write_bytes(base64.b64decode(data))
            print(f'{target}: {target.stat().st_size} bytes')
        finally:
            browser.close()
            server.shutdown()


if __name__ == '__main__':
    main()
