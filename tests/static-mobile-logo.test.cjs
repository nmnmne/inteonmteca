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
  const context={isMobileViewport:mobile,document:{hidden},window:{inteonHomeEffects:{ambientBlocked:blocked,beat(){}}},
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
test('listening room keeps original copy',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.doesNotMatch(html,/Независимые голоса|Одна частота|LISTENING ROOM/);
});

test('catalogue wraps in both directions without growing rows or changing the visible offset',()=>{
 const begin=source.indexOf('const balanceInfiniteWheel =');
 const balance=source.slice(begin,source.indexOf('const fillInfiniteWheel',begin));
 const count=19, row=72, cycle=count*row;
 const children=Array.from({length:count*3},(_,index)=>({offsetTop:index*row}));
 const list={children,clientHeight:row*7,scrollTop:cycle};
 const context={tracks:Array(count),playlistList:list,wheelBalancing:false,
  playlistScrollTarget:cycle,draggingScroll:null,document:{activeElement:null}};
 vm.createContext(context);
 vm.runInContext(balance,context);
 for (const direction of [-1,1]) {
  for (let i=0;i<50;i++) {
   list.scrollTop=direction<0?cycle-23:2*cycle+23;
   context.playlistScrollTarget=list.scrollTop+15;
   context.draggingScroll={startTop:list.scrollTop-8};
   vm.runInContext('balanceInfiniteWheel()',context);
   assert.equal(list.scrollTop,direction<0?2*cycle-23:cycle+23);
   assert.equal(context.playlistScrollTarget-list.scrollTop,15,'pending momentum remains relative to the visible row');
   assert.equal(list.scrollTop-context.draggingScroll.startTop,8,'drag anchor follows recentering');
   assert.equal(list.children,children,'no rows are created while scrolling');
  }
 }
 const stable=cycle+100;list.scrollTop=stable;
 vm.runInContext('balanceInfiniteWheel()',context);
 assert.equal(list.scrollTop,stable,'ordinary scroll positions are untouched');
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
