const MOVE = {
  KeyW: [1, 0],
  ArrowUp: [1, 0],
  KeyS: [-1, 0],
  ArrowDown: [-1, 0],
  KeyA: [0, -1],
  ArrowLeft: [0, -1],
  KeyD: [0, 1],
  ArrowRight: [0, 1],
};

export function movementFromCodes(codes, sprint) {
  let forward = 0;
  let strafe = 0;
  for (const code of codes) {
    const axis = MOVE[code];
    if (!axis) continue;
    forward += axis[0];
    strafe += axis[1];
  }
  const length = Math.hypot(forward, strafe);
  if (length > 1) {
    forward /= length;
    strafe /= length;
  }
  return { forward, strafe, sprint: Boolean(sprint) && length > 0 };
}

export function createInputController(target, { walkSpeed = 2.6, sprintSpeed = 3.8 } = {}) {
  const codes = new Set();
  const pointers = new Map();
  const root = target || (typeof window === "undefined" ? null : window);
  let mode = "idle";
  let look = { yaw: 0, pitch: 0 };
  const stick = { id: null, originX: 0, originY: 0, x: 0, z: 0 };
  const lookPointer = { id: null, x: 0, y: 0, moved: false };

  const typing = () => {
    if (typeof document === "undefined") return false;
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  };

  const clear = () => {
    codes.clear();
    pointers.clear();
    stick.id = null;
    stick.x = 0;
    stick.z = 0;
    lookPointer.id = null;
  };

  const setMode = (next) => {
    mode = next;
    clear();
  };

  const keyDown = (event) => {
    if (mode !== "walking" || typing()) return;
    if (MOVE[event.code] || event.code === "ShiftLeft" || event.code === "ShiftRight") {
      codes.add(event.code);
      event.preventDefault();
    }
  };
  const keyUp = (event) => codes.delete(event.code);
  root?.addEventListener?.("keydown", keyDown);
  root?.addEventListener?.("keyup", keyUp);
  if (typeof window !== "undefined") window.addEventListener("blur", clear);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clear();
    });
  }

  const beginStick = (id, x, y) => {
    if (mode !== "walking" || stick.id !== null) return false;
    stick.id = id;
    stick.originX = x;
    stick.originY = y;
    pointers.set(id, "stick");
    return true;
  };

  const moveStick = (id, x, y, radius = 48) => {
    if (stick.id !== id) return { x: stick.x, z: stick.z };
    const dx = (x - stick.originX) / Math.max(1, radius);
    const dz = (y - stick.originY) / Math.max(1, radius);
    const length = Math.hypot(dx, dz);
    const capped = Math.min(1, length);
    const deadZone = 0.12;
    const strength = capped <= deadZone ? 0 : (capped - deadZone) / (1 - deadZone);
    stick.x = length ? (dx / length) * strength : 0;
    stick.z = length ? (dz / length) * strength : 0;
    return { x: stick.x, z: stick.z };
  };

  const beginLook = (id, x, y) => {
    if (mode !== "walking" || lookPointer.id !== null) return false;
    lookPointer.id = id;
    lookPointer.x = x;
    lookPointer.y = y;
    lookPointer.moved = false;
    pointers.set(id, "look");
    return true;
  };

  const moveLook = (id, x, y, sensitivity = 0.004) => {
    if (lookPointer.id !== id) return { ...look };
    const dx = x - lookPointer.x;
    const dy = y - lookPointer.y;
    lookPointer.x = x;
    lookPointer.y = y;
    lookPointer.moved ||= Math.hypot(dx, dy) > 1;
    look = {
      yaw: look.yaw + dx * sensitivity,
      pitch: Math.max(-1.1, Math.min(1.1, look.pitch - dy * sensitivity)),
    };
    return { ...look };
  };

  const mouseLook = (dx, dy, sensitivity = 0.0022) => {
    look = {
      yaw: look.yaw + dx * sensitivity,
      pitch: Math.max(-1.1, Math.min(1.1, look.pitch - dy * sensitivity)),
    };
    return { ...look };
  };

  const endPointer = (id) => {
    if (stick.id === id) {
      stick.id = null;
      stick.x = 0;
      stick.z = 0;
    }
    if (lookPointer.id === id) lookPointer.id = null;
    pointers.delete(id);
  };

  const sample = () => {
    const move = movementFromCodes(codes, codes.has("ShiftLeft") || codes.has("ShiftRight"));
    move.forward -= stick.z;
    move.strafe += stick.x;
    const length = Math.hypot(move.forward, move.strafe);
    if (length > 1) {
      move.forward /= length;
      move.strafe /= length;
    }
    return { ...move, speed: move.sprint ? sprintSpeed : walkSpeed, look };
  };

  return {
    get mode() { return mode; },
    setMode,
    clear,
    sample,
    keyDown,
    keyUp,
    beginStick,
    moveStick,
    beginLook,
    moveLook,
    mouseLook,
    endPointer,
    codes,
    stick,
    lookPointer,
    pointers,
  };
};
