const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

function seededRandom() {
  let seed = 123;
  return () => ((seed = (Math.imul(seed,1664525) + 1013904223) >>> 0) / 2**32);
}

test('all 1,920 story sequences play once per shuffle, including across visits', async () => {
  const {createCrowStoryDeck} = await import('../yard/crow-story-deck.js');
  const random = seededRandom(), seen = new Set(), saved = new Map();
  const storage = {getItem:key => saved.get(key) ?? null, setItem:(key,value) => saved.set(key,value)};
  let deck = createCrowStoryDeck(random, storage), last;
  for (let i = 0; i < 1920; i++) {
    if (i % 64 === 0) deck = createCrowStoryDeck(random, storage);
    const plan = deck.next();
    assert.equal(new Set(plan.middle).size, 3);
    last = JSON.stringify(plan);
    assert.ok(!seen.has(last));
    seen.add(last);
  }
  assert.notEqual(JSON.stringify(deck.next()), last);
});

test('shuffling continues locally when saving is disabled or saved data is corrupt', async () => {
  const {createCrowStoryDeck} = await import('../yard/crow-story-deck.js');
  const deck = createCrowStoryDeck(seededRandom(), {
    getItem:() => '{invalid',
    setItem:() => { throw new Error('disabled'); },
  });
  assert.equal(new Set(Array.from({length:100}, () => JSON.stringify(deck.next()))).size, 100);
});

test('the roaming camera stages each opening and ending, plays the drawn middle scenes in order and releases the actors', async () => {
  const {createCrowFlock} = await import('../yard/crow-flock.js');
  const {ambientOpeningView, createAutoWalk} = await import('../yard/auto-walk.js');
  const openings = ['knock','cache','beacon','echo'];
  const endings = ['stash','return','portal','gift'];
  const middleScenes = ['ripple','lookout','echo','relay','footprints','decoy'];
  for (let i = 0; i < 4; i++) {
    const random = seededRandom(), aspect = i % 2 ? 1.6 : .46;
    const openingView = ambientOpeningView(layout,aspect);
    const plan = {opening:openings[i], middle:middleScenes.slice(i, i+3), ending:endings[i]};
    let draws = 0;
    const flock = createCrowFlock(layout,openingView,{random, residentVisits:true, allowKeyStory:()=>true,
      storyDeck:{next:() => { draws++; return plan; }},
    });
    const walk = createAutoWalk(layout,{openingView,random,flock});
    const sequence = [], story = flock.keyStory;
    let endingVisible = false;
    for (let frame = 0; frame < 3000 && !story.count; frame++) {
      const pose = walk.update(.1);
      if (story.sceneIndex >= 0 && story.phase !== 'idle') {
        const event = story.phase + '/' + story.scene;
        if (sequence.at(-1) !== event) sequence.push(event);
        assert.equal(flock.canTakeOff(),false);
        if (story.phase === 'ending') {
          const key = story.key;
          const finder = flock.birds[story.finder];
          switch (story.scene) {
            case 'stash':
              endingVisible ||= key.y < 0 && key.scale < .1 && story.cache.open > .6;
              break;
            case 'return':
              endingVisible ||= key.scale === 1 && key.turn > 3 && !story.door && key.y < .08;
              break;
            case 'portal':
              endingVisible ||= key.y > .48 && key.scale === 0 && story.constellationAge > 5.55;
              break;
            case 'gift':
              endingVisible ||= Math.abs(Math.hypot(key.x-finder.x,key.z-finder.z)-.34) < .01
                && key.y > .18 && key.tilt > .95;
              break;
          }
        }
        const dx = story.x-pose.x, dz = story.z-pose.z;
        const forward = dx*Math.sin(pose.yaw)-dz*Math.cos(pose.yaw);
        assert.ok(forward > 0);
        assert.ok(Math.abs(dx*Math.cos(pose.yaw)+dz*Math.sin(pose.yaw)) < forward*aspect*Math.tan(pose.fov*Math.PI/360));
      }
    }
    assert.deepEqual(sequence, ['opening/'+plan.opening, ...plan.middle.map(id=>'middle/'+id), 'ending/'+plan.ending]);
    assert.ok(endingVisible, plan.ending);
    assert.equal(draws,1);
    assert.equal(story.count,1);
    assert.ok(flock.birds.every(bird=>!bird.storyPose));
  }
});
