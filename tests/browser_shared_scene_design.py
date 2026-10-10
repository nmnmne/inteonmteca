"""Shared room design must survive every scene phase in every shipped palette."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge')
 for w,h in [(1440,900),(3391,1971),(390,844),(844,390)]:
  page=b.new_page(viewport={'width':w,'height':h});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script("localStorage.setItem('inteonmteca-theme-duration','604800000')")
  page.goto('http://127.0.0.1:8080/',wait_until='domcontentloaded');page.wait_for_timeout(600)
  themes=page.locator('#theme-select option').evaluate_all('es=>es.map(e=>e.value).filter(Boolean)')
  snapshot='''() => {const sels=['.release-card','.release-content','.track-viewport','.track-select','.track-title','.track-artist','.listening-intro h1','#active-player','#active-player .transport','#immersive-play','#active-track-artist','#active-player .now-playing-title','#chat-panel .chat-input'];const props=['width','height','fontSize','fontFamily','borderRadius','display','gridTemplateColumns','gridTemplateRows'];return Object.fromEntries(sels.map(sel=>{const s=getComputedStyle(document.querySelector(sel));return [sel,Object.fromEntries(props.map(p=>[p,s[p]]))]}));}'''
  for theme in themes:
   page.evaluate('theme=>setTheme(theme,{animate:false})',theme);page.wait_for_timeout(250)
   base=page.evaluate(snapshot)
   for phase in ['','scene-peek','scene-heading','scene-void','scene-energy','scene-dawn']:
    page.evaluate('phase=>{document.body.classList.remove("is-interlude","scene-peek","scene-heading","scene-void","scene-energy","scene-dawn");document.body.classList.add("is-interlude");if(phase)document.body.classList.add(phase)}',phase)
    page.wait_for_timeout(100)
    state=page.evaluate(snapshot)
    assert state==base,(w,h,theme,phase,{k:(base[k],state[k]) for k in base if base[k]!=state[k]})
    if phase=='scene-energy':
     logo=page.locator('#logo-wrap').bounding_box();player=page.locator('#active-player').bounding_box()
     assert abs(player['x']+player['width']/2-w/2)<2,(w,h,player)
     assert player['y']>=logo['y']+logo['height'] and player['y']+player['height']<=h+1,(w,h,logo,player)
   page.evaluate('document.body.classList.remove("is-interlude","scene-peek","scene-heading","scene-void","scene-energy","scene-dawn")')
  assert not errors,errors
  print(w,h,len(themes),'palettes: all six phases inherit player, playlist, typography and chat design',flush=True)
  page.close()
 b.close()
