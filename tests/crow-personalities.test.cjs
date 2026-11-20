const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../yard/data/site-layout.json');

test('the same home and visiting birds can be recognised in a new courtyard session', async () => {
  const {crowPersonality} = await import('../yard/crow-personalities.js');
  const {createCrowFlock} = await import('../yard/crow-flock.js');
  const {ambientOpeningView} = await import('../yard/auto-walk.js');
  let firstVisit;
  for (let seed of [719, 2941]) {
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const {allBirds} = createCrowFlock(layout, ambientOpeningView(layout, .68), {random});
    const profiles = allBirds.map(bird => {
      const profile = crowPersonality(bird.id);
      assert.equal(profile.id, bird.id);
      assert.equal(bird.personality, profile);
      assert.ok(Object.isFrozen(profile) && [profile.look, profile.voice, profile.habits].every(Object.isFrozen));
      return profile;
    });
    assert.equal(profiles.length, 19);
    assert.equal(new Set(profiles.map(bird => bird.name)).size, profiles.length);
    for (const facet of ['look', 'voice', 'habits']) {
      const differences = new Set(profiles.map(bird => JSON.stringify(bird[facet])));
      assert.equal(differences.size, profiles.length, facet);
    }
    if (firstVisit) profiles.forEach((profile, index) => assert.equal(profile, firstVisit[index]));
    firstVisit = profiles;
  }
  assert.equal(crowPersonality(19), undefined);
});
