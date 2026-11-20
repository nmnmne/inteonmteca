// The ids belong to the birds, independently of their changing rank or story role.
// 0 is the camera bird, 1–12 live in the yard, 13–15 and 16–18 are its neighbours.
const residents = [
  {
    id: 0, name: 'Штурман',
    look: {size: 1.04, wingSpan: 1.12, beak: 1.05, tail: 1.09, tint: .42, warmth: -.12, mark: 'tail', markStrength: .67},
    voice: {pitch: .98, volume: .93, rasp: .41, length: 1.07, cadence: 1.12, notes: 2},
    habits: {boldness: .74, sociability: .68, vigilance: .84, curiosity: .51, pace: 1.02, flap: .94, bob: .88, gesture: 'scan'}
  },
  {
    id: 1, name: 'Седыш',
    look: {size: 1.11, wingSpan: 1.09, beak: 1.16, tail: .95, tint: .90, warmth: -.25, mark: 'nape', markStrength: .99},
    voice: {pitch: .80, volume: .72, rasp: .82, length: 1.27, cadence: 1.31, notes: 1},
    habits: {boldness: .40, sociability: .51, vigilance: .92, curiosity: .30, pace: .80, flap: .81, bob: .76, gesture: 'watch'}
  },
  {
    id: 2, name: 'Искра',
    look: {size: .89, wingSpan: .94, beak: .87, tail: 1.13, tint: .16, warmth: -.70, mark: 'wing', markStrength: .96},
    voice: {pitch: 1.27, volume: .89, rasp: .23, length: .76, cadence: .72, notes: 3},
    habits: {boldness: .72, sociability: .71, vigilance: .49, curiosity: .97, pace: 1.26, flap: 1.27, bob: 1.23, gesture: 'forage'}
  },
  {
    id: 3, name: 'Копоть',
    look: {size: 1.02, wingSpan: .94, beak: 1.10, tail: .90, tint: .08, warmth: .41, mark: 'bib', markStrength: .42},
    voice: {pitch: .93, volume: .79, rasp: .88, length: .92, cadence: 1.16, notes: 1},
    habits: {boldness: .37, sociability: .18, vigilance: .71, curiosity: .44, pace: .91, flap: 1.02, bob: .91, gesture: 'preen'}
  },
  {
    id: 4, name: 'Часовой',
    look: {size: 1.07, wingSpan: 1.15, beak: 1.09, tail: 1.03, tint: .59, warmth: -.58, mark: 'brow', markStrength: .84},
    voice: {pitch: .90, volume: 1.11, rasp: .53, length: 1.13, cadence: .94, notes: 2},
    habits: {boldness: .79, sociability: .57, vigilance: .99, curiosity: .21, pace: .94, flap: .85, bob: .79, gesture: 'scan'}
  },
  {
    id: 5, name: 'Крошка',
    look: {size: .88, wingSpan: .85, beak: .83, tail: .89, tint: .64, warmth: .52, mark: 'bib', markStrength: .83},
    voice: {pitch: 1.30, volume: .66, rasp: .15, length: .81, cadence: .82, notes: 2},
    habits: {boldness: .19, sociability: .87, vigilance: .85, curiosity: .75, pace: 1.11, flap: 1.23, bob: 1.14, gesture: 'forage'}
  },
  {
    id: 6, name: 'Грачок',
    look: {size: 1.01, wingSpan: 1.08, beak: 1.18, tail: 1.00, tint: .23, warmth: -.84, mark: 'shoulder', markStrength: .62},
    voice: {pitch: 1.04, volume: .91, rasp: .72, length: .95, cadence: .89, notes: 3},
    habits: {boldness: .62, sociability: .78, vigilance: .44, curiosity: .85, pace: 1.09, flap: .96, bob: 1.08, gesture: 'forage'}
  },
  {
    id: 7, name: 'Дымка',
    look: {size: .94, wingSpan: 1.03, beak: .91, tail: 1.12, tint: .80, warmth: -.54, mark: 'wing', markStrength: .52},
    voice: {pitch: 1.12, volume: .70, rasp: .32, length: 1.17, cadence: 1.22, notes: 1},
    habits: {boldness: .24, sociability: .42, vigilance: .89, curiosity: .59, pace: .92, flap: 1.05, bob: .86, gesture: 'scan'}
  },
  {
    id: 8, name: 'Барин',
    look: {size: 1.12, wingSpan: 1.06, beak: 1.12, tail: .86, tint: .48, warmth: .78, mark: 'shoulder', markStrength: .84},
    voice: {pitch: .82, volume: 1.07, rasp: .69, length: 1.29, cadence: 1.34, notes: 1},
    habits: {boldness: .86, sociability: .34, vigilance: .39, curiosity: .32, pace: .76, flap: .80, bob: .83, gesture: 'preen'}
  },
  {
    id: 9, name: 'Сверчок',
    look: {size: .92, wingSpan: .90, beak: .94, tail: 1.18, tint: .36, warmth: .33, mark: 'tail', markStrength: .91},
    voice: {pitch: 1.24, volume: .83, rasp: .57, length: .79, cadence: .76, notes: 3},
    habits: {boldness: .60, sociability: .84, vigilance: .60, curiosity: .77, pace: 1.20, flap: 1.21, bob: 1.27, gesture: 'scan'}
  },
  {
    id: 10, name: 'Бровка',
    look: {size: .98, wingSpan: .92, beak: .93, tail: .93, tint: .50, warmth: .21, mark: 'brow', markStrength: .98},
    voice: {pitch: 1.09, volume: .95, rasp: .36, length: .89, cadence: 1.03, notes: 2},
    habits: {boldness: .54, sociability: .67, vigilance: .74, curiosity: .86, pace: 1.06, flap: 1.09, bob: 1.11, gesture: 'watch'}
  },
  {
    id: 11, name: 'Щепка',
    look: {size: .91, wingSpan: 1.07, beak: .89, tail: 1.15, tint: .39, warmth: .96, mark: 'nape', markStrength: .68},
    voice: {pitch: 1.17, volume: .76, rasp: .44, length: .85, cadence: .96, notes: 1},
    habits: {boldness: .32, sociability: .29, vigilance: .69, curiosity: .91, pace: 1.17, flap: 1.16, bob: 1.19, gesture: 'forage'}
  },
  {
    id: 12, name: 'Басок',
    look: {size: 1.09, wingSpan: 1.04, beak: 1.14, tail: 1.05, tint: .30, warmth: -.41, mark: 'tail', markStrength: .56},
    voice: {pitch: .76, volume: 1.04, rasp: .61, length: 1.22, cadence: 1.25, notes: 2},
    habits: {boldness: .58, sociability: .82, vigilance: .55, curiosity: .40, pace: .85, flap: .84, bob: .82, gesture: 'watch'}
  },
  {
    id: 13, name: 'Буян',
    look: {size: 1.13, wingSpan: 1.16, beak: 1.17, tail: .87, tint: .22, warmth: -.32, mark: 'bib', markStrength: .94},
    voice: {pitch: .83, volume: 1.20, rasp: .96, length: 1.11, cadence: .79, notes: 2},
    habits: {boldness: .98, sociability: .15, vigilance: .76, curiosity: .38, pace: 1.14, flap: 1.07, bob: 1.17, gesture: 'watch'}
  },
  {
    id: 14, name: 'Галька',
    look: {size: .96, wingSpan: .88, beak: .92, tail: .84, tint: .73, warmth: -.08, mark: 'shoulder', markStrength: .74},
    voice: {pitch: 1.15, volume: .80, rasp: .39, length: 1.03, cadence: 1.08, notes: 2},
    habits: {boldness: .43, sociability: .75, vigilance: .47, curiosity: .64, pace: .98, flap: 1.11, bob: 1.00, gesture: 'preen'}
  },
  {
    id: 15, name: 'Косой',
    look: {size: 1.03, wingSpan: .97, beak: 1.11, tail: 1.08, tint: .46, warmth: -.65, mark: 'wing', markStrength: .78},
    voice: {pitch: 1.00, volume: 1.01, rasp: .75, length: .87, cadence: .86, notes: 3},
    habits: {boldness: .67, sociability: .25, vigilance: .93, curiosity: .66, pace: 1.13, flap: 1.03, bob: 1.04, gesture: 'scan'}
  },
  {
    id: 16, name: 'Лада',
    look: {size: .97, wingSpan: 1.01, beak: .96, tail: 1.04, tint: .69, warmth: .88, mark: 'shoulder', markStrength: .90},
    voice: {pitch: 1.10, volume: .81, rasp: .19, length: 1.14, cadence: 1.19, notes: 2},
    habits: {boldness: .46, sociability: .98, vigilance: .54, curiosity: .62, pace: .89, flap: .97, bob: .90, gesture: 'preen'}
  },
  {
    id: 17, name: 'Кремень',
    look: {size: 1.08, wingSpan: 1.13, beak: 1.08, tail: .96, tint: .33, warmth: -.96, mark: 'nape', markStrength: .76},
    voice: {pitch: .88, volume: 1.14, rasp: .78, length: 1.05, cadence: 1.01, notes: 1},
    habits: {boldness: .91, sociability: .41, vigilance: .81, curiosity: .27, pace: .95, flap: .89, bob: .93, gesture: 'watch'}
  },
  {
    id: 18, name: 'Соринка',
    look: {size: .90, wingSpan: .91, beak: .85, tail: 1.10, tint: .56, warmth: .67, mark: 'brow', markStrength: .80},
    voice: {pitch: 1.22, volume: .74, rasp: .28, length: .83, cadence: .87, notes: 3},
    habits: {boldness: .28, sociability: .90, vigilance: .78, curiosity: .88, pace: 1.19, flap: 1.19, bob: 1.16, gesture: 'forage'}
  }
];

const byId = new Map();
for (const bird of residents) {
  Object.freeze(bird.look);
  Object.freeze(bird.voice);
  Object.freeze(bird.habits);
  byId.set(bird.id, Object.freeze(bird));
}

export function crowPersonality(id) {
  return byId.get(id);
}
