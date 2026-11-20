"""Bake local reflection probes and still courtyard views at four solar phases."""
import argparse
import base64
import functools
import io
import json
import math
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
from shapely.geometry import LineString, Point, Polygon

ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 512, 128
COLUMNS = 4
FACES = [(1, 0, 0), (-1, 0, 0), (0, 0, 1), (0, 0, -1), (0, 1, 0)]
UPS = [(0, 1, 0)] * 4 + [(0, 0, -1)]
POSTER_TIMES = {
    'day': '2026-06-21T08:30:00Z',
    'dawn': '2026-09-22T02:52:00Z',
    'dusk': '2026-09-22T14:32:00Z',
    'night': '2026-09-22T21:00:00Z',
}


class QuietServer(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def panorama(faces, width=WIDTH, height=HEIGHT):
    # Texel centres, with the zenith in the first scanline and the horizon in the last.
    azimuth = 2 * np.pi * ((np.arange(width) + 0.5) / width - 0.5)
    elevation = (np.pi / 2) * (1 - (np.arange(height)[:, None] + 0.5) / height)
    rays = np.stack(np.broadcast_arrays(np.cos(elevation) * np.cos(azimuth),
                                        np.sin(elevation),
                                        np.cos(elevation) * np.sin(azimuth)), axis=-1)
    depth = rays @ np.array(FACES).T
    nearest = depth.argmax(axis=-1)
    frame = np.empty((height, width, 3), dtype=np.uint8)
    for index, (forward, up) in enumerate(zip(FACES, UPS)):
        mask = nearest == index
        selected = rays[mask]
        right = np.cross(forward, up)  # Three cameras look along local -Z.
        image = faces[index]
        size = image.shape[0]
        u = (1 + (selected @ right) / depth[mask, index]) * size / 2 - 0.5
        v = (1 - (selected @ up) / depth[mask, index]) * size / 2 - 0.5
        u, v = u.clip(0, size - 1), v.clip(0, size - 1)
        x, y = u.astype(int), v.astype(int)
        x1, y1 = (x + 1).clip(max=size - 1), (y + 1).clip(max=size - 1)
        du, dv = (u - x)[:, None], (v - y)[:, None]
        top = image[y, x] * (1 - du) + image[y, x1] * du
        bottom = image[y1, x] * (1 - du) + image[y1, x1] * du
        frame[mask] = np.rint(top * (1 - dv) + bottom * dv).astype(np.uint8)
    return frame


def probe_sites(layout):
    """Densely sample the walking route, then fill the surrounding street grid."""
    sites = []
    exclusion = [Polygon(item['footprint']) for kind in ['buildings', 'utilityStructures']
                 for item in layout[kind]]
    def place(x, z, spacing):
        if not any(area.covers(Point(x, z)) for area in exclusion) and all(
                math.hypot(x - px, z - pz) >= spacing for px, pz in sites):
            sites.append((x, z))
    priorities = {'spawn-pedestrian-link': 6, 'house14-courtyard-drive': 12, 'zhandova-courtyard-drive': 13}
    for road in sorted(layout['roads'], key=lambda item: priorities.get(item['id'], 27)):
        if road.get('render') is False or road['kind'] != 'asphalt':
            continue
        line = LineString(road['centerline'])
        step = priorities.get(road['id'], 27)
        for metre in np.linspace(0, line.length, math.ceil(line.length / step) + 1):
            p = line.interpolate(metre)
            place(p.x, p.y, step * 0.68)
    for z in range(-140, 145, 33):
        for x in range(-79, 164, 33):
            place(x, z, 32)
    return sites


def bake_lookup(sites, layout, folder):
    west, north = np.min(layout['walkable'], axis=0)
    east, south = np.max(layout['walkable'], axis=0)
    w, h = 500, 590
    xs = west + (np.arange(w) + 0.5) * (east - west) / w
    zs = north + (np.arange(h) + 0.5) * (south - north) / h
    # Each texel names its two closest local views. Blend across the narrow
    # boundary between them, retaining crisp architecture within each region.
    locations = np.array(sites)
    pixels = np.empty((h, w, 3), dtype=np.uint8)
    for row, z in enumerate(zs):
        distances = np.hypot(xs[:, None] - locations[:, 0], z - locations[:, 1])
        closest = np.argsort(distances, axis=1)[:, :2]
        d1, d2 = np.take_along_axis(distances, closest, axis=1).T
        blend = np.clip(1 - (d2 - d1) / 3.5, 0, 1)
        pixels[row, :, :2] = closest
        pixels[row, :, 2] = np.rint(127 * blend * blend * (3 - 2 * blend))
    Image.fromarray(pixels).save(folder / 'puddle-probes.png', optimize=True)


def main(posters_only):
    folder = ROOT / 'yard/assets'
    layout = json.loads((ROOT / 'yard/data/site-layout.json').read_text(encoding='utf8'))
    handler = functools.partial(QuietServer, directory=str(ROOT))
    with ThreadingHTTPServer(('127.0.0.1', 0), handler) as server, sync_playwright() as pw:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        browser = pw.chromium.launch(channel='msedge', headless=True, args=['--enable-unsafe-swiftshader'])
        try:
            page = browser.new_page(reduced_motion='reduce')
            errors = []
            page.on('pageerror', lambda err: errors.append(str(err)))
            page.on('console', lambda msg: errors.append(msg.text) if 'Shader Error' in msg.text else None)
            page.goto(f'http://127.0.0.1:{server.server_port}/robots.txt')
            page.evaluate("""async () => {
                const THREE = await import('/yard/vendor/three.module.js');
                const {createYardScene} = await import('/yard/scene.js');
                const {ambientOpeningView} = await import('/yard/auto-walk.js');
                const {createCrowFlock} = await import('/yard/crow-flock.js');
                const {createCrowModels} = await import('/yard/crow-models.js');
                const {sunForLocation, solarLighting} = await import('/yard/solar-clock.js');
                const {createSolarLighting} = await import('/yard/solar-lighting.js');
                const layout = await (await fetch('/yard/data/site-layout.json')).json();
                const resources = new Promise((resolve, reject) => {
                    THREE.DefaultLoadingManager.onLoad = resolve;
                    THREE.DefaultLoadingManager.onError = url => reject(new Error(url));
                });
                let time = Date.parse('2026-06-21T08:30:00Z');
                const lighting = solarLighting(sunForLocation(layout.origin, time));
                const yard = createYardScene(layout, lighting);
                await resources;
                const renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
                renderer.setSize(320, 320, false);
                renderer.outputColorSpace = THREE.SRGBColorSpace;
                const camera = new THREE.PerspectiveCamera(90, 1, 0.025, 510);
                const rig = createSolarLighting(renderer, yard, layout, {mapSize: 2048});
                rig.refreshGeometry();
                let ripple;
                const crows = createCrowModels();
                window.capturePoster = async ({width, height, isoTime}) => {
                    time = Date.parse(isoTime);
                    if (!yard.scene.getObjectByName('courtyard-puddles')) {
                        const {addPuddles} = await import('/yard/puddles.js');
                        await new Promise((resolve, reject) => {
                            THREE.DefaultLoadingManager.onError = url => reject(new Error(url));
                            ripple = addPuddles(yard.scene, layout, resolve);
                        });
                    }
                    const pose = ambientOpeningView(layout, width / height);
                    camera.position.set(pose.x, layout.movement.eyeM, pose.z);
                    camera.fov = pose.fov; camera.aspect = width / height; camera.updateProjectionMatrix();
                    camera.rotation.set(pose.pitch, -pose.yaw, 0, 'YXZ');
                    yard.edgeEffect.update(pose.x, pose.z, camera.position.y, 0);
                    rig.update(time, camera);
                    const preloadNight = yard.scene.userData.windowNight.value > .02
                        && !yard.scene.getObjectByName('courtyard-puddles').material.uniforms.nightPanorama.value;
                    const nightReady = preloadNight && new Promise((resolve, reject) => {
                        THREE.DefaultLoadingManager.onLoad = resolve;
                        THREE.DefaultLoadingManager.onError = url => reject(new Error(url));
                    });
                    ripple(0);
                    if (nightReady) { await nightReady; ripple(0); }
                    // Keep the same birds and poses in all four daylight variants.
                    // Only the opening photograph includes them; the static probes
                    // are reflections of the permanent courtyard.
                    let seed = 14;
                    const random = () => ((seed = (Math.imul(seed,1664525) + 1013904223) >>> 0) / 4294967296);
                    const flock = createCrowFlock(layout, pose, {random});
                    crows.update(flock.birds, 0, 0, yard.scene.userData.solarLighting.daylight);
                    yard.scene.add(crows.group);
                    renderer.setSize(width, height, false);
                    renderer.render(yard.scene, camera);
                    crows.group.removeFromParent();
                    return renderer.domElement.toDataURL('image/jpeg', 0.90).split(',')[1];
                };
                window.setProbeLight = ({isoTime, size}) => {
                    time = Date.parse(isoTime);
                    renderer.setSize(size, size, false);
                    // Precipitation and the solar disk keep moving independently of the buildings.
                    yard.scene.getObjectByName('courtyard-weather-fronts').visible = false;
                    yard.scene.getObjectByName('courtyard-sun').visible = false;
                };
                window.restoreSky = () => {
                    yard.scene.getObjectByName('courtyard-weather-fronts').visible = true;
                    yard.scene.getObjectByName('courtyard-sun').visible = true;
                };
                window.captureFaces = ({x, z, faces, ups}) => {
                    camera.position.set(x, 0.12, z);
                    yard.edgeEffect.update(x, z, camera.position.y, 0);
                    return faces.map(([dx, dy, dz], i) => {
                        camera.up.set(...ups[i]);
                        camera.lookAt(x + dx, 0.12 + dy, z + dz);
                        rig.update(time, camera);
                        renderer.render(yard.scene, camera);
                        return renderer.domElement.toDataURL('image/png').split(',')[1];
                    });
                };
            }""")
            if not posters_only:
                sites = probe_sites(layout)
                assert len(sites) <= 256
                print(f'Baking {len(sites)} courtyard probes', flush=True)
                for phase, divisor in [('day',1), ('night',4)]:
                    w, h = WIDTH // divisor, HEIGHT // divisor
                    atlas = Image.new('RGB', (COLUMNS*w, math.ceil(len(sites)/COLUMNS)*h))
                    page.evaluate('window.setProbeLight', {'isoTime': POSTER_TIMES[phase], 'size': 320//divisor})
                    for i, (x, z) in enumerate(sites):
                        samples = page.evaluate('window.captureFaces', {'x': x, 'z': z, 'faces': FACES, 'ups': UPS})
                        faces = [np.asarray(Image.open(io.BytesIO(base64.b64decode(face))).convert('RGB'))
                                 for face in samples]
                        atlas.paste(Image.fromarray(panorama(faces,w,h)), (i%COLUMNS*w, i//COLUMNS*h))
                    suffix = '' if phase == 'day' else '-night'
                    atlas.save(folder / f'puddle-reflections{suffix}.jpg', quality=88, subsampling=0, optimize=True)
                    print('Saved ' + phase + ' reflections.', flush=True)
                bake_lookup(sites, layout, folder)
                page.evaluate('window.restoreSky()')
            for phase, iso_time in POSTER_TIMES.items():
                suffix = '' if phase == 'day' else '-' + phase
                for kind, width, height in [('desktop', 1440, 900), ('mobile', 540, 1080)]:
                    jpeg = page.evaluate('args => window.capturePoster(args)', {
                        'width': width, 'height': height, 'isoTime': iso_time,
                    })
                    if errors:
                        raise RuntimeError('\n'.join(errors))
                    (folder / f'spawn-{kind}{suffix}.jpg').write_bytes(base64.b64decode(jpeg))
            print('Saved reflection assets and still backgrounds.', flush=True)
        finally:
            browser.close()
            server.shutdown()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--posters-only', action='store_true')
    main(parser.parse_args().posters_only)
