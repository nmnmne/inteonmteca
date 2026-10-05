(() => {
  "use strict";
  const anchor = document.querySelector(".room-presence");
  if (!anchor) return;

  const resident = document.createElement("div");
  resident.className = "room-resident";
  resident.setAttribute("aria-hidden", "true");
  resident.innerHTML = '<div class="resident-mist"></div><div class="resident-body">'
    + '<div class="resident-face"><i></i><i></i></div></div><div class="resident-shadow"></div>';
  document.body.append(resident);
  anchor.classList.add("has-resident");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const compact = matchMedia("(max-width: 800px), (pointer: coarse)");
  const random = (a, b) => a + Math.random() * (b - a);
  const timers = new Set();
  let journey = null, decision = 0, stillness = 0, resizeTimer = 0;
  let blocked = false, lastPointerWork = 0, lastEncounter = -60000;
  let pointer = { x: -9999, y: -9999, at: 0 };
  let obstacles = [];
  const later = (fn, delay) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, delay);
    timers.add(id);
    return id;
  };
  const clear = id => { clearTimeout(id); timers.delete(id); };
  const center = () => {
    const b = resident.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const position = p => `translate3d(${(p.x - resident.offsetWidth / 2).toFixed(1)}px, ${(p.y - resident.offsetHeight / 2).toFixed(1)}px, 0)`;
  const home = () => {
    const r = anchor.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  const stopJourney = () => {
    if (!journey) return;
    const here = center();
    journey.cancel();
    journey = null;
    resident.style.transform = position(here);
  };
  const refreshObstacles = () => {
    obstacles = [...document.querySelectorAll(
      '.logo-wrap, .listening-intro h1, .listening-intro .label, .hero-intro, '
      + '.catalog-heading, #track-list, #active-player, .text, '
      + '#auth-hint, #theme-hint, #chat-hint, .street-return'
    )].map(el => el.getBoundingClientRect()).filter(r => r.width && r.height);
  };
  const safe = p => p.x > 38 && p.x < innerWidth - 38 && p.y > 75 && p.y < innerHeight - 55
    && !obstacles.some(r => p.x > r.left - 34 && p.x < r.right + 34
      && p.y > r.top - 34 && p.y < r.bottom + 34);
  const clearPath = (from, to) => {
    for (let i = 1; i <= 16; i++) {
      const t = i / 16;
      if (!safe({x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t})) return false;
    }
    return true;
  };
  const look = point => {
    const here = center();
    const dx = point.x - here.x, dy = point.y - here.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    resident.style.setProperty("--look-x", `${(dx / length * 2.5).toFixed(1)}px`);
    resident.style.setProperty("--look-y", `${(dy / length * 1.8).toFixed(1)}px`);
  };
  const pose = name => { resident.dataset.state = name; };
  const schedule = (delay = random(6500, 17000)) => {
    clear(decision);
    if (!blocked && !reduced.matches && !compact.matches) decision = later(think, delay);
  };
  const walk = (target, arrive, duration) => {
    const from = center();
    if (!clearPath(from, target)) return false;
    stopJourney();
    clear(decision);
    look(target);
    pose("walking");
    const end = position(target);
    journey = resident.animate([{transform:position(from)}, {transform:end}], {
      duration: duration || Math.max(3800, Math.hypot(target.x-from.x,target.y-from.y) * 38),
      easing: "cubic-bezier(.38,0,.3,1)",
    });
    resident.style.transform = end;
    journey.onfinish = () => { journey = null; arrive(); };
    return true;
  };
  const wander = () => {
    const from = center();
    for (let attempt = 0; attempt < 36; attempt++) {
      const angle = random(0, Math.PI * 2), distance = random(65, 260);
      const target = {x:from.x+Math.cos(angle)*distance, y:from.y+Math.sin(angle)*distance};
      if (Math.hypot(target.x-pointer.x,target.y-pointer.y) < 105) continue;
      if (walk(target, () => { pose(Math.random()<.3 ? "cube" : "thinking"); schedule(); })) return true;
    }
    return false;
  };
  function think() {
    if (blocked || reduced.matches || compact.matches || journey) return;
    refreshObstacles();
    const mood = Math.random();
    if (mood < .38 && wander()) return;
    if (mood > .88 && safe(home()) && walk(home(), () => { pose("cube"); schedule(random(15000,32000)); })) return;
    pose(mood < .62 ? "thinking" : mood < .82 ? "watching" : "cube");
    look({x:random(0,innerWidth),y:random(0,innerHeight*.7)});
    schedule(mood < .22 ? random(18000,34000) : random(7000,18000));
  }
  const investigate = () => {
    if (blocked || compact.matches || reduced.matches || journey || performance.now()-lastEncounter<24000) return;
    if (Math.random() > .48) return;
    refreshObstacles();
    const from = center();
    if (Math.hypot(pointer.x-from.x,pointer.y-from.y) > 480) return;
    const angle = Math.atan2(from.y-pointer.y,from.x-pointer.x);
    for (const offset of [0,.5,-.5,1,-1]) {
      const target = {x:pointer.x+Math.cos(angle+offset)*88,y:pointer.y+Math.sin(angle+offset)*88};
      if (Math.hypot(target.x-from.x,target.y-from.y)<22) continue;
      if (walk(target, () => {
        look(pointer); pose("sniffing");
        schedule(random(3500,6500));
      }, random(4500,7200))) { lastEncounter=performance.now(); return; }
    }
  };
  const blink = () => {
    if (blocked || reduced.matches) return;
    resident.classList.remove("is-blinking");
    void resident.offsetWidth;
    resident.classList.add("is-blinking");
    later(blink, random(6000,14000));
  };
  const suspend = () => {
    timers.forEach(clearTimeout); timers.clear();
    stopJourney(); resident.classList.remove("is-blinking");
  };
  const sync = () => {
    const hidden = document.hidden || !anchor.getBoundingClientRect().width
      || [...document.querySelectorAll('#chat-panel,#theme-panel,#auth-panel')].some(el=>!el.hidden);
    suspend(); blocked = hidden; resident.hidden = hidden;
    if (hidden) return;
    resident.style.transform = position(home());
    pose("cube");
    resident.style.setProperty("--look-x", "0px");
    resident.style.setProperty("--look-y", "0px");
    if (!reduced.matches) {
      later(blink, random(4000,9000));
      if (!compact.matches) {
        later(() => {
          if (!journey) { pose("thinking"); schedule(random(4500,10000)); }
        }, random(3000,6500));
      }
    }
  };
  window.addEventListener("pointermove", event => {
    if (event.pointerType !== "mouse" || blocked || compact.matches || reduced.matches) return;
    const now = performance.now();
    if (now-lastPointerWork<100) return;
    lastPointerWork=now;
    pointer={x:event.clientX,y:event.clientY,at:now};
    clear(stillness); stillness=later(investigate,random(2000,3800));
    const here=center(), distance=Math.hypot(pointer.x-here.x,pointer.y-here.y);
    if (distance<280) look(pointer);
    if (distance<95 && now-lastEncounter>11000 && Math.random()<.78) {
      lastEncounter=now;
      refreshObstacles();
      const dx=here.x-pointer.x,dy=here.y-pointer.y,norm=Math.max(1,distance);
      const target={x:here.x+dx/norm*random(85,140),y:here.y+dy/norm*random(85,140)};
      walk(target,()=>{pose("watching");schedule();},random(4200,6200));
    }
  }, {passive:true});
  document.documentElement.addEventListener("pointerleave", () => {
    pointer={x:-9999,y:-9999,at:0}; clear(stillness);
  });
  window.addEventListener("resize", () => {
    clear(resizeTimer); stopJourney();
    resizeTimer=later(sync,150);
  }, {passive:true});
  document.addEventListener("visibilitychange",sync);
  reduced.addEventListener("change",sync);
  compact.addEventListener("change",sync);
  const panels = new MutationObserver(sync);
  document.querySelectorAll('#chat-panel,#theme-panel,#auth-panel').forEach(el=>panels.observe(el,{attributes:true,attributeFilter:['hidden']}));
  window.addEventListener("pagehide",suspend);
  window.addEventListener("pageshow",sync);
  sync();
})();
