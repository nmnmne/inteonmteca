/* Apply a palette once, then crossfade browser snapshots on the compositor. */
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = 4000;
  let transition = null, target = null, metadata = null, active = false, generation = 0;
  const commit = () => {
    if (target) for (const [property, value] of Object.entries(target)) {
      if (root.style.getPropertyValue(property) !== value) root.style.setProperty(property, value);
    }
    if (metadata?.name) {
      root.dataset.theme = metadata.name;
      root.dataset.themeMood = metadata.mood;
    }
    window.dispatchEvent(new Event('inteon-theme-frame'));
  };
  const complete = token => {
    if (token !== generation) return;
    transition = null; active = false;
    root.classList.remove('is-theme-crossfading', 'is-theme-shifting');
    window.inteonHomeEffects?.release('theme');
  };
  const finish = () => {
    const token = ++generation, previous = transition;
    transition = null; active = false;
    previous?.skipTransition();
    commit(); complete(token);
  };
  window.inteonThemeMorph = {
    duration,
    apply(tokens, mood, animate, options = {}) {
      const token = ++generation;
      transition?.skipTransition(); transition = null; active = false;
      const light = mood === 'light';
      target = {...tokens,
        '--interface-ink':tokens['--interface-ink'] || (light?'12, 15, 17':'249, 244, 233'),
        '--interface-muted':tokens['--interface-muted'] || (light?'38, 42, 43':'202, 196, 178'),
        '--interface-accent':tokens['--interface-accent'] || (light?'12, 15, 17':'218, 243, 149'),
        '--interface-peach':tokens['--interface-peach'] || (light?'12, 15, 17':'232, 178, 125'),
        '--interface-sage':tokens['--interface-sage'] || (light?'12, 15, 17':'191, 211, 151'),
        '--interface-glass':light?'250, 248, 239':'12, 14, 14',
        '--interface-control':light?'12, 15, 17':'230, 237, 232',
        '--interface-on-control':light?'251, 250, 245':'12, 15, 17',
        '--logo-brightness':light?'0':'1.45',
        '--field-opacity':light?'.19':'.27',
        '--field-strength':mood==='dark'?'.07':'.17',
      };
      metadata = {name: options.name, mood};
      const controller = window.inteonHomeEffects;
      const immediate = !animate || reduced.matches || document.hidden ||
        typeof document.startViewTransition !== 'function' ||
        (controller && controller.active !== 'theme' && !controller.claim('theme'));
      if (immediate) { commit(); complete(token); return; }
      active = true;
      root.classList.add('is-theme-crossfading');
      try {
        transition = document.startViewTransition(() => {
          // A skipped, superseded callback must never put an older palette back.
          if (token === generation) commit();
        });
        transition.ready.catch(() => {});
        transition.finished.then(() => complete(token), () => {
          if (token === generation) { commit(); complete(token); }
        });
      } catch {
        commit(); complete(token);
      }
    },
    get active() { return active; },
  };
  reduced.addEventListener('change', () => { if (reduced.matches) finish(); });
  window.addEventListener('pagehide', finish);
  window.addEventListener('inteon-effects-change', () => {
    if (active && (document.hidden || reduced.matches || document.body.classList.contains('portal-leaving'))) finish();
  });
  // A user's next action immediately reveals the live controls, including typed
  // text and the playback state, instead of leaving them behind a frozen image.
  for (const event of ['pointerdown', 'keydown', 'input']) {
    document.addEventListener(event, input => {
      if (!active) return;
      // Snapshot hit-testing can retarget a menu click to <html>. Resolve the
      // live button by its visible bounds before removing the snapshot.
      let button;
      if (event === 'pointerdown' && input.target === root) {
        button = [...document.querySelectorAll('#theme-panel:not([hidden]) button, #auth-panel:not([hidden]) button, .development-animation-menu:not([hidden]) button')].find(el => {
          const r = el.getBoundingClientRect();
          return r.width && r.height && input.clientX >= r.left && input.clientX <= r.right && input.clientY >= r.top && input.clientY <= r.bottom;
        });
      }
      finish();
      if (button) {
        input.preventDefault(); input.stopImmediatePropagation();
        button.focus({preventScroll: true}); button.click();
      }
    }, {capture: true});
  }
})();
