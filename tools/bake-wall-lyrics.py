"""Rasterize the courtyard's source lyrics with the original marker strokes."""
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
const lyrics = [...new Set(lyricSheets.flatMap(sheet=>sheet.lines))];
const columns=16, rows=Math.ceil(lyrics.length/columns), cellW=128, cellH=28;
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
  а:'M6.3 3.8 Q.8 1.4 .4 5.6 Q0 9.3 3 8.4 Q5.6 7.5 6.3 3.4 L5.9 8.5 7.8 7.8',
  б:'M7 .2 Q5.1 1.5 2.9 1.3 Q.8 1.4 .5 4.5 L.4 6 Q4.4 2.4 6.3 5 Q7.7 8.1 4 8.8 Q.7 9.2 .4 6',
  е:'M.5 6.4 Q6.1 5.4 6.3 3.6 Q4 .9 1.6 3.2 Q-1.5 8.2 2.8 8.7 Q5.2 9.1 7.2 7.1',
  р:'M1.1 3.5 L.1 12 M1.1 5.2 Q4.9 .1 6.8 3.9 Q8.4 7.3 4.7 8.5 Q2.1 9.1 1.1 7.6',
  у:'M.4 2.6 Q-.1 12.4 5.9 5.8 L6.9 2.9 Q5.6 14.8 .7 12.6 Q-1.2 11.4 2.4 9.9',
  ф:'M4.7 -.5 L3.6 12 M4.2 3.4 Q.5 1.7 0 5.6 Q-.2 9.5 3.9 7.8 Q8.4 10.3 8.5 5 Q8.1 2.5 4.2 3.4',
};

function rasterizeLyrics() {
  const atlas = document.createElement('canvas');
  atlas.width = columns*cellW; atlas.height = rows*cellH;
  const ctx = atlas.getContext('2d',{willReadFrequently:true});
  ctx.font = 'italic 12px "Segoe Print", "Comic Sans MS", cursive';
  const paths = Object.fromEntries(Object.entries({...letters,...compactLetters})
    .map(([c,d]) => [c,new Path2D(d)]));
  const glyphs = new Map();
  function glyph(c) {
    if (!glyphs.has(c)) {
      const lower = c !== c.toUpperCase();
      const path = paths[c] || paths[c.toUpperCase()];
      const small = lower && !paths[c];
      const width = c === ' ' ? 4.6 : c === ',' ? 3.9 :
        path ? (lower ? 8 : 10) : Math.max(3,ctx.measureText(c).width+1);
      glyphs.set(c,{path,small,width});
    }
    return glyphs.get(c);
  }
  const widthOf = word => Array.from(word).reduce((w,c) => w+glyph(c).width,0);
  function fit(text, areaW) {
    const words = text.split(' '), widths = words.map(widthOf);
    let low=0, high=4.9, best;
    for (let attempt=0; attempt<10; attempt++) {
      const scale=(low+high)/2, limit=(areaW-10)/scale, lines=[];
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
      if (lines.every(l=>l.w<=limit) && (lines.length*15-2)*scale <= 86) {
        best={lines,scale}; low=scale;
      } else high=scale;
    }
    return best;
  }
  // Every line is painted once. Only a small tile index buffer changes as the
  // writing fades and reappears; the complete atlas has one byte per texel.
  lyrics.forEach((text,n) => {
    const x=n%columns*cellW, y=Math.floor(n/columns)*cellH, areaW=620;
    const {lines,scale}=fit(text,areaW);
    let seed=18657+n*997;
    const random=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
    ctx.clearRect(x,y,cellW,cellH);
    ctx.save(); ctx.translate(x,y); ctx.scale(cellW/areaW,cellH/100);
    ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle=ctx.fillStyle='#fff';
    lines.forEach(({line,w:lineW}, j) => {
      const startX=(areaW-lineW*scale)*(.31+.33*random());
      let penX=startX;
      const top=(100-(lines.length*15-4)*scale)/2+j*15*scale;
      for (const c of line) {
        const {path,small,width}=glyph(c);
        if (c!==' ') {
          ctx.save(); ctx.translate(penX,top+(random()-.5)*.7*scale);
          ctx.scale(scale,scale*(.95+.09*random()));
          ctx.transform(1,(random()-.5)*.06,-.05-random()*.07,1,0,0);
          ctx.lineWidth=1.1+.25*random(); ctx.globalAlpha=.83+.15*random();
          if (path) {
            if (small) {ctx.translate(0,2);ctx.scale(.76,.8);}
            else if (compactLetters[c]) ctx.translate(0,1.3);
            ctx.stroke(path);
          } else {
            // Keep original Latin case, accents, digits, quotes and punctuation.
            ctx.fillText(c,0,9.5);
          }
          ctx.restore();
        }
        penX+=width*scale;
      }
      if (j===lines.length-1 && n%8===0) {
        ctx.globalAlpha=.64; ctx.lineWidth=.79*scale;
        ctx.beginPath(); ctx.moveTo(startX+scale,top+scale*12.8);
        ctx.quadraticCurveTo((startX+penX)/2,top+scale*11.5,penX-scale*2,top+scale*13);
        ctx.stroke();
      }
    });
    ctx.restore();
    ctx.save();ctx.globalCompositeOperation='destination-out';ctx.globalAlpha=.42;
    for (let k=0;k<18;k++) ctx.fillRect(x+random()*(cellW-3),y+random()*cellH,1.2+1.8*random(),.7);
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
