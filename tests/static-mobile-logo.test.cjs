const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'script.js'),'utf8');
test('mobile uses an actual baked logo asset and no decorative scene loop',()=>{
 assert.ok(fs.existsSync(path.join(root,'assets/logo-fragmented.png')));
 assert.match(source,/backgroundViewport.addEventListener\("change", syncBackgroundRenderer\)/);
 assert.match(source,/cancelAnimationFrame\(sceneRaf\)/);
 assert.match(source,/if \(isMobileViewport\) return;\s*sceneRaf = requestAnimationFrame\(tickVisuals\)/);
 assert.match(source,/if \(isMobileViewport\) return;\s*if \(!logoVector/);
 const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
 assert.match(css,/mask-image: url\("assets\/logo-fragmented.png"\)/);
});
test('listening room keeps original copy and infinite two-way scrolling',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.doesNotMatch(html,/Независимые голоса|Одна частота|LISTENING ROOM/);
 const balance=source.slice(source.indexOf('const balanceInfiniteWheel'),source.indexOf('const nearestItemForTrackIndex'));
 assert.doesNotMatch(balance,/layout === "catalog"/);
 assert.match(balance,/prependWheelCycle/);
 assert.match(balance,/appendWheelCycle/);
});
test('listening room exposes a complete transport',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/data-layout="catalog"/);
 for (const id of ['previous-track','next-track','current-time','duration-time','track-volume']) assert.ok(html.includes(`id="${id}"`),id);
 assert.match(html,/class="listening-intro"/);
});
test('closed chat has only the accessible compact opener, no teaser',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.doesNotMatch(html,/class="chat-sign"/);
 assert.match(html,/id="chat-hint"[^>]*aria-controls="chat-panel"[^>]*aria-expanded="false"/);
 assert.match(html,/id="chat-panel"/);
});
