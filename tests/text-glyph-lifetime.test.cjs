const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'text-waves.js'), 'utf8');
const start = source.indexOf('const createGlyphQueue =');
const end = source.indexOf('const audioMotion =', start);
const create = vm.runInNewContext(source.slice(start, end) + '\ncreateGlyphQueue;');
const pacingStart = source.indexOf('const glyphAdmissionCredit =');
const admit = vm.runInNewContext(source.slice(pacingStart, start) + '\nglyphAdmissionCredit;');

test('dense waves keep changing each display frame instead of filling and waiting in batches', () => {
  for (const hz of [60, 120, 144, 240]) for (const limit of [12, 24]) {
    let now = 0, writes = 0, credit = 0, cursor = 0;
    const chars = Array.from({length: 800}, () => ({el: {isConnected: true}, glyph: ''}));
    const queue = create(() => writes++);
    for (let frame = 1; frame <= hz * 2; frame++) {
      now = frame * 1000 / hz; writes = 0;
      queue.expire(now, limit);
      credit = admit(credit, 1000 / hz, limit);
      while (credit >= 1 && writes < limit && queue.size < limit * 3) {
        const char = chars[cursor++ % chars.length];
        if (!char.glyph && queue.paint(char, '#', now + 80)) credit--;
      }
      assert.ok(writes > 0, `${hz} Hz: no artificial empty frames in an active wave`);
      assert.ok(writes <= limit, 'expiry and new ink share one bounded budget');
    }
  }
});

test('dense text retires noisy letters promptly without exceeding the write budget', () => {
  for (const hz of [30, 60, 120, 144, 240]) {
    for (const limit of [12, 24]) {
      let now = 0, cursor = 0, writes = 0, longest = 0;
      const chars = Array.from({length: 800}, () => ({el: {isConnected: true}, glyph: ''}));
      const queue = create((char, glyph) => {
        writes++;
        if (glyph) char.started = now;
        else longest = Math.max(longest, now - char.started);
      });
      // Every candidate wants noise: the busiest possible wave over a long list.
      for (let frame = 0; frame < hz * 4; frame++) {
        now = frame * 1000 / hz; writes = 0;
        queue.expire(now, limit);
        for (let i = 0; i < 64 && writes < limit && queue.size < limit * 3; i++) {
          const char = chars[cursor++ % chars.length];
          if (!char.glyph) queue.paint(char, '#', now + 80);
        }
        assert.ok(writes <= limit, `${hz} Hz: bounded DOM writes`);
        assert.ok(queue.size <= limit * 3, 'quality controls simultaneous noise');
        for (const char of chars) if (char.glyph) {
          assert.ok(now - char.started <= 80 + 3 * 1000 / hz + .01, 'no stale glyph waits for the full catalogue');
        }
      }
      assert.ok(longest > 0 && longest <= 80 + 3 * 1000 / hz + .01);
    }
  }
});

test('restoring text removes pending ink so resumed frames cannot revive it', () => {
  let calls = 0;
  const queue = create(() => calls++);
  const char = {el: {isConnected: true}, glyph: ''};
  queue.paint(char, '#', 80);
  queue.paint(char);
  assert.equal(queue.size, 0);
  assert.equal(queue.expire(60000, 12), 0);
  assert.equal(calls, 2);
  assert.equal(char.glyph, '');
});

test('detached playlist rows are released without spending the live write budget', () => {
  let calls = 0;
  const queue = create(() => calls++);
  const char = {el: {isConnected: true}, glyph: ''};
  queue.paint(char, '#', 80);
  char.el.isConnected = false;
  assert.equal(queue.expire(100, 12), 0);
  assert.equal(queue.size, 0);
  assert.equal(calls, 1);
});
