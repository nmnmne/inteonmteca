// Each handwritten tile has this many equal-width cells. The shader uses the
// same bit order when it reads those cells in pairs from two different tiles.
export const inkGroups = 8;

export function wallFragments(text) {
  const letters = Array.from(text.normalize('NFC').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/gu, ' ').trim());
  return Array.from({length:inkGroups}, (_,i) => letters.slice(
    Math.floor(i*letters.length/inkGroups), Math.floor((i+1)*letters.length/inkGroups)).join(''));
}

export function mixWallPhrase(first, second, key) {
  const a = wallFragments(first), b = wallFragments(second);
  return a.flatMap((fragment,i) => key & (1 << i) ? [b[i],fragment] : [fragment,b[i]]);
}

export function separateWallPhrase(chunks, key) {
  const lines = ['', ''];
  for (let i=0; i<inkGroups; i++) {
    const swap = (key >> i) & 1;
    lines[0] += chunks[i*2+swap];
    lines[1] += chunks[i*2+1-swap];
  }
  return lines;
}
