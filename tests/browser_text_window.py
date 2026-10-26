"""Focused text-wave virtualization checks, without server, audio, or chat writes."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

SOURCE = (Path(__file__).resolve().parents[1] / 'text-waves.js').read_text(encoding='utf-8')
CSS = (Path(__file__).resolve().parents[1] / 'text-waves.css').read_text(encoding='utf-8')
HTML = '''<!doctype html><meta charset="utf-8"><style>
body{margin:0;font:16px monospace}h1{font-size:22px}.track-list{height:420px;overflow:auto;width:360px;margin:0;padding:0}
.track-item{height:70px;box-sizing:border-box;display:block;padding:8px}.track-select{width:100%;height:100%;display:flex;align-items:center}
.track-art{width:32px;height:32px;flex:none}.track-art img{width:32px;height:32px}.track-copy{min-width:0;text-align:left}
.track-title,.track-artist{white-space:nowrap;overflow:hidden}.text-wave-run{display:inline}.text-wave-char{position:relative}.text-wave-mask{position:absolute;inset:0}
</style><div class="listening-intro"><h1>Выбери свой звук</h1></div><ul class="track-list"></ul><span class="transport-time">0:00</span>
<script>
window.inteonHomeEffects={ambientPaused:true,ambientBlocked:false,beat(){},watch(){}};
let seed=12345;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
for(let i=0;i<63;i++){
 const row=document.createElement('li');row.className='track-item';
 row.innerHTML=`<button class="track-select"><span class="track-art" aria-hidden="true"><img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='2'/%3E"></span><span class="track-copy"><span class="track-title"></span><span class="track-artist">Матт</span></span></button>`;
 row.querySelector('.track-title').textContent='Трек '+i+' — ночь & тишина';
 row.querySelector('button').setAttribute('aria-label','Воспроизвести трек '+i);
 document.querySelector('.track-list').append(row);
}
window.originalTitles=[...document.querySelectorAll('.track-title')].map(el=>el.textContent);
window.coverReferences=[...document.images];
</script>'''

def snapshot(page):
    return page.evaluate('''() => {
      const list=document.querySelector('.track-list'), clip=list.getBoundingClientRect();
      const rows=[...document.querySelectorAll('.track-item')];
      return {dom:document.querySelectorAll('*').length,glyphs:document.querySelectorAll('.text-wave-char').length,
        wrappedRows:rows.filter(row=>row.querySelector('.text-wave-char')).length,
        farWrapped:rows.filter(row=>{const r=row.getBoundingClientRect();return (r.bottom<clip.top-74||r.top>clip.bottom+74)&&row.querySelector('.text-wave-char')}).length,
        titles:[...document.querySelectorAll('.track-title')].map(el=>el.textContent),
        coversIntact:[...document.images].every((img,i)=>img===coverReferences[i]),
        nestedRuns:document.querySelectorAll('.text-wave-run .text-wave-run').length,
        labels:rows.every((row,i)=>row.querySelector('button').getAttribute('aria-label')==='Воспроизвести трек '+i),
        allMasksHidden:[...document.querySelectorAll('.text-wave-mask')].every(el=>el.getAttribute('aria-hidden')==='true')};
    }''')

with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    results=[]
    for mobile in (False,True):
        context=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile)
        page=context.new_page(); errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.set_content(HTML)
        page.add_style_tag(content=CSS)
        original=page.evaluate('originalTitles')
        page.add_script_tag(content=SOURCE)
        page.wait_for_function("document.querySelector('.track-item .text-wave-char')")
        assert page.evaluate("document.querySelector('.text-wave-mask').getBoundingClientRect().width > 0")
        page.evaluate('''() => {
          window.glyphGeometryReads=0;
          const read=Element.prototype.getBoundingClientRect;
          Element.prototype.getBoundingClientRect=function(...args){
            if(this.classList.contains('text-wave-char')) glyphGeometryReads++;
            return read.apply(this,args);
          };
        }''')
        page.wait_for_timeout(1400)
        page.evaluate('glyphGeometryReads=0')
        page.wait_for_timeout(1400)
        assert page.evaluate('glyphGeometryReads')==0,'stable glyph boxes must be reused while symbols animate'
        page.evaluate("window.dispatchEvent(new Event('resize'))")
        page.wait_for_function('glyphGeometryReads>0')
        samples=[]
        for position in (0,1400,2800,3990,700,0):
            page.evaluate('(y)=>document.querySelector(".track-list").scrollTop=y',position)
            page.wait_for_function('''() => {
              const list=document.querySelector('.track-list'),clip=list.getBoundingClientRect();
              return [...document.querySelectorAll('.track-item')].every(row=>{
                const r=row.getBoundingClientRect();return !(r.bottom<clip.top-74||r.top>clip.bottom+74)||!row.querySelector('.text-wave-char');
              })&&[...document.querySelectorAll('.track-item')].some(row=>{const r=row.getBoundingClientRect();return r.bottom>clip.top&&r.top<clip.bottom&&row.querySelector('.text-wave-char')});
            }''')
            sample=snapshot(page)
            assert sample['wrappedRows']<=10,sample
            assert sample['farWrapped']==0,sample
            assert sample['titles']==original,sample
            assert sample['coversIntact'] and sample['labels'] and sample['allMasksHidden'],sample
            assert sample['nestedRuns']==0,sample
            samples.append({k:sample[k] for k in ('dom','glyphs','wrappedRows')})
        # The first repeated row is ordinary original text again when far away.
        page.evaluate('document.querySelector(".track-list").scrollTop=2800')
        page.wait_for_function('!document.querySelector(".track-item:first-child .text-wave-run")')
        page.evaluate('''() => {
          document.querySelector('.track-item:first-child .track-title').textContent='Новое название & 雨';
          document.querySelector('.transport-time').textContent='3:47';
        }''')
        page.evaluate('document.querySelector(".track-list").scrollTop=0')
        page.wait_for_function('document.querySelector(".track-item:first-child .text-wave-char")')
        assert page.locator('.track-title').first.text_content()=='Новое название & 雨'
        assert page.locator('.transport-time').text_content()=='3:47'
        assert snapshot(page)['coversIntact']
        # Heavy backgrounds are resting for this whole fixture; letters still run.
        signatures=set()
        for _ in range(10):
            page.wait_for_timeout(150)
            signatures.add(page.evaluate("[...document.querySelectorAll('.text-wave-mask')].map(el=>el.dataset.glyph||'').join('')"))
        assert len(signatures)>1,'letters should keep moving during heavy-layer rest'
        assert not errors,errors
        results.append({'mobile':mobile,'samples':samples,'movingSignatures':len(signatures),'errors':errors})
        context.close()
    browser.close()
    print(json.dumps(results,ensure_ascii=False))
