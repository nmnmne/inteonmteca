"""Assemble the revised home around the preserved functional controller and logo."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
saved = root / '.hermes/plans/2026-10-04-vr-player/hour-start-snapshot'
# Reuse verified transport, handoff and mobile lifecycle fixes, not the discarded
# visual composition. The shared courtyard code is never copied or reset here.
for name in ['script.js', 'track-play.js']:
    (root/name).write_bytes((saved/name).read_bytes())
html = (saved/'index.html').read_text(encoding='utf-8')
html = html.replace('home-vr-20261004-1', 'vr-room-20261004-2')
html = html.replace('<div class="perception-field" aria-hidden="true"></div>', '''<picture class="room-scene" aria-hidden="true">
    <source media="(max-width: 800px), (pointer: coarse)" srcset="assets/vr-room-mobile-v1.webp">
    <img src="assets/vr-room-v1.webp" width="1672" height="941" alt="" fetchpriority="high" decoding="async">
  </picture>
  <div class="perception-field" aria-hidden="true"></div>''')
html = html.replace('<div class="active-track-copy">', '<div class="player-art" aria-hidden="true"><span></span></div>\n              <div class="active-track-copy">', 1)
html = html.replace('data-theme="desert"', 'data-theme="slate"', 1)
(root/'index.html').write_text(html, encoding='utf-8')
styles = (saved/'styles.css').read_text(encoding='utf-8')
(root/'styles.css').write_text(styles.rstrip()+'\n', encoding='utf-8')
css = (saved/'home-player.css').read_text(encoding='utf-8')
css = css.replace('max(5vw, calc((100vw - 1280px) / 2))', 'max(7.5vw, calc((100vw - 1320px) / 2))')
css = css.replace('--room-top: 108px;', '--room-top: 110px;')
css = css.replace('--tile-height: 82px;', '--tile-height: 76px;')
css = css.replace('--tile-gap: 10px;', '--tile-gap: 9px;')
css = css.replace('--glass-radius: 20px;', '--glass-radius: 16px;')
css = css.replace('--glass-border: rgba(var(--theme-text-rgb), .17);', '--glass-border: rgba(var(--theme-text-rgb), .26);')
css = css.replace('rgba(var(--theme-text-rgb), .065), rgba(var(--theme-text-rgb), .015)), rgba(var(--theme-panel-rgb), .76)', 'rgba(var(--theme-text-rgb), .09), rgba(var(--theme-text-rgb), .025)), rgba(var(--theme-panel-rgb), .49)')
css = css.replace('--glass-blur: 12px;', '--glass-blur: 16px;')
css = css.replace('minmax(0, .85fr) minmax(0, 1.15fr); gap: 6%', 'minmax(0, .95fr) minmax(0, 1.05fr); gap: 7%')
css = css.replace('font-size: clamp(40px, 5.3vw, 76px)', 'font-size: clamp(40px, 4.8vw, 72px)')
css = css.replace('grid-template-columns: minmax(160px, .85fr) minmax(280px, 1.3fr) 120px;', 'grid-template-columns: 78px minmax(160px, .8fr) minmax(280px, 1.2fr) 116px;')
css = css.replace('grid-template-columns: minmax(120px, 1fr) minmax(240px, 1.4fr) 90px;', 'grid-template-columns: 58px minmax(100px, .8fr) minmax(220px, 1.4fr) 80px;')
css = css.replace('.spatial-room .depth-floor { display: block;', '.spatial-room .depth-floor { display: none;')
css = css.replace('.spatial-room .logo-atmosphere { position:', '.spatial-room .logo-atmosphere { display: none; position:')
css = css.replace('.spatial-room .perception-visual { opacity: .28; }', '.spatial-room .perception-visual { opacity: .12; }')
# Insert design-specific material rules before responsive rules, not another override layer.
addition = '''
/* One static environment image; all interface and branding remain live HTML/SVG. */
.spatial-room { background: var(--theme-bg); }
.room-scene { position: fixed; inset: 0; z-index: 0; display: block; overflow: hidden; pointer-events: none; background: rgb(var(--theme-a-rgb)); }
.room-scene img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; filter: grayscale(.82); mix-blend-mode: luminosity; opacity: .83; }
.room-scene::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(var(--theme-panel-rgb), .3), transparent 52%, rgba(var(--theme-panel-rgb), .12)), linear-gradient(90deg, transparent 30%, rgba(var(--theme-panel-rgb), .22) 75%); }
.spatial-room .perception-field { opacity: .15; }
.spatial-room .theme-lights { opacity: .18; }
.spatial-room .track-viewport { backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-radius: var(--glass-radius); }
.spatial-room .track-art { background: repeating-radial-gradient(circle at center, transparent 0 4px, rgba(var(--theme-text-rgb), .13) 5px, transparent 6px), rgba(var(--theme-panel-rgb), .46); color: rgba(var(--theme-text-rgb), .8); text-shadow: 0 1px 4px #000; border-radius: 10px; }
.spatial-room .player-art { position: relative; display: grid; place-items: center; width: 78px; height: 78px; border-radius: 12px; border: 1px solid rgba(var(--theme-text-rgb), .18); background: repeating-radial-gradient(ellipse at 50% 50%, transparent 0 6px, rgba(var(--theme-text-rgb), .2) 7px, transparent 8px), linear-gradient(140deg, rgba(var(--theme-text-rgb), .1), transparent), rgba(var(--theme-panel-rgb), .55); }
.spatial-room .player-art span { width: 16px; height: 16px; border: 1px solid rgba(var(--theme-text-rgb), .6); border-radius: 50%; background: rgb(var(--theme-panel-rgb)); }
.spatial-room.is-signal .player-art { border-color: rgba(var(--theme-accent-rgb), .5); }
body.spatial-room .logo-wrap.release-logo { opacity: .8; }
'''
css = css.replace('@media (max-width: 1000px) {', addition+'\n@media (max-width: 1000px) {\n  .spatial-room .player-art { width: 58px; height: 58px; }', 1)
css = css.replace('@media (max-width: 600px) {', '@media (max-width: 600px) {\n  .spatial-room .player-art { display: none; }\n  .room-scene img { object-position: 34% center; opacity: .65; }', 1)
css = css.replace('@media (max-height: 540px) and (min-width: 501px) {', '@media (max-height: 540px) and (min-width: 501px) {\n  .spatial-room .player-art { display: none; }', 1)
(root/'home-player.css').write_text(css, encoding='utf-8')
script = (root/'script.js').read_text(encoding='utf-8').replace('setTheme(storedTheme || "desert",', 'setTheme(storedTheme || "slate",')
(root/'script.js').write_text(script, encoding='utf-8')
print('New home scene assembled with preserved functional engine')
