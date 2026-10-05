from pathlib import Path
p=Path('home-player.css'); s=p.read_text(encoding='utf-8')
replacements={
'--spatial-gutter: max(7.5vw, calc((100vw - 1320px) / 2));':'--spatial-gutter: clamp(32px, 3.333vw, 64px);',
'--room-top: 110px;':'--room-top: clamp(108px, 13dvh, 140px);',
'--dock-height: 144px;':'--dock-height: 124px;',
'--room-gap: 24px;':'--room-gap: 36px;',
'--tile-height: 76px;':'--tile-height: 70px;',
'--tile-gap: 9px;':'--tile-gap: 1px;',
'--glass-radius: 16px;':'--glass-radius: 6px;',
'--glass-border: rgba(var(--theme-text-rgb), .26);':'--glass-border: rgba(var(--theme-text-rgb), .24);',
'--glass-bg: linear-gradient(115deg, rgba(var(--theme-text-rgb), .09), rgba(var(--theme-text-rgb), .025)), rgba(var(--theme-panel-rgb), .49);':'--glass-bg: linear-gradient(112deg, rgba(var(--theme-text-rgb), .065), transparent 38%, rgba(var(--theme-a-rgb), .025)), rgba(var(--theme-panel-rgb), .5);',
'--glass-highlight: inset 0 1px 0 rgba(var(--theme-text-rgb), .07);':'--glass-highlight: inset 0 1px 0 rgba(var(--theme-text-rgb), .16), inset 1px 0 0 rgba(147, 174, 204, .09);',
'--glass-shadow: var(--glass-highlight), 0 12px 36px #0002;':'--glass-shadow: var(--glass-highlight), 0 18px 40px #0006, 0 2px 4px #0005;',
'--glass-blur: 16px;':'--glass-blur: 10px;',
'grid-template-columns: minmax(0, .95fr) minmax(0, 1.05fr); gap: 7%;':'grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); gap: 5%;',
'padding: 42px 0 0;':'padding: clamp(40px, 6dvh, 70px) 0 0 24px;',
'font-size: clamp(40px, 4.8vw, 72px);':'font-size: clamp(44px, 5.55vw, 100px);',
'letter-spacing: -.06em;':'letter-spacing: -.065em;',
'* .2); top:':'* .205); top:',
'* .72); width:':'* .74); width:',
'flex: 0 0 40px;':'flex: 0 0 42px;',
'padding: 2px; overflow-y:':'padding: 0; overflow-y:',
'padding: 12px 18px; border: 1px solid var(--glass-border); border-radius: var(--glass-radius); background: var(--glass-bg); box-shadow: var(--glass-shadow);':'padding: 10px 22px; border: 1px solid transparent; border-bottom-color: rgba(var(--theme-text-rgb), .12); border-radius: 0; background: linear-gradient(110deg, rgba(var(--theme-text-rgb), .015), transparent); box-shadow: none;',
'border-color: rgba(var(--theme-text-rgb), .45); background-color: rgba(var(--theme-text-rgb), .065);':'border-color: rgba(var(--theme-text-rgb), .32); background-color: rgba(var(--theme-text-rgb), .075);',
'border-color: rgba(var(--theme-accent-rgb), .62); background-color: rgba(var(--theme-accent-rgb), .08);':'border-color: rgba(var(--theme-accent-rgb), .4); background-color: rgba(var(--theme-accent-rgb), .075); box-shadow: inset 2px 0 rgb(var(--theme-accent-rgb));',
'grid-template-columns: 48px minmax(0, 1fr);':'grid-template-columns: 42px minmax(0, 1fr);',
'width: 48px; height: 48px; border-radius: 12px;':'width: 42px; height: 42px; border-radius: 2px;',
'grid-template-columns: 78px minmax(160px, .8fr) minmax(280px, 1.2fr) 116px;':'grid-template-columns: 64px minmax(160px, 1fr) minmax(280px, 1.25fr) 132px;',
'gap: 0 28px;':'gap: 0 26px;',
'padding: 18px 26px;':'padding: 12px 24px;',
'grid-template-columns: 1fr 60px 1fr; grid-template-rows: 60px 44px;':'grid-template-columns: 1fr 52px 1fr; grid-template-rows: 52px 44px;',
'width: 60px; height: 60px; min-width: 60px; min-height: 60px;':'width: 52px; height: 52px; min-width: 52px; min-height: 52px;',
'font: 9px/1.5 ui-monospace, monospace;':'font: 10px/1.5 ui-monospace, monospace;',
'border-radius: var(--glass-radius); background: var(--glass-bg); box-shadow: var(--glass-highlight);':'border-radius: 3px; background: linear-gradient(120deg, rgba(var(--theme-text-rgb), .04), transparent), rgba(var(--theme-panel-rgb), .24); box-shadow: var(--glass-highlight);',
'.room-scene img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; filter: grayscale(.82) brightness(.82); mix-blend-mode: luminosity; opacity: .83; }':'.room-scene img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; filter: saturate(.72) contrast(1.08) brightness(.92); opacity: 1; }',
'background: linear-gradient(180deg, rgba(var(--theme-panel-rgb), .3), transparent 52%, rgba(var(--theme-panel-rgb), .12)), linear-gradient(90deg, transparent 30%, rgba(var(--theme-panel-rgb), .22) 75%);':'background: linear-gradient(180deg, rgba(var(--theme-panel-rgb), .2), transparent 48%, rgba(var(--theme-panel-rgb), .1)), linear-gradient(90deg, transparent 28%, rgba(var(--theme-panel-rgb), .22) 80%);',
'.spatial-room .track-viewport { backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-radius: var(--glass-radius); }':'.spatial-room .track-viewport { backdrop-filter: blur(7px); -webkit-backdrop-filter: blur(7px); border: 1px solid var(--glass-border); border-radius: 3px; background: var(--glass-bg); box-shadow: var(--glass-highlight), 0 28px 48px #0005; }',
'.spatial-room .track-art { background: repeating-radial-gradient(circle at center, transparent 0 4px, rgba(var(--theme-text-rgb), .13) 5px, transparent 6px), rgba(var(--theme-panel-rgb), .46); color: rgba(var(--theme-text-rgb), .8); text-shadow: 0 1px 4px #000; border-radius: 10px; }':'.spatial-room .track-art { background: radial-gradient(circle, transparent 46%, rgba(var(--theme-text-rgb), .18) 48%, transparent 51%), linear-gradient(135deg, rgba(var(--theme-text-rgb), .05), transparent); color: rgba(var(--theme-text-rgb), .65); border-radius: 2px; }',
'width: 78px; height: 78px; border-radius: 12px;':'width: 64px; height: 64px; border-radius: 3px;',
'body.spatial-room .logo-wrap.release-logo { opacity: .8; }':'body.spatial-room .logo-wrap.release-logo { opacity: .95; }',
'--room-top: 92px;':'--room-top: 100px;',
'--tile-height: 78px;':'--tile-height: 72px;',
'.spatial-room .listening-intro { padding-top: 34px; }':'.spatial-room .listening-intro { padding: 36px 0 0 8px; }',
'.room-scene img { object-position: 34% center; opacity: .65; }':'.room-scene img { object-position: 30% center; opacity: .92; }',
'--dock-height: 204px;':'--dock-height: 174px;',
'--tile-gap: 8px; --glass-radius: 18px;':'--tile-gap: 1px; --glass-radius: 5px;',
'grid-template-rows: 132px minmax(0, 1fr);':'grid-template-rows: 116px minmax(0, 1fr);',
'top: 183px; left: 50%; width: min(320px, 88vw); opacity: .65;':'top: 168px; left: 50%; width: min(282px, 80vw); opacity: .85;',
'width: 42px; height: 42px; border-radius: 10px;':'width: 42px; height: 42px; border-radius: 2px;',
'grid-template-rows: 58px 104px; align-content: start; gap: 10px 12px; padding: 14px 16px 18px;':'grid-template-rows: 52px 92px; align-content: start; gap: 0 12px; padding: 10px 16px 18px;',
'.spatial-room .active-player .transport { grid-column: 1 / -1; grid-row: 2; }':'.spatial-room .active-player .transport { grid-column: 1 / -1; grid-row: 2; grid-template-rows: 48px 44px; grid-template-columns: 1fr 48px 1fr; }\n  .spatial-room .active-player .transport-play { width: 48px; height: 48px; min-width: 48px; min-height: 48px; }',
'font-size: 8px; bottom: calc(28px':'font-size: 9px; bottom: calc(26px',
}
for old,new in replacements.items():
    if old not in s: raise Exception('Missing pattern '+old[:80])
    s=s.replace(old,new)
s += '''
/* Room architecture: fixed optical layers, independent of the live logo engine.
   Marks are geometry only; no invented copy, metadata or interaction targets. */
.spatial-room .hero-header {
  position: fixed;
  inset: 82px var(--spatial-gutter) auto;
  width: auto;
  height: 9px;
  overflow: visible;
  border-top: 1px solid rgba(var(--theme-text-rgb), .13);
  background: linear-gradient(90deg, #98bba9 0 22px, transparent 22px) left top / 100% 1px no-repeat;
  pointer-events: none;
}
.spatial-room .hero-header::before,
.spatial-room .hero-header::after {
  content: '';
  position: absolute;
  top: -4px;
  width: 1px;
  height: 8px;
  background: rgba(var(--theme-text-rgb), .42);
}
.spatial-room .hero-header::after { right: 0; }
.spatial-room .catalog-heading { position: relative; padding: 0 2px; }
.spatial-room .catalog-heading::after {
  content: '';
  position: absolute;
  bottom: 13px;
  left: 2px;
  width: 28px;
  height: 2px;
  background: repeating-linear-gradient(90deg, #a6cbb9 0 2px, transparent 2px 7px);
  opacity: .7;
}
.spatial-room .depth-floor {
  display: block;
  inset: 63% -40% -35%;
  background-image: linear-gradient(rgba(147, 175, 165, .11) 1px, transparent 1px), linear-gradient(90deg, rgba(147, 175, 165, .09) 1px, transparent 1px);
  background-size: 180px 110px;
  opacity: .55;
}
.spatial-room .active-player::before {
  content: '';
  position: absolute;
  inset: 4px 5px;
  width: auto;
  height: auto;
  border: 1px solid rgba(var(--theme-text-rgb), .055);
  border-top-color: transparent;
  border-radius: 3px;
  background: none;
  filter: none;
  transform: none;
  opacity: 1;
  pointer-events: none;
}
.spatial-room .active-player::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 12px;
  right: 12px;
  height: 5px;
  border: 1px solid rgba(var(--theme-text-rgb), .16);
  border-top: 0;
  background: rgba(var(--theme-panel-rgb), .7);
  transform: skewX(-28deg);
  pointer-events: none;
}
.spatial-room .active-track-copy { border-right: 1px solid rgba(var(--theme-text-rgb), .12); padding-right: 24px; }
.spatial-room .transport-skip:hover:not(:disabled) { background: rgba(var(--theme-text-rgb), .07); }
.spatial-room .track-artist { animation: none; }
.spatial-room .track-item.is-playing .track-title { color: rgb(var(--theme-text-rgb)); }
.spatial-room .topline, .spatial-room .label, .spatial-room .catalog-heading h2,
.spatial-room .catalog-heading .ours, .spatial-room .player-caption,
.spatial-room .transport-time, .spatial-room .volume-control label { font-family: Consolas, 'Liberation Mono', monospace; }
@media (min-width: 1001px) {
  .spatial-room .volume-control { border-left: 1px solid rgba(var(--theme-text-rgb), .12); padding-left: 22px; }
}
@media (min-width: 601px) and (max-width: 850px) and (min-height: 541px) {
  .spatial-room { --room-top: 104px; --dock-height: 132px; }
  .spatial-room .release-card { grid-template-columns: minmax(0, .68fr) minmax(0, 1.32fr); gap: 4%; }
  .spatial-room .listening-intro { padding-left: 0; }
  .spatial-room .listening-intro h1 { font-size: clamp(32px, 4.55vw, 40px); }
  .spatial-room .active-player { grid-template-columns: minmax(0, 1fr) minmax(220px, 1.4fr) 78px; gap: 0 16px; padding-inline: 18px; }
  .spatial-room .player-art { display: none; }
  html[data-theme] .spatial-room .active-player .now-playing-title { font-size: 17px; }
  body.spatial-room .logo-wrap.release-logo { left: 21%; width: 37%; }
}
@media (max-width: 600px) {
  .spatial-room .hero-header { display: none; }
  .spatial-room .active-track-copy { border: 0; padding-right: 0; }
  .spatial-room .catalog-heading::after { bottom: 8px; width: 16px; height: 1px; }
  .spatial-room .track-viewport { backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
  .spatial-room .track-meta { gap: 3px; }
  .spatial-room .volume-control label { font-size: 9px; }
  .spatial-room .depth-floor { opacity: .25; }
}
@media (max-height: 540px) {
  .spatial-room .hero-header { display: none; }
}
'''
p.write_text(s,encoding='utf-8')
p=Path('index.html'); s=p.read_text(encoding='utf-8'); s=s.replace('home-player.css?v=vr-room-20261004-3','home-player.css?v=astra-room-20261005-1'); p.write_text(s,encoding='utf-8')
print('Updated visual surface and CSS cache key; DOM and copy unchanged.')
