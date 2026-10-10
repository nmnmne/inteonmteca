/* A quiet resident and cached mist for the home page. No per-frame DOM work. */
(() => {
  "use strict";
  const anchor = document.querySelector(".room-presence");
  if (!anchor) return;

  // One small procedural alpha texture, reused by the existing room canvas.
  // Mobile and reduced-motion modes never request it.
  let mist, mistTime = 0, mistLast = 0, musicLift = 0;
  const noise = (x, y) => {
    const hash = (a, b) => {
      let n = Math.imul(a + 71, 374761393) ^ Math.imul(b + 97, 668265263);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    };
    const ix = Math.floor(x), iy = Math.floor(y);
    const smooth = t => t * t * (3 - 2 * t);
    const sx = smooth(x - ix), sy = smooth(y - iy);
    const mix = (a, b, t) => a + (b - a) * t;
    return mix(mix(hash(ix, iy), hash(ix + 1, iy), sx),
      mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx), sy);
  };
  const createMist = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const pixels = ctx.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const u = x / 128, v = y / 128;
      const edge = Math.max(0, 1 - Math.hypot(u - .5, v - .5) * 2);
      const cloud = noise(u * 5, v * 5) * .65 + noise(u * 12, v * 12) * .25
        + noise(u * 27, v * 27) * .1;
      const i = (y * 128 + x) * 4;
      pixels.data.set([206, 172, 132, Math.round(Math.pow(edge, 1.25) * cloud * 190)], i);
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas;
  };
  window.inteonRoom = Object.freeze({
    drawMist(ctx, width, height, now, energy = 0) {
      mist ||= createMist();
      const dt = Math.min(80, mistLast ? now-mistLast : 0); mistLast=now;
      const playing = document.body.classList.contains("room-music-playing");
      musicLift += ((playing ? .6 + Math.min(.4,energy) : 0)-musicLift)*.018;
      mistTime += dt*.00009*(1+musicLift*.4);
      const t = mistTime;
      ctx.save();
      ctx.globalAlpha = .72 + musicLift*.10;
      const size = Math.min(1500, width * .78);
      ctx.drawImage(mist, -size * .25 + Math.sin(t) * 55,
        height * .15 + Math.cos(t * .7) * 28, size, size * .62);
      ctx.globalAlpha = .38 + musicLift*.10;
      ctx.drawImage(mist, width * .08 + Math.cos(t * .6) * 65,
        -size * .25 + Math.sin(t * .8) * 35, size, size * .78);
      ctx.globalAlpha = .32;
      ctx.drawImage(mist, width * .05 + Math.sin(t * .43 + 2) * 110,
        height * .36 + Math.cos(t * .57) * 58, size * 1.25, size * .58);
      ctx.restore();
    },
  });

  const resident = document.createElement("div");
  resident.className = "room-resident";
  resident.setAttribute("aria-hidden", "true");
  resident.innerHTML = '<div class="resident-mist"></div><div class="resident-body">'
    + '<div class="resident-face"><i></i><i></i></div></div><div class="resident-mark"></div><div class="resident-shadow"></div>';
  document.body.append(resident);
  anchor.classList.add("has-resident");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const compact = matchMedia("(max-width: 800px), (pointer: coarse)");
  const random = (a, b) => a + Math.random() * (b - a);
  const timers = new Set();
  let journey = null, decision = 0, stillness = 0, resizeTimer = 0;
  let blocked = false, lastPointerWork = 0, lastEncounter = -60000;
  let cinematic = false;
  let encounter = 0, hoverArmed = true, ignoreUntil = 0, chaseUntil = 0;
  const music = document.getElementById("album-player");
  const musicPlaying = () => music && !music.paused && !music.ended;
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
      + '#auth-hint, #theme-hint, #chat-hint, #street-link, .street-return, .chat-compose, .chat-stream:not(:empty)'
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
      if (walk(target, () => { pose(Math.random()<.4 ? "letter" : "thinking"); schedule(random(9000,17000)); })) return true;
    }
    return false;
  };
  function think() {
    if (blocked || reduced.matches || compact.matches || journey) return;
    refreshObstacles();
    const mood = Math.random();
    if (musicPlaying() && mood < .48 && explore()) return;
    if (mood < .38 && wander()) return;
    if (mood > .88 && safe(home()) && walk(home(), () => { pose(Math.random()<.5 ? "letter" : "cube"); schedule(random(15000,32000)); })) return;
    pose(mood < .62 ? "thinking" : mood < .82 ? "watching" : "cube");
    look({x:random(0,innerWidth),y:random(0,innerHeight*.7)});
    schedule(mood < .22 ? random(18000,34000) : random(7000,18000));
  }
  const investigate = () => {
    if (blocked || compact.matches || reduced.matches || journey || performance.now()-lastEncounter<24000 || performance.now()<ignoreUntil || encounter===1) return;
    if (Math.random() > .48) return;
    refreshObstacles();
    const from = center();
    if (Math.hypot(pointer.x-from.x,pointer.y-from.y) > 480) return;
    // Quiet curiosity between games; keep clear of the pointer and controls.
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
    if (cinematic) return;
    const hidden = document.hidden || !anchor.getBoundingClientRect().width
      || document.body.classList.contains('is-interlude');
    suspend(); chaseUntil=0; encounter=0; hoverArmed=true; resident.dataset.behavior="independent"; blocked = hidden; resident.hidden = hidden;
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
  const independent = () => {
    encounter = 0; chaseUntil = 0; ignoreUntil = performance.now() + random(22000,38000);
    resident.dataset.behavior = "independent";
    pose("thinking"); schedule(1800);
  };
  const flee = () => {
    refreshObstacles();
    const here = center(), angle = Math.atan2(here.y-pointer.y, here.x-pointer.x);
    for (const distance of [125,90,60]) for (const offset of [0,.6,-.6,1.2,-1.2,2,-2,Math.PI]) {
      const target = {x:here.x+Math.cos(angle+offset)*distance,y:here.y+Math.sin(angle+offset)*distance};
      if (walk(target, () => { pose("watching"); schedule(); }, 1000+distance*4)) {
        resident.dataset.behavior="escaping"; return true;
      }
    }
    pose("watching"); schedule(); return false;
  };
  const pursue = () => {
    if (blocked || reduced.matches || compact.matches) return;
    if (performance.now()>chaseUntil || pointer.x<0) { independent(); return; }
    refreshObstacles();
    const here=center(), angle=Math.atan2(here.y-pointer.y,here.x-pointer.x);
    resident.dataset.behavior="chasing";
    for (const offset of [0,.5,-.5,1,-1]) {
      const goal={x:pointer.x+Math.cos(angle+offset)*80,y:pointer.y+Math.sin(angle+offset)*80};
      const distance=Math.hypot(goal.x-here.x,goal.y-here.y),step=Math.min(1,90/Math.max(1,distance));
      const target={x:here.x+(goal.x-here.x)*step,y:here.y+(goal.y-here.y)*step};
      if (distance>16 && walk(target,pursue,900)) return;
    }
    look(pointer);pose("curious");later(pursue,700);
  };
  const circle = () => {
    stopJourney();clear(decision);refreshObstacles();
    const here=center();
    // A closed path entirely inside free space, starting at the current position.
    for (const radius of [34,24,16]) for (let direction=0;direction<8;direction++) {
      const start=direction*Math.PI/4, origin={x:here.x-Math.cos(start)*radius,y:here.y-Math.sin(start)*radius};
      const points=Array.from({length:25},(_,i)=>({x:origin.x+Math.cos(start+i/24*Math.PI*2)*radius,y:origin.y+Math.sin(start+i/24*Math.PI*2)*radius}));
      if (!points.every((point,i)=>safe(point)&&(!i||clearPath(points[i-1],point)))) continue;
      resident.dataset.behavior="circling";pose("curious");
      journey=resident.animate(points.map(point=>({transform:position(point)})),{duration:2400,easing:"ease-in-out"});
      resident.style.transform=position(here);
      journey.onfinish=()=>{journey=null;chaseUntil=performance.now()+random(8500,12500);pursue();};
      return;
    }
    // If cornered, move into a clearing before trying the circle again.
    if (!wander()) { independent(); return; }
    journey.onfinish=()=>{journey=null;circle();};
  };
  const explore = () => {
    refreshObstacles();
    const selectors=['#track-list','.transport-play','#track-progress','#track-volume'];
    const interest=document.querySelector(selectors[Math.floor(Math.random()*selectors.length)]);
    const target=interest?.closest('#active-player') || interest;
    if (!target) return false;
    const r=target.getBoundingClientRect(),here=center();
    const candidates=[{x:r.left-48,y:r.top+r.height*.85},{x:r.left-48,y:r.top+r.height*.35},{x:r.left+r.width*.2,y:r.top-48},
      {x:r.right+48,y:r.top+r.height*.6},{x:r.left+r.width*.6,y:r.bottom+48}];
    candidates.sort((a,b)=>Math.hypot(a.x-here.x,a.y-here.y)-Math.hypot(b.x-here.x,b.y-here.y));
    const focus=interest.getBoundingClientRect();
    const arrive=()=>{resident.dataset.behavior="listening";look({x:focus.left+focus.width*.5,y:focus.top+focus.height*.5});pose("listening");schedule(random(6000,11000));};
    for (const point of candidates) if (walk(point,arrive,random(3200,5200))) {
      resident.dataset.behavior="exploring";resident.dataset.interest=interest.id || "transport-play";return true;
    }
    arrive();return true;
  };
  music?.addEventListener("play",()=>{document.body.classList.add("room-music-playing");if (!journey && !chaseUntil) schedule(1600);});
  music?.addEventListener("pause",()=>{document.body.classList.remove("room-music-playing");if (resident.dataset.state==="listening") {pose("thinking");schedule();}});
  music?.addEventListener("ended",()=>document.body.classList.remove("room-music-playing"));
  window.addEventListener("pointermove", event => {
    if (event.pointerType !== "mouse" || blocked || compact.matches || reduced.matches) return;
    const now = performance.now();
    if (now-lastPointerWork<80) return;
    lastPointerWork=now;
    pointer={x:event.clientX,y:event.clientY,at:now};
    clear(stillness);
    if (now<ignoreUntil || chaseUntil || resident.dataset.behavior==="circling") return;
    const here=center(), distance=Math.hypot(pointer.x-here.x,pointer.y-here.y);
    if (distance>115) hoverArmed=true;
    if (distance<280) look(pointer);
    if (distance<55 && hoverArmed) {
      hoverArmed=false;lastEncounter=now;clear(decision);
      if (encounter===0) {encounter=1;flee();}
      else {encounter=2;circle();}
      return;
    }
    stillness=later(investigate,random(2400,4000));
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
  window.addEventListener("pagehide",suspend);
  window.addEventListener('inteon-storm', event => {
    const {phase, x, y} = event.detail;
    if (phase === 'prepare') {
      suspend(); cinematic = true; blocked = true;
      resident.style.opacity = '0';
    } else if (phase === 'burst') {
      resident.hidden = false;
      resident.style.transform = position({x, y});
      resident.classList.add('is-detonating');
      resident.style.opacity = '1'; pose('watching');
    } else if (cinematic) {
      cinematic = false; resident.classList.remove('is-detonating'); resident.style.opacity = '';
      sync(); resident.animate([{opacity:0},{opacity:1}], {duration:1400});
    }
  });
  window.addEventListener('inteon-interlude', sync);
  window.addEventListener("pageshow",sync);
  sync();
  // One brief comic speech per browser and local calendar day.
  const speech = document.createElement('div');
  speech.className = 'resident-speech'; speech.hidden = true;
  speech.setAttribute('role', 'status');
  document.body.append(speech);
  const speechKey = 'inteonmteca-resident-speech-day';
  let speechTimer = 0, hideSpeech = 0, speechPosition = 0, spokenToday = '';
  const day = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };
  const previousDay = () => { try { return localStorage.getItem(speechKey) || spokenToday; } catch { return spokenToday; } };
  const hide = () => { speech.hidden = true; clearTimeout(hideSpeech); clearInterval(speechPosition); };
  const attempt = () => {
    if (previousDay() === day()) return;
    if (document.hidden || resident.hidden || cinematic || window.inteonHomeEffects?.ambientBlocked) {
      speechTimer = setTimeout(attempt, 5000); return;
    }
    const prior = previousDay();
    spokenToday = day();
    try { localStorage.setItem(speechKey, spokenToday); } catch {}
    speech.textContent = prior && Math.random() < .5 ? 'на счет чего?' : 'привет';
    speech.hidden = false;
    const placeSpeech = () => {
    if (resident.hidden || cinematic) { hide(); return; }
    const rect = resident.getBoundingClientRect();
    speech.style.left = `${Math.max(8, Math.min(innerWidth - speech.offsetWidth - 8, rect.left + rect.width / 2 - speech.offsetWidth / 2))}px`;
    speech.style.top = `${Math.max(8, rect.top - speech.offsetHeight - 12)}px`;
    };
    placeSpeech();
    speechPosition = setInterval(placeSpeech, 100);
    hideSpeech = setTimeout(hide, 5000);
  };
  const scheduleSpeech = () => {
    clearTimeout(speechTimer);
    if (!document.hidden && previousDay() !== day()) speechTimer = setTimeout(attempt, random(12000,25000));
  };
  document.addEventListener('visibilitychange', () => { hide(); scheduleSpeech(); });
  window.addEventListener('storage', event => { if (event.key === speechKey) { clearTimeout(speechTimer); hide(); } });
  window.addEventListener('pagehide', () => { clearTimeout(speechTimer); hide(); });
  window.addEventListener('pageshow', scheduleSpeech);
  scheduleSpeech();
})();
