// Each handwritten tile has this many equal-width cells. The shader uses the
// same bit order when it reads those cells in pairs from two different tiles.
export const inkGroups = 8;
export const inkPasses = 3;
export const inkAtlasColumns = 21;
export const inkCellWidth = 96;
export const inkCellHeight = 22;

function normalize(text) {
  return text.normalize('NFC').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/gu, ' ').trim();
}

// Keep a faded transcription independent of the ink. Stripping selected
// inner vowels and repeated letters preserves a clue to each source word.
const vowels = 'аеёиоуыэюяaeiouyáéíóú';
export function wallEcho(text) {
  return normalize(text).split(' ').map(word => {
    const letters = Array.from(word);
    return letters.filter((letter, i) =>
      letters.length < 5 || i === 0 || i === letters.length - 1 ||
      (letter !== letters[i - 1] && !(vowels.includes(letter) && i % 3 !== 0))
    ).join('');
  }).join(' ');
}

// Each successive reading follows a different sense of the previous word.
// The three languages in the sheets enter the same chains of false friends.
const falseFriends = [
  [/^(свет|light|luz)/u, 'лёгкий', 'вес', 'пыль'],
  [/^(врем|час|time|hour|tiemp)/u, 'отсчёт', 'деление', 'насечка'],
  [/^(мир|world|mundo)/u, 'покой', 'сон', 'ил'],
  [/^(стекл|окн|glass|vidri|ventan)/u, 'окно', 'око', 'зерно'],
  [/^(знак|sign|señal)/u, 'след', 'колея', 'желоб'],
  [/^(стен|wall|pared)/u, 'грань', 'ребро', 'кость'],
  [/^(вод|water|agua)/u, 'ток', 'провод', 'жила'],
  [/^(ноч|night|noche)/u, 'темнота', 'слепок', 'глина'],
  [/^(серд|heart|coraz)/u, 'центр', 'ядро', 'скорлупа'],
  [/^(голос|voice|voz)/u, 'тон', 'оттенок', 'ржавчина'],
  [/^(ключ|шифр|код|key|code|llav)/u, 'ключ', 'родник', 'рукав'],
  [/^(путь|дорог|road|way|camin)/u, 'ход', 'шаг', 'шов'],
  [/^(дом|home|casa)/u, 'очаг', 'жар', 'уголь'],
  [/^(дым|smok|humo)/u, 'завеса', 'складка', 'рубец'],
  [/^(тень|тен[ьи]|shadow|sombra)/u, 'двойник', 'эхо', 'полость']
];

// These strokes have their own hand-drawn forms in the atlas painter.
const shorthand = ['ȝʊø', 'ƞŋþ', 'λƛꝛ', 'ʃʒɣ'];
function soundClass(letter) {
  if (vowels.includes(letter)) return 0;
  if ('мнnmñ'.includes(letter)) return 1;
  if ('лрйrlj'.includes(letter)) return 2;
  return 3;
}

export function wallTranslation(text, pass = 0) {
  const source = normalize(text);
  if (!source) return '';
  const stage = Math.min(inkPasses - 1, Math.max(0, Math.trunc(pass) || 0));
  const words = source.split(' ').map((word, index) => {
    const chain = falseFriends.find(([root]) => root.test(word));
    const heard = Array.from(chain ? chain[stage + 1] : word);
    // A repeated mistranscription keeps a small fragment of each word.
    if (stage && heard.length > 3) heard.splice(Math.floor(heard.length / 2), stage);
    const accent = (word.codePointAt(0) + index) % 3;
    return heard.map((letter, i) => {
      if (i && (i + accent) % 3 > stage) return letter;
      const forms = shorthand[soundClass(letter)];
      return forms[(accent + stage + i) % forms.length];
    }).join('');
  });
  if (stage > 0) {
    // Local word order slips on the second reading. On the last reading
    // adjacent words collapse into a single ligature.
    for (let i = 0; i + 1 < words.length; i += 3) {
      [words[i], words[i + 1]] = [words[i + 1], words[i]];
    }
  }
  return words.map((word, i) => i && (stage < 2 || i % 2 === 0) ? ' ' + word : word).join('');
}

export function wallFragments(text) {
  const letters = Array.from(normalize(text));
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
