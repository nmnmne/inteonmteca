const player = document.getElementById("album-player");
const perceptionVisual = document.getElementById("perception-visual");
const perceptionContext = perceptionVisual?.getContext("2d");
const immersiveMode = document.getElementById("immersive-mode");
const immersiveVisual = document.getElementById("immersive-visual");
const immersiveTitle = document.getElementById("immersive-title");
const immersiveArtist = document.getElementById("immersive-artist");
const playbackStatus = document.getElementById("playback-status");
const activePlayer = document.getElementById("active-player");
const activeTrackArtist = document.getElementById("active-track-artist");
const immersiveBack = document.getElementById("immersive-back");
const immersivePlay = document.getElementById("immersive-play");
const immersivePlayIcon = document.getElementById("immersive-play-icon");
const nowPlayingTitle = document.getElementById("now-playing-title");
const previousTrack = document.getElementById("previous-track");
const nextTrack = document.getElementById("next-track");
const trackProgress = document.getElementById("track-progress");
const trackVolume = document.getElementById("track-volume");
const currentTime = document.getElementById("current-time");
const durationTime = document.getElementById("duration-time");
const playlistList = document.getElementById("track-list");
const playlistShell = document.getElementById("playlist-shell");
const trackViewport = document.getElementById("track-viewport");
const scrollbar = document.getElementById("track-scrollbar");
const scrollbarThumb = document.getElementById("track-scrollbar-thumb");
const inkField = document.getElementById("ink-field");
const inkContext = inkField?.getContext("2d");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobileViewport = window.matchMedia("(max-width: 640px)").matches;
const lowPowerDevice = isMobileViewport
  || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
  || (navigator.deviceMemory && navigator.deviceMemory <= 4);
let animationQuality = lowPowerDevice ? "low" : "high";
document.documentElement.dataset.animationQuality = animationQuality;
let particleGrid = animationQuality === "low" ? { cols: 12, rows: 4 } : { cols: 18, rows: 6 };
const logoWrap = document.querySelector(".logo-wrap");
const reactiveLogo = document.getElementById("reactive-logo");
const logoVector = document.getElementById("logo-vector");
const logoGaze = document.getElementById("logo-gaze");
const logoTurbulence = document.getElementById("logo-turbulence");
const logoDisplacement = document.getElementById("logo-displacement");
const logoSliceContainer = document.getElementById("logo-vector-slices");
const logoReactiveCanvas = document.getElementById("logo-reactive-canvas");
const logoReactiveContext = logoReactiveCanvas?.getContext("2d");
const logoParticles = document.getElementById("logo-particles");
const logoSymbolEcho = document.getElementById("logo-symbol-echo");
const uniqueCount = document.getElementById("unique-count");
const visitCount = document.getElementById("visit-count");
const authHint = document.getElementById("auth-hint");
const authPanel = document.getElementById("auth-panel");
const authEmailForm = document.getElementById("auth-email-form");
const authCodeForm = document.getElementById("auth-code-form");
const authEmail = document.getElementById("auth-email");
const authCode = document.getElementById("auth-code");
const authCodeLabel = document.getElementById("auth-code-label");
const authStatus = document.getElementById("auth-status");
const authClose = document.getElementById("auth-close");
const authLogout = document.getElementById("auth-logout");
const chatHint = document.getElementById("chat-hint");
const chatPanel = document.getElementById("chat-panel");
const chatStream = document.getElementById("chat-stream");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatClose = document.getElementById("chat-close");
const themeHint = document.getElementById("theme-hint");
const themePanel = document.getElementById("theme-panel");
const themeClose = document.getElementById("theme-close");
const themeSelect = document.getElementById("theme-select");
const themeDuration = document.getElementById("theme-duration");
const themeDurationOutput = document.getElementById("theme-duration-output");
const themeRandom = document.getElementById("theme-random");
const themeStatus = document.getElementById("theme-status");
const streetLink = document.getElementById("street-link");
const apiMeta = document.querySelector('meta[name="inteonmteca-api"]');
const isFileMode = location.protocol === "file:";
const canUseNetwork = location.protocol === "http:" || location.protocol === "https:";
const explicitApiBase = (apiMeta?.getAttribute("content") || "").replace(/\/$/, "");
const API_BASE = canUseNetwork ? explicitApiBase : "";
const sceneClock = { now: 0, energy: 0, bass: 0 };
const perceptionField = [];
const perceptionChars = "0123456789";
const motionState = { x: 0, y: 0, strength: 0 };
const motionTarget = { x: 0, y: 0, strength: 0 };
const motionVelocity = { x: 0, y: 0 };
const pointerState = { x: innerWidth * .5, y: innerHeight * .5, active: false };
const motionStrength = 2.8;
const audioContext = window.AudioContext || window.webkitAudioContext;
const audioNodes = new WeakMap();
let sharedAudioContext = null;
const immersiveState = { active: false, audio: null, analyser: null, data: null, raf: 0, lastDraw: 0, pointerX: 0, pointerY: 0 };
const spectrumState = { at: -Infinity, bass: 0, mid: 0, high: 0, avg: 0, flux: 0, previous: 0, peaks: [] };
const logoReactiveState = { x: 0, y: 0, hoverX: 0, hoverY: 0, proximity: 0, bass: 0, mid: 0, high: 0, energy: 0 };
const matrixElements = document.querySelectorAll(".matrix-text[data-matrix-noise]");
const prefersDynamicMotion = !prefersReducedMotion;
const logoText = "inteonmteca";
const logoLetters = [];
const matrixGlyphs = "01/\\|<>[]{}#$%&*+-=abcdefghijklmnopqrstuvwxyz";
const titleGlyphs = "∆⟟⌁⋮╱╲░▒◇◌01/\\|<>[]{}+-=";
const readableElements = new Set();
const matrixHoldStates = new WeakMap();
const matrixHoldRatio = 0.15;
const matrixHoldDuration = 1000;
const counterNamespace = "inteonmteca.online";
const uniqueStorageKey = "inteonmteca-unique-visit";
const counterBaseUrl = "https://abacus.jasoncameron.dev";
const TRACK_VIEW = 5;
const THEME_MIN_MS = 4 * 1000;
const THEME_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const THEME_DEFAULT_MS = 8 * 1000;
// Single file://-safe source of truth. First ten are the core collection;
// the remaining material studies are deliberately composed, not hue rotations.
// Row: id | Russian label | background panel light-a light-b light-c accent text.
const themeCoreFilters = Object.freeze({
  desert: { canvas: "none", logo: "none", fog: "18px", opacity: ".82" },
  sunset: { canvas: "hue-rotate(22deg) saturate(1.28)", logo: "hue-rotate(23deg) saturate(1.24)", fog: "22px", opacity: "1" },
  abyss: { canvas: "hue-rotate(165deg) saturate(1.42)", logo: "hue-rotate(162deg) saturate(1.48)", fog: "20px", opacity: ".82" },
  moss: { canvas: "hue-rotate(58deg) saturate(1.28)", logo: "hue-rotate(57deg) saturate(1.4)", fog: "16px", opacity: ".82" },
  infrared: { canvas: "hue-rotate(-22deg) saturate(1.7) contrast(1.08)", logo: "hue-rotate(-25deg) saturate(1.65)", fog: "18px", opacity: ".82" },
  amethyst: { canvas: "hue-rotate(226deg) saturate(1.5)", logo: "hue-rotate(224deg) saturate(1.55)", fog: "22px", opacity: ".82" },
  glacier: { canvas: "hue-rotate(148deg) saturate(.92) brightness(1.08)", logo: "hue-rotate(150deg) saturate(.82) brightness(1.1)", fog: "22px", opacity: ".8" },
  porcelain: { canvas: "hue-rotate(8deg) saturate(.95)", logo: "hue-rotate(10deg) saturate(.9)", fog: "18px", opacity: ".8" },
  graphite: { canvas: "hue-rotate(200deg) saturate(.62)", logo: "hue-rotate(198deg) saturate(.58)", fog: "18px", opacity: ".78" },
  oxblood: { canvas: "hue-rotate(-18deg) saturate(1.2)", logo: "hue-rotate(-16deg) saturate(1.16)", fog: "18px", opacity: ".84" },
});
const themeRegistry = Object.freeze([
  // основные — seven original IDs stay vivid; three more complete the core ten
  "desert|пустынная ртуть|070605 070605 e07d49 893a2d 6b415b d3ff69 f4eee8",
  "sunset|перегретый закат|0d0802 0d0802 ff741a ffbe41 68ae37 bcff63 fff1dc",
  "abyss|ультрамариновая глубина|020810 020810 14a8ff 1945dc 7e32ff 68ffe6 e0f5ff",
  "moss|радиоактивный мох|050804 050804 9df330 347025 d2a326 d5ff66 edf5db",
  "infrared|инфракрасный сон|0a0103 0a0103 ff261e 8b002d ff5c12 ff704e ffe6de",
  "amethyst|аметистовый мираж|080410 080410 be48ff 4948e6 ff5bb5 e29dff f7e8ff",
  "glacier|ледяная память|02090d 02090d 97eeff 2689eb cdffe8 c6fff9 e8fbff",
  "porcelain|тёплый фарфор|14120f 26231c c9bc9e 92806b a9aaa0 e8dbbb f6f0e5",
  "graphite|мягкий графит|0c0e10 1b1e21 929b9e 59666c 898078 c2cdce eff1f0",
  "oxblood|воловья кожа|160b0b 291818 a97263 794452 9a825f d9b19b f5e8df",
  // глины и земли
  "kaolin|сырой каолин|14110e 27221c bcb09c 928675 847f6c d9c8aa f4ecdf",
  "terracotta|пыльная терракота|190e0a 302019 c08364 914e42 aa946f e2ba91 f8eadb",
  "umber|жжёная умбра|110e09 231d13 9c8159 685c44 948478 d2bc90 f0e9db",
  "sienna|сырая сиена|171107 2b2112 b69a5d 8a684c 8f9170 e3ce9b f6eed7",
  "ochre|золотая охра|151107 292314 c3a856 847344 a58b70 e7d69d f9f0d9",
  "bentonite|серая глина|121211 232522 a4aaa0 727d79 978e7d ced1bb f0f0e5",
  "brick-dust|кирпичная пыль|170d0d 2b1a19 b67569 885e58 8f856d dcb8a7 f6e9e0",
  "adobe|саманный дом|15120c 282418 b4a37a 837552 9b8e7d d9cba7 f3eddf",
  "red-earth|красная земля|170c08 2c1b12 b77247 874d3e 998058 ddb18a f5e8d9",
  // волокна и ткани
  "linen|небелёный лён|12130f 24271e aeb49a 80876d a19783 d5d9bd f1f2e5",
  "hemp|конопляное полотно|13110a 272217 ada17a 777853 978765 d8cfa3 f2efda",
  "raw-silk|шёлк экрю|151110 2b2220 c4aea3 95847d a4a291 e5d5bf f8eee7",
  "cashmere|серый кашемир|111214 242529 a1a3b1 777a8c a39189 d0cbd8 f0eff5",
  "felt|войлок и шалфей|0e1210 202722 98a897 617a70 a2967d c8d4b9 ebf2e8",
  "velvet|табачный бархат|14100b 281f17 ab9065 79604b 928378 d6bd94 f4eada",
  "denim|выцветший деним|0c1117 1a2632 829bb7 4e6b8a 9d9690 bdceda e9f0f7",
  "corduroy|вельвет корицы|160e0b 2c1d17 b28b6b 88664f 968976 dbbd9c f5eadd",
  "muslin|розовый муслин|171113 2b2127 c0a1b0 907b8d ada190 e6c9d5 faedf2",
  // садовая зелень
  "sage|серебряный шалфей|0f1410 202b23 9caf98 6d8b7b b0a184 cdddba eff5e8",
  "olive|оливковая косточка|131409 272b18 a4a76c 737b45 9b8964 d1d49e f1f2dc",
  "eucalyptus|кора эвкалипта|0d1413 1b2b29 7fa79c 537e79 a7927d bad8c9 e9f5ef",
  "fern|тенистый папоротник|09130d 17291c 739c6c 466c54 938e62 b6d7a6 e8f4e4",
  "juniper|сухой можжевельник|0d1214 1b282b 83a4a9 53747c 9d9b85 c0d8d1 ebf4f1",
  "pistachio|скорлупа фисташки|14150e 292c20 b2bb85 7d9167 b0a081 d9e0b1 f3f5e3",
  "nettle|крапивный настой|101307 222918 8f9a55 5e753c a39560 c4d393 eff3d9",
  "lichen|лишайник на камне|131512 272c26 a1ae8b 748472 a5a290 d2d7b8 f0f3e6",
  "artichoke|лист артишока|13120f 29271f a3a083 73785e 958a9a d1cdb0 f3eee3",
  // вода и минеральные синие
  "petrol|петролевая эмаль|081415 152b2d 589a9e 37696e a59877 abd6cb e4f4f0",
  "slate|мокрый сланец|101216 222730 8897ad 5e708b a39c96 c5cfdb eff2f7",
  "celadon|селадоновая глазурь|101612 222e26 a1beb0 6e9285 b6af8e d5e7ce f0f8ed",
  "sea-glass|матовое стекло|0e1616 1d2d2e 8fb9b6 648e99 a8b19b c8e3d7 ecf7f2",
  "verdigris|медная патина|0b1511 182d25 6cae95 487967 b09a68 bbe0b8 e7f5e9",
  "ink-blue|синие чернила|0c101b 1b2335 718bad 4c597e 9d8f9f bdc9df eaf0fc",
  "storm-blue|грозовой лён|10141a 232b36 93a6bc 637c94 a8a390 ccdbe0 f0f4f8",
  "ceramic-blue|синяя керамика|0b121a 192936 759eb5 486f93 b5a184 bed7e3 eaf4fa",
  "river-silt|речной ил|111512 242d26 9fac98 697f76 a59a88 d0dac1 eff5e8",
  // плоды и настои
  "quince|айвовый мёд|181307 302715 c7ac62 937343 a19a6e e9d8a1 f9f1d9",
  "fig|кожица инжира|170e18 2d1e2e ad87a9 735e7c a19c77 d9bed2 f8edf6",
  "plum|сливовый налёт|130e19 271e31 9e8bb0 655777 ab8e8b cfbeda f2eaf9",
  "mulberry|сок шелковицы|180b13 301922 b17894 7f4968 a88c71 e0b1c6 fae6ef",
  "blackcurrant|смородиновый лист|130e16 261e2c 97798d 625470 8f9e76 cdb8c7 f4eaf1",
  "rosehip|сухой шиповник|1a0e0b 321e18 c08770 92594d a59b77 e9bea1 fbeddf",
  "pomegranate|гранатовая корка|190b0f 30181f b57279 803e58 ae8868 e3b2ae fae7e7",
  "apricot|абрикосовая замша|19130e 30261e c7a17a 937957 a7a18b edd0a9 faf1e4",
  "persimmon|вяленая хурма|191006 302115 c58f50 956344 9a976e ebc28e f9ebd6",
  // древесина и смолы
  "walnut|ореховый шпон|120e0c 261e1a a58b7a 71584f 97947a d4bba3 f1e7dd",
  "cedar|кедровая стружка|17110c 2d231a b69b79 8b6d55 9d9f80 e1c9a5 f6eddf",
  "ebony|чёрное дерево|0c0c0a 1e1d17 8b8971 5b6355 928076 c4bf9e eceade",
  "birch|берёзовая кора|141413 292a26 b9b9aa 858d82 a59a87 e0dfc9 f4f4e9",
  "cork|португальская пробка|18130e 2e261b b8a080 8c775e a59687 e4cfae f8efdf",
  "rosewood|розовое дерево|180f11 2f2022 b58a89 845e69 a5927c e0bebe f9eaeb",
  "smoked-oak|копчёный дуб|11100e 25241d 96957d 676b58 988577 c7c2a4 f0ede0",
  "amber-resin|янтарная смола|171005 2d2210 bd984c 86672f a28760 e7ce8e f7edcf",
  "pine-bark|сосновая кора|13100b 292219 a48b62 726a48 8d9b83 d1c294 f0ebda",
  // металл и камень
  "pewter|оловянная чашка|121416 262b2e a9b2b4 76868e a69c8a d5ded9 f1f5f2",
  "brass|старая латунь|151309 2b2817 b9ab69 887b43 a69b7f dfdaa5 f6f3dd",
  "copper|травлёная медь|180e0c 2f1f1b b98772 86594e 80a293 e1bba7 f8eade",
  "basalt|тёплый базальт|101110 232522 90998f 616e69 9a8d81 c6cfc1 edf1e8",
  "travertine|римский травертин|17140f 2e281e c1b091 948366 a9a18c e7d9b7 f8f1e1",
  "soapstone|мыльный камень|111614 252e28 a8b8aa 728e7f aca88f d6e2cd f1f7eb",
  "malachite|матовый малахит|091611 172e24 6ca68a 3e725f b1a37e b9d9ba e6f6e9",
  "rhodonite|пыльный родонит|180f15 301f2a ba92aa 805f7a 9e9c88 e5c1d4 f9edf4",
  "fluorite|зелёный флюорит|101515 222d2f 9fb5ad 778b9e ac94b3 d4ddd0 f1f6f1",
  // чай и пряности
  "matcha|маття в тени|14170c 292e1b a9b77c 7a9058 b2a179 dce3ac f5f7e0",
  "oolong|дымный улун|17130b 2d281b ac9c76 7a704e 9b9e84 d9cda2 f4efdc",
  "hibiscus|чай каркаде|190d16 311c2b b17e9b 7f4f73 a88d81 e1b8d0 f9eaf3",
  "saffron|нить шафрана|191406 302911 c1a345 947531 a28e67 e9d485 faf1d2",
  "cardamom|зелёный кардамон|15170f 2c3020 aeb891 7e906b b5aa8c dde4bd f5f7e7",
  "cinnamon|палочка корицы|180f0a 301f16 b98d69 885e44 a29676 e3c09a f8ead9",
  "clove|сухая гвоздика|140e10 291e21 9e7f82 70585f 9a9179 d1b6b5 f2e7e6",
  "vanilla|стручок ванили|17150f 2e2b1f c0b598 908767 a9a293 e9ddbb f9f3e3",
  "cacao|горькое какао|120d0b 271c17 9e8069 705549 9b8b78 d2b398 f1e5d8",
  // пигменты и бумага
  "parchment|старый пергамент|18160f 302d20 bdb58d 91845f aba28a e5dfb6 f9f5e0",
  "sepia|сепия на бумаге|151008 2b2316 ab9164 786345 a1997e dac498 f4ecda",
  "indigo|потёртый индиго|10101b 232338 8c8ead 5c608b a39d8e c8cce0 f0f0fb",
  "madder|мареновый краситель|1a0e11 321e23 ba8287 894d63 b69b81 e8bdbb fbeaec",
  "weld|резеда красильная|17170c 2f301b b6b777 818c4e a79c76 e0e2a9 f7f7df",
  "wisteria|сухая глициния|141019 292333 ac9dbb 79708d b2a191 dfd1e5 f6effa",
  "dusty-rose|пепельная роза|181215 30262a c0a3ad 917b87 afa18d ead0d7 fbF0f3",
  "chalk|цветной мел|151718 2b3031 b4c0bc 83959d b5aa9c e0e9dd f5faf3",
  "charcoal|угольный набросок|0e1012 21262b 929fa8 647580 9e9588 c6d4d9 ecf3f6",
  // необычные сочетания
  "salt-plum|соль и слива|15121a 2c2733 b0a3c1 7c718e a6b7ab e0d4eb f7f1fc",
  "pear-smoke|груша в дыму|17180e 2f3220 b9bf87 879759 b3a094 e6e9ba f8f9e5",
  "tea-rose|чайная роза|1a1310 332820 c6a48d 947e68 a9ae93 eed2b8 fcf1e5",
  "lavender-clay|лавандовая глина|17111a 2f2534 b29db4 7d708b b4a082 e3cfe1 f8eff9",
  "mint-copper|мята и медь|101915 21332b 9ebbaa 6c9388 bb987b d9ead0 f1faed",
  "mustard-ink|горчица и тушь|151510 2b2d23 b5ad75 657e80 a28b76 e0d7a6 f6f3e0",
  "aubergine-linen|баклажан и лён|191019 312330 b69cad 806177 b5af8e e4d2c0 faf0ec",
  "oyster|устричный перламутр|151617 2d3030 b7bdbc 858e9a b8a69f e5e6da f8f8f1"
].map((row, index) => {
  const [id, name, palette] = row.split("|");
  const [bg, panel, a, b, c, accent, text] = palette.toLowerCase().split(" ");
  const rgb = (hex) => hex.match(/.{2}/g).map((channel) => parseInt(channel, 16)).join(", ");
  const hueOf = (hex) => {
    const [red, green, blue] = hex.match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    if (max === min) return 22;
    const delta = max - min;
    let hue = max === red
      ? (green - blue) / delta + (green < blue ? 6 : 0)
      : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
    return hue * 60;
  };
  const rotate = Math.round((hueOf(a) - 22 + 360) % 360);
  const core = themeCoreFilters[id];
  return Object.freeze({
    id,
    name,
    group: index < 10 ? "основные" : "оттенки",
    tokens: Object.freeze({
      "--theme-bg": `#${bg}`,
      "--theme-panel-rgb": rgb(panel),
      "--theme-a-rgb": rgb(a),
      "--theme-b-rgb": rgb(b),
      "--theme-c-rgb": rgb(c),
      "--theme-accent-rgb": rgb(accent),
      "--theme-text-rgb": rgb(text),
      "--theme-canvas-filter": core?.canvas || `hue-rotate(${rotate}deg) saturate(1.22)`,
      "--theme-logo-filter": core?.logo || `hue-rotate(${rotate}deg) saturate(1.18)`,
      "--theme-fog-blur": core?.fog || "18px",
      "--theme-light-opacity": core?.opacity || ".8",
    }),
  });
}));
const themeNames = themeRegistry.map((theme) => theme.id);
const themesById = new Map(themeRegistry.map((theme) => [theme.id, theme]));

const populateThemeSelect = () => {
  if (!themeSelect) return;
  themeSelect.replaceChildren();
  const groups = { "основные": document.createElement("optgroup"), "оттенки": document.createElement("optgroup") };
  groups["основные"].label = "основные";
  groups["оттенки"].label = "оттенки";
  for (const theme of themeRegistry) {
    const option = document.createElement("option");
    option.value = theme.id;
    option.textContent = theme.name;
    groups[theme.group].append(option);
  }
  themeSelect.append(groups["основные"], groups["оттенки"]);
};
const themeStorageKey = "inteonmteca-theme";
const themeDurationStorageKey = "inteonmteca-theme-duration";
const localSessionStorageKey = "inteonmteca-local-session";
const localAccountsStorageKey = "inteonmteca-local-accounts";
const localChatStorageKey = "inteonmteca-local-chat";
const emailFormat = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

let tracks = [];
let currentTrack = null;
let currentTrackIndex = -1;
let playlistRaf = 0;
let playlistScrollRaf = 0;
let playlistScrollTarget = 0;
let playlistScrollVelocity = 0;
let playlistPointerLockUntil = 0;
let playlistPointerCarry = 0;
let wheelBalancing = false;
let playLockAt = 0;
let trackPlayBlend = 0;
let playbackRequestId = 0;
let fullReadableMode = false;
let logoLocked = false;
let logoChaosActive = false;
let logoChargeTimeout;
let logoCycleTimeout;
let logoChaosCountdown = 0;
let pendingEmail = "";
let localLoginCode = "";
let sessionEmail = "";
let chatTimer = 0;
let chatGlyphs = [];
let draggingScroll = null;
let activeAudioNode = null;
let logoSlices = [];
let inkParticles = [];
let inkLastFrame = performance.now();
let inkLastEmission = 0;
let inkFieldBounds = null;
let perceptionLastFrame = 0;
let logoLastFrame = 0;
let titleLastFrame = 0;
let playlistLastFrame = 0;
let playlistSignature = "";
let themeRotationTimer = 0;
let themeShiftTimer = 0;
let slowFrameScore = 0;
let motionLastFrame = performance.now();
let trackItemNodes = [];
let trackTitleNodes = [];
let sceneRaf = 0;
let lastVisualTick = 0;
let logoCanvasBounds = { width: 0, height: 0 };
const lastMotionCss = { x: "", y: "", strength: "", tiltX: "", tiltY: "" };
const lastLogoVars = new Map();

const apiUrl = (path) => `${API_BASE}${path}`;

const refreshTrackNodes = () => {
  trackItemNodes = playlistList ? [...playlistList.querySelectorAll(".track-item")] : [];
  trackTitleNodes = trackItemNodes.map((item) => item.querySelector(".track-title")).filter(Boolean);
};

const renderInterval = () => animationQuality === "low" ? 52 : 34;

const rebuildQualityDependentState = () => {
  particleGrid = animationQuality === "low" ? { cols: 12, rows: 4 } : { cols: 18, rows: 6 };
  setupSmokeEmitters();
  setupPerceptionField();
  setupWindField();
  setupLogoFilaments();
  setupLogoSlices();
  setupLogoParticles();
  resizeInkField();
  resizeLogoCanvas();
  sizeCanvas(immersiveVisual);
};

const setAnimationQuality = (quality) => {
  if (animationQuality === quality) return;
  animationQuality = quality;
  document.documentElement.dataset.animationQuality = quality;
  rebuildQualityDependentState();
};

const recordFramePacing = (delta) => {
  if (document.hidden || animationQuality === "low") return;
  slowFrameScore = delta > 72 ? slowFrameScore + 1 : Math.max(0, slowFrameScore - .2);
  if (slowFrameScore > 20) setAnimationQuality("low");
};

const setMotion = (x, y, strength = 1) => {
  if (!prefersDynamicMotion) {
    motionTarget.x = 0;
    motionTarget.y = 0;
    motionTarget.strength = 0;
    return;
  }
  motionTarget.x = Math.max(-1, Math.min(1, x * motionStrength));
  motionTarget.y = Math.max(-1, Math.min(1, y * motionStrength));
  motionTarget.strength = Math.min(1, Math.max(0, strength));
};

const renderWeightedMotion = (now) => {
  const delta = Math.min(2.2, Math.max(.25, (now - motionLastFrame) / 16.67));
  motionLastFrame = now;
  const spring = .052 * delta;
  const damping = Math.pow(.82, delta);
  motionVelocity.x = (motionVelocity.x + (motionTarget.x - motionState.x) * spring) * damping;
  motionVelocity.y = (motionVelocity.y + (motionTarget.y - motionState.y) * spring) * damping;
  motionState.x += motionVelocity.x * delta;
  motionState.y += motionVelocity.y * delta;
  motionState.strength += (motionTarget.strength - motionState.strength) * (.055 * delta);
  const x = motionState.x.toFixed(3);
  const y = motionState.y.toFixed(3);
  const strength = motionState.strength.toFixed(3);
  const tiltX = `${(motionState.x * 1.8).toFixed(2)}deg`;
  const tiltY = `${(-motionState.y * 1.2).toFixed(2)}deg`;
  const root = document.documentElement.style;
  if (lastMotionCss.x !== x) { lastMotionCss.x = x; root.setProperty("--motion-x", x); }
  if (lastMotionCss.y !== y) { lastMotionCss.y = y; root.setProperty("--motion-y", y); }
  if (lastMotionCss.strength !== strength) { lastMotionCss.strength = strength; root.setProperty("--motion-strength", strength); }
  if (lastMotionCss.tiltX !== tiltX) { lastMotionCss.tiltX = tiltX; root.setProperty("--hero-tilt-x", tiltX); }
  if (lastMotionCss.tiltY !== tiltY) { lastMotionCss.tiltY = tiltY; root.setProperty("--hero-tilt-y", tiltY); }
};

const setPointerMotion = (event) => {
  pointerState.x = event.clientX;
  pointerState.y = event.clientY;
  pointerState.active = true;
  const x = (event.clientX / Math.max(1, innerWidth) - .5) * 2;
  const y = (event.clientY / Math.max(1, innerHeight) - .5) * 2;
  setMotion(x, y, Math.min(1, Math.hypot(x, y)));
  immersiveState.pointerX += (x - immersiveState.pointerX) * .08;
  immersiveState.pointerY += (y - immersiveState.pointerY) * .08;
};

window.addEventListener("pointermove", setPointerMotion, { passive: true });
document.documentElement.addEventListener("pointerleave", () => {
  pointerState.active = false;
  setMotion(0, 0, 0);
}, { passive: true });

const handleDeviceMotion = (event) => {
  const a = event.accelerationIncludingGravity;
  if (!a || prefersReducedMotion) return;
  const x = Math.max(-1, Math.min(1, (a.x || 0) / 5));
  const y = Math.max(-1, Math.min(1, (a.y || 0) / 5));
  setMotion(x, y, Math.min(1, Math.hypot(x, y)));
};

const handleDeviceOrientation = (event) => {
  if (prefersReducedMotion) return;
  const x = Math.max(-1, Math.min(1, (event.gamma || 0) / 30));
  const y = Math.max(-1, Math.min(1, ((event.beta || 0) - 45) / 30));
  setMotion(x, y, Math.min(1, Math.hypot(x, y)));
};

window.addEventListener("devicemotion", handleDeviceMotion, { passive: true });
window.addEventListener("deviceorientation", handleDeviceOrientation, { passive: true });
if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
  window.addEventListener("pointerdown", () => DeviceMotionEvent.requestPermission().catch(() => {}), { once: true, passive: true });
}

const canvasScale = () => Math.min(devicePixelRatio || 1, animationQuality === "low" ? 1 : 1.25);

const sizeCanvas = (canvas) => {
  if (!canvas) return;
  const scale = canvasScale();
  const nextWidth = Math.max(1, Math.round(innerWidth * scale));
  const nextHeight = Math.max(1, Math.round(innerHeight * scale));
  if (canvas.width === nextWidth && canvas.height === nextHeight) return;
  canvas.width = nextWidth;
  canvas.height = nextHeight;
};

const fractalLayer = document.createElement("canvas");
const fractalContext = fractalLayer.getContext("2d", { alpha: true });
const smokeMaskLayer = document.createElement("canvas");
const smokeMaskContext = smokeMaskLayer.getContext("2d", { alpha: true });
const hashUnit = (value) => {
  let n = Math.imul((value * 4096) | 0 ^ 0x9e3779b9, 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
let smokeEmitters = [];
let smokeClouds = [];
const setupSmokeEmitters = () => {
  const count = animationQuality === "low" ? 5 : 8;
  smokeEmitters = Array.from({ length: count }, (_, index) => ({
    x: .08 + hashUnit(index + 1.2) * .84,
    y: .12 + hashUnit(index + 4.7) * .72,
    radius: .13 + hashUnit(index + 8.1) * .17,
    phase: hashUnit(index + 12.4) * Math.PI * 2,
    speed: .055 + hashUnit(index + 16.8) * .11,
    orbitX: .025 + hashUnit(index + 20.1) * .095,
    orbitY: .025 + hashUnit(index + 24.9) * .08,
  }));
  smokeClouds = smokeEmitters.map((_, index) => ({ x: 0, y: 0, radius: 0, life: 0, phase: 0, index }));
};
setupSmokeEmitters();

const setupPerceptionField = () => {
  if (!perceptionVisual || !perceptionContext) return;
  perceptionField.length = 0;
  const count = animationQuality === "low" ? 4 : 7;
  for (let index = 0; index < count; index += 1) {
    perceptionField.push({
      x: .08 + hashUnit(index + 31.2) * .84,
      y: .12 + hashUnit(index + 42.7) * .76,
      radius: .08 + hashUnit(index + 52.1) * .11,
      seed: index * 13.37 + 9,
      glyph: perceptionChars[Math.floor(hashUnit(index + 62.4) * perceptionChars.length)],
    });
  }
  sizeCanvas(perceptionVisual);
};

const renderPerceptionField = (now) => {
  if (!perceptionVisual || !perceptionContext) return;
  const elapsed = now - perceptionLastFrame;
  if (elapsed < renderInterval()) return;
  perceptionLastFrame = now;
  sceneClock.now = now;
  const energy = audioEnergy(now);
  const scale = canvasScale();
  perceptionContext.setTransform(scale, 0, 0, scale, 0, 0);
  perceptionContext.clearRect(0, 0, innerWidth, innerHeight);
  if (!immersiveState.active) {
    drawSmoke(perceptionContext, innerWidth, innerHeight, energy, now, .3);
  }
  drawWindField(perceptionContext, innerWidth, innerHeight, energy, now);
  perceptionContext.font = "11px ui-monospace, monospace";
  const live = immersiveState.active;
  for (let index = 0; index < perceptionField.length; index += 1) {
    const node = perceptionField[index];
    const breath = Math.max(0, Math.sin(now * .00018 + node.seed));
    const x = node.x * innerWidth + motionState.x * (8 + index * 1.3) + windState.x * (10 + index);
    const y = node.y * innerHeight + motionState.y * (6 + index) + windState.y * (8 + index * .6);
    perceptionContext.fillStyle = `rgba(214,165,104,${(live ? .03 : .018) + breath * (live ? .09 : .055)})`;
    perceptionContext.fillText(node.glyph, x, y);
  }
};

setupPerceptionField();
window.addEventListener("resize", setupPerceptionField, { passive: true });

const windState = { x: .55, y: -.14, gust: .4, angle: -.22 };
const windMotes = [];
const windDigits = [];
let windDigitAt = 0;
let windLastTick = 0;

const spawnWindMote = (anywhere = false) => {
  const fromLeft = windState.x >= 0;
  const fromTop = windState.y >= 0;
  let x;
  let y;
  if (anywhere) {
    x = Math.random() * innerWidth;
    y = Math.random() * innerHeight;
  } else if (Math.abs(windState.x) > Math.abs(windState.y)) {
    x = fromLeft ? -16 - Math.random() * 40 : innerWidth + 16 + Math.random() * 40;
    y = Math.random() * innerHeight;
  } else {
    x = Math.random() * innerWidth;
    y = fromTop ? -16 - Math.random() * 40 : innerHeight + 16 + Math.random() * 40;
  }
  return {
    x,
    y,
    z: .4 + Math.random() * .9,
    size: .5 + Math.random() * 1.9,
    wobble: Math.random() * Math.PI * 2,
    ember: Math.random() > .82,
  };
};

const spawnWindDigit = () => {
  const fromLeft = windState.x >= 0;
  return {
    x: fromLeft ? -28 : innerWidth + 28,
    y: innerHeight * (.1 + Math.random() * .78),
    z: .55 + Math.random() * .7,
    size: 10 + Math.random() * 20,
    rot: (Math.random() - .5) * .8,
    spin: (Math.random() - .5) * .035,
    glyph: perceptionChars[Math.floor(Math.random() * perceptionChars.length)],
    age: 0,
    ttl: 3.8 + Math.random() * 3.2,
  };
};

const setupWindField = () => {
  windMotes.length = 0;
  windDigits.length = 0;
  const count = prefersReducedMotion ? 10 : animationQuality === "low" ? 32 : 64;
  for (let index = 0; index < count; index += 1) windMotes.push(spawnWindMote(true));
};

const updateWind = (now, energy, delta) => {
  const time = now * .00012;
  const sway = Math.sin(time * 1.7) * .18 + Math.sin(time * .43) * .12;
  windState.angle += (sway + motionState.x * .04) * .018 * delta;
  const targetGust = .28 + energy.avg * .85 + energy.bass * .45 + motionState.strength * .35;
  windState.gust += (targetGust - windState.gust) * .045 * delta;
  windState.x = Math.cos(windState.angle) * (1.15 + windState.gust);
  windState.y = Math.sin(windState.angle) * (.32 + windState.gust * .28) - .12;
};

const recycleWindMote = (mote) => {
  const next = spawnWindMote(false);
  mote.x = next.x;
  mote.y = next.y;
  mote.z = next.z;
  mote.size = next.size;
  mote.wobble = next.wobble;
  mote.ember = next.ember;
};

const drawWindField = (ctx, width, height, energy, now) => {
  if (!ctx || prefersReducedMotion && !windMotes.length) return;
  const delta = Math.min(2.2, Math.max(.25, (now - (windLastTick || now)) / 16.67));
  windLastTick = now;
  updateWind(now, energy, delta);
  if (!windMotes.length) setupWindField();

  const live = .7 + energy.avg * .9;
  for (let index = 0; index < windMotes.length; index += 1) {
    const mote = windMotes[index];
    const speed = (1.1 + mote.z * 1.8) * live;
    mote.wobble += .04 * delta;
    mote.x += (windState.x * 1.8 + Math.sin(mote.wobble) * .35) * speed * delta;
    mote.y += (windState.y * 1.4 + Math.cos(mote.wobble * .7) * .22) * speed * delta;
    if (mote.x < -48 || mote.x > width + 48 || mote.y < -48 || mote.y > height + 48) recycleWindMote(mote);
    const alpha = (.045 + mote.z * .07) * (immersiveState.active ? 1.15 : 1);
    ctx.fillStyle = mote.ember
      ? `rgba(232,156,92,${alpha * 1.6})`
      : `rgba(236,214,176,${alpha})`;
    ctx.fillRect(mote.x, mote.y, mote.size * mote.z, mote.size * .45);
  }

  const digitGap = prefersReducedMotion ? 6400 : animationQuality === "low" ? 2200 : 1400;
  const wantDigit = now - windDigitAt > digitGap
    && windDigits.length < (animationQuality === "low" ? 3 : 6)
    && (energy.flux > .12 || hashUnit(now * .0013) > .72);
  if (wantDigit) {
    windDigits.push(spawnWindDigit());
    windDigitAt = now;
  }

  ctx.save();
  ctx.font = "500 14px ui-monospace, SFMono-Regular, Consolas, monospace";
  for (let index = windDigits.length - 1; index >= 0; index -= 1) {
    const digit = windDigits[index];
    const speed = (1.2 + digit.z * 1.6) * live;
    digit.age += delta * .016;
    digit.x += windState.x * 2.4 * speed * delta;
    digit.y += (windState.y * 1.6 + Math.sin(digit.age * 2.2) * .18) * speed * delta;
    digit.rot += digit.spin * delta;
    const fade = Math.min(1, digit.age * 1.8, (digit.ttl - digit.age) * 1.1);
    if (digit.age > digit.ttl || digit.x < -80 || digit.x > width + 80 || digit.y < -80 || digit.y > height + 80) {
      windDigits.splice(index, 1);
      continue;
    }
    ctx.save();
    ctx.translate(digit.x, digit.y);
    ctx.rotate(digit.rot);
    ctx.globalAlpha = Math.max(0, fade) * (.22 + energy.high * .28);
    ctx.fillStyle = digit.glyph === "0" || digit.glyph === "1"
      ? "rgba(211,255,105,.95)"
      : "rgba(244,214,168,.95)";
    ctx.font = `${Math.round(digit.size)}px ui-monospace, monospace`;
    ctx.fillText(digit.glyph, 0, 0);
    ctx.restore();
  }
  ctx.restore();
};
setupWindField();
window.addEventListener("resize", setupWindField, { passive: true });

const ensureAudioContext = async () => {
  if (!audioContext || isFileMode || !canUseNetwork) return null;
  try {
    sharedAudioContext ||= new audioContext();
    if (sharedAudioContext.state !== "running") await sharedAudioContext.resume();
    return sharedAudioContext.state === "running" ? sharedAudioContext : null;
  } catch {
    return null;
  }
};

const attachPlaybackAnalysis = async () => {
  const context = await ensureAudioContext();
  const node = getAudioNode(player, context);
  if (!node) return;
  activeAudioNode = node;
  immersiveState.analyser = node.analyser;
  immersiveState.data = node.data;
};

const getAudioNode = (audio, context = sharedAudioContext) => {
  if (!context || context.state !== "running" || !audio) return null;
  if (audioNodes.has(audio)) return audioNodes.get(audio);
  try {
    const source = context.createMediaElementSource(audio);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = .82;
    source.connect(analyser);
    analyser.connect(context.destination);
    const node = { context, analyser, data: new Uint8Array(analyser.frequencyBinCount) };
    audioNodes.set(audio, node);
    return node;
  } catch {
    return null;
  }
};

const averageBand = (data, from, to) => {
  const start = Math.max(0, Math.floor(data.length * from));
  const end = Math.max(start + 1, Math.floor(data.length * to));
  let total = 0;
  for (let index = start; index < end; index += 1) total += data[index];
  return total / (end - start) / 255;
};

const audioEnergy = (now = performance.now()) => {
  if (now - spectrumState.at < 10) return spectrumState;
  spectrumState.at = now;
  const node = activeAudioNode || (immersiveState.analyser ? {
    analyser: immersiveState.analyser,
    data: immersiveState.data,
  } : null);
  let bass = 0;
  let mid = 0;
  let high = 0;
  let avg = 0;
  if (node?.analyser && node.data && player && !player.paused) {
    node.analyser.getByteFrequencyData(node.data);
    bass = averageBand(node.data, 0, .14);
    mid = averageBand(node.data, .14, .52);
    high = averageBand(node.data, .52, 1);
    avg = averageBand(node.data, 0, 1);
  }
  const flux = Math.min(1, Math.abs(avg - spectrumState.previous) * 8.5);
  spectrumState.previous = avg;
  spectrumState.bass += (bass - spectrumState.bass) * .24;
  spectrumState.mid += (mid - spectrumState.mid) * .2;
  spectrumState.high += (high - spectrumState.high) * .18;
  spectrumState.avg += (avg - spectrumState.avg) * .2;
  spectrumState.flux += (flux - spectrumState.flux) * .3;
  return spectrumState;
};

const ensureEffectLayers = (width, height) => {
  const targetWidth = Math.max(1, Math.round(width));
  const targetHeight = Math.max(1, Math.round(height));
  if (fractalLayer.width !== targetWidth || fractalLayer.height !== targetHeight) {
    fractalLayer.width = targetWidth;
    fractalLayer.height = targetHeight;
    smokeMaskLayer.width = targetWidth;
    smokeMaskLayer.height = targetHeight;
  }
};

const smokeCloudsAt = (width, height, energy, now) => {
  const time = now * .001;
  const pointerX = immersiveState.active ? immersiveState.pointerX : motionState.x;
  const pointerY = immersiveState.active ? immersiveState.pointerY : motionState.y;
  const size = Math.min(width, height);
  for (let index = 0; index < smokeEmitters.length; index += 1) {
    const emitter = smokeEmitters[index];
    const cloud = smokeClouds[index];
    const lifeWave = (Math.sin(time * emitter.speed * Math.PI * 2 + emitter.phase) + 1) * .5;
    cloud.x = (emitter.x + Math.sin(time * emitter.speed + emitter.phase) * emitter.orbitX) * width + pointerX * (9 + index * 1.8);
    cloud.y = (emitter.y + Math.cos(time * emitter.speed * .77 + emitter.phase) * emitter.orbitY) * height + pointerY * (7 + index * 1.4);
    cloud.life = .12 + Math.pow(lifeWave, 1.7) * .88;
    cloud.radius = size * emitter.radius * (.62 + cloud.life * .52 + energy.bass * .3);
    cloud.phase = emitter.phase;
    cloud.index = index;
  }
  return smokeClouds;
};

const traceFractalBranch = (ctx, x, y, length, angle, depth, seed, now, energy) => {
  if (depth < 0 || length < 3) return;
  const time = now * .00022;
  const bend = (hashUnit(seed + depth * 3.1) - .5) * 1.2 + Math.sin(time + seed) * (.12 + energy.mid * .18);
  const endAngle = angle + bend;
  const endX = x + Math.cos(endAngle) * length;
  const endY = y + Math.sin(endAngle) * length;
  const normal = angle + Math.PI * .5;
  const kink = (hashUnit(seed + 8.8) - .5) * length * .44;
  const controlX = (x + endX) * .5 + Math.cos(normal) * kink;
  const controlY = (y + endY) * .5 + Math.sin(normal) * kink;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(controlX, controlY, endX, endY);
  ctx.stroke();
  if (depth === 0) {
    ctx.beginPath();
    ctx.arc(endX, endY, .7 + energy.high * 2.2, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  const spread = .34 + hashUnit(seed + 14.2) * .56;
  const shrink = .53 + hashUnit(seed + 19.6) * .15;
  traceFractalBranch(ctx, endX, endY, length * shrink, endAngle - spread, depth - 1, seed * 1.37 + 2.1, now, energy);
  traceFractalBranch(ctx, endX, endY, length * (shrink - .035), endAngle + spread * .82, depth - 1, seed * 1.61 + 5.4, now, energy);
  if (depth > 1 && hashUnit(seed + 27.3) > .72) {
    traceFractalBranch(ctx, endX, endY, length * .42, endAngle + Math.PI * (.68 + hashUnit(seed) * .28), depth - 2, seed * 1.83, now, energy);
  }
};

const traceFractalCell = (ctx, cx, cy, radius, seed, now, energy, depth) => {
  const sides = 5 + Math.floor(hashUnit(seed + 3) * 4);
  const turn = now * .000025 * (hashUnit(seed + 8) > .5 ? 1 : -1);
  for (let ring = 1; ring <= 3; ring += 1) {
    const points = [];
    for (let point = 0; point < sides; point += 1) {
      const angle = turn + (point / sides) * Math.PI * 2 + (hashUnit(seed + point * 2.7 + ring) - .5) * .7;
      const mutation = .42 + ring * .2 + Math.sin(now * .00016 + seed + point) * .045;
      points.push({
        x: cx + Math.cos(angle) * radius * mutation,
        y: cy + Math.sin(angle) * radius * mutation * (.52 + hashUnit(seed + point) * .5),
      });
    }
    ctx.beginPath();
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      if (index === 0) ctx.moveTo(point.x, point.y);
      ctx.quadraticCurveTo(
        cx + (point.x + next.x - cx * 2) * (.52 + hashUnit(seed + index) * .18),
        cy + (point.y + next.y - cy * 2) * (.52 + hashUnit(seed + index + 2) * .18),
        next.x,
        next.y,
      );
    });
    ctx.closePath();
    ctx.stroke();
    if (ring === 2) {
      points.forEach((point, index) => {
        if (index % 2) return;
        const angle = Math.atan2(point.y - cy, point.x - cx);
        traceFractalBranch(ctx, point.x, point.y, radius * .28, angle, depth, seed + index * 11.3, now, energy);
      });
    }
  }
};

const paintFractalLattice = (ctx, width, height, energy, now) => {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = .42 + energy.high * .8;
  ctx.strokeStyle = `rgba(231,176,111,${.28 + energy.mid * .42})`;
  ctx.shadowBlur = animationQuality === "low" ? 0 : 2 + energy.bass * 6;
  ctx.shadowColor = `rgba(190,73,40,${.22 + energy.bass * .28})`;
  const depth = animationQuality === "low" ? 1 : 2;
  perceptionField.forEach((field, index) => {
    const parallax = .3 + index / Math.max(1, perceptionField.length);
    const x = field.x * width + motionState.x * 24 * parallax;
    const y = field.y * height + motionState.y * 18 * parallax;
    const radius = Math.min(width, height) * (field.radius + energy.bass * .025);
    traceFractalCell(ctx, x, y, radius, field.seed, now, energy, depth);
    traceFractalBranch(
      ctx,
      x,
      y,
      radius * 1.1,
      field.seed + now * .00004,
      depth + 1,
      field.seed * 2.3,
      now,
      energy,
    );
  });
  ctx.restore();
};

const paintSmokeMask = (ctx, width, height, clouds, energy, now) => {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  clouds.forEach((cloud) => {
    const lobes = animationQuality === "low" ? 2 : 3;
    for (let lobe = 0; lobe < lobes; lobe += 1) {
      const angle = cloud.phase + lobe * 1.73 + now * .00008;
      const x = cloud.x + Math.cos(angle) * cloud.radius * .22;
      const y = cloud.y + Math.sin(angle * 1.13) * cloud.radius * .18;
      const radius = cloud.radius * (.62 + hashUnit(cloud.index * 9 + lobe) * .44);
      const gradient = ctx.createRadialGradient(x, y, radius * .04, x, y, radius);
      gradient.addColorStop(0, `rgba(255,255,255,${.62 * cloud.life})`);
      gradient.addColorStop(.36, `rgba(255,255,255,${.38 * cloud.life})`);
      gradient.addColorStop(.72, `rgba(255,255,255,${.09 * cloud.life})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  });
  ctx.restore();
};

const drawSmokeRevealedFractal = (ctx, width, height, energy, now, intensity = 1) => {
  if (!fractalContext || !smokeMaskContext || !perceptionField.length) return;
  const layerScale = animationQuality === "low" ? .32 : .46;
  const layerW = Math.max(1, Math.round(width * layerScale));
  const layerH = Math.max(1, Math.round(height * layerScale));
  ensureEffectLayers(layerW, layerH);
  const clouds = smokeCloudsAt(layerW, layerH, energy, now);
  paintFractalLattice(fractalContext, layerW, layerH, energy, now);
  paintSmokeMask(smokeMaskContext, layerW, layerH, clouds, energy, now);
  fractalContext.save();
  fractalContext.globalCompositeOperation = "destination-in";
  fractalContext.drawImage(smokeMaskLayer, 0, 0);
  fractalContext.restore();
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = intensity * (.48 + energy.avg * .65);
  ctx.drawImage(fractalLayer, -motionState.x * 1.6, -motionState.y * 1.2, width, height);
  ctx.globalAlpha = intensity * (.12 + energy.high * .25);
  ctx.drawImage(fractalLayer, motionState.x * 4 + 2, motionState.y * 3 - 1, width, height);
  ctx.restore();
};

const drawGrid = drawSmokeRevealedFractal;

const drawSmoke = (ctx, width, height, energy, now, intensity = 1) => {
  const clouds = smokeCloudsAt(width, height, energy, now);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  clouds.forEach((cloud) => {
    const lobes = 2;
    for (let lobe = 0; lobe < lobes; lobe += 1) {
      const angle = cloud.phase + lobe * 2.15 + now * .00011;
      const x = cloud.x + Math.cos(angle) * cloud.radius * .08;
      const y = cloud.y + Math.sin(angle * .83) * cloud.radius * .06;
      const radius = cloud.radius * (.2 + hashUnit(cloud.index * 7 + lobe) * .12);
      const alpha = intensity * cloud.life * (.018 + energy.avg * .03);
      const gradient = ctx.createRadialGradient(x, y, radius * .08, x, y, radius);
      gradient.addColorStop(0, `rgba(236,214,176,${alpha})`);
      gradient.addColorStop(.45, `rgba(168,112,74,${alpha * .45})`);
      gradient.addColorStop(1, "rgba(20,16,12,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  });
  ctx.restore();
};

const drawElectricity = (ctx, width, height, energy, now) => {
  const frame = Math.floor(now / 72);
  const impulse = Math.min(1, energy.flux * 2.4 + energy.high * .7 + energy.bass * .38);
  if (hashUnit(frame * 4.1) > impulse) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const bolts = 1 + Math.floor(impulse * 3);
  for (let bolt = 0; bolt < bolts; bolt += 1) {
    const seed = frame * 17 + bolt * 23;
    const field = perceptionField[Math.floor(hashUnit(seed) * perceptionField.length)] || { x: .5, y: .3 };
    let x = field.x * width;
    let y = field.y * height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 7 + Math.floor(hashUnit(seed + 2) * 10);
    for (let step = 0; step < steps; step += 1) {
      x += (hashUnit(seed + step * 8.3) - .5) * (48 + energy.high * 80);
      y += (hashUnit(seed + step * 5.7 + 4) - .22) * (42 + energy.bass * 55);
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(232,255,178,${.12 + impulse * .55})`;
    ctx.lineWidth = .65 + energy.high * 2.4;
    ctx.shadowBlur = animationQuality === "low" ? 0 : 6 + energy.bass * 12;
    ctx.shadowColor = "rgba(224,108,61,.85)";
    ctx.stroke();
  }
  ctx.restore();
};

const immersiveContext = immersiveVisual?.getContext("2d");

const drawImmersiveScene = (now) => {
  if (!immersiveState.active || !immersiveVisual || !immersiveContext) return;
  const elapsed = now - immersiveState.lastDraw;
  if (elapsed < renderInterval()) return;
  immersiveState.lastDraw = now;
  const energy = audioEnergy(now);
  sceneClock.now = now;
  sceneClock.energy = energy.avg;
  sceneClock.bass = energy.bass;
  const scale = canvasScale();
  immersiveContext.setTransform(scale, 0, 0, scale, 0, 0);
  immersiveContext.clearRect(0, 0, innerWidth, innerHeight);
  drawSmoke(immersiveContext, innerWidth, innerHeight, energy, now, 1.28);
  drawSmokeRevealedFractal(immersiveContext, innerWidth, innerHeight, energy, now, 1.22);
  drawElectricity(immersiveContext, innerWidth, innerHeight, energy, now);
};

const drawLiquid = drawImmersiveScene;

const resizeInkField = () => {
  if (!inkField || !inkContext) return;
  inkFieldBounds = inkField.getBoundingClientRect();
  const scale = Math.min(devicePixelRatio || 1, animationQuality === "low" ? 1 : 1.25);
  const nextWidth = Math.max(1, Math.round(inkFieldBounds.width * scale));
  const nextHeight = Math.max(1, Math.round(inkFieldBounds.height * scale));
  if (inkField.width !== nextWidth || inkField.height !== nextHeight) {
    inkField.width = nextWidth;
    inkField.height = nextHeight;
  }
  inkParticles = [];
};

const emitTitleInk = (now, energy) => {
  if (!inkField || !inkFieldBounds) return;
  const titles = trackTitleNodes.length ? trackTitleNodes : document.querySelectorAll(".track-title");
  const limit = animationQuality === "low" ? 60 : 110;
  for (let titleIndex = 0; titleIndex < titles.length; titleIndex += 1) {
    const title = titles[titleIndex];
    const item = title.closest(".track-item");
    if (!item || item.classList.contains("is-departing")) continue;
    const rect = title.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight || rect.width < 2) continue;
    const amount = 1 + (energy.bass > .24 && (titleIndex + Math.floor(now / 120)) % 2 === 0 ? 1 : 0);
    for (let count = 0; count < amount && inkParticles.length < limit; count += 1) {
      const x = rect.left - inkFieldBounds.left + Math.random() * rect.width;
      const y = rect.top - inkFieldBounds.top + rect.height * (.62 + Math.random() * .24);
      const direction = Math.random() < .5 ? -1 : 1;
      inkParticles.push({
        x,
        y,
        previousX: x,
        previousY: y,
        vx: direction * (.08 + Math.random() * .34) + motionState.x * .08,
        vy: -.2 + Math.random() * .42,
        size: 2.1 + Math.random() * 5.2 + energy.bass * 3.4,
        age: 0,
        decay: .0026 + Math.random() * .0024,
        seed: Math.random() * Math.PI * 2,
        spin: direction * (.18 + Math.random() * .45),
      });
    }
  }
};

const updateInkParticle = (particle, now, delta) => {
  particle.previousX = particle.x;
  particle.previousY = particle.y;
  const current = now * .00045 + particle.seed;
  particle.vx += Math.sin(current + particle.y * .011) * .018 * delta;
  particle.vy += Math.cos(current * 1.17 + particle.x * .008) * .012 * delta;
  particle.vy -= .006 * delta;

  if (pointerState.active && inkFieldBounds) {
    const pointerX = pointerState.x - inkFieldBounds.left;
    const pointerY = pointerState.y - inkFieldBounds.top;
    const dx = particle.x - pointerX;
    const dy = particle.y - pointerY;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const radius = 155;
    if (distance < radius) {
      const force = Math.pow(1 - distance / radius, 2) * .24 * delta;
      particle.vx += dx / distance * force;
      particle.vy += dy / distance * force;
      particle.spin += (dx / distance) * .008;
    }
  }

  particle.vx += windState.x * .11 * delta;
  particle.vy += windState.y * .08 * delta;
  particle.vx *= 1 - .014 * delta;
  particle.vy *= 1 - .012 * delta;
  particle.x += particle.vx * delta;
  particle.y += particle.vy * delta;
  particle.age += particle.decay * delta;
  if (particle.size < 8) particle.size += .012 * delta;
};

const inkSprite = document.createElement("canvas");
inkSprite.width = 48;
inkSprite.height = 48;
{
  const spriteContext = inkSprite.getContext("2d");
  const gradient = spriteContext.createRadialGradient(24, 24, 0, 24, 24, 24);
  gradient.addColorStop(0, "rgba(42,22,16,.85)");
  gradient.addColorStop(.42, "rgba(92,48,32,.38)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  spriteContext.fillStyle = gradient;
  spriteContext.fillRect(0, 0, 48, 48);
}

const drawInkParticle = (ctx, particle) => {
  const alpha = Math.max(0, 1 - particle.age);
  if (alpha <= 0) return;
  const length = particle.size * (1.05 + particle.age * .85);
  const breadth = particle.size * (.62 + particle.age * .15);
  ctx.save();
  ctx.translate(particle.x, particle.y);
  ctx.rotate(Math.atan2(particle.vy, particle.vx || .001));
  ctx.globalAlpha = alpha * .62;
  ctx.drawImage(inkSprite, -length, -breadth * .5, length * 2, breadth);
  ctx.restore();
};

const renderInkField = (now) => {
  if (!inkField || !inkContext) return;
  if (!inkFieldBounds?.width) resizeInkField();
  if (now - inkLastFrame < renderInterval()) return;
  const scale = inkField.width / Math.max(1, inkFieldBounds?.width || 1);
  const delta = Math.min(2.3, Math.max(.25, (now - inkLastFrame) / 16.67));
  inkLastFrame = now;
  inkContext.setTransform(scale, 0, 0, scale, 0, 0);
  inkContext.clearRect(0, 0, inkFieldBounds.width, inkFieldBounds.height);
  const energy = audioEnergy(now);
  const emissionDelay = prefersReducedMotion ? 420 : Math.max(74, 132 - energy.avg * 62);
  if (now - inkLastEmission > emissionDelay) {
    emitTitleInk(now, energy);
    inkLastEmission = now;
  }
  for (let index = 0; index < inkParticles.length; index += 1) {
    const particle = inkParticles[index];
    updateInkParticle(particle, now, delta);
    drawInkParticle(inkContext, particle);
  }
  let write = 0;
  const maxX = inkFieldBounds.width + 120;
  const maxY = inkFieldBounds.height + 120;
  for (let index = 0; index < inkParticles.length; index += 1) {
    const particle = inkParticles[index];
    if (particle.age < 1 && particle.x > -120 && particle.x < maxX && particle.y > -120 && particle.y < maxY) {
      inkParticles[write] = particle;
      write += 1;
    }
  }
  inkParticles.length = write;
};

const mutateGlyphString = (text, intensity, frame, seed = 0) => {
  let result = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === " ") {
      result += character;
      continue;
    }
    const gate = hashUnit(frame * .83 + index * 7.19 + seed * 13.7);
    result += gate > intensity
      ? character
      : titleGlyphs[Math.floor(hashUnit(frame * 2.17 + index * 11.3 + seed) * titleGlyphs.length)];
  }
  return result;
};

let playingLetterMode = "rest";
let playingLetterUntil = 0;
let playingLetterNext = 0;
let playingLetterTitle = "";

const playingLetters = () => (nowPlayingTitle ? [...nowPlayingTitle.querySelectorAll(".play-letter")] : []);

const paintPlayingTitle = (title) => {
  if (!nowPlayingTitle) return [];
  const existing = playingLetters();
  if (playingLetterTitle === title && existing.length) return existing;
  playingLetterTitle = title;
  playingLetterMode = "rest";
  playingLetterUntil = 0;
  playingLetterNext = 0;
  nowPlayingTitle.replaceChildren(...[...title].map((char) => {
    const letter = document.createElement("span");
    letter.className = "play-letter";
    letter.dataset.char = char;
    letter.textContent = char === " " ? "\u00a0" : char;
    return letter;
  }));
  return playingLetters();
};

const restorePlayingLetters = (letters) => {
  letters.forEach((letter) => {
    const char = letter.dataset.char || "";
    letter.textContent = char === " " ? "\u00a0" : char;
    letter.style.transform = "";
  });
};

const renderPlayingLetters = (now) => {
  if (!nowPlayingTitle) return;
  const playing = Boolean(currentTrack && player && !player.paused);
  if (!playing || prefersReducedMotion) {
    if (playingLetterTitle) {
      nowPlayingTitle.textContent = currentTrack?.title || playingLetterTitle;
      playingLetterTitle = "";
      playingLetterMode = "rest";
    }
    return;
  }
  const letters = paintPlayingTitle(currentTrack.title || "");
  if (!letters.length) return;
  if (playingLetterMode === "rest") {
    if (!playingLetterNext) playingLetterNext = now + 3200 + Math.random() * 4800;
    if (now < playingLetterNext) return;
    playingLetterMode = Math.random() < 0.5 ? "stair" : "glyphs";
    playingLetterUntil = now + (playingLetterMode === "stair" ? 1680 : 1280);
    return;
  }
  if (now >= playingLetterUntil) {
    restorePlayingLetters(letters);
    playingLetterMode = "rest";
    playingLetterNext = now + 8000 + Math.random() * 7000;
    return;
  }
  const duration = playingLetterMode === "stair" ? 1680 : 1280;
  const progress = 1 - Math.max(0, (playingLetterUntil - now) / duration);
  if (playingLetterMode === "stair") {
    const shift = Math.floor(progress * 5);
    const scales = [0.78, 0.92, 1.08, 1.26];
    letters.forEach((letter, index) => {
      if (letter.dataset.char === " ") {
        letter.style.transform = "";
        return;
      }
      letter.textContent = letter.dataset.char;
      letter.style.transform = `scale(${scales[(index + shift) % scales.length]})`;
    });
    return;
  }
  const head = Math.floor(progress * (letters.length + 2));
  letters.forEach((letter, index) => {
    letter.style.transform = "";
    const char = letter.dataset.char || "";
    if (char === " ") {
      letter.textContent = "\u00a0";
      return;
    }
    const passing = head - index;
    letter.textContent = passing >= 0 && passing < 3
      ? titleGlyphs[Math.floor(hashUnit(Math.floor(now / 70) + index * 9.1) * titleGlyphs.length)]
      : char;
  });
};

const renderTitleMutation = (now) => {
  if (now - titleLastFrame < (animationQuality === "low" ? 120 : 68)) return;
  titleLastFrame = now;
  const frame = Math.floor(now / (prefersReducedMotion ? 210 : 76));
  const titles = trackTitleNodes.length ? trackTitleNodes : document.querySelectorAll(".track-title");
  const mutateTitle = (element, index) => {
    const original = element.dataset.originalText || element.textContent || "";
    if (!element.dataset.originalText) element.dataset.originalText = original;
    const hovering = Boolean(element.closest(".track-item")?.matches(":hover, :focus-within"));
    const phase = (now * .001 + index * 1.31) % 7.4;
    const wave = phase < .88 ? Math.sin((phase / .88) * Math.PI) : 0;
    const intensity = Math.min(.34, wave * .24 + (hovering ? .1 : 0));
    element.classList.toggle("is-scrambling", intensity > .05);
    element.textContent = intensity > .05
      ? mutateGlyphString(original, intensity, frame, index + 1)
      : original;
  };
  for (let index = 0; index < titles.length; index += 1) mutateTitle(titles[index], index);
  if (immersiveTitle) mutateTitle(immersiveTitle, titles.length);
};

const renderLogoSymbolEcho = (now, energy) => {
  if (!logoSymbolEcho) return;
  const phase = (now * .001) % 11.6;
  const mutationWave = phase > 5.4 && phase < 7.6
    ? Math.sin(((phase - 5.4) / 2.2) * Math.PI)
    : 0;
  const intensity = Math.min(.94, mutationWave * .82 + energy.high * .16);
  const frame = Math.floor(now / (prefersReducedMotion ? 240 : 68));
  logoSymbolEcho.textContent = intensity > .04
    ? mutateGlyphString(logoText, intensity, frame, 47)
    : logoText;
  logoSymbolEcho.style.setProperty("--symbol-opacity", (.035 + mutationWave * .19 + energy.avg * .14).toFixed(3));
  logoSymbolEcho.style.setProperty("--symbol-blur", `${(1.1 + mutationWave * 2.8 + energy.bass * 2).toFixed(2)}px`);
};

const updateTrackFold = () => {
  if (!playlistList) return;
  const items = trackItemNodes.length ? trackItemNodes : [...playlistList.querySelectorAll(".track-item")];
  const overflowing = items.length > TRACK_VIEW;
  const bounds = playlistList.getBoundingClientRect();
  const mid = bounds.top + bounds.height / 2;
  const half = Math.max(1, bounds.height / 2);
  const live = Boolean((currentTrack || immersiveState.active) && player && !player.paused);
  const energy = live ? audioEnergy() : spectrumState;
  trackPlayBlend += ((live ? 1 : 0) - trackPlayBlend) * 0.055;
  if (Math.abs(trackPlayBlend - (live ? 1 : 0)) < 0.008) trackPlayBlend = live ? 1 : 0;
  const pulse = energy.bass * 10 + energy.flux * 6;
  const spread = 1.12 + trackPlayBlend * 0.42;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const card = item.querySelector(".track-fold") || item.querySelector(".track-meta") || item;
    item.style.transform = "";
    const button = item.querySelector(".track-select");
    if (button) button.style.transform = "";
    if (item.classList.contains("is-kept")) {
      const lift = 10 + trackPlayBlend * (6 + energy.bass * 8);
      card.style.transform = `translate3d(0, 0, ${lift}px) scale(${1 + trackPlayBlend * energy.avg * .02})`;
      item.style.opacity = "1";
      item.style.filter = "none";
      continue;
    }
    const rect = item.getBoundingClientRect();
    if (rect.bottom < bounds.top - 80 || rect.top > bounds.bottom + 80) {
      card.style.transform = "translate3d(0, 0, -180px) rotateX(0deg) scale(.62)";
      item.style.opacity = "0.28";
      item.style.filter = "blur(8px)";
      continue;
    }
    const hovered = item.matches(":hover, :focus-within");
    const offset = ((rect.top + rect.height / 2 - mid) / half) * spread;
    const fold = Math.min(1, Math.abs(offset));
    const depth = fold * (128 + trackPlayBlend * 36) + pulse * fold * trackPlayBlend;
    const rotateX = Math.max(-28, Math.min(28, offset * (20 + trackPlayBlend * 6)));
    const scale = Math.max(0.76, 1 - fold * (0.13 + trackPlayBlend * 0.05) + trackPlayBlend * energy.high * .02 * (1 - fold));
    // Keep the wheel's depth, not optical blur on readable track labels.
    const blur = 0;
    card.style.transform = `translate3d(0, ${offset * -5}px, ${-depth}px) rotateX(${rotateX}deg) scale(${scale})`;
    item.style.opacity = hovered ? "1" : String(Math.max(0.56, 1 - fold * 0.22));
    item.style.filter = `blur(${blur.toFixed(2)}px)`;
  }
};

const updateScrollbar = () => {
  if (!playlistList || !scrollbar || !scrollbarThumb) return;
  const overflow = (trackItemNodes.length || playlistList.querySelectorAll(".track-item").length) > TRACK_VIEW;
  playlistList.classList.toggle("has-overflow", overflow);
  scrollbar.hidden = !overflow;
  if (!overflow) {
    playlistList.scrollTop = 0;
    return;
  }
  const trackHeight = scrollbar.clientHeight;
  const thumbHeight = 12;
  const max = playlistList.scrollHeight - playlistList.clientHeight;
  const top = max <= 0 ? 0 : (playlistList.scrollTop / max) * (trackHeight - thumbHeight);
  scrollbarThumb.style.height = `${thumbHeight}px`;
  scrollbarThumb.style.transform = `translateY(${top}px)`;
};

const pointerPlaylistNudge = () => {
  // Hover is for choosing a track. Only wheel, touch or drag may scroll.
  return 0;
};

const loopPlaylistMotion = (now) => {
  if (now - playlistLastFrame < (animationQuality === "low" ? 90 : 50)) return;
  playlistLastFrame = now;
  if (pointerPlaylistNudge() && !playlistScrollRaf && playlistList) {
    playlistScrollTarget = playlistList.scrollTop;
    playlistScrollRaf = requestAnimationFrame(animatePlaylistScroll);
  }
  updateTrackFold();
  updateScrollbar();
};

const shuffle = (items) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
};

const setPlaybackStatus = (text = "", state = "") => {
  if (!playbackStatus) return;
  playbackStatus.textContent = text;
  playbackStatus.dataset.state = state;
};

const resolveTrackUrl = (track) => {
  const source = String(track?.audio || track?.file || "").replace(/\\/g, "/");
  if (!source) return "";
  try {
    return new URL(source, document.baseURI).href;
  } catch {
    return encodeURI(source);
  }
};

const findTrackForItem = (item) => {
  if (!item) return null;
  const index = Number(item.dataset.trackIndex);
  if (Number.isInteger(index) && tracks[index]) return tracks[index];
  const title = item.dataset.trackTitle
    || item.querySelector(".track-title")?.dataset.originalText
    || item.querySelector(".track-title")?.textContent?.trim()
    || "";
  const bundled = Array.isArray(window.INTEONMTECA_PLAYLIST) ? window.INTEONMTECA_PLAYLIST : [];
  const matchTitle = (candidate) => candidate?.title === title
    || (title && typeof candidate?.title === "string" && candidate.title.includes(title));
  return tracks.find(matchTitle) || bundled.find(matchTitle) || null;
};

const trackRowHeight = () => {
  const measured = playlistList?.querySelector(".track-item")?.offsetHeight || 0;
  if (measured > 1) return measured;
  return 72;
};

const bindTrackItem = (item, track) => {
  const button = item.querySelector(".track-select");
  if (!button || button.dataset.bound === "1") return;
  button.dataset.bound = "1";
  const play = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const resolved = track || findTrackForItem(item);
    if (resolved) playTrack(resolved, item);
  };
  button.addEventListener("click", play);
};

const createTrackItem = (track, index) => {
  const item = document.createElement("li");
  item.className = "track-item";
  item.dataset.trackTitle = track.title;
  item.dataset.trackIndex = String(index);
  const playing = currentTrack && (track === currentTrack || (track.audio || track.file) === (currentTrack.audio || currentTrack.file));
  if (playing) item.classList.add("is-playing");
  const button = document.createElement("button");
  button.className = "track-select";
  button.type = "button";
  button.setAttribute("aria-label", `Воспроизвести ${track.title}`);
  const meta = document.createElement("span");
  meta.className = "track-meta";
  const title = document.createElement("span");
  title.className = "track-title";
  title.dataset.originalText = track.title;
  title.dataset.ink = track.title;
  title.textContent = track.title;
  const artist = document.createElement("span");
  artist.className = "track-artist";
  artist.textContent = track.artist || "inteonmteca";
  meta.append(title, artist);
  const fold = document.createElement("span");
  fold.className = "track-fold";
  fold.append(meta);
  button.append(fold);
  item.append(button);
  bindTrackItem(item, track);
  return item;
};

const visibleTrackIndexes = () => tracks.map((_, index) => index).filter((index) => index !== currentTrackIndex);
const visibleTrackCount = () => Math.max(1, visibleTrackIndexes().length);
const shuffledTrackIndexes = () => shuffle(visibleTrackIndexes());

const appendWheelCycle = () => {
  if (!playlistList || !tracks.length) return 0;
  const before = playlistList.scrollHeight;
  shuffledTrackIndexes().forEach((index) => playlistList.append(createTrackItem(tracks[index], index)));
  return playlistList.scrollHeight - before;
};

const prependWheelCycle = () => {
  if (!playlistList || !tracks.length) return 0;
  const before = playlistList.scrollHeight;
  const fragment = document.createDocumentFragment();
  shuffledTrackIndexes().forEach((index) => fragment.append(createTrackItem(tracks[index], index)));
  playlistList.prepend(fragment);
  const added = playlistList.scrollHeight - before;
  playlistList.scrollTop += added;
  playlistScrollTarget += added;
  return added;
};

const trimInfiniteWheel = () => {
  if (!playlistList || !tracks.length) return;
  const cycle = visibleTrackCount();
  const limit = cycle * 8;
  if (playlistList.children.length <= limit) return;
  const cycleH = cycle * trackRowHeight();
  if (playlistList.scrollTop > cycleH * 2.4) {
    for (let index = 0; index < cycle; index += 1) playlistList.firstElementChild?.remove();
    playlistList.scrollTop = Math.max(0, playlistList.scrollTop - cycleH);
    playlistScrollTarget = Math.max(0, playlistScrollTarget - cycleH);
  } else if (playlistList.scrollHeight - playlistList.scrollTop - playlistList.clientHeight > cycleH * 2.4) {
    for (let index = 0; index < cycle; index += 1) playlistList.lastElementChild?.remove();
  }
};

const balanceInfiniteWheel = () => {
  if (wheelBalancing || !playlistList || !tracks.length) return;
  wheelBalancing = true;
  const cycleH = Math.max(trackRowHeight(), visibleTrackCount() * trackRowHeight());
  let guard = 0;
  while (guard < 6 && playlistScrollTarget < cycleH * 0.8) {
    prependWheelCycle();
    guard += 1;
  }
  guard = 0;
  while (guard < 6 && playlistScrollTarget + playlistList.clientHeight > playlistList.scrollHeight - cycleH * 0.8) {
    appendWheelCycle();
    guard += 1;
  }
  trimInfiniteWheel();
  refreshTrackNodes();
  wheelBalancing = false;
};

const fillInfiniteWheel = () => {
  if (!playlistList || !tracks.length) return;
  wheelBalancing = true;
  try {
    playlistList.replaceChildren();
    appendWheelCycle();
    appendWheelCycle();
    appendWheelCycle();
    let extra = 0;
    while (
      extra < 8
      && playlistList.scrollHeight > 0
      && playlistList.clientHeight > 0
      && (playlistList.children.length <= TRACK_VIEW
        || playlistList.scrollHeight <= playlistList.clientHeight + trackRowHeight())
    ) {
      appendWheelCycle();
      extra += 1;
    }
    refreshTrackNodes();
    const cycleH = visibleTrackCount() * trackRowHeight();
    playlistList.scrollTop = cycleH;
    playlistScrollTarget = playlistList.scrollTop;
    playlistScrollVelocity = 0;
  } catch {
    playlistList.replaceChildren(...tracks.map((track, index) => createTrackItem(track, index)));
    refreshTrackNodes();
  }
  wheelBalancing = false;
};

const nearestItemForTrackIndex = (index) => {
  const items = [...(playlistList?.querySelectorAll(`[data-track-index="${index}"]`) || [])];
  if (!items.length) return null;
  const bounds = playlistList.getBoundingClientRect();
  const mid = bounds.top + bounds.height / 2;
  return items.reduce((best, item) => {
    const y = item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2;
    const dist = Math.abs(y - mid);
    if (!best || dist < best.dist) return { item, dist };
    return best;
  }, null)?.item || items[0];
};

const centerWheelItem = (item) => {
  if (!item || !playlistList) return;
  const top = item.offsetTop - (playlistList.clientHeight - item.offsetHeight) / 2;
  playlistList.scrollTop = top;
  playlistScrollTarget = top;
  playlistScrollVelocity = 0;
  balanceInfiniteWheel();
};

const playTrack = (track, sourceItem = null, options = {}) => {
  if (!track) return;
  const now = performance.now();
  if (now - playLockAt < 220 && currentTrack === track) return;
  playLockAt = now;
  const requestId = ++playbackRequestId;
  currentTrack = track;
  setPlaybackStatus("", "");
  document.body.classList.add("is-track-diving");
  activePlayer?.classList.toggle("is-swapping", activePlayer.classList.contains("is-visible"));
  currentTrackIndex = tracks.findIndex((candidate) => (
    candidate === track
    || candidate.audio === track.audio
    || candidate.file === track.file
  ));
  if (currentTrackIndex < 0 && Array.isArray(window.INTEONMTECA_PLAYLIST)) {
    tracks = tracks.length ? tracks : shuffle(window.INTEONMTECA_PLAYLIST.filter((item) => item?.audio));
    currentTrackIndex = tracks.findIndex((candidate) => (
      candidate.audio === track.audio || candidate.title === track.title
    ));
  }
  if (!sourceItem && currentTrackIndex >= 0) {
    sourceItem = nearestItemForTrackIndex(currentTrackIndex);
  }
  const src = resolveTrackUrl(track);
  const assigned = player ? (player.getAttribute("src") || player.src || "") : "";
  if (player && src && assigned !== src && player.src !== src) player.src = src;
  if (player && src && !options.audioStarted) {
    const attempt = player.play();
    if (attempt && typeof attempt.then === "function") {
      attempt.then(() => {
        if (requestId !== playbackRequestId) return;
        setPlaybackStatus();
        attachPlaybackAnalysis();
        syncTransport();
      }).catch((error) => {
        if (requestId !== playbackRequestId) return;
        if (error?.name === "AbortError") {
          player.play().catch(() => {});
          return;
        }
        const message = error?.name === "NotAllowedError"
          ? "нажми ▶ чтобы пустить звук"
          : error?.name === "NotSupportedError"
            ? "этот файл браузер не играет"
            : "звук не открылся — нажми ▶";
        setPlaybackStatus(message, "error");
        syncTransport();
      });
    } else {
      attachPlaybackAnalysis();
      syncTransport();
    }
  } else if (player && src && options.audioStarted) {
    attachPlaybackAnalysis();
    syncTransport();
  } else if (!src) {
    setPlaybackStatus("нет аудиофайла", "error");
  }
  [...(playlistList?.querySelectorAll(".track-item") || [])].forEach((item) => {
    const same = Number(item.dataset.trackIndex) === currentTrackIndex;
    item.classList.toggle("is-kept", Boolean(sourceItem) && item === sourceItem);
    item.classList.toggle("is-playing", same);
    item.classList.remove("is-departing");
    if (sourceItem && item === sourceItem) {
      item.style.opacity = "1";
      item.style.filter = "none";
      item.classList.add("is-departing");
    }
  });
  updateTrackFold();
  window.setTimeout(() => {
    if (currentTrack !== track) return;
    fillInfiniteWheel();
    updateTrackFold();
    updateScrollbar();
    enterImmersiveMode(player, track);
  }, prefersReducedMotion ? 0 : 400);
};

const renderPlaylist = (playlist, { force = false } = {}) => {
  if (!Array.isArray(playlist) || !playlistList) return false;
  const discovered = playlist.filter((track) => track?.audio && !String(track.audio).toLowerCase().includes("wave-phonk"));
  const nextSignature = discovered
    .map((track) => String(track.id || track.audio))
    .sort((left, right) => left.localeCompare(right))
    .join("|");
  if (!force && tracks.length && nextSignature === playlistSignature) return false;
  if (!discovered.length) {
    tracks = [];
    playlistSignature = "";
    currentTrackIndex = -1;
    const emptyState = document.createElement("li");
    emptyState.className = "track-empty";
    emptyState.textContent = "media ожидает сигнал";
    playlistList.replaceChildren(emptyState);
    playlistScrollTarget = 0;
    playlistScrollVelocity = 0;
    refreshTrackNodes();
    updateScrollbar();
    return true;
  }
  const activeAudio = currentTrack?.audio || currentTrack?.file;
  tracks = shuffle(discovered);
  playlistSignature = nextSignature;
  currentTrackIndex = activeAudio
    ? tracks.findIndex((track) => (track.audio || track.file) === activeAudio)
    : -1;
  if (currentTrackIndex >= 0) currentTrack = tracks[currentTrackIndex];
  cancelAnimationFrame(playlistScrollRaf);
  playlistScrollRaf = 0;
  fillInfiniteWheel();
  if (currentTrackIndex >= 0) {
    const kept = nearestItemForTrackIndex(currentTrackIndex);
    if (kept) {
      kept.classList.add("is-kept", "is-playing");
      centerWheelItem(kept);
    }
  }
  updateTrackFold();
  updateScrollbar();
  refreshTrackNodes();
  return true;
};

const bindFallbackTracks = () => {
  if (tracks.length || !playlistList) return;
  const randomizedItems = shuffle([...(playlistList.querySelectorAll(".track-item") || [])]);
  randomizedItems.forEach((item, index) => {
    item.dataset.trackIndex = String(index);
    const titleElement = item.querySelector(".track-title");
    if (titleElement) {
      titleElement.dataset.originalText = titleElement.textContent;
      titleElement.dataset.ink = titleElement.textContent;
    }
  });
  playlistList.replaceChildren(...randomizedItems);
  randomizedItems.forEach((item) => bindTrackItem(item, findTrackForItem(item)));
  refreshTrackNodes();
};

const pickItemAtPoint = (clientX, clientY) => {
  if (!playlistList || !trackViewport) return null;
  const box = trackViewport.getBoundingClientRect();
  if (clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return null;
  const items = [...playlistList.querySelectorAll(".track-item")];
  let best = null;
  let bestDist = Infinity;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.classList.contains("track-empty")) continue;
    const rect = item.getBoundingClientRect();
    if (rect.height < 2) continue;
    const dist = Math.abs(clientY - (rect.top + rect.height / 2));
    if (dist < bestDist) {
      best = item;
      bestDist = dist;
    }
  }
  return best;
};

const pickTrackFromEvent = (event) => {
  if (event.button != null && event.button !== 0) return;
  if (event.target.closest?.(".auth-panel, .chat-panel, .theme-panel, .transport, .auth-hint, .chat-hint, .theme-hint")) return;
  const item = event.target.closest?.(".track-item") || pickItemAtPoint(event.clientX, event.clientY);
  if (!item || !playlistList?.contains(item) || item.classList.contains("track-empty")) return;
  const track = findTrackForItem(item);
  if (!track) return;
  event.preventDefault();
  playTrack(track, item);
};
window.inteonPlayTrack = playTrack;
playlistList?.addEventListener("click", pickTrackFromEvent);

const restoreTrackStage = () => {
  [...(playlistList?.querySelectorAll(".track-item") || [])].forEach((item) => {
    item.classList.remove("is-departing", "is-kept", "is-playing");
    item.style.transform = "";
    item.style.opacity = "";
    item.style.filter = "";
    const card = item.querySelector(".track-select");
    const fold = item.querySelector(".track-fold");
    if (card) card.style.transform = "";
    if (fold) fold.style.transform = "";
  });
  updateTrackFold();
};

const enterImmersiveMode = (audio, track = null) => {
  if (!immersiveMode || !audio) return;
  sceneClock.now = performance.now();
  immersiveState.active = true;
  immersiveState.lastDraw = 0;
  immersiveState.audio = audio;
  const node = activeAudioNode;
  if (node) {
    activeAudioNode = node;
    immersiveState.analyser = node.analyser;
    immersiveState.data = node.data;
  }
  const item = audio.closest?.(".track-item");
  const title = track?.title || item?.dataset.trackTitle || "трек";
  immersiveTitle.textContent = title;
  immersiveTitle.dataset.originalText = title;
  immersiveTitle.dataset.ink = title;
  const artist = track?.artist || item?.querySelector(".track-artist")?.textContent.trim() || "inteonmteca";
  immersiveArtist.textContent = artist;
  if (activeTrackArtist) activeTrackArtist.textContent = artist;
  activePlayer?.setAttribute("aria-hidden", "false");
  activePlayer?.classList.add("is-visible");
  requestAnimationFrame(() => activePlayer?.classList.remove("is-swapping"));
  document.body.classList.remove("is-track-diving", "is-immersive");
  document.body.classList.add("is-inline-playing");
  immersiveMode?.classList.remove("is-active");
  immersiveMode?.setAttribute("aria-hidden", "true");
  syncTransport();
};

const exitImmersiveMode = () => {
  playbackRequestId += 1;
  immersiveState.active = false;
  immersiveState.audio?.pause();
  immersiveState.audio = null;
  immersiveMode?.classList.remove("is-active");
  immersiveMode?.setAttribute("aria-hidden", "true");
  activePlayer?.classList.remove("is-visible", "is-swapping");
  activePlayer?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-track-diving", "is-immersive", "is-inline-playing", "is-signal");
  currentTrack = null;
  currentTrackIndex = -1;
  cancelAnimationFrame(immersiveState.raf);
  setPlaybackStatus();
  fillInfiniteWheel();
  restoreTrackStage();
};

const formatTime = (value) => {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const syncTransport = () => {
  if (!player) return;
  const duration = Number.isFinite(player.duration) ? player.duration : 0;
  const progress = duration > 0 ? player.currentTime / duration : 0;
  const seekValue = `${(progress * 100).toFixed(2)}%`;
  trackProgress?.parentElement?.style.setProperty("--seek", seekValue);
  if (trackProgress && document.activeElement !== trackProgress) {
    trackProgress.value = String(Math.round(progress * 1000));
    trackProgress.style.setProperty("--seek", seekValue);
  }
  if (currentTime) currentTime.textContent = formatTime(player.currentTime);
  if (durationTime) durationTime.textContent = formatTime(duration);
  if (immersivePlayIcon) immersivePlayIcon.textContent = player.paused ? "▶" : "Ⅱ";
  if (immersivePlay) immersivePlay.setAttribute("aria-label", player.paused ? "Воспроизвести" : "Пауза");
  const signal = Boolean(currentTrack) && !player.paused;
  if (document.body.classList.contains("is-signal") !== signal) {
    document.body.classList.toggle("is-signal", signal);
  }
  if (nowPlayingTitle) {
    const title = currentTrack?.title || immersiveTitle?.textContent || "";
    if (nowPlayingTitle.dataset.track !== title) {
      nowPlayingTitle.textContent = title;
      nowPlayingTitle.dataset.track = title;
    }
  }
};

const togglePlayback = () => {
  if (!player || !currentTrack) return;
  if (player.paused) {
    setPlaybackStatus("", "");
    player.play()
      .then(() => {
        setPlaybackStatus();
        attachPlaybackAnalysis();
      })
      .catch(() => setPlaybackStatus("нажми ▶ ещё раз", "error"));
  } else {
    player.pause();
  }
};

const playRelativeTrack = (offset) => {
  if (!tracks.length) return;
  const start = currentTrackIndex >= 0 ? currentTrackIndex : 0;
  const nextIndex = (start + offset + tracks.length) % tracks.length;
  playTrack(tracks[nextIndex], nearestItemForTrackIndex(nextIndex));
};

immersiveBack?.addEventListener("click", exitImmersiveMode);
immersivePlay?.addEventListener("click", togglePlayback);
previousTrack?.addEventListener("click", () => playRelativeTrack(-1));
nextTrack?.addEventListener("click", () => playRelativeTrack(1));
trackProgress?.addEventListener("input", () => {
  if (!player || !Number.isFinite(player.duration)) return;
  player.currentTime = (Number(trackProgress.value) / 1000) * player.duration;
  syncTransport();
});
trackVolume?.addEventListener("input", () => {
  if (player) player.volume = Number(trackVolume.value);
});
if (player && trackVolume) player.volume = Number(trackVolume.value);
player?.addEventListener("timeupdate", syncTransport);
player?.addEventListener("durationchange", syncTransport);
player?.addEventListener("play", syncTransport);
player?.addEventListener("pause", syncTransport);
player?.addEventListener("playing", () => setPlaybackStatus());
player?.addEventListener("waiting", () => setPlaybackStatus("сигнал буферизуется…", "loading"));
player?.addEventListener("stalled", () => setPlaybackStatus("соединение с media замедлилось", "error"));
player?.addEventListener("error", () => {
  const messages = {
    1: "воспроизведение остановлено",
    2: "не удалось загрузить аудиофайл",
    3: "ошибка декодирования аудио",
    4: "формат аудио не поддерживается",
  };
  setPlaybackStatus(messages[player.error?.code] || "не удалось открыть аудиофайл", "error");
});
player?.addEventListener("ended", () => {
  if (tracks.length > 1) playRelativeTrack(1);
  else exitImmersiveMode();
});
window.addEventListener("keydown", (event) => {
  if (!immersiveState.active || openPanels.length || document.activeElement?.isContentEditable
      || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(document.activeElement?.tagName || "")) return;
  if (event.key === " ") {
    event.preventDefault();
    togglePlayback();
  }
  if (event.key === "ArrowLeft" && player) player.currentTime = Math.max(0, player.currentTime - 8);
  if (event.key === "ArrowRight" && player && Number.isFinite(player.duration)) player.currentTime = Math.min(player.duration, player.currentTime + 8);
});
window.addEventListener("resize", () => {
  sizeCanvas(immersiveVisual);
  resizeInkField();
  updateTrackFold();
  updateScrollbar();
}, { passive: true });
sizeCanvas(immersiveVisual);
resizeInkField();

const animatePlaylistScroll = () => {
  if (!playlistList) return;
  balanceInfiniteWheel();
  const nudge = pointerPlaylistNudge();
  const max = Math.max(0, playlistList.scrollHeight - playlistList.clientHeight);
  if (nudge) {
    playlistPointerCarry += nudge;
    const step = playlistPointerCarry > 0 ? Math.floor(playlistPointerCarry) : Math.ceil(playlistPointerCarry);
    if (step) {
      playlistList.scrollTop = Math.max(0, Math.min(max, playlistList.scrollTop + step));
      playlistPointerCarry -= step;
      playlistScrollTarget = playlistList.scrollTop;
    }
  } else {
    playlistPointerCarry *= .8;
  }
  playlistScrollTarget = Math.max(0, Math.min(max, playlistScrollTarget));
  const distance = playlistScrollTarget - playlistList.scrollTop;
  playlistScrollVelocity = (playlistScrollVelocity + distance * .075) * .8;
  const nextPosition = Math.max(0, Math.min(max, playlistList.scrollTop + playlistScrollVelocity));
  playlistList.scrollTop = nextPosition;
  if (!nudge && Math.abs(distance) < .35 && Math.abs(playlistScrollVelocity) < .12) {
    playlistList.scrollTop = playlistScrollTarget;
    playlistScrollVelocity = 0;
    playlistScrollRaf = 0;
    return;
  }
  playlistScrollRaf = requestAnimationFrame(animatePlaylistScroll);
};

window.addEventListener("pointermove", () => {
  if (!playlistList || playlistScrollRaf || !pointerPlaylistNudge()) return;
  playlistScrollTarget = playlistList.scrollTop;
  playlistScrollRaf = requestAnimationFrame(animatePlaylistScroll);
}, { passive: true });

trackViewport?.addEventListener("wheel", (event) => {
  if (!playlistList) return;
  event.preventDefault();
  const lineScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 20 : 1;
  const pageScale = event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? playlistList.clientHeight : 1;
  const rawDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  const delta = rawDelta * lineScale * pageScale;
  if (!playlistScrollRaf) playlistScrollTarget = playlistList.scrollTop;
  playlistScrollTarget += delta * .92;
  playlistScrollVelocity += Math.max(-18, Math.min(18, delta * .035));
  balanceInfiniteWheel();
  const max = Math.max(0, playlistList.scrollHeight - playlistList.clientHeight);
  playlistScrollTarget = Math.max(0, Math.min(max, playlistScrollTarget));
  if (!playlistScrollRaf) playlistScrollRaf = requestAnimationFrame(animatePlaylistScroll);
}, { passive: false });

playlistList?.addEventListener("scroll", () => {
  if (!playlistScrollRaf) playlistScrollTarget = playlistList.scrollTop;
  if (!wheelBalancing) balanceInfiniteWheel();
  updateTrackFold();
  updateScrollbar();
}, { passive: true });

scrollbarThumb?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  cancelAnimationFrame(playlistScrollRaf);
  playlistScrollRaf = 0;
  playlistScrollVelocity = 0;
  draggingScroll = { startY: event.clientY, startTop: playlistList.scrollTop };
  scrollbarThumb.setPointerCapture(event.pointerId);
});

scrollbarThumb?.addEventListener("pointermove", (event) => {
  if (!draggingScroll || !playlistList || !scrollbar) return;
  const max = playlistList.scrollHeight - playlistList.clientHeight;
  const trackTravel = scrollbar.clientHeight - scrollbarThumb.clientHeight;
  if (trackTravel <= 0) return;
  const delta = event.clientY - draggingScroll.startY;
  playlistList.scrollTop = draggingScroll.startTop + (delta / trackTravel) * max;
  playlistScrollTarget = playlistList.scrollTop;
});

scrollbarThumb?.addEventListener("pointerup", () => {
  draggingScroll = null;
});

const openPanels = [];
const panelOpeners = new WeakMap();
const setPanelOpen = (panel, open, { focus = true } = {}) => {
  if (!panel || panel.hidden === !open) return;
  const trigger = document.getElementById(panel.id.replace("-panel", "-hint"));
  if (open) panelOpeners.set(panel, document.activeElement);
  const index = openPanels.indexOf(panel);
  if (index !== -1) openPanels.splice(index, 1);
  panel.hidden = !open;
  panel.setAttribute("aria-hidden", String(!open));
  trigger?.setAttribute("aria-expanded", String(open));
  if (open) {
    openPanels.push(panel);
    openPanels.forEach((entry, order) => { entry.style.zIndex = String(40 + order); });
    if (focus) panel.querySelector('input:not([hidden]), select, button')?.focus({ preventScroll: true });
  } else {
    panel.style.zIndex = "";
    const opener = panelOpeners.get(panel);
    if (panel.contains(document.activeElement)) {
      (opener?.isConnected ? opener : trigger)?.focus({ preventScroll: true });
    }
    panelOpeners.delete(panel);
  }
};

const readStoredValue = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const storeValue = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
};

const readStoredJson = (key, fallback) => {
  try {
    const value = JSON.parse(readStoredValue(key) || "");
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

const createLoginCode = () => {
  if (window.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return String(value[0] % 1000000).padStart(6, "0");
  }
  return String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
};

const rememberLocalAccount = (email) => {
  const accounts = readStoredJson(localAccountsStorageKey, []);
  if (!accounts.includes(email)) {
    accounts.push(email);
    storeValue(localAccountsStorageKey, JSON.stringify(accounts));
  }
};

const themeSliderToDuration = (value) => {
  const progress = Math.max(0, Math.min(1, Number(value) / 1000));
  const duration = THEME_MIN_MS * Math.pow(THEME_MAX_MS / THEME_MIN_MS, progress);
  const quantum = duration < 60000 ? 1000 : duration < 3600000 ? 10000 : 60000;
  return Math.max(THEME_MIN_MS, Math.min(THEME_MAX_MS, Math.round(duration / quantum) * quantum));
};

const themeDurationToSlider = (duration) => {
  const safeDuration = Math.max(THEME_MIN_MS, Math.min(THEME_MAX_MS, Number(duration) || THEME_DEFAULT_MS));
  return Math.round(Math.log(safeDuration / THEME_MIN_MS) / Math.log(THEME_MAX_MS / THEME_MIN_MS) * 1000);
};

const formatThemeDuration = (duration) => {
  const ruCount = (value, one, few, many) => {
    const n = Math.abs(value) % 100;
    const last = n % 10;
    const word = n > 10 && n < 20 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many;
    return `${value} ${word}`;
  };
  if (duration < 60000) return ruCount(Math.round(duration / 1000), "секунда", "секунды", "секунд");
  const minutes = Math.round(duration / 60000);
  if (minutes < 90) return ruCount(minutes, "минута", "минуты", "минут");
  const hours = Math.round(minutes / 60);
  if (hours < 36) return ruCount(hours, "час", "часа", "часов");
  const days = Math.max(2, Math.round(hours / 24));
  return days >= 7 ? "1 неделя" : ruCount(days, "день", "дня", "дней");
};

const currentThemeDuration = () => themeSliderToDuration(themeDuration?.value || themeDurationToSlider(THEME_DEFAULT_MS));

const updateThemeDurationLabel = () => {
  const duration = currentThemeDuration();
  if (themeDurationOutput) themeDurationOutput.textContent = formatThemeDuration(duration);
  return duration;
};

const setTheme = (name, { animate = true, persist = true } = {}) => {
  const nextTheme = themesById.has(name) ? name : "desert";
  const root = document.documentElement;
  const changed = root.dataset.theme !== nextTheme;
  if (changed && animate && !prefersReducedMotion) {
    root.classList.remove("is-theme-shifting");
    void root.offsetWidth;
    root.classList.add("is-theme-shifting");
    window.clearTimeout(themeShiftTimer);
    themeShiftTimer = window.setTimeout(() => root.classList.remove("is-theme-shifting"), 1650);
  }
  root.dataset.theme = nextTheme;
  for (const [property, value] of Object.entries(themesById.get(nextTheme).tokens)) {
    root.style.setProperty(property, value);
  }
  if (themeSelect) themeSelect.value = nextTheme;
  if (persist) storeValue(themeStorageKey, nextTheme);
  if (changed && themeStatus) {
    themeStatus.textContent = themesById.get(nextTheme).name;
  }
};

const randomizeTheme = () => {
  const current = document.documentElement.dataset.theme;
  const available = themeNames.filter((name) => name !== current);
  setTheme(available[Math.floor(Math.random() * available.length)] || "desert");
};

const scheduleThemeRotation = () => {
  window.clearTimeout(themeRotationTimer);
  const duration = updateThemeDurationLabel();
  storeValue(themeDurationStorageKey, duration);
  themeRotationTimer = window.setTimeout(() => {
    randomizeTheme();
    scheduleThemeRotation();
  }, duration);
};

const initializeThemeSystem = () => {
  populateThemeSelect();
  const storedTheme = readStoredValue(themeStorageKey);
  const storedDuration = Number(readStoredValue(themeDurationStorageKey)) || THEME_DEFAULT_MS;
  if (themeDuration) themeDuration.value = String(themeDurationToSlider(storedDuration));
  setTheme(storedTheme || "desert", { animate: false, persist: false });
  scheduleThemeRotation();
};

themeHint?.addEventListener("click", () => {
  const opening = Boolean(themePanel?.hidden);
  setPanelOpen(themePanel, opening);
  if (opening) themeSelect?.focus();
});
themeClose?.addEventListener("click", () => setPanelOpen(themePanel, false));
themeSelect?.addEventListener("change", () => {
  setTheme(themeSelect.value);
  scheduleThemeRotation();
});
themeDuration?.addEventListener("input", updateThemeDurationLabel);
themeDuration?.addEventListener("change", scheduleThemeRotation);
themeRandom?.addEventListener("click", () => {
  randomizeTheme();
  scheduleThemeRotation();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  perceptionLastFrame = performance.now();
  inkLastFrame = performance.now();
  logoLastFrame = performance.now();
  lastVisualTick = 0;
  windLastTick = 0;
});

const setAuthStatus = (text) => {
  if (authStatus) authStatus.textContent = text;
};

const refreshAuthHint = () => {
  if (!authHint) return;
  authHint.textContent = sessionEmail ? sessionEmail.split("@")[0] : "вход";
  if (authLogout) authLogout.hidden = !sessionEmail;
  if (authEmailForm) authEmailForm.hidden = Boolean(sessionEmail);
  if (sessionEmail && authCodeForm) authCodeForm.hidden = true;
  if (chatInput) {
    chatInput.readOnly = !sessionEmail;
    chatInput.placeholder = sessionEmail ? "написать в воздух" : "войди, чтобы написать";
  }
};

const requestJson = async (path, options = {}) => {
  if (!canUseNetwork) throw new Error("local-auth");
  let response;
  try {
    response = await fetch(apiUrl(path), {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch {
    throw new Error("сервер входа не запущен — открой сайт через start-site.cmd");
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("API входа не подключён к этому адресу сайта");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "request failed");
  return data;
};

const loadSession = async () => {
  if (isFileMode) {
    sessionEmail = readStoredValue(localSessionStorageKey) || "";
    refreshAuthHint();
    return;
  }
  try {
    const data = await requestJson("/api/auth/me");
    sessionEmail = data.email || "";
  } catch {
    sessionEmail = "";
  }
  refreshAuthHint();
};

authHint?.addEventListener("click", () => {
  setPanelOpen(authPanel, true);
  if (sessionEmail) {
    setAuthStatus(sessionEmail);
    return;
  }
  authEmail?.focus();
});

authLogout?.addEventListener("click", async () => {
  if (isFileMode) {
    try {
      localStorage.removeItem(localSessionStorageKey);
    } catch {}
  } else {
    try {
      await requestJson("/api/auth/logout", { method: "POST", body: "{}" });
    } catch {}
  }
  sessionEmail = "";
  refreshAuthHint();
  setPanelOpen(authPanel, false);
  closeChat();
  setAuthStatus("вышли");
});

authClose?.addEventListener("click", () => setPanelOpen(authPanel, false));

authEmailForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  pendingEmail = authEmail?.value.trim().toLowerCase() || "";
  setAuthStatus("готовим код…");
  try {
    if (isFileMode) {
      if (!emailFormat.test(pendingEmail)) throw new Error("нужна почта: имя@example.com");
      rememberLocalAccount(pendingEmail);
      localLoginCode = createLoginCode();
      authCodeForm.hidden = false;
      if (authCodeLabel) authCodeLabel.textContent = "код с экрана";
      setAuthStatus(`код входа: ${localLoginCode}`);
      authCode?.focus();
      return;
    }
    const data = await requestJson("/api/auth/request-code", {
      method: "POST",
      body: JSON.stringify({ email: pendingEmail }),
    });
    authCodeForm.hidden = false;
    const directCode = data.login_code || data.dev_code;
    if (authCodeLabel) authCodeLabel.textContent = directCode ? "код с экрана" : "код из письма";
    setAuthStatus(directCode ? `код входа: ${directCode}` : `код отправлен на ${pendingEmail}`);
    authCode?.focus();
  } catch (error) {
    setAuthStatus(error.message === "request failed" ? "сервер входа недоступен" : error.message);
  } finally {
    if (submit) submit.disabled = false;
  }
});

authCodeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  setAuthStatus("проверяем…");
  try {
    if (isFileMode) {
      if (authCode?.value.trim() !== localLoginCode) throw new Error("код не подошёл");
      sessionEmail = pendingEmail;
      storeValue(localSessionStorageKey, sessionEmail);
      refreshAuthHint();
      setPanelOpen(authPanel, false);
      setAuthStatus("");
      return;
    }
    const data = await requestJson("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ email: pendingEmail, code: authCode?.value.trim() }),
    });
    sessionEmail = data.email || pendingEmail;
    refreshAuthHint();
    setPanelOpen(authPanel, false);
    setAuthStatus("");
  } catch (error) {
    setAuthStatus(error.message === "request failed" ? "код не подошёл" : error.message);
  } finally {
    if (submit) submit.disabled = false;
  }
});

const animateChatGlyphs = (now) => {
  const t = now * 0.001;
  const beat = (Math.sin(t * 1.45) + 1) / 2;
  chatGlyphs.forEach((glyph, index) => {
    const wave = Math.sin(t * 1.7 + index * 0.42) * 9;
    const helixX = Math.cos(t * 0.9 + index * 0.26) * (5 + beat * 10);
    const helixZ = Math.sin(t * 0.9 + index * 0.26) * (10 + beat * 18);
    const rotY = Math.sin(t * 1.1 + index * 0.2) * 20;
    const rotX = Math.cos(t * 0.8 + index * 0.16) * 14;
    const rotZ = Math.sin(t * 0.6 + index * 0.12) * 8;
    const scale = 1 + Math.sin(t * 2.2 + index * 0.3) * 0.09;
    glyph.style.transform = `translate3d(${helixX}px, ${wave}px, ${helixZ}px) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg) scale(${scale})`;
  });
  if (!chatPanel?.hidden) requestAnimationFrame(animateChatGlyphs);
};

const renderChatMessages = (messages) => {
  if (!chatStream) return;
  chatStream.replaceChildren();
  chatGlyphs = [];
  const all = messages || [];
  all.forEach((message, index) => {
    const line = document.createElement("div");
    line.className = "chat-line";
    const meta = document.createElement("div");
    meta.className = "chat-meta";
    meta.textContent = (message.email || "").split("@")[0] || "гость";
    line.append(meta);
    const recent = index >= all.length - 8;
    if (recent) {
      [...String(message.text || "")].forEach((char) => {
        const glyph = document.createElement("span");
        glyph.className = "chat-glyph";
        glyph.textContent = char === " " ? "\u00a0" : char;
        line.append(glyph);
        chatGlyphs.push(glyph);
      });
    } else {
      const body = document.createElement("span");
      body.className = "chat-text";
      body.textContent = message.text || "";
      line.append(body);
    }
    chatStream.append(line);
  });
  chatStream.scrollTop = chatStream.scrollHeight;
  requestAnimationFrame(animateChatGlyphs);
};

const loadChat = async () => {
  if (isFileMode) {
    renderChatMessages(readStoredJson(localChatStorageKey, []));
    return;
  }
  try {
    const data = await requestJson("/api/chat");
    renderChatMessages(data.messages || data);
  } catch {
    if (!chatStream.childElementCount) {
      renderChatMessages([{ email: "inteonmteca", text: "воздух молчит" }]);
    }
  }
};

const openChat = async ({ focus = false } = {}) => {
  setPanelOpen(chatPanel, true, { focus: false });
  document.body.classList.add("is-chat-open");
  if (chatInput) {
    chatInput.placeholder = sessionEmail ? "написать в воздух" : "войди, чтобы написать";
    chatInput.readOnly = !sessionEmail;
  }
  if (focus) chatInput?.focus({ preventScroll: true });
  await loadChat();
  if (chatPanel?.hidden) return;
  window.clearInterval(chatTimer);
  chatTimer = window.setInterval(loadChat, 2500);
};

const closeChat = () => {
  window.clearInterval(chatTimer);
  setPanelOpen(chatPanel, false);
  document.body.classList.remove("is-chat-open");
  chatHint?.focus();
};

chatHint?.addEventListener("click", () => openChat({ focus: true }));
chatClose?.addEventListener("click", closeChat);
chatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!sessionEmail) {
    setPanelOpen(authPanel, true);
    setAuthStatus("сначала почта");
    return;
  }
  const text = chatInput?.value.trim();
  if (!text) return;
  try {
    if (isFileMode) {
      const messages = readStoredJson(localChatStorageKey, []);
      messages.push({
        id: Date.now(),
        email: sessionEmail,
        text,
        created_at: Math.floor(Date.now() / 1000),
      });
      storeValue(localChatStorageKey, JSON.stringify(messages));
      chatInput.value = "";
      renderChatMessages(messages);
      return;
    }
    await requestJson("/api/chat", { method: "POST", body: JSON.stringify({ text }) });
    chatInput.value = "";
    await loadChat();
  } catch (error) {
    renderChatMessages([{ email: "система", text: error.message === "request failed" ? "нет связи" : error.message }]);
  }
});

const handlePanelKeydown = (event) => {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const topPanel = openPanels[openPanels.length - 1];
  if (topPanel) {
    event.preventDefault();
    if (topPanel === chatPanel) closeChat();
    else setPanelOpen(topPanel, false);
    return;
  }
  if (immersiveState.active) {
    event.preventDefault();
    exitImmersiveMode();
  }
};
window.addEventListener("keydown", handlePanelKeydown);

const updateCounterText = (element, value) => {
  if (!element || value === null || value === undefined) return;
  element.textContent = String(value);
};

const readCounterValue = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("counter unavailable");
  const data = await response.json();
  return data.value;
};

const bumpCounter = (key) => readCounterValue(`${counterBaseUrl}/hit/${counterNamespace}/${key}`);
const loadCounter = async (key) => {
  try {
    return await readCounterValue(`${counterBaseUrl}/get/${counterNamespace}/${key}`);
  } catch {
    return null;
  }
};

const setupVisitCounter = async () => {
  if (!uniqueCount && !visitCount) return;
  try {
    const visits = await bumpCounter("visits");
    updateCounterText(visitCount, visits);
    if (localStorage.getItem(uniqueStorageKey)) {
      updateCounterText(uniqueCount, await loadCounter("unique"));
      return;
    }
    const unique = await bumpCounter("unique");
    localStorage.setItem(uniqueStorageKey, "1");
    updateCounterText(uniqueCount, unique);
  } catch {
    updateCounterText(uniqueCount, "--");
    updateCounterText(visitCount, "--");
  }
};

const randomGlyph = () => matrixGlyphs[Math.floor(Math.random() * matrixGlyphs.length)];
const isStaticChar = (char) => [" ", ".", "-", "—", "/"].includes(char);
const randomRange = (min, max) => Math.random() * (max - min) + min;
const randomInteger = (min, max) => Math.floor(randomRange(min, max + 1));

const getMatrixHoldState = (element, original) => {
  let state = matrixHoldStates.get(element);
  if (!state || state.length !== original.length) {
    state = { heldIndexes: new Set(), length: original.length, nextShuffleAt: 0, rendered: "" };
    matrixHoldStates.set(element, state);
  }
  return state;
};

const shuffleMatrixHoldIndexes = (state, original, now) => {
  if (now < state.nextShuffleAt) return;
  const indexes = [...original].map((char, index) => (isStaticChar(char) ? null : index)).filter((index) => index !== null);
  const holdCount = Math.max(1, Math.round(indexes.length * matrixHoldRatio));
  state.heldIndexes = new Set(shuffle(indexes).slice(0, holdCount));
  state.nextShuffleAt = now + matrixHoldDuration;
};

const renderMatrixNoise = (element) => {
  if (fullReadableMode || readableElements.has(element)) return;
  const original = element.dataset.originalText || element.textContent;
  const state = getMatrixHoldState(element, original);
  const now = Date.now();
  shuffleMatrixHoldIndexes(state, original, now);
  const nextText = [...original].map((char, index) => {
    if (isStaticChar(char)) return char;
    if (state.heldIndexes.has(index) && state.rendered[index]) return state.rendered[index];
    return Math.random() < 0.16 ? char : randomGlyph();
  }).join("");
  state.rendered = nextText;
  element.textContent = nextText;
};

const revealText = (element) => {
  const original = element.dataset.originalText || element.textContent;
  readableElements.add(element);
  element.classList.remove("is-matrixing");
  element.classList.add("is-readable");
  element.textContent = original;
  window.setTimeout(() => {
    element.classList.remove("is-readable");
    element.classList.add("is-matrixing");
    readableElements.delete(element);
    renderMatrixNoise(element);
  }, 780);
};

const runReadableWave = () => {
  matrixElements.forEach((element, index) => {
    window.setTimeout(() => revealText(element), index * 140);
  });
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
let logoFilamentSeeds = [];
const setupLogoFilaments = () => {
  logoFilamentSeeds = Array.from({ length: animationQuality === "low" ? 28 : 52 }, (_, index) => ({
    x: .08 + hashUnit(index + 101.3) * .84,
    y: .32 + hashUnit(index + 141.8) * .36,
    phase: hashUnit(index + 181.4) * Math.PI * 2,
    size: .35 + hashUnit(index + 221.9) * 1.45,
    band: index % 3,
  }));
};
setupLogoFilaments();

const setupLogoSlices = () => {
  if (!logoVector || !logoSliceContainer) return;
  const defs = logoVector.querySelector("defs");
  if (!defs) return;
  logoSlices = [];
  logoSliceContainer.replaceChildren();
  const count = animationQuality === "low" ? 14 : 24;
  for (let index = 0; index < count; index += 1) {
    const clip = document.createElementNS(SVG_NAMESPACE, "clipPath");
    const clipId = `logo-slice-clip-${index}`;
    clip.id = clipId;
    clip.setAttribute("clipPathUnits", "userSpaceOnUse");
    const clipRect = document.createElementNS(SVG_NAMESPACE, "rect");
    const sliceHeight = 107 / count + .8;
    clipRect.setAttribute("x", "-40");
    clipRect.setAttribute("y", String(index * 107 / count - .4));
    clipRect.setAttribute("width", "614");
    clipRect.setAttribute("height", String(sliceHeight));
    clip.append(clipRect);
    defs.append(clip);

    const image = document.createElementNS(SVG_NAMESPACE, "image");
    image.classList.add("logo-slice");
    image.setAttribute("href", "assets/logo-wordmark.svg");
    image.setAttribute("x", "0");
    image.setAttribute("y", "0");
    image.setAttribute("width", "534");
    image.setAttribute("height", "107");
    image.setAttribute("clip-path", `url(#${clipId})`);
    image.dataset.index = String(index);
    logoSliceContainer.append(image);
    logoSlices.push(image);
  }
};

const resizeLogoCanvas = () => {
  if (!logoReactiveCanvas || !logoReactiveContext) return;
  const bounds = logoReactiveCanvas.getBoundingClientRect();
  const scale = Math.min(devicePixelRatio || 1, 1.5);
  logoReactiveCanvas.width = Math.max(1, Math.round(bounds.width * scale));
  logoReactiveCanvas.height = Math.max(1, Math.round(bounds.height * scale));
};

const updateLogoPointer = (event) => {
  if (!logoWrap) return;
  const bounds = logoWrap.getBoundingClientRect();
  const x = (event.clientX - (bounds.left + bounds.width * .5)) / Math.max(1, bounds.width * .5);
  const y = (event.clientY - (bounds.top + bounds.height * .5)) / Math.max(1, bounds.height * .5);
  const distance = Math.hypot(x * .75, y);
  logoReactiveState.hoverX = Math.max(-1.35, Math.min(1.35, x));
  logoReactiveState.hoverY = Math.max(-1.35, Math.min(1.35, y));
  logoReactiveState.proximity = Math.max(0, Math.min(1, 1.5 - distance));
};

window.addEventListener("pointermove", updateLogoPointer, { passive: true });
logoWrap?.addEventListener("pointerleave", () => {
  logoReactiveState.proximity *= .35;
});

const drawLogoFilaments = (now, profile) => {
  if (!logoReactiveCanvas || !logoReactiveContext) return;
  const bounds = logoReactiveCanvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const scale = logoReactiveCanvas.width / bounds.width;
  const ctx = logoReactiveContext;
  const width = bounds.width;
  const height = bounds.height;
  const t = now * .001;
  const pointerX = (.5 + logoReactiveState.x * .34) * width;
  const pointerY = (.5 + logoReactiveState.y * .28) * height;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const strandCount = animationQuality === "low" ? 5 : 9;
  for (let strand = 0; strand < strandCount; strand += 1) {
    ctx.beginPath();
    const steps = 34;
    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps;
      const x = width * (.08 + progress * .84);
      const base = height * (.5 + (strand - (strandCount - 1) * .5) * .021);
      const octaveA = Math.sin(progress * Math.PI * (3 + strand % 4) + t * (.35 + profile.mid) + strand);
      const octaveB = Math.sin(progress * Math.PI * 11 + t * .62 + strand * 2.1);
      const nearPointer = Math.exp(-Math.pow((x - pointerX) / Math.max(1, width * .19), 2));
      const y = base
        + octaveA * (4 + profile.bass * 18)
        + octaveB * (1.2 + profile.high * 7)
        + nearPointer * (pointerY - base) * .13 * logoReactiveState.proximity;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const green = strand % 3 === 0;
    ctx.strokeStyle = green
      ? `rgba(204,255,105,${.025 + profile.high * .18})`
      : `rgba(224,112,64,${.025 + profile.mid * .14})`;
    ctx.lineWidth = .35 + profile.bass * 1.2;
    ctx.shadowBlur = 4 + profile.high * 16;
    ctx.shadowColor = green ? "rgba(201,255,97,.55)" : "rgba(224,92,51,.5)";
    ctx.stroke();
  }

  logoFilamentSeeds.forEach((particle, index) => {
    const bandEnergy = particle.band === 0 ? profile.bass : particle.band === 1 ? profile.mid : profile.high;
    const orbit = t * (.18 + particle.band * .12) + particle.phase;
    let x = particle.x * width + Math.cos(orbit) * (4 + bandEnergy * 20);
    let y = particle.y * height + Math.sin(orbit * 1.7) * (3 + bandEnergy * 13);
    const dx = x - pointerX;
    const dy = y - pointerY;
    const pull = Math.exp(-(dx * dx + dy * dy) / Math.max(1, width * width * .035)) * logoReactiveState.proximity;
    x += (pointerX - x) * pull * .12;
    y += (pointerY - y) * pull * .12;
    const alpha = .04 + bandEnergy * .45 + profile.flux * .25;
    ctx.fillStyle = particle.band === 2
      ? `rgba(214,255,118,${alpha})`
      : `rgba(239,168,104,${alpha})`;
    ctx.shadowBlur = 5 + bandEnergy * 18;
    ctx.shadowColor = particle.band === 2 ? "#d6ff76" : "#dc7042";
    ctx.beginPath();
    ctx.arc(x, y, particle.size * (1 + bandEnergy * 1.8), 0, Math.PI * 2);
    ctx.fill();
    if (index % 7 === 0 && bandEnergy > .08) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(orbit * 2.3) * (8 + bandEnergy * 34), y + Math.sin(orbit * 1.9) * (5 + bandEnergy * 18));
      ctx.strokeStyle = `rgba(244,220,167,${alpha * .45})`;
      ctx.lineWidth = .45;
      ctx.stroke();
    }
  });
  ctx.restore();
};

const setLogoCssVariable = (name, value) => {
  document.documentElement.style.setProperty(name, value);
  logoWrap?.style.setProperty(name, value);
};

const renderReactiveLogo = (now) => {
  if (now - logoLastFrame < renderInterval()) return;
  logoLastFrame = now;
  const profile = audioEnergy(now);
  renderLogoSymbolEcho(now, profile);
  const motionLimit = prefersReducedMotion ? .14 : 1;
  const pointerMix = logoReactiveState.proximity * .72;
  const targetX = (motionState.x * (1 - pointerMix) + logoReactiveState.hoverX * pointerMix) * motionLimit;
  const targetY = (motionState.y * (1 - pointerMix) + logoReactiveState.hoverY * pointerMix) * motionLimit;
  logoReactiveState.x += (targetX - logoReactiveState.x) * .085;
  logoReactiveState.y += (targetY - logoReactiveState.y) * .085;
  logoReactiveState.bass += (profile.bass - logoReactiveState.bass) * .18;
  logoReactiveState.mid += (profile.mid - logoReactiveState.mid) * .16;
  logoReactiveState.high += (profile.high - logoReactiveState.high) * .14;
  logoReactiveState.energy += (profile.avg - logoReactiveState.energy) * .16;

  const x = logoReactiveState.x;
  const y = logoReactiveState.y;
  const bass = logoReactiveState.bass;
  const mid = logoReactiveState.mid;
  const high = logoReactiveState.high;
  const energy = logoReactiveState.energy;
  setLogoCssVariable("--logo-x", `${(x * 12).toFixed(2)}px`);
  setLogoCssVariable("--logo-y", `${(y * 8).toFixed(2)}px`);
  setLogoCssVariable("--logo-rx", `${(-y * 9).toFixed(2)}deg`);
  setLogoCssVariable("--logo-ry", `${(x * 13).toFixed(2)}deg`);
  const live = immersiveState.active ? 1.45 : 1;
  setLogoCssVariable("--logo-scale", (1 + (bass * .075 + profile.flux * .025) * live).toFixed(4));
  setLogoCssVariable("--logo-bass", Math.min(1, bass * live).toFixed(4));
  setLogoCssVariable("--logo-mid", Math.min(1, mid * live).toFixed(4));
  setLogoCssVariable("--logo-high", Math.min(1, high * live).toFixed(4));
  setLogoCssVariable("--logo-energy", Math.min(1, energy * live).toFixed(4));

  if (logoGaze) {
    const size = 150 + bass * 72 + logoReactiveState.proximity * 26;
    logoGaze.setAttribute("x", String(267 + x * 224 - size * .5));
    logoGaze.setAttribute("y", String(53.5 + y * 58 - size * .5));
    logoGaze.setAttribute("width", String(size));
    logoGaze.setAttribute("height", String(size));
    logoGaze.setAttribute("rx", String(size * .5));
  }
  if (logoTurbulence) {
    logoTurbulence.setAttribute(
      "baseFrequency",
      `${(.0035 + high * .012).toFixed(4)} ${(.031 + mid * .075).toFixed(4)}`,
    );
  }
  if (logoDisplacement) {
    const chaos = logoChaosActive ? 12 : 0;
    const liveWarp = immersiveState.active ? 8 : 0;
    logoDisplacement.setAttribute("scale", String(1.4 + bass * 13 + high * 8 + profile.flux * 14 + chaos + liveWarp));
  }

  const sliceForce = high * 8 + profile.flux * 13 + (logoChaosActive ? 12 : 0) + (immersiveState.active ? 7 : 0);
  logoSlices.forEach((slice, index) => {
    const normalized = index / Math.max(1, logoSlices.length - 1) - .5;
    const phase = now * .0023 + index * 1.91;
    const dx = Math.sin(phase) * sliceForce * (.3 + Math.abs(normalized)) + x * normalized * 9;
    const dy = Math.cos(phase * .73) * sliceForce * .11 + y * normalized * 3;
    const skew = Math.sin(phase * .41) * (high * 3 + (logoChaosActive ? 5 : 0));
    slice.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) skewX(${skew.toFixed(2)}deg)`;
    slice.style.opacity = String(Math.min(.9, .06 + high * .34 + profile.flux * .45 + (logoChaosActive ? .18 : 0)));
  });

  drawLogoFilaments(now, profile);
};

const scatterLogoParticles = () => {
  if (!logoParticles) return;
  const particles = [...logoParticles.querySelectorAll(".logo-particle")];
  const shuffledCells = shuffle(particles.map((_, index) => ({
    col: index % particleGrid.cols,
    row: Math.floor(index / particleGrid.cols),
  })));
  particles.forEach((particle, index) => {
    const cell = shuffledCells[index];
    particle.style.setProperty("--bg-x", particleGrid.cols === 1 ? "0%" : `${((cell.col / (particleGrid.cols - 1)) * 100).toFixed(4)}%`);
    particle.style.setProperty("--bg-y", particleGrid.rows === 1 ? "0%" : `${((cell.row / (particleGrid.rows - 1)) * 100).toFixed(4)}%`);
    particle.style.setProperty("--scatter-x", `${randomRange(-110, 110).toFixed(1)}px`);
    particle.style.setProperty("--scatter-y", `${randomRange(-64, 64).toFixed(1)}px`);
    particle.style.setProperty("--scatter-z", `${randomRange(-160, 160).toFixed(1)}px`);
    particle.style.setProperty("--scatter-r", `${randomRange(-34, 34).toFixed(1)}deg`);
    particle.style.setProperty("--scatter-scale", randomRange(0.62, 1.28).toFixed(2));
  });
};

const setupLogoParticles = () => {
  if (!logoParticles) return;
  const { cols, rows } = particleGrid;
  logoParticles.textContent = "";
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const particle = document.createElement("span");
      particle.className = "logo-particle";
      particle.style.setProperty("--cols", cols);
      particle.style.setProperty("--rows", rows);
      particle.style.setProperty("--x", ((col / cols) * 100).toFixed(4));
      particle.style.setProperty("--y", ((row / rows) * 100).toFixed(4));
      particle.dataset.bgX = cols === 1 ? "0%" : `${((col / (cols - 1)) * 100).toFixed(4)}%`;
      particle.dataset.bgY = rows === 1 ? "0%" : `${((row / (rows - 1)) * 100).toFixed(4)}%`;
      particle.style.setProperty("--bg-x", particle.dataset.bgX);
      particle.style.setProperty("--bg-y", particle.dataset.bgY);
      logoParticles.appendChild(particle);
    }
  }
  scatterLogoParticles();
};

const restoreLogoTileOrder = () => {
  logoParticles?.querySelectorAll(".logo-particle").forEach((particle) => {
    particle.style.setProperty("--bg-x", particle.dataset.bgX || "0%");
    particle.style.setProperty("--bg-y", particle.dataset.bgY || "0%");
  });
};

const renderLogoMatrix = (readable = false) => {
  logoWrap?.classList.toggle("is-assembled", readable);
  logoWrap?.classList.toggle("is-charging", readable);
  if (logoChargeTimeout) window.clearTimeout(logoChargeTimeout);
  if (readable) {
    logoChargeTimeout = window.setTimeout(() => logoWrap?.classList.remove("is-charging"), 1350);
    restoreLogoTileOrder();
  } else {
    scatterLogoParticles();
  }
};

const setAllTextReadable = (isReadable) => {
  fullReadableMode = isReadable;
  logoWrap?.classList.toggle("is-stable", isReadable);
  if (isReadable) renderLogoMatrix(true);
  matrixElements.forEach((element) => {
    const original = element.dataset.originalText || element.textContent;
    if (isReadable) {
      readableElements.add(element);
      element.classList.remove("is-matrixing");
      element.classList.add("is-readable");
      element.textContent = original;
      return;
    }
    element.classList.remove("is-readable");
    element.classList.add("is-matrixing");
    readableElements.delete(element);
    renderMatrixNoise(element);
  });
};

const runLongReadableMoment = () => {
  if (logoChaosActive) return;
  logoLocked = true;
  logoWrap?.classList.add("is-stable");
  renderLogoMatrix(true);
  window.setTimeout(() => setAllTextReadable(true), 520);
  window.setTimeout(() => setAllTextReadable(false), 4120);
  window.setTimeout(() => {
    logoLocked = false;
    logoWrap?.classList.remove("is-stable");
  }, 5200);
};

const resetLogoChaosCountdown = () => {
  logoChaosCountdown = randomInteger(5, 10);
};

const runLogoCycle = () => {
  if (logoChaosActive) {
    logoCycleTimeout = window.setTimeout(runLogoCycle, 1200);
    return;
  }
  if (fullReadableMode || logoLocked) {
    renderLogoMatrix(true);
    logoCycleTimeout = window.setTimeout(runLogoCycle, 1200);
    return;
  }
  logoChaosCountdown -= 1;
  if (logoChaosCountdown <= 0) resetLogoChaosCountdown();
  renderLogoMatrix(false);
  const chaosDuration = randomRange(2000, 16000);
  window.setTimeout(() => {
    if (logoChaosActive) return;
    logoWrap?.classList.add("is-assembling");
    renderLogoMatrix(true);
    window.setTimeout(() => logoWrap?.classList.remove("is-assembling"), 320);
    logoCycleTimeout = window.setTimeout(runLogoCycle, randomRange(1000, 10000));
  }, chaosDuration);
};

matrixElements.forEach((element) => {
  element.dataset.originalText = element.textContent;
  element.classList.add("is-matrixing");
});

window.setInterval(() => {
  if (!document.hidden) matrixElements.forEach(renderMatrixNoise);
}, prefersReducedMotion ? 360 : 95);
window.setTimeout(runReadableWave, 1200);
window.setInterval(runReadableWave, 6200);
window.setTimeout(runLongReadableMoment, 3200);
window.setInterval(runLongReadableMoment, 9500);
const tickVisuals = (now) => {
  sceneRaf = requestAnimationFrame(tickVisuals);
  if (document.hidden) return;
  if (lastVisualTick) recordFramePacing(now - lastVisualTick);
  lastVisualTick = now;
  renderWeightedMotion(now);
  renderPerceptionField(now);
  if (immersiveState.active) drawImmersiveScene(now);
  renderInkField(now);
  renderTitleMutation(now);
  renderPlayingLetters(now);
  loopPlaylistMotion(now);
  renderReactiveLogo(now);
};

setupLogoSlices();
setupLogoParticles();
resizeLogoCanvas();
renderLogoMatrix(true);
resetLogoChaosCountdown();
logoCycleTimeout = window.setTimeout(runLogoCycle, randomRange(1000, 10000));
requestAnimationFrame(tickVisuals);
window.addEventListener("resize", resizeLogoCanvas, { passive: true });

try { initializeThemeSystem(); } catch {}
window.setTimeout(() => {
  try {
    bindFallbackTracks();
    if (Array.isArray(window.INTEONMTECA_PLAYLIST) && window.INTEONMTECA_PLAYLIST.length) {
      renderPlaylist(window.INTEONMTECA_PLAYLIST);
    }
  } catch {}
}, 0);
loadSession();

streetLink?.addEventListener("click", () => {
  window.inteonStreet?.noteExit();
});

window.addEventListener("DOMContentLoaded", () => {
  setupVisitCounter();
  updateScrollbar();
  openChat();
});
