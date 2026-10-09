(function () {
  const dayKey = "inteonmteca-street-day";
  const secondsKey = "inteonmteca-street-return-sec";
  const visitsKey = "inteonmteca-street-visits";
  const poseKey = "inteonmteca-street-pose";
  const ruleKey = "inteonmteca-street-rule";
  const rule = "20,120,+120;boundary+240";
  const baseSeconds = 20;
  const stepSeconds = 120;
  const boundaryBonusSeconds = 240;

  const read = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const write = (key, value) => {
    try {
      localStorage.setItem(key, String(value));
    } catch {}
  };

  const today = () => {
    const date = new Date();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  };

  const resetIfNewDay = () => {
    if (read(dayKey) === today() && read(ruleKey) === rule) return;
    write(dayKey, today());
    write(ruleKey, rule);
    write(secondsKey, "");
    write(visitsKey, "");

  };

  const visits = () => {
    resetIfNewDay();
    const value = Number(read(visitsKey) || 0);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  };

  const recall = () => {
    resetIfNewDay();
    try {
      const pose = JSON.parse(read(poseKey) || "");
      if (!pose || !Number.isFinite(Number(pose.x)) || !Number.isFinite(Number(pose.z))) return null;
      return {
        x: Number(pose.x),
        z: Number(pose.z),
        yaw: Number(pose.yaw) || 0,
        pitch: Number(pose.pitch) || 0,
      };
    } catch {
      return null;
    }
  };

  const storedSeconds = () => {
    resetIfNewDay();
    const raw = read(secondsKey);
    if (raw === null || raw === "") return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < baseSeconds) return null;
    return Math.round(value);
  };

  const formatWatch = (totalSeconds) => {
    const safe = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  // Device-local calendar/storage, not a server entitlement. Clearing storage or
  // changing the device clock is outside this client-only daily guarantee.
  const walkKey = "inteonmteca-street-walk-v1";
  let reschedule = null;
  let armedVisit = null;
  const walkState = () => {
    try { return JSON.parse(read(walkKey)) || {}; } catch { return {}; }
  };
  const putWalk = (state) => write(walkKey, JSON.stringify(state));
  const newVisit = () => {
    const state = walkState();
    state.visit = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    state.ended = false;
    state.deadline = null;
    putWalk(state);
    return state;
  };
  const endVisit = () => {
    const state = walkState();
    state.ended = true;
    state.deadline = null;
    putWalk(state);
  };
  const atHome = () => {
    const path = window.location?.pathname || "";
    return Boolean(path) && !/\/yard(?:\/|$)/.test(path);
  };
  if (atHome()) endVisit();
  window.addEventListener?.("pageshow", () => { if (atHome()) endVisit(); });

  window.inteonStreet = {
    endVisit,
    boundaryVisit() { return armedVisit; },
    boundaryPlaybackSucceeded(visit = armedVisit) {
      const state = walkState();
      if (!visit || visit !== armedVisit || state.visit !== visit || state.ended || state.consumedDay === today()
          || !Number.isFinite(state.deadline) || state.deadline <= Date.now()) return false;
      const duration = this.seconds();
      // Keep elapsed walking time: the daily bonus extends the existing deadline.
      // One record contains both consumption and the absolute deadline.
      state.consumedDay = today();
      state.deadline += boundaryBonusSeconds * 1000;
      putWalk(state);
      write(secondsKey, duration + boundaryBonusSeconds);
      reschedule?.();
      return true;
    },
    seconds() {
      return storedSeconds() ?? baseSeconds;
    },
    visits,
    formatWatch,
    noteExit() {
      resetIfNewDay();
      newVisit();
      const previous = storedSeconds();
      // The short first visit is followed by two minutes. Once a boundary bonus
      // has grown that duration, every later visit adds two minutes to that base.
      const next = previous === null ? baseSeconds : previous === baseSeconds ? stepSeconds : previous + stepSeconds;
      write(dayKey, today());
      write(ruleKey, rule);
      write(secondsKey, String(next));
      write(visitsKey, String(visits() + 1));
      return next;
    },
    savePose(pose) {
      if (!pose || !Number.isFinite(Number(pose.x)) || !Number.isFinite(Number(pose.z))) return;
      write(poseKey, JSON.stringify({
        x: Number(pose.x),
        z: Number(pose.z),
        yaw: Number(pose.yaw) || 0,
        pitch: Number(pose.pitch) || 0,
      }));
    },
    resumePose() {
      return recall();
    },
    armReturn(locationObject, protocol, onTick, remember) {
      if (protocol === "file:") return;
      let interval;
      let timeout;
      const save = () => {
        if (typeof remember === "function") this.savePose(remember());
      };
      const stop = () => {
        window.clearInterval(interval);
        window.clearTimeout(timeout);
      };
      const start = () => {
        stop();
        let state = walkState();
        if (!state.visit || state.ended) state = newVisit();
        armedVisit = state.visit;
        if (!Number.isFinite(state.deadline)) {
          state.deadline = Date.now() + this.seconds() * 1000;
          putWalk(state);
        }
        const endsAt = state.deadline;
        const tick = () => {
          const left = Math.max(0, (endsAt - Date.now()) / 1000);
          if (typeof onTick === "function") onTick(left);
        };
        tick();
        interval = window.setInterval(tick, 1000);
        timeout = window.setTimeout(() => {
          stop();
          save();
          endVisit();
          locationObject.replace("../index.html");
        }, Math.max(0, endsAt - Date.now()));
      };
      reschedule = start;
      // A reload keeps its absolute deadline. Home marks the visit ended, even
      // when restored from BFCache; a later yard restore is a new ordinary visit.
      window.addEventListener?.("pagehide", () => { stop(); save(); reschedule = null; });
      window.addEventListener?.("pageshow", (event) => {
        if (event.persisted) { reschedule = start; start(); }
      });
      start();
    },
  };
})();
