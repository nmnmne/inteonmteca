(() => {
  const body = document.body, music = document.querySelector('#album-player');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 800px), (pointer: coarse)');
  const read = key => { try { return Number(sessionStorage.getItem(key)) || 0; } catch { return 0; } };
  const write = (key, value) => { try { sessionStorage.setItem(key, String(value)); } catch {} };
  let interludeAt = read('inteon-interlude-next'), cloudAt = read('inteon-cloud-next') || Date.now() + 260000;
  let curtain, digits, cloud, cloudTimer, poll, sceneTheme=null;
  const timers = new Set();
  const later = (fn, delay) => { const id = setTimeout(() => { timers.delete(id); fn(); }, delay); timers.add(id); };
  const publish = () => {
    body.dataset.interludeNextAt = String(interludeAt);
    body.dataset.cloudNextAt = String(cloudAt);
  };
  const stopInterlude = () => {
    timers.forEach(clearTimeout); timers.clear();
    body.classList.remove('is-interlude', 'is-debug-interlude', 'scene-peek', 'scene-heading', 'scene-void', 'scene-energy', 'scene-energy-out', 'scene-dawn');
    if(sceneTheme){const previous=sceneTheme;sceneTheme=null;setTheme(previous,{animate:false,persist:false});}
    window.inteonPixelEnergy?.stop();
    body.dataset.interludePhase = 'idle';
    curtain?.remove(); digits?.remove(); curtain = digits = null;
    document.querySelectorAll('.track-item').forEach(el => { el.style.removeProperty('--return-delay'); el.classList.remove('scene-peek-track'); });
    window.dispatchEvent(new Event('inteon-interlude'));
    window.inteonHomeEffects?.release('interlude');
  };
  const startInterlude = (preview = false) => {
    if (mobile.matches || curtain || document.hidden || reduced.matches || (window.inteonHomeEffects && !window.inteonHomeEffects.claim('interlude'))) return;
    window.dispatchEvent(new Event('inteon-close-popups'));
    sceneTheme=document.documentElement.dataset.theme;
    window.inteonThemeMorph?.finish();setTheme('graphite',{animate:false,persist:false});
    body.classList.toggle('is-debug-interlude', preview);
    const sceneLater = later;
    body.dataset.interludeStartedAt = String(Date.now());
    interludeAt = Date.now() + 720000; write('inteon-interlude-next', interludeAt); publish();
    curtain = document.createElement('div'); curtain.className = 'scene-curtain'; curtain.setAttribute('aria-hidden', 'true');
    digits = document.createElement('div'); digits.className = 'scene-digits'; digits.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < (innerWidth < 600 ? 18 : 34); i++) {
      const digit = document.createElement('span'); digit.className = 'scene-digit'; digit.textContent = String(Math.floor(Math.random() * 10));
      digit.style.cssText = `--digit-x:${Math.random()*100}%;--digit-size:${10+Math.random()*15}px;--digit-time:${11+Math.random()*15}s;--digit-delay:${-Math.random()*24}s`;
      digits.append(digit);
    }
    body.append(curtain, digits);
    // Commit the initial transparent frame before dimming the scene.
    void curtain.offsetWidth;
    body.classList.add('is-interlude'); body.dataset.interludePhase = 'dark';
    window.dispatchEvent(new Event('inteon-interlude'));
    sceneLater(() => {
      const list = document.querySelector('.track-list');
      const bounds = list.getBoundingClientRect();
      const visible = [...list.children].filter(el => { const r=el.getBoundingClientRect(); return r.top >= bounds.top-.5 && r.top < bounds.bottom; });
      visible.forEach((el, i) => { el.classList.add('scene-peek-track'); el.style.setProperty('--return-delay', `${i * 1000}ms`); });
      body.classList.add('scene-peek'); body.dataset.interludePhase = 'tracks';
      const rebuiltAt=visible.length*1000+500;
      sceneLater(() => { body.classList.add('scene-heading'); body.dataset.interludePhase='heading'; },rebuiltAt);
      sceneLater(() => { body.classList.remove('scene-heading','scene-peek');body.classList.add('scene-void');body.dataset.interludePhase='void'; },rebuiltAt+1500);
      sceneLater(() => {
        body.classList.add('scene-energy');body.dataset.interludePhase='energy';window.inteonPixelEnergy?.start();
        sceneLater(() => {
          body.classList.add('scene-energy-out');body.dataset.interludePhase='settling';
          sceneLater(() => {
            body.classList.remove('scene-void','scene-energy','scene-energy-out');body.classList.add('scene-dawn');body.dataset.interludePhase='background';window.inteonPixelEnergy?.stop();
            sceneLater(stopInterlude,2500);
          },800);
        },10000);
      },rebuiltAt+2500);
    }, preview ? 300 : 1200);
  };
  const stopCloud = () => { clearTimeout(cloudTimer); cloud?.remove(); cloud = null; };
  const startCloud = (preview = false) => {
    if (cloud || document.hidden || reduced.matches) return;
    cloudAt = Date.now() + 260000; write('inteon-cloud-next', cloudAt); publish();
    cloud = document.createElement('div'); cloud.className = 'sky-clouds'; cloud.setAttribute('aria-hidden', 'true');
    cloud.innerHTML = '<svg viewBox="0 0 900 300" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><defs><filter id="passing-cloud-noise" x="-10%" y="-20%" width="120%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".006 .017" numOctaves="3" seed="17"/><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1.6 0 0 0 -.55"/><feGaussianBlur stdDeviation="3"/><feComposite in="SourceGraphic" operator="in"/></filter></defs><rect width="900" height="300" fill="currentColor" filter="url(#passing-cloud-noise)"/></svg>';
    body.append(cloud);
    if (preview) { cloud.style.animationDuration = '16s'; cloud.style.animationDelay = '-4s'; }
    cloudTimer = setTimeout(stopCloud, preview ? 12000 : 80000);
  };
  const planFirst = () => {
    if (!interludeAt && !music?.paused) {
      interludeAt = Date.now() + 120000 + Math.random() * 120000;
      write('inteon-interlude-next', interludeAt); publish();
    }
  };
  const tick = () => {
    if (!document.hidden && !reduced.matches) {
      const panelOpen = [...document.querySelectorAll('#chat-panel:not(.chat-inline),#theme-panel,#auth-panel')].some(el => !el.hidden);
      const busy = window.inteonHomeEffects?.ambientBlocked || body.classList.contains('is-interlude') || body.classList.contains('storm-priming') || document.querySelector('.logo-storm');
      if (!busy && !panelOpen && !music?.paused && interludeAt && Date.now() >= interludeAt) startInterlude();
      if (!cloud && Date.now() >= cloudAt) startCloud();
    }
    poll = setTimeout(tick, 1000);
  };
  music?.addEventListener('playing', planFirst);
  music?.addEventListener('pause', () => { if (curtain) stopInterlude(); });
  music?.addEventListener('error', () => { if (curtain) stopInterlude(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && curtain) stopInterlude(); });
  const suspend = () => {
    if (document.hidden || reduced.matches || window.inteonHomeEffects?.suspended) {
      if (curtain) stopInterlude(); stopCloud();
    }
  };
  document.addEventListener('visibilitychange', suspend);
  reduced.addEventListener('change', suspend);
  window.addEventListener('inteon-effects-change', suspend);
  window.addEventListener('pagehide', () => { clearTimeout(poll); suspend(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { clearTimeout(poll); tick(); } });
  window.inteonAtmosphere = {
    stop: () => { stopInterlude(); stopCloud(); },
    stopScene: stopInterlude,
    replayScene: (options = {}) => { stopInterlude(); if (!reduced.matches) startInterlude(options.preview === true); },
    replayCloud: (options = {}) => { stopCloud(); if (!reduced.matches) startCloud(options.preview === true); },
  };
  planFirst(); publish(); tick();
})();
