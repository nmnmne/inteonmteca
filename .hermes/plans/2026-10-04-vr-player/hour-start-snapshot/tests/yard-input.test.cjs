const assert = require("node:assert/strict");

const run = async () => {
  const { createInputController, movementFromCodes } = await import("../yard/input-controller.js");
  const walk = movementFromCodes(new Set(["KeyW"]), false);
  assert.equal(walk.forward, 1);
  assert.equal(walk.strafe, 0);
  const diagonal = movementFromCodes(new Set(["KeyW", "KeyD"]), false);
  assert.ok(Math.abs(Math.hypot(diagonal.forward, diagonal.strafe) - 1) < 1e-6);
  const russianLayoutStillUsesCode = movementFromCodes(new Set(["KeyW"]), false);
  assert.equal(russianLayoutStillUsesCode.forward, 1);
  const sprint = movementFromCodes(new Set(["KeyW"]), true);
  assert.equal(sprint.sprint, true);

  global.window = { addEventListener() {} };
  global.document = { activeElement: null, addEventListener() {}, hidden: false };
  const controller = createInputController({ addEventListener() {} }, { walkSpeed: 2.6, sprintSpeed: 3.8 });
  controller.setMode("walking");
  controller.beginStick(7, 100, 100);
  controller.moveStick(7, 148, 100, 48);
  controller.beginLook(9, 400, 240);
  const look = controller.moveLook(9, 420, 228, 0.005);
  const touchMove = controller.sample();
  assert.ok(touchMove.strafe > 0.95, "right side of the stick moves right");
  assert.ok(look.yaw > 0 && look.pitch > 0, "the second finger controls look independently");
  controller.endPointer(7);
  assert.equal(controller.sample().strafe, 0, "releasing the stick does not leave movement stuck");
  console.log("PASS: yard input");
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
