const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'script.js'),'utf8');
test('mobile uses an actual baked logo asset and no decorative scene loop',()=>{
 assert.ok(fs.existsSync(path.join(root,'assets/logo-fragmented.png')));
 assert.match(source,/backgroundViewport.addEventListener\("change", syncBackgroundRenderer\)/);
 assert.match(source,/cancelAnimationFrame\(sceneRaf\)/);
 const tickStart=source.indexOf('const tickVisuals =');
 assert.ok(tickStart >= 0);
 const tickSource=source.slice(tickStart,source.indexOf('\n};',tickStart)+3);
 for (const [mobile, hidden, blocked] of [[true,false,false],[false,true,false],[false,false,true],[false,false,false]]) {
  let frames=0, renders=0;
  const context={isMobileViewport:mobile,document:{hidden},window:{inteonHomeEffects:{ambientBlocked:blocked}},
   sceneRaf:123,isListeningRoom:false,lastVisualTick:0,immersiveState:{active:false},
   requestAnimationFrame:()=>{frames+=1; return 42;}};
  for (const fn of ['recordFramePacing','renderWeightedMotion','renderPerceptionField','renderInkField',
   'renderTitleMutation','renderPlayingLetters','loopPlaylistMotion','renderReactiveLogo']) context[fn]=()=>{renders+=1;};
  vm.runInNewContext(tickSource+'\ntickVisuals(100);',context);
  const paused=mobile||hidden||blocked;
  assert.equal(frames,paused?0:1,`RAF scheduling: mobile=${mobile}, hidden=${hidden}, blocked=${blocked}`);
  assert.equal(context.sceneRaf,paused?0:42);
  assert.equal(renders>0,!paused,'rendering only runs on an available desktop frame');
 }
 assert.match(source,/if \(isMobileViewport\) return;\s*if \(!logoVector/);
 const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
 assert.match(css,/mask-image: url\("assets\/logo-fragmented.png"\)/);
});
test('listening room keeps original copy and a finite catalogue',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.doesNotMatch(html,/Независимые голоса|Одна частота|LISTENING ROOM/);
 const balance=source.slice(source.indexOf('const balanceInfiniteWheel'),source.indexOf('const nearestItemForTrackIndex'));
 assert.doesNotMatch(balance,/layout === "catalog"/);
 assert.doesNotMatch(balance,/prependWheelCycle/);
 assert.match(balance,/replaceChildren\(\.\.\.tracks\.map/);
});
test('listening room exposes a complete transport',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/data-layout="catalog"/);
 for (const id of ['previous-track','next-track','current-time','duration-time','track-volume']) assert.ok(html.includes(`id="${id}"`),id);
 assert.match(html,/class="listening-intro"/);
});
test('public inline chat has an accessible mobile section switch and no teaser',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.doesNotMatch(html,/class="chat-sign"/);
 assert.match(html,/<section[^>]*class="chat-panel chat-inline"[^>]*id="chat-panel"[^>]*role="region"[^>]*aria-label="Чат"/);
 assert.match(html,/id="mobile-section-slider"[^>]*aria-label="Треки или чат"[^>]*aria-valuetext="Треки"[^>]*aria-controls="mobile-track-section chat-panel"/);
 assert.doesNotMatch(html,/<section[^>]*id="chat-panel"[^>]*\shidden(?:\s|>)/,'desktop chat is visible before script initialization');
});
