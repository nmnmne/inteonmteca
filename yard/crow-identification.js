import { Raycaster, Vector3 } from './vendor/three.module.js';

// Test a visible bird's centre against the courtyard walls only when someone taps.
export function crowAtPoint(birds, camera, solids, rect, x, y) {
  const position = new Vector3(), projected = new Vector3();
  const ray = new Raycaster();
  const candidates = [];
  for (const bird of birds) {
    if (!bird.id || !bird.personality) continue; // Bird zero carries the camera.
    position.set(bird.x, bird.y, bird.z);
    const distance = position.distanceTo(camera.position);
    projected.copy(position).project(camera);
    if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) continue;
    const px = rect.left + (.5 + projected.x * .5) * rect.width;
    const py = rect.top + (.5 - projected.y * .5) * rect.height;
    const offset = Math.hypot(x - px, y - py);
    const pixelsPerMetre = rect.height * camera.projectionMatrix.elements[5] / (2 * distance);
    const radius = Math.min(45, Math.max(12, pixelsPerMetre * (.32 + .24 * bird.airborne)));
    if (offset <= radius) candidates.push({bird, offset, distance});
  }
  candidates.sort((a, b) => a.offset - b.offset || a.distance - b.distance);
  for (const {bird, distance} of candidates) {
    const direction = position.set(bird.x, bird.y, bird.z).sub(camera.position).normalize();
    ray.set(camera.position, direction);
    ray.far = Math.max(0, distance - .2);
    if (!ray.intersectObjects(solids, false).length) return bird;
  }
  return null;
}

export function enableCrowNames(canvas, camera, yard, flock, signal) {
  const caption = document.createElement('output');
  caption.className = 'yard-crow-name';
  caption.hidden = true;
  document.body.append(caption);
  let timer;
  document.addEventListener('click', event => {
    const body = document.body;
    if (event.detail === 0 || (event.target !== body && event.target !== document.documentElement)) return;
    if (body.dataset.yardWindow !== 'desktop' && !(body.dataset.yardWindow === 'dj' && body.dataset.djMode === 'compact')) return;
    const bird = crowAtPoint(flock.allBirds, camera, yard.solids, canvas.getBoundingClientRect(), event.clientX, event.clientY);
    clearTimeout(timer);
    caption.hidden = !bird;
    if (!bird) return;
    event.preventDefault(); // This courtyard tap selected a bird.
    caption.textContent = bird.personality.name;
    caption.style.left = Math.max(60, Math.min(innerWidth - 60, event.clientX)) + 'px';
    caption.style.top = Math.max(42, event.clientY - 12) + 'px';
    timer = setTimeout(() => { caption.hidden = true; }, 2300);
  }, {signal});
  signal.addEventListener('abort', () => { clearTimeout(timer); caption.remove(); }, {once: true});
}
