import * as THREE from './vendor/three.module.js';
import { createResidentModel } from './resident-model.js';
import { createResidentOrb } from './resident-orb.js';

export function createResidentLayers(scene, canvas) {
  const model = createResidentModel();
  const orb = createResidentOrb();
  scene.add(model.group, orb.mesh);
  const center = new THREE.Vector3(), perch = new THREE.Vector3(), offset = new THREE.Vector3();
  const projected = new THREE.Vector3(), lastScreen = new THREE.Vector2();
  const anchor = new THREE.Vector2(), target = new THREE.Vector3();
  let layer = 'room', wasVisiting = false, hasScreenPoint = false;
  let approach = 1, startScale = 1, depth = 5.8, floatTime = 0;

  function atDepth(camera, x, y, distance, out) {
    const p = camera.projectionMatrix.elements;
    out.set((x + p[8]) * distance / p[0], (y + p[9]) * distance / p[5], -distance);
    return out.applyMatrix4(camera.matrixWorld);
  }

  function returnToRoom() {
    if (layer === 'room') return;
    const rect = canvas.getBoundingClientRect();
    const point = hasScreenPoint && rect.width && rect.height ? {
      x: rect.left + (lastScreen.x + 1) * rect.width / 2,
      y: rect.top + (1 - lastScreen.y) * rect.height / 2,
    } : null;
    window.inteonRoom?.setInCourtyard(false, false, point);
    layer = 'room';
    hasScreenPoint = false;
  }

  function update(visit, camera, daylight, virtuality, dt) {
    const room = window.inteonRoom;
    if (!room) return;
    // Hysteresis avoids swapping bodies on every frame of a grazing flight.
    const backstage = virtuality >= (layer === 'backstage' ? .45 : .50);
    model.group.scale.setScalar(1);
    model.update(visit?.amount > 0 && room.canVisitCourtyard() ? visit : null,
      dt, daylight, backstage ? 0 : virtuality);
    const visiting = model.group.visible;
    model.group.visible = visiting && !backstage;
    orb.mesh.visible = backstage;
    const next = backstage ? 'backstage' : visiting ? 'courtyard' : 'room';
    if (next === 'room') {
      returnToRoom();
      wasVisiting = false;
      return;
    }

    camera.updateMatrixWorld();
    if (visiting) model.body.getWorldPosition(perch);
    if (layer === 'room') {
      const point = room.getResidentCenter?.();
      const rect = canvas.getBoundingClientRect();
      anchor.set(0, 0);
      if (point && rect.width && rect.height) {
        anchor.set((point.x - rect.left) * 2 / rect.width - 1,
          1 - (point.y - rect.top) * 2 / rect.height);
      }
      depth = visiting ? Math.max(camera.near * 2, -projected.copy(perch).applyMatrix4(camera.matrixWorldInverse).z) : 5.8;
      atDepth(camera, anchor.x, anchor.y, depth, center);
    }

    if (visiting) {
      // Keep the real perch as the destination. On entry the body starts at
      // the outgoing form's center, then moves the remaining distance to it.
      if (!wasVisiting || layer !== next) {
        startScale = 1;
        if (layer === 'room' && center.y < perch.y && camera.position.y > visit.y) {
          // On a downward sightline, start nearer and proportionally smaller
          // so the body appears at the same pixel without starting underground.
          startScale = Math.min(1, (camera.position.y - visit.y) /
            (camera.position.y - center.y + model.body.position.y));
          center.lerp(camera.position, 1 - startScale);
        }
        offset.subVectors(center, perch);
        approach = 0;
      } else {
        approach = Math.min(1, approach + dt / .8);
      }
      const weight = 1 - THREE.MathUtils.smoothstep(approach, 0, 1);
      const scale = 1 + (startScale - 1) * weight;
      center.copy(perch).addScaledVector(offset, weight);
      model.group.scale.setScalar(scale);
      model.group.position.addScaledVector(offset, weight);
      model.group.position.y += model.body.position.y * (1 - scale);
    } else if (layer !== next || wasVisiting) {
      // The floating companion inherits the departing body's sightline.
      // A continuing visit instead uses exactly the same world center above.
      projected.copy(center).project(camera);
      depth = -target.copy(center).applyMatrix4(camera.matrixWorldInverse).z;
      if (depth > camera.near && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1) {
        anchor.set(projected.x, projected.y);
      } else {
        anchor.copy(lastScreen);
        depth = 5.8;
      }
      floatTime = 0;
    } else {
      floatTime += dt;
      atDepth(camera, anchor.x + .024 * Math.sin(floatTime * .48),
        anchor.y + .025 * Math.sin(floatTime * .66), depth, target);
      if (center.distanceToSquared(target) > 16) center.copy(target);
      else center.lerp(target, 1 - Math.exp(-4.5 * dt));
    }
    if (backstage) orb.update(virtuality, center, dt);

    // Remember the last displayed pixel before the camera moves again. In
    // particular a cut, resize or teardown must not project through a new pose.
    projected.copy(center).project(camera);
    if (Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && Math.abs(projected.z) <= 1) {
      lastScreen.set(projected.x, projected.y);
      hasScreenPoint = true;
    }
    if (layer !== next) room.setInCourtyard(true, backstage);
    layer = next;
    wasVisiting = visiting;
  }

  return {update, dispose() {
    returnToRoom();
    model.dispose();
    orb.dispose();
  }};
}
