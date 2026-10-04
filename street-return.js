(function () {
  const dayKey = "inteonmteca-street-day";
  const secondsKey = "inteonmteca-street-return-sec";
  const visitsKey = "inteonmteca-street-visits";
  const poseKey = "inteonmteca-street-pose";
  const ruleKey = "inteonmteca-street-rule";
  const rule = "10+5";
  const baseSeconds = 10;
  const stepSeconds = 5;

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
    write(poseKey, "");
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

  window.inteonStreet = {
    seconds() {
      return storedSeconds() ?? baseSeconds;
    },
    visits,
    formatWatch,
    noteExit() {
      resetIfNewDay();
      const previous = storedSeconds();
      const next = previous === null ? baseSeconds : previous + stepSeconds;
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
      if (visits() === 0 || visits() % 2 !== 0) return null;
      return recall();
    },
    armReturn(locationObject, protocol, onTick, remember) {
      if (protocol === "file:") return;
      const endsAt = Date.now() + this.seconds() * 1000;
      const tick = () => {
        const left = Math.max(0, (endsAt - Date.now()) / 1000);
        if (typeof onTick === "function") onTick(left);
      };
      tick();
      const interval = window.setInterval(tick, 1000);
      window.setTimeout(() => {
        window.clearInterval(interval);
        if (typeof remember === "function") this.savePose(remember());
        locationObject.replace("../index.html");
      }, Math.max(0, endsAt - Date.now()));
    },
  };
})();
