"""Rasterize the three lossy readings of the courtyard's lyrics in marker ink."""
import base64
import functools
import io
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PAINTER = r"""async () => {
const {lyricSheets} = await import('/yard/wall-lyrics.js');
const {inkGroups, inkPasses, inkAtlasColumns:columns, inkCellWidth:cellW, inkCellHeight:cellH,
  wallTranslation, wallFragments} = await import('/yard/wall-ink-codec.js');
const lyrics = [...new Set(lyricSheets.flatMap(sheet=>sheet.lines))];
const tiles = Array.from({length:inkPasses}, (_,pass) => lyrics.map(line => wallTranslation(line,pass))).flat();
const rows = Math.ceil(tiles.length/columns);
// A single-line marker alphabet. The two strokes of a letter can cross,
// overshoot and double back without leaving a typeset outline.
const letters = {
  А:'M.3 10 Q2.4 4.2 4.3 .4 L8 10 M1.6 6.5 L6.8 6.1',
  Б:'M7 .8 L1.3 1.3 .7 10 Q7.3 10.6 7.4 7.5 Q7.9 5.1 1.3 5.6',
  В:'M1 10 L1.5 1.2 Q7.2 -1 7.2 2.4 Q7.1 4.5 1.8 5.2 Q8.2 4 7.8 7.7 Q7.4 10.2 1 10',
  Г:'M.8 10 L1.5 1.3 7.4 .7',
  Д:'M.3 9 Q2.4 8.6 3.1 1.3 L7 .8 6.9 9 M.1 12 L.3 9.3 8.8 9 8.6 11.8',
  Е:'M7.6 .8 L1.3 1.4 .7 9.9 7.4 9.4 M1.4 5.3 L6 4.9',
  Ё:'M7.6 1.1 L1.3 1.5 .8 10 7.4 9.4 M1.4 5.3 L6 4.9 M2 -1.2 l.3 -.2 M6 -1.6 l.3 -.2',
  Ж:'M.2 1 L7.8 9.7 M7.9 .6 L.1 10 M4.3 .6 L3.9 10',
  З:'M.8 2 Q7.8 -1.5 7.1 2.9 Q6.5 4.7 2.7 5.2 Q8.6 4.4 7.3 8 Q5.6 11 0 9.5',
  И:'M1.3 1 L.7 10 Q4.2 6.1 7.8 .8 L7.3 10',
  Й:'M1.3 1.3 L.7 10 7.8 1.1 7.3 10 M3.1 -1.7 Q4.9 .4 6.6 -2.1',
  К:'M1.5 .7 L.8 10 M7.8 .5 L1.6 5.7 8.2 9.8',
  Л:'M-.4 9.4 Q1.3 11 2.3 7.4 L4.7 1.1 7.4 .8 7.1 10',
  М:'M.6 10 L1.6 1 4.4 6.1 8.1 .7 7.8 10',
  Н:'M1.5 1 L.9 10 M7.7 .7 L7.2 9.8 M1.3 5.6 L7.4 4.8',
  О:'M4.4 1 Q1 .8 .7 5.7 Q.2 11 4.6 10 Q8.1 9.3 8 4.3 Q7.8 .1 4 1',
  П:'M.7 10 L1.7 1.3 7.7 .8 7.2 10',
  Р:'M.8 10 L1.6 1.3 Q8.4 -1 7.9 2.9 Q7.2 6 1.4 5.5',
  С:'M7.7 1.7 Q4 -.7 1.6 3.1 Q-.9 9.2 3.3 10 Q5.2 10.7 7.4 8.5',
  Т:'M-.1 1.7 L8.8 .8 M4.6 1.5 L4 10.1',
  У:'M.7 1 L4.1 7 Q5.7 5 8 .6 M4.5 6.8 Q2.4 12 -.1 9.6',
  Ф:'M4.6 -.1 L3.8 11 M4.3 2 Q.7 1.3 .3 5 Q-.1 8.2 4 8 Q8.4 7.8 8.6 4.6 Q8.7 1.8 4.3 2',
  Х:'M.5 1.2 L7.7 9.8 M8 .6 L.2 10',
  Ц:'M1.5 1 L.8 9.7 7.5 9.2 8.1 .7 M7.5 9.2 L8.9 9.2 8.7 12',
  Ч:'M1.1 .9 Q-1 8.3 7.5 5 M7.9 .5 L7.3 10',
  Ш:'M1.2 1 L.6 9.9 8.6 9.4 9 .5 M4.8 1 L4.3 9.2',
  Щ:'M1.2 1 L.6 9.9 8.6 9.4 9 .5 M4.8 1 L4.3 9.2 M8.6 9.4 L10 9.3 9.8 12',
  Ы:'M1.4 1 L.8 10 Q6.2 10.5 6.1 7.6 Q6.3 5.1 1.5 5.9 M8.6 .8 L8 9.9',
  Ь:'M1.5 .9 L.7 10 Q7.8 10.6 7.7 7.1 Q7.3 4.9 1.5 5.7',
  Э:'M.7 1.8 Q7.4 -1.3 7.7 4.8 Q7.9 11.6 .4 9.5 M2.7 5.6 L7.2 5.2',
  Ю:'M1.1 1 L.6 10 M1 5.6 L3.8 5.3 M6.1 1.1 Q3.6 1.6 3.5 6 Q3.3 10.8 6.4 10 Q9.1 9.5 9.2 4.5 Q9.2 .5 6.1 1.1',
  Я:'M7.4 10 L7.8 1 Q1.3 .1 1.1 3.6 Q.9 5.9 6.7 5.8 M5.4 5.8 L.2 10.1',
  '?':'M1.1 2 Q3.1 -.5 6.3 .8 Q9.4 2.8 5.6 5.5 Q4.5 6.5 4.7 7.5 M4.3 9.9 l.3 -.2',
  ',':'M2.5 9.3 Q2.8 10.3 1.3 12',
};

const compactLetters = {
  ȝ:'M-.6 5.9 Q2.8 .8 5.3 3.2 Q6.6 4.6 2 6.5 Q8.7 3.7 6.5 8.1 Q4.3 12.6 .6 12.9 L1.4 10.5 M4 1.2 l2.8 -2.1',
  ʊ:'M-.7 4.3 L2 2.8 Q-1.3 10.2 2.7 9.2 Q6.7 8.6 7.5 3.2 L5.2 3.9 M5.5 6.8 l2.9 -.8',
  ø:'M6.4 3 Q2.1 1.8 .6 6.3 Q-.5 10.3 3.6 8.7 Q7.7 6.1 6.4 3 M-.7 11.4 L8.3 -.7',
  ƞ:'M-.6 8.3 L2.2 3.7 1.2 8.5 Q6.4 .6 6.5 4.8 L5.2 12.6 8.3 10.6 M-.2 4.3 l2.3 -2',
  ŋ:'M-1 9 L2.5 3.2 1.2 8.4 Q5.8 .5 6.6 4.4 L5.7 10.5 Q5.3 14.3 2.7 12.4 L6.9 8.6',
  þ:'M-.4 8.7 Q3.7 2.7 3.4 -1.5 L.6 12.6 M1.6 5.8 Q7.4 .9 7.7 4.8 Q6.5 8.7 1.1 7.7 L8.3 9.3',
  λ:'M.3 1.2 Q2.3 -1.1 3.5 3.2 L5.1 8.9 8.5 6.3 M3.5 4.4 L-.6 9.9',
  ƛ:'M.5 -.6 L2.8 1.5 4.9 9 8.4 7.2 M3.8 3.9 L-.5 10.2 M1.7 7.3 L7.1 4.5',
  ꝛ:'M-.8 5.7 L2.4 3.6 2 2.5 Q8.8 2.9 5.7 5.3 L1.9 8.8 7.6 7 M5.2 10.7 l2.4 -1.6',
  ʃ:'M7.7 -.7 Q4.3 -1.9 3.2 2.7 L1.7 10.8 Q.9 14 -1 12 L3.7 9.1 M.4 6.5 L7.5 3.6',
  ʒ:'M-.2 5.1 L3 2.7 6.4 3.2 2.7 6.6 Q8.2 4.2 6.2 8.4 L2.3 12.8 .5 11.1 7.8 6.1',
  ɣ:'M-.6 3.5 Q1.3 1.4 2.3 5.2 L4.8 11.5 Q4.6 14 2.6 11.7 Q1.8 8.8 7.5 2.4 L8.3 3.1',
  а:'M6.3 3.8 Q.8 1.4 .4 5.6 Q0 9.3 3 8.4 Q5.6 7.5 6.3 3.4 L5.9 8.5 7.8 7.8',
  б:'M7 .2 Q5.1 1.5 2.9 1.3 Q.8 1.4 .5 4.5 L.4 6 Q4.4 2.4 6.3 5 Q7.7 8.1 4 8.8 Q.7 9.2 .4 6',
  е:'M.5 6.4 Q6.1 5.4 6.3 3.6 Q4 .9 1.6 3.2 Q-1.5 8.2 2.8 8.7 Q5.2 9.1 7.2 7.1',
  р:'M1.1 3.5 L.1 12 M1.1 5.2 Q4.9 .1 6.8 3.9 Q8.4 7.3 4.7 8.5 Q2.1 9.1 1.1 7.6',
  у:'M.4 2.6 Q-.1 12.4 5.9 5.8 L6.9 2.9 Q5.6 14.8 .7 12.6 Q-1.2 11.4 2.4 9.9',
  ф:'M4.7 -.5 L3.6 12 M4.2 3.4 Q.5 1.7 0 5.6 Q-.2 9.5 3.9 7.8 Q8.4 10.3 8.5 5 Q8.1 2.5 4.2 3.4',
  в:'M-.2 8.2 Q6.2 3.6 4.8 .4 Q2.9 -2 1.9 4 L1.1 8.7 Q6.9 10.1 6.3 6 Q5.9 3.6 2.2 5.5',
  г:'M.1 6.8 Q1.7 2.1 4.8 3 Q8.4 3.4 5.1 5.3 L1.8 7.8 Q1.4 10.1 7.6 7.7',
  д:'M5.9 4 Q1.7 1.5 .6 5.3 Q-.6 9.9 3 8.1 L6.5 3.3 Q5.9 11.7 2.2 14.2 Q-2.5 15.6 1.1 11.2 L7.9 7.4',
  ж:'M.1 4.3 Q3.1 1.7 3.2 5.5 L.1 9 M3.1 6.4 L6 .9 4.1 9.3 M4.9 6.1 L9 3.1 M5.1 6.1 Q7.2 5.7 7.8 8.4 L9 7.8',
  з:'M-.1 5 Q2.9 1.6 5.1 3.2 Q6.7 4.7 2.9 6.3 Q8.5 4.3 5 10.2 Q3.6 13.7 .4 13.4 Q-2.5 12.5 2.8 9.6 L7.6 7.3',
  и:'M.7 3.9 L.1 8.8 Q1.8 11 6.8 2.7 L5.4 8.9 8.4 7',
  й:'M.7 3.9 L.1 8.8 Q1.8 11 6.8 2.7 L5.4 8.9 8.4 7 M2.3 .1 Q4.9 2.1 6.8 -.7',
  к:'M.4 9.1 L2 3 M1.6 6.5 Q7.2 .6 6.5 4 Q6.3 5.5 3.2 6.4 L5.5 9 8 7.6',
  л:'M-.9 8.8 Q.6 10.1 2.3 7.2 L5.6 2.4 Q4.9 11.2 8.1 7.5',
  м:'M-.6 9 Q1.5 9.5 3.2 2.8 L4.5 7.9 8.3 2.8 7.9 8.6 9.3 7.5',
  н:'M.5 9.3 L2.1 2.9 M.8 6.4 Q3.7 7 6.9 5 L7.6 2.8 6.1 8.8 8.8 7.5',
  о:'M7.4 4.6 Q4.2 1.6 1.8 4 Q-1.5 8.4 2 9 Q5.4 10 6.6 4.2 Q5.6 5.2 8.5 5.8',
  п:'M-.7 8.5 Q.9 7.8 2.2 3.1 L1.1 8.8 Q5.1 .7 6.4 3.5 L5.5 8.9 8.5 7.2',
  с:'M6.8 4.2 Q5.6 1.5 2.5 3.5 Q-1.6 7.4 1.2 8.9 Q4.4 10.2 8.3 6.6',
  т:'M-.7 8.5 L2.2 3.1 1.2 9 Q6.5 -1.1 4.7 6.1 L4 8.9 Q9.2 -1 7.9 6.1 L7.4 9 10 7.1',
  х:'M.3 4.3 Q3.8 1.1 4 6.1 Q4.4 10.9 8.3 7.1 M7.7 2.9 L.2 9.5',
  ц:'M1.1 2.9 Q-1.6 13.5 3.8 7.1 L6.8 2.8 5.8 9.1 Q9 5.4 7.3 11.4 Q6.1 14.8 6 11.7 L9.1 7.3',
  ч:'M1.2 2.7 Q-1.8 11.3 6.5 4.8 L7.1 2.6 6.1 9.4 8.7 7.4',
  ш:'M.8 3.3 Q-1.4 14 3.4 6.8 L5.1 3.2 Q2.4 13.7 7.3 6.8 L8.9 3.1 8 9.1 10.5 7.3',
  щ:'M.8 3.3 Q-1.4 14 3.4 6.8 L5.1 3.2 Q2.4 13.7 7.3 6.8 L8.9 3.1 8 9.1 Q11.3 5.4 9 12.1 L8.2 13.8 11.3 7.5',
  ь:'M-.3 8.4 L2.2 2.8 1.1 8.9 Q5.6 10 6.2 7.5 Q6.6 5.5 2.1 6.4 L8.4 5.5',
  ы:'M.2 3.3 L.2 8.8 Q5.6 10.3 5.7 7.3 Q5.8 5.3 .9 6.3 L7.9 4.9 8.3 2.9 7 9.1 9.4 7.4',
  я:'M6.1 3.3 Q1.6 1.8 .9 4.8 Q.7 6.6 4.3 6.1 L-.2 9.2 M6.6 2.9 L5.5 8.8 8.1 7.3',
  ё:'M.5 6.4 Q6.1 5.4 6.3 3.6 Q4 .9 1.6 3.2 Q-1.5 8.2 2.8 8.7 Q5.2 9.1 7.2 7.1 M2 .8 l.45 -.6 M5.7 .5 l.4 -.55',
  b:'M-.5 8.2 Q5.4 3.1 5.1 -1.1 Q3.8 -3 2.8 .3 L.8 8.7 Q6.8 11 6.9 5.2 Q6.8 2.4 4.5 4.1 Q5.3 6.6 9 5.2',
  d:'M6.4 3.8 Q1.2 1.4 .4 6 Q-.6 10.8 3.6 7.9 Q7.6 3.8 7.5 -2.3 L5.2 9 8.1 7.2',
  f:'M-.3 8.7 Q5.4 2.6 5.8 -1 Q5.2 -3 3.9 -.8 Q1.7 3.8 2.4 12.7 Q3.3 14.3 4.1 9.6 L3 6.5 8.3 5.4',
  h:'M-.3 8.7 Q5.4 3.8 5.7 -.5 Q5.2 -3.2 3.1 1 L.9 9.1 Q7.3 -1.5 6.2 6 L5.6 9 8.8 7.2',
  i:'M-.3 8.7 L3.3 3.1 2 9.1 6.4 6.8 M3.5 .4 l.3 -.5',
  j:'M-.2 8.8 L4.5 3.2 Q3.4 13.4 .2 14.2 Q-3 13.3 2.4 9.5 L6.7 7 M4.9 .9 l.3 -.8',
  l:'M-.6 8.6 Q5.2 3.8 5.2 -.6 Q4.3 -2.4 2.5 .7 Q-1 12.2 6.9 7.1',
  q:'M6.4 3.8 Q1.5 1.8 .4 5.8 Q-.4 10.5 3.1 8.1 L6.7 3 Q4.2 14 6.1 13 L8.2 7.2',
  r:'M-.6 8.7 Q2.3 6.2 2.5 3.5 Q2.2 1.2 1.2 4.6 L1.5 8.8 Q3.6 2.9 5.3 3.5 Q6.6 5.3 8.1 4.2',
  s:'M-.4 8.5 Q4.1 5.5 4.9 2.4 Q4.7 4.7 5.9 6.7 Q7.1 11.5 1.7 9 L-.2 8.4',
  t:'M-.2 8.5 Q3.4 5 4.7 .2 L2.4 8.3 Q3.2 10.6 7.7 6.7 M1.1 4 L7.9 3.1',
  v:'M-.6 5.4 Q1.8 .4 2.4 4.5 L2.2 9.1 Q6.4 6.5 7.1 2.8 Q6.6 5.5 9.1 5.2',
  z:'M.1 4.8 Q2.7 1.3 5.4 3.5 L.8 8.6 Q6.2 4.5 7.3 6.9 Q7.7 9 4.3 12.7 Q1.1 14 .9 11.7 L8.3 7.5',
};
// The quick and angular forms share a baseline but have different stroke orders.
const hooked = {
  а:'M.1 7.7 L2.9 3.4 6.1 3 2.6 8.5 .5 8.1 6.8 3.1 5.4 8.2 8.6 6',
  д:'M-.4 8.8 L2.9 3.8 6.4 3.4 5.1 8.6 M.7 8.5 L7.5 7.9 5.5 13.5 8.5 7.1',
  и:'M0 5.1 L2.3 3 .8 8.6 3.2 7.6 7.6 2.6 5.4 9.1 8 7.2',
  о:'M6.5 3.1 L2.6 3.3 .2 7.4 2.7 9 5.8 7 6.8 3.5 8.2 5.2',
  т:'M-.5 4.7 L8.5 2.9 M4.9 3.5 L3 9.2 7.9 7.2',
  е:'M.8 6.7 L5.9 4.4 4.5 2.7 1.2 4.4 .2 8 2.5 9 7.9 7',
  л:'M-1 10 L2 8.3 5.9 2.4 5.4 8.6 8.9 7',
};
const sameStroke = {a:'а', c:'с', e:'е', g:'д', k:'к', m:'т', n:'п', o:'о',
  p:'р', u:'и', w:'ш', x:'х', y:'у', A:'А', B:'В', C:'С', E:'Е', H:'Н', K:'К', M:'М',
  O:'О', P:'Р', T:'Т', X:'Х'};

// Trace each lifted stroke separately so a downstroke can spread like marker
// felt while the return stroke barely grazes the brick.
const sampler = document.createElementNS('http://www.w3.org/2000/svg','path');
function penStrokes(pathData) {
  return pathData.match(/M[^M]+/g).map(stroke => {
    sampler.setAttribute('d',stroke);
    const length=sampler.getTotalLength(), segments=Math.max(1,Math.ceil(length/1.3));
    return Array.from({length:segments+1},(_,i) => {
      const {x,y}=sampler.getPointAtLength(length*i/segments);
      return {x,y};
    });
  });
}

function drawInk(ctx, strokes, pressure, grit, phase) {
  ctx.beginPath();
  for (const stroke of strokes) {
    const left=[], right=[];
    for (let i=0; i<stroke.length; i++) {
      const p=stroke[i], before=stroke[Math.max(0,i-1)], after=stroke[Math.min(stroke.length-1,i+1)];
      const dx=after.x-before.x, dy=after.y-before.y, len=Math.hypot(dx,dy) || 1;
      const nx=-dy/len, ny=dx/len;
      const slip=grit*(.55*Math.sin(i*1.63+phase)+.45*Math.sin(i*.67+p.y+phase));
      const taper=i===0 || i===stroke.length-1 ? .72 : 1;
      const radius=pressure*taper*(.34+.29*Math.max(0,dy/len)+.22*Math.abs(.83*nx-.55*ny));
      left.push([p.x+nx*(slip+radius),p.y+ny*(slip+radius)]);
      right.push([p.x+nx*(slip-radius),p.y+ny*(slip-radius)]);
    }
    ctx.moveTo(...left[0]);
    for (const point of left.slice(1)) ctx.lineTo(...point);
    for (const point of right.reverse()) ctx.lineTo(...point);
    ctx.closePath();
  }
  ctx.fill();
}

function rasterizeLyrics() {
  const atlas = document.createElement('canvas');
  atlas.width = columns*cellW; atlas.height = rows*cellH;
  const ctx = atlas.getContext('2d',{willReadFrequently:true});
  ctx.font = 'italic 12px "Segoe Print", "Comic Sans MS", cursive';
  const paths = {...letters,...compactLetters};
  const glyphs = new Map();
  function glyph(c) {
    if (!glyphs.has(c)) {
      const lower = c !== c.toUpperCase();
      const [letter,accent] = c.normalize('NFD');
      const key = paths[c] ? c : sameStroke[letter] || letter;
      const path = paths[key] || paths[key.toUpperCase()];
      const small = lower && !paths[key];
      const mark=accent==='\u0301' ? ' M3.5 1.3 L6.5 -1.1' : '';
      const strokes = path && penStrokes(path+mark);
      const variant = hooked[key] && (key!=='т' || c==='т') ? penStrokes(hooked[key]+mark) : null;
      const width = c === ' ' ? 4.8 : c === ',' ? 3.9 :
        strokes ? (lower ? ('тщшмmw'.includes(c)?8.3:'ijl'.includes(c)?4.4:6.7) : 8.7)
        : Math.max(3,ctx.measureText(c).width);
      glyphs.set(c,{strokes,variant,small,width});
    }
    return glyphs.get(c);
  }
  const widthOf = word => Array.from(word).reduce((w,c) => w+glyph(c).width,0);
  function fit(text, areaW) {
    const words = text.split(' '), widths = words.map(widthOf);
    let low=0, high=6.2, best;
    for (let attempt=0; attempt<10; attempt++) {
      const scale=(low+high)/2, limit=areaW/scale-16, lines=[];
      let line='', w=0;
      for (let i=0;i<words.length;i++) {
        const combined = w+(line ? glyph(' ').width : 0)+widths[i];
        if (line && combined > limit) {
          lines.push({line,w}); line=words[i]; w=widths[i];
        } else {
          line+=(line ? ' ' : '')+words[i]; w=combined;
        }
      }
      lines.push({line,w});
      if (lines.every(l=>l.w<=limit) && (lines.length*15+4)*scale <= 93) {
        best={lines,scale}; low=scale;
      } else high=scale;
    }
    return best;
  }
  // Keep the pen inside each group: the GPU can weave the translated letters
  // from two tiles at runtime without cutting a character in half.
  const groupW = cellW/inkGroups;
  tiles.flatMap(wallFragments).forEach((text,index) => {
    if (!text.trim()) return;
    const n = Math.floor(index/inkGroups);
    const x=n%columns*cellW+(index%inkGroups)*groupW, y=Math.floor(n/columns)*cellH, areaW=124;
    let seed=18657+index*997;
    const random=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
    const slant=[-.46,-.25,.16][n%3], weight=1.45+random()*.65;
    const grit=.18+random()*.31, wave=.7+random()*1.05;
    const tracking=.88+random()*.23;
    const {lines,scale}=fit(text,areaW/tracking);
    ctx.save();
    ctx.beginPath(); ctx.rect(x+.3,y+1,groupW-.6,cellH-2);ctx.clip();
    ctx.translate(x,y); ctx.scale(groupW/areaW,cellH/100);
    ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle=ctx.fillStyle='#fff';
    lines.forEach(({line,w:lineW}, j) => {
      const startX=(areaW-lineW*scale*tracking)*(.34+.25*random());
      let penX=startX;
      const top=(100-((lines.length-1)*15+10)*scale)/2+j*15*scale;
      let lastExit=null;
      const rowPhase=random()*6, rise=random()-.5;
      let wordTilt=slant, step=0;
      for (const c of line) {
        const {strokes,variant,small,width}=glyph(c);
        if (c!==' ') {
          const bend=wave*Math.sin(rowPhase+step*.77)+rise*(step%7-3)+(random()-.5)*1.7;
          const sy=scale*(.87+random()*.31), tall=top+bend*scale;
          const tilt=wordTilt+(random()-.5)*.32, shear=(random()-.5)*.28;
          const nib=weight*(.87+.44*random());
          const offsetX=penX-tilt*5.7*sy;
          const form=variant && random()<.22+(n%3)*.17 ? variant : strokes;
          if (lastExit && form) {
            const first=form[0][0], start=small?2+first.y*.8:first.y;
            const linkX=offsetX+scale*tracking*first.x+tilt*sy*start;
            const linkY=tall+sy*start;
            ctx.lineWidth=scale*nib*.51; ctx.globalAlpha=.7;
            ctx.beginPath(); ctx.moveTo(...lastExit);
            ctx.quadraticCurveTo(penX+scale*2,lastExit[1]-.45*scale,linkX,linkY);ctx.stroke();
          }
          ctx.save(); ctx.translate(offsetX,tall);
          ctx.transform(scale*tracking,shear*scale,tilt*sy,sy,0,0);
          ctx.globalAlpha=.80+.20*random();
          if (form) {
            if (small) {ctx.translate(0,2);ctx.scale(.76,.8);}
            drawInk(ctx,form,nib,grit,random()*6);
            const end=form[0].at(-1);
            lastExit=[offsetX+end.x*scale*tracking+tilt*sy*end.y,tall+end.y*sy+shear*scale*end.x];
          } else {
            // Preserve the remaining uppercase Latin glyphs and punctuation.
            ctx.fillText(c,0,9.5);
            lastExit=null;
          }
          ctx.restore();
        } else {
          if (lastExit && step>1 && random()<.27) {
            ctx.lineWidth=scale*(.53+.25*random());ctx.globalAlpha=.77;
            ctx.beginPath();ctx.moveTo(...lastExit);
            ctx.quadraticCurveTo(penX+scale*1.8,lastExit[1]+scale*1.4,penX+scale*(3+random()*3),lastExit[1]-scale*(2+random()*3));
            ctx.stroke();
          }
          lastExit=null;wordTilt=slant+(random()-.5)*.4;
        }
        penX+=width*scale*tracking;step++;
      }
      if (j===lines.length-1 && n%8===0) {
        ctx.globalAlpha=.65;ctx.lineWidth=.7*scale;
        ctx.beginPath();ctx.moveTo(startX+scale,top+scale*12.8);
        ctx.lineTo(penX-scale*1.6,top+scale*(10+random()*2.2));
        ctx.lineTo(penX-scale*10,top+scale*13.3);
        ctx.stroke();
      }
    });
    ctx.restore();
    ctx.save();ctx.globalCompositeOperation='destination-out';ctx.globalAlpha=.42;
    for (let k=0;k<3;k++) ctx.fillRect(x+random()*(groupW-3),y+random()*cellH,1.2+1.8*random(),.7);
    ctx.restore();
  });
  return atlas.toDataURL('image/png').split(',')[1];
}

return rasterizeLyrics();
}"""


def main():
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server, sync_playwright() as pw:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        browser = pw.chromium.launch(channel="msedge", headless=True)
        try:
            page = browser.new_page()
            page.goto(f"http://127.0.0.1:{server.server_port}/robots.txt")
            raster = Image.open(io.BytesIO(base64.b64decode(page.evaluate(PAINTER)))).getchannel("A")
            # Sixteen ink densities keep the download small; the GPU interpolates between them.
            shades = raster.point(lambda a: round(a / 17))
            png = Image.frombytes("P", raster.size, shades.tobytes())
            png.putpalette([i*17 for i in range(16) for _ in range(3)])
            png.save(ROOT/"yard/assets/wall-lyrics-ink.png", bits=4, optimize=True)
        finally:
            browser.close()
            server.shutdown()


if __name__ == "__main__":
    main()
