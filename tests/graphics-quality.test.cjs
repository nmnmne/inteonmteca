const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'graphics-quality.js'), 'utf8');

function harness({loaded = true, hidden = false, mobile = false} = {}) {
  let now = 0, sequence = 0;
  const timers = new Map(), frames = new Map(), events = [];
  const target = () => {
    const handlers = new Map();
    return {
      addEventListener(type, callback) {
        if (!handlers.has(type)) handlers.set(type, []);
        handlers.get(type).push(callback);
      },
      dispatchEvent(event) {
        for (const callback of handlers.get(event.type) || []) callback(event);
      },
    };
  };
  const document = Object.assign(target(), {
    hidden, readyState: loaded ? 'complete' : 'loading',
    documentElement: {dataset: {animationQuality: 'low'}},
  });
  const window = target();
  const dispatch = window.dispatchEvent;
  window.dispatchEvent = event => { events.push(event); dispatch(event); };
  const context = {window, document, matchMedia: () => ({matches: mobile}), performance: {now: () => now},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, {callback, at: now + delay, delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  vm.runInNewContext(source, context);
  const advance = duration => {
    const until = now + duration;
    for (let count = 0; count < 1000; count++) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > until) { now = until; return; }
      now = next[1].at; timers.delete(next[0]); next[1].callback();
    }
    throw Error('Unbounded timer activity');
  };
  const paint = (duration = 0) => {
    advance(duration);
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(callback => callback(now));
  };
  const api = window.inteonGraphicsQuality;
  const finish = rate => {
    assert.equal(api.state, 'sampling');
    const pattern = typeof rate === 'function' ? rate : () => ({ms: 1000 / rate, heavy: true});
    const began = now;
    document.documentElement.dataset.ambientPhase = pattern(0, 0).heavy === false ? 'frozen' : 'running';
    paint();
    for (let i = 0; i < 5000 && api.state === 'sampling'; i++) {
      const next = pattern(i, now - began);
      document.documentElement.dataset.ambientPhase = next.heavy === false ? 'frozen' : 'running';
      paint(next.ms);
    }
    assert.equal(api.state, 'waiting');
  };
  const sample = rate => {
    assert.notEqual(api.nextSampleAt, null);
    advance(api.nextSampleAt - now);
    finish(rate);
  };
  return {api, document, window, events, timers, frames, advance, paint, finish, sample,
    now: () => now,
    changes: () => events.filter(event => event.type === 'inteon-quality-change'),
    hide() { document.hidden = true; document.dispatchEvent({type: 'visibilitychange'}); },
    show() { document.hidden = false; document.dispatchEvent({type: 'visibilitychange'}); },
  };
}


test('mobile reserves initial decorative budget for text and starts sampling promptly', () => {
 const h=harness({mobile:true});assert.equal(h.api.level,3);assert.equal(h.api.nextSampleAt,1000);
});

test('mobile foreground scenes count as active work during decorative rest', () => {
 const h=harness({mobile:true});h.window.inteonHomeEffects={active:'recursion',ambientPaused:true};
 h.sample(()=>({ms:1000/60,heavy:false}));assert.ok(h.api.activeSampleMs>=3900);assert.equal(h.api.lightSampleMs,0);
});
test('scene changes interrupt idle backoff but preserve manual choice and hidden-page suspension', () => {
  const h=harness(); h.sample(60); h.sample(60);
  h.window.inteonHomeEffects={active:'interlude'};
  h.window.dispatchEvent({type:'inteon-effects-change'});
  assert.equal(h.api.state,'sampling'); assert.equal(h.frames.size,1);
  const frame=[...h.frames.keys()][0];
  h.window.dispatchEvent({type:'inteon-effects-change'});
  assert.equal([...h.frames.keys()][0],frame,'same scene must not restart sampling');
  h.finish(30); assert.equal(h.api.level,3);
  h.api.setManualLevel(8);
  h.window.inteonHomeEffects.active=null;
  h.window.dispatchEvent({type:'inteon-effects-change'});
  assert.equal(h.api.state,'manual'); assert.equal(h.frames.size,0);
  h.hide(); h.window.inteonHomeEffects.active='acid';
  h.window.dispatchEvent({type:'inteon-effects-change'});
  assert.equal(h.frames.size,0);
});

test('an early scene cannot bypass initial warmup or restart the first calibration', () => {
  const h=harness();
  h.window.inteonHomeEffects={active:'acid'};
  h.window.dispatchEvent({type:'inteon-effects-change'});
  assert.equal(h.api.state,'warming'); assert.equal(h.frames.size,0);
  h.advance(4000); const frame=[...h.frames.keys()][0];
  h.window.inteonHomeEffects.active=null;
  h.window.dispatchEvent({type:'inteon-effects-change'});
  assert.equal([...h.frames.keys()][0],frame);
  h.finish(60); assert.ok(h.api.baselineFps>59);
});

test('load, warmup and sample retain four-second windows with no idle RAF', () => {
  const h=harness({loaded:false});
  assert.equal(h.api.level,5); assert.equal(h.frames.size+h.timers.size,0);
  h.advance(12000); h.window.dispatchEvent({type:'load'});
  h.advance(3999); assert.equal(h.frames.size,0);
  h.advance(1); h.finish(60);
  assert.ok(Math.abs(h.api.fps-60)<.001);
  assert.equal(h.api.baselineFps,h.api.fps);
  assert.ok(h.api.snapshot().sampleDurationMs>=4000);
  assert.equal(h.frames.size,0); assert.equal(h.timers.size,1);
  assert.equal(h.api.waitMs,4000); assert.equal(h.changes().length,0);
});
test('clean 30/60/144 Hz caps start at5 and require three clean samples for one trial level', () => {
  for(const rate of [30,60,144]) {
    const h=harness(); h.sample(rate);
    assert.equal(h.api.level,5,String(rate)); assert.ok(Math.abs(h.api.cadenceFps-rate)<.001);
    h.sample(rate); assert.equal(h.api.level,5);
    h.sample(rate); assert.equal(h.api.level,6); assert.equal(h.api.reason,'quality-trial');
    h.sample(rate); assert.equal(h.api.level,6); assert.equal(h.changes().length,1);
  }
});
test('light60/heavy30 detects constant half-rate overload without promoting from the frozen part', () => {
  const h=harness(); h.sample((i,t)=>({ms:t<2000?1000/60:1000/30,heavy:t>=2000}));
  assert.equal(h.api.level,3); assert.equal(h.api.reason,'overload-severe');
  assert.ok(Math.abs(h.api.cadenceFps-60)<.001);
  assert.ok(Math.abs(h.api.activeFps-30)<.001);
  assert.ok(Math.abs(h.api.lowerTailFps-30)<.001);
  assert.ok(h.api.missedFrameRatio>.49);
  assert.ok(h.api.fps>40&&h.api.fps<50);
});
test('known cadence is not redefined by a regular but slow heavy scene', () => {
  const h=harness(); h.sample(60); h.sample(30);
  assert.equal(h.api.level,3); assert.ok(Math.abs(h.api.cadenceFps-60)<.001);
  h.sample(30); assert.equal(h.api.level,1);
});
test('a very slow fully active window still lowers detail instead of appearing to lack evidence', () => {
  const h=harness();h.sample(1);
  assert.equal(h.api.level,3);assert.equal(h.api.reason,'overload-severe');
});
test('a faster active cohort prevents a slower light cohort from redefining the delivery cap', () => {
  const h=harness();h.sample(60);
  for(let i=0;i<3;i++)h.sample((n,t)=>({ms:t<1800?1000/30:1000/60,heavy:t>=1800}));
  assert.ok(Math.abs(h.api.cadenceFps-60)<.001);
});
test('lower-tail pacing detects jank hidden by a similar average', () => {
  const smooth=harness(); smooth.sample(1000/19);
  const janky=harness(); janky.sample(i=>({ms:i%10===9?100:10,heavy:true}));
  assert.ok(Math.abs(smooth.api.fps-janky.api.fps)<2);
  assert.equal(smooth.api.level,5); assert.equal(janky.api.level,3);
  assert.equal(janky.api.p95FrameMs,100); assert.equal(janky.api.lowerTailFps,10);
  assert.ok(janky.api.missedFrames>0);
});
test('moderate missed frames reduce one level, severe stalls reduce two', () => {
  const h=harness(); h.sample(i=>({ms:i%8===7?1000/30:1000/60,heavy:true}));
  assert.equal(h.api.level,4); assert.equal(h.api.reason,'overload');
  const severe=harness(); severe.sample(i=>({ms:i===50?280:1000/60,heavy:true}));
  assert.equal(severe.api.level,3); assert.equal(severe.api.reason,'overload-severe');
});
test('a trial rolls back on lower-tail regression before generic overload thresholds', () => {
  const h=harness(); h.sample(60); h.sample(60); h.sample(60);
  assert.equal(h.api.level,6);
  h.sample((i,t)=>({ms:t<1800?1000/60:1000/45,heavy:t>=1800}));
  assert.equal(h.api.level,5); assert.equal(h.api.reason,'trial-rollback'); assert.equal(h.api.waitMs,4000);
});
test('freeze-only and less than one second of heavy evidence cannot promote', () => {
  const h=harness(); h.sample(60); h.sample(60);
  h.sample(()=>({ms:1000/144,heavy:false}));
  assert.equal(h.api.level,5); assert.equal(h.api.reason,'insufficient-active');
  assert.equal(h.api.activeSampleMs,0); assert.equal(h.api.activeFps,null); assert.equal(h.api.lowerTailFps,null);
  assert.equal(h.api.waitMs,4000); assert.equal(h.frames.size,0);
  h.sample((i,t)=>({ms:1000/144,heavy:t<500}));
  assert.equal(h.api.level,5); assert.equal(h.api.reason,'insufficient-active'); assert.ok(h.api.activeSampleMs<1000);
});
test('phase-crossing intervals are excluded from both cohorts', () => {
  const h=harness(); h.sample((i,t)=>({ms:1000/60,heavy:t>=2000}));
  const s=h.api.snapshot();
  assert.ok(s.activeSampleMs+s.lightSampleMs<s.sampleDurationMs);
  assert.ok(s.activeSampleMs>1900&&s.lightSampleMs>1900);
  assert.ok(Math.abs(s.p95FrameMs-1000/60)<.001);
});
test('display-cap recalibration requires three consistent samples and cannot promote or collapse quality', () => {
  const h=harness(); h.sample(120); h.api.recalibrate('resize');
  for(let i=0;i<3;i++){h.sample(60);assert.equal(h.api.level,5);assert.equal(h.api.reason,'cadence-recalibration');}
  assert.ok(Math.abs(h.api.cadenceFps-60)<.001);
  h.sample(60); h.sample(60); assert.equal(h.api.level,5);
  h.sample(60); assert.equal(h.api.level,6);
});
test('regular slower light samples recalibrate an unannounced delivery cap', () => {
  const h=harness();h.sample(120);
  for(let i=0;i<3;i++)h.sample((n,t)=>({ms:1000/60,heavy:t>=1800}));
  assert.equal(h.api.level,5);assert.ok(Math.abs(h.api.cadenceFps-60)<.001);
});
test('manual choice cancels partial sampling, holds sixty seconds, then uses fresh evidence', () => {
  const h=harness();h.sample(60);h.advance(h.api.nextSampleAt-h.now());h.paint();h.paint(16);
  const stale=[...h.frames.values()][0];
  h.api.setManualLevel(9);assert.equal(h.api.state,'manual');assert.equal(h.api.mode,'manual');
  assert.equal(h.frames.size,0);stale(h.now());assert.equal(h.frames.size,0);
  h.advance(59999);assert.equal(h.api.level,9);assert.equal(h.frames.size,0);
  h.advance(1);assert.equal(h.api.state,'sampling');assert.equal(h.api.mode,'auto');
  h.finish(30);assert.equal(h.api.level,7);
  assert.deepEqual(h.changes().map(e=>e.detail.reason),['manual','overload-severe']);
});
test('GPU/debug recalibration cancels stale sampling and preserves the manual deadline', () => {
  const h=harness();h.advance(4000);h.paint();h.paint(16);
  const stale=[...h.frames.values()][0];
  h.api.recalibrate('gpu-probe');assert.equal(h.api.state,'warming');assert.equal(h.api.reason,'gpu-probe');
  stale(h.now());assert.equal(h.frames.size,0);assert.equal(h.api.nextSampleAt,h.now()+4000);
  h.api.setManualLevel(8);const until=h.api.manualUntil;
  h.advance(30000);h.api.recalibrate('gpu-probe');
  assert.equal(h.api.level,8);assert.equal(h.api.manualUntil,until);assert.equal(h.api.nextSampleAt,until);
  h.advance(29999);assert.equal(h.api.state,'manual');
  h.advance(1);assert.equal(h.api.state,'sampling');
});
test('manual reselection extends its deadline without a duplicate quality event', () => {
  const h=harness();h.api.setManualLevel(7);h.advance(30000);h.api.setManualLevel(7);
  assert.equal(h.changes().length,1);assert.equal(h.api.manualUntil,90000);
  for(const bad of [0,11,1.5,NaN,Infinity,'8',null])assert.equal(h.api.setManualLevel(bad),false);
  assert.equal(h.api.manualUntil,90000);
});
test('visibility and pagehide discard partial samples and hidden time, then warm once', () => {
  const h=harness();h.advance(4000);h.paint();
  for(let i=0;i<50;i++)h.paint(1000/60);
  h.hide();assert.equal(h.frames.size+h.timers.size,0);
  h.advance(120000);assert.equal(h.api.fps,null);
  h.show();assert.equal(h.api.state,'warming');h.sample(30);assert.ok(Math.abs(h.api.fps-30)<.001);
  h.window.dispatchEvent({type:'pagehide'});assert.equal(h.frames.size+h.timers.size,0);
  h.advance(10000);h.window.dispatchEvent({type:'pageshow'});assert.equal(h.api.nextSampleAt,h.now()+4000);
});
test('focus and resize recalibrate without duplicate timers or changing the selected level', () => {
  const h=harness();h.sample(60);h.window.dispatchEvent({type:'focus'});h.window.dispatchEvent({type:'resize'});
  assert.equal(h.api.level,5);assert.equal(h.api.state,'warming');assert.equal(h.frames.size,0);
  assert.equal(h.timers.size,1);assert.equal(h.api.reason,'resize');
});
test('stable monitoring backs off at most thirty seconds and never spins between samples', () => {
  const h=harness();h.api.setManualLevel(10);h.advance(60000);h.finish(60);
  for(let i=0;i<9;i++)h.sample(60);
  assert.equal(h.api.waitMs,30000);assert.equal([...h.timers.values()][0].delay,30000);assert.equal(h.frames.size,0);
  h.advance(29999);assert.equal(h.frames.size,0);h.advance(1);assert.equal(h.frames.size,1);
});
test('diagnostics and snapshots are readonly and preserve legacy animation quality', () => {
  const h=harness();h.sample(60);
  assert.equal(Object.isFrozen(h.api),true);assert.equal(Object.isFrozen(h.api.snapshot()),true);
  for(const key of ['level','fps','activeFps','lowerTailFps','p95FrameMs','cadenceFps','missedFrames','reason'])
    assert.equal(Object.getOwnPropertyDescriptor(h.api,key).set,undefined);
  h.api.setManualLevel(10);assert.equal(Object.isFrozen(h.changes()[0].detail),true);
  assert.equal(h.document.documentElement.dataset.animationQuality,'low');
});

test('foreground overload during a frozen background lowers detail without promoting on light frames', () => {
  const h=harness(); h.sample(60);
  h.sample(() => ({ms:80,heavy:false}));
  assert.equal(h.api.level,3);
  assert.equal(h.api.reason,'foreground-overload');
  for(let i=0;i<4;i++)h.sample(() => ({ms:1000/120,heavy:false}));
  assert.equal(h.api.level,3,'fast frozen frames cannot raise detail');
});
