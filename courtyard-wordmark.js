// Bring the original reactive wordmark into the empty courtyard for a brief performance.
(() => {
  const logo = document.getElementById('logo-wrap');
  if (!logo || !document.querySelector('[data-yard-layer]')) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 800px), (pointer: coarse)');
  const stage = document.createElement('div');
  stage.id = 'courtyard-wordmark';
  stage.setAttribute('aria-hidden', 'true');
  stage.inert = true;
  stage.hidden = true;
  document.body.append(stage);
  const effects = window.inteonHomeEffects;
  let next = 0, end = 0, slot = null, ownedEffect = null, act = 0, lastInput = -Infinity;
  const pause = (low, high) => low + Math.random()*(high-low);

  function schedule(delay) {
    clearTimeout(next);
    if (!document.hidden && !reduced.matches) next = setTimeout(present, delay);
  }
  function restore() {
    if (!slot) return;
    clearTimeout(end);
    if (ownedEffect === 'recursion' && effects?.active === 'recursion') window.inteonLogoMaterials.stop();
    if (ownedEffect === 'handwriting') window.inteonAlternateLogo?.hide();
    if (ownedEffect === 'acid' && effects?.active === 'acid') window.inteonLogoAcid.stop();
    ownedEffect = null;
    // Responsive layout can move the node first when a device rotates.
    if (logo.parentNode === stage && slot.isConnected) slot.replaceWith(logo);
    else slot.remove();
    slot = null;
    stage.hidden = true;
    delete document.body.dataset.courtyardWordmark;
    schedule(pause(76000, 128000));
  }
  function present() {
    const active = effects?.active;
    if (slot || document.hidden || reduced.matches) return;
    if (performance.now()-lastInput < 9000 || effects?.suspended || document.body.classList.contains('is-interlude')
      || document.body.dataset.yardWindow === 'engrus'
      || document.querySelector('dialog[open], [popover]:popover-open, .room-resident[data-in-courtyard]')
      || (active && !['alternate-logo','recursion','mobile-scatter'].includes(active))) {
      schedule(pause(8000,15000));
      return;
    }
    slot = document.createComment('wordmark home');
    logo.before(slot);
    stage.append(logo);
    stage.hidden = false;
    document.body.dataset.courtyardWordmark = '';
    const variation = act++ % 4;
    let duration = 7900;
    if (!active && !logo.dataset.alternateLogo) {
      if (variation === 0 && window.inteonLogoMaterials?.run('recursion')) ownedEffect = 'recursion';
      if (variation === 1) {
        const alternate = window.inteonAlternateLogo;
        const variants = alternate?.variants;
        if (variants?.length && alternate.show(variants[Math.floor(Math.random()*variants.length)])) ownedEffect = 'handwriting';
      }
      if (variation === 2 && window.inteonLogoAcid?.run()) { ownedEffect = 'acid'; duration = 13700; }
      // Mobile fragments belong to the logo node and can finish after it returns.
      if (variation === 3 && compact.matches) window.inteonMobileLogo?.run('scatter');
    }
    stage.style.setProperty('--appearance-duration', duration+'ms');
    end = setTimeout(restore, duration);
  }
  function input() { lastInput = performance.now(); restore(); }
  for (const type of ['pointerdown','keydown','wheel']) {
    window.addEventListener(type,input,{capture:true,passive:true});
  }
  for (const type of ['resize','yard-app-visibility','yard-dj-mode']) window.addEventListener(type,restore);
  const resident = document.querySelector('.room-resident');
  if (resident) new MutationObserver(() => {
    if (resident.hasAttribute('data-in-courtyard')) restore();
  }).observe(resident,{attributes:true,attributeFilter:['data-in-courtyard']});
  function stop() { restore(); clearTimeout(next); }
  function resume() { stop(); schedule(pause(26000,43000)); }
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : resume());
  reduced.addEventListener('change',resume);
  window.addEventListener('pagehide',stop);
  window.addEventListener('pageshow',resume);
  resume();
})();
