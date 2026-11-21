const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

for (const frameSeconds of [1/30, .1, .5]) {
  test(`camera follows the opening house route at ${Math.round(1/frameSeconds)} FPS throughout the light wave`, async () => {
    const THREE = await import('../yard/vendor/three.module.js');
    const {ambientOpeningView, createAutoWalk} = await import('../yard/auto-walk.js');
    const {advanceYardCamera} = await import('../yard/ambient-scene.js');
    const {createDigitalBoundary} = await import('../yard/digital-boundary.js');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color();
    scene.fog = new THREE.Fog(0, 90, 260);
    const edge = createDigitalBoundary(scene, layout, {skyColor:0xabcdef, fogColor:0xeeeeee},
      new THREE.Mesh(), [], {passThroughBuildings:true});
    const gallery = scene.getObjectByName(`backstage-${layout.musicWall.buildingId}`);
    const lines = scene.getObjectByName('city-signal-backbone').children.find(child => child.isLineSegments);
    const pulse = lines.material.uniforms.entryPulse.value;
    const camera = new THREE.PerspectiveCamera(64, 390/844, .1, 260);
    const options = {random: () => .3, openingView: ambientOpeningView(layout, camera.aspect)};
    const walk = createAutoWalk(layout, options);
    const reference = createAutoWalk(layout, options);
    const dt = Math.min(frameSeconds, .15);
    let entryFrame, entryPosition, movedDuringDrawing = false, finished = false, exited = false, cleared = false;

    for (let frame = 0; frame * dt < 70; frame++) {
      const seconds = frame * frameSeconds;
      const motionDt = frame === 0 ? 0 : dt;
      const expected = reference.update(motionDt * edge.passagePace);
      const pose = advanceYardCamera(walk, edge, camera, motionDt, seconds, false);
      assert.deepEqual(pose, expected, 'the route consumes every normal movement step');
      assert.deepEqual(camera.position.toArray(), [expected.x, expected.y, expected.z]);
      assert.deepEqual(camera.rotation.toArray(), [expected.pitch, -expected.yaw, expected.roll, 'YXZ']);
      assert.equal(camera.fov, expected.fov);

      if (entryFrame === undefined) {
        if (pulse.w !== 0) continue;
        assert.ok(edge.facadeDistance <= 0 && gallery.visible, 'this wave starts inside the opening facade');
        entryFrame = frame;
        entryPosition = camera.position.clone();
      }
      const elapsed = (frame - entryFrame) * frameSeconds;
      const draw = gallery.material.uniforms.entryDraw.value;
      if (elapsed < .2 - 1e-8) {
        assert.ok(Math.abs(draw - elapsed/.2) < 1e-8);
        assert.ok(Math.abs(pulse.w - draw) < 1e-8);
        if (draw > 0 && camera.position.distanceTo(entryPosition) > .005) movedDuringDrawing = true;
      } else if (!finished) {
        assert.ok(draw > 1 - 1e-8);
        assert.ok(pulse.w === -1 || pulse.w > 1 - 1e-8);
        assert.ok(camera.position.distanceTo(entryPosition) > .005);
        finished = true;
      }
      if (finished && !exited && edge.facadeDistance > .2) {
        assert.equal(pulse.w, -1, 'exiting the room does not restart the entry wave');
        assert.equal(draw, 1);
        exited = true;
      }
      if (exited && edge.facadeDistance >= 6) {
        assert.equal(edge.passagePace, 1);
        cleared = true;
        break;
      }
    }
    assert.ok(cleared, 'the route crosses both faces of the opening house');
    if (frameSeconds < .2) assert.ok(movedDuringDrawing, 'the camera travels while lines are being drawn');
  });
}
