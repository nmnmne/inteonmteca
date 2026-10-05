const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const setup = () => {
  let picks = 0;
  const handlers = {};
  const item = { getAttribute: key => key === 'data-track-index' ? '0' : 'Track', classList: { contains: () => false } };
  const window = { INTEONMTECA_PLAYLIST: [{title:'Track',audio:'a.mp3'}], inteonPlayTrack: () => picks++ };
  const document = {
    addEventListener: (name, handler) => handlers[name] = handler,
    elementsFromPoint: () => [{closest: () => item}],
    getElementById: () => null,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../track-play.js'), 'utf8'), {window, document, Date});
  return {handlers, item, picks: () => picks};
};
test('text links and blank space never select a nearby/underlying song', () => {
  for (const link of [true,false]) {
    const s = setup();
    for (const type of ['pointerdown','click']) s.handlers[type]({type,button:0,clientX:100,clientY:100,target:{
      closest: selector => link && selector.split(',').map(x=>x.trim()).includes('a') ? {} : null,
    }});
    assert.equal(s.picks(), 0);
  }
});
test('touch starts scrolling without selecting; the completed tap still selects', () => {
  const s = setup();
  const target = {closest: selector => selector === '.track-item' ? s.item : null};
  s.handlers.pointerdown({type:'pointerdown',pointerType:'touch',button:0,target});
  assert.equal(s.picks(), 0, 'Do not start audio at the beginning of a touch swipe');
  s.handlers.click({type:'click',pointerType:'touch',button:0,target});
  assert.equal(s.picks(), 1);
});
