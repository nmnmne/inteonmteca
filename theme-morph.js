/* Interpolate the actual palette, including glass and ink, for fifteen seconds. */
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, target = null, last = 0, started = 0, pairs = [];
  const parse = value => {
    if (/^#[\da-f]{6}$/i.test(value)) return {v:value.slice(1).match(/../g).map(x=>parseInt(x,16)),kind:'hex'};
    if (/^\d+(?:\.\d+)?,/.test(value)) return {v:value.split(',').map(Number),kind:'rgb'};
    if (/^[\d.]+(?:px)?$/.test(value)) return {v:[parseFloat(value)],kind:value.endsWith('px')?'px':'number'};
    return null;
  };
  const write = (property, value) => root.style.setProperty(property, value);
  const finish = () => {
    cancelAnimationFrame(frame); frame = 0;
    if (target) Object.entries(target).forEach(([key,value])=>write(key,value));
    root.classList.remove('is-theme-shifting');
    window.dispatchEvent(new Event('inteon-theme-frame'));
  };
  const draw = now => {
    const progress = Math.min(1,(now-started)/15000);
    if (progress === 1) { finish(); return; }
    if (now-last>40) {
      last=now;
      const t=progress*progress*(3-2*progress);
      for (const [key,from,to] of pairs) {
        const logoProgress = Math.min(1, (now-started)/1000);
        const blend = key.startsWith('--logo-') ? logoProgress*logoProgress*(3-2*logoProgress) : t;
        const values=from.v.map((v,i)=>v+(to.v[i]-v)*blend);
        write(key,to.kind==='hex' ? '#'+values.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('')
          : to.kind==='rgb' ? values.map(v=>v.toFixed(2)).join(', ') : values[0].toFixed(4)+(to.kind==='px'?'px':''));
      }
      window.dispatchEvent(new Event('inteon-theme-frame'));
    }
    frame=requestAnimationFrame(draw);
  };
  window.inteonThemeMorph = {
    apply(tokens,mood,animate) {
      cancelAnimationFrame(frame); frame=0;
      const light=mood==='light';
      target={...tokens,
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
      if (!animate || reduced.matches) { finish(); return; }
      const css=getComputedStyle(root); pairs=[];
      for (const [key,value] of Object.entries(target)) {
        const to=parse(value),from=parse(css.getPropertyValue(key).trim());
        if (from&&to&&from.kind===to.kind) pairs.push([key,from,to]); else write(key,value);
      }
      started=performance.now(); last=0;
      root.classList.add('is-theme-shifting'); frame=requestAnimationFrame(draw);
    },
    get active() { return Boolean(frame); },
  };
  reduced.addEventListener('change',()=>{if(reduced.matches) finish();});
  window.addEventListener('pagehide',finish);
})();
