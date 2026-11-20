// Each entry is one complete performance. The three middle scenes can play in
// any order, while the opening introduces the key and the ending resolves it.
const openings = ['knock', 'cache', 'beacon', 'echo'];
const scenes = ['ripple', 'lookout', 'echo', 'relay', 'footprints', 'decoy'];
const endings = ['stash', 'return', 'portal', 'gift'];
const arrangements = [];
for (const first of scenes) {
  for (const second of scenes) {
    for (const third of scenes) {
      if (first !== second && second !== third && first !== third) arrangements.push([first, second, third]);
    }
  }
}
const total = openings.length * arrangements.length * endings.length;
const storageKey = 'inteonmteca-crow-stories-v1';

function shuffledDeck(random, previous) {
  const remaining = Array.from({length: total}, (_, index) => index);
  for (let index = remaining.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [remaining[index], remaining[other]] = [remaining[other], remaining[index]];
  }
  // The last draw in one cycle and the first draw in the next must differ.
  if (remaining[total - 1] === previous) {
    [remaining[0], remaining[total - 1]] = [remaining[total - 1], remaining[0]];
  }
  return remaining;
}

function validId(id) {
  return Number.isInteger(id) && id >= 0 && id < total;
}

export function createCrowStoryDeck(random = Math.random, storage) {
  let remaining = [], previous = null;
  return {
    next() {
      // Re-read at draw time so another visit or tab can advance the same deck.
      if (storage) {
        try {
          const saved = JSON.parse(storage.getItem(storageKey));
          if (saved && validId(saved.previous) && Array.isArray(saved.remaining)
              && saved.remaining.length < total && saved.remaining.every(validId)
              && !saved.remaining.includes(saved.previous)
              && new Set(saved.remaining).size === saved.remaining.length) {
            ({remaining, previous} = saved);
          }
        } catch { /* Memory-only play if browser storage is unavailable. */ }
      }
      if (!remaining.length) remaining = shuffledDeck(random, previous);
      previous = remaining.pop();
      if (storage) {
        try { storage.setItem(storageKey, JSON.stringify({remaining, previous})); }
        catch { storage = null; }
      }
      const row = Math.floor(previous / endings.length);
      return {
        opening: openings[Math.floor(row / arrangements.length)],
        middle: [...arrangements[row % arrangements.length]],
        ending: endings[previous % endings.length],
      };
    },
  };
}
