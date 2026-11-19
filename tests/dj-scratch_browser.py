"""Exercise the vinyl transport and measure the sound it actually records in Edge."""
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


def exercise(page, fallback=False):
    if fallback:
        page.add_init_script("Object.defineProperty(AudioContext.prototype,'audioWorklet',{get(){return null}})")
    for name in ("dj-engine.js", "dj-scratch.js"):
        page.route("http://localhost/" + name, lambda r: r.fulfill(
            path=ROOT / r.request.url.rsplit("/", 1)[-1], content_type="application/javascript"))
    page.route("http://localhost/test", lambda r: r.fulfill(content_type="text/html", body="""
      <button onclick="DJEngine.setOutputLayout('stereo')">Open mixer</button>
      <script src="/dj-scratch.js"></script><script src="/dj-engine.js"></script>"""))
    page.goto("http://localhost/test")
    page.get_by_role("button").click()
    page.evaluate("""() => {
      const rate=44100, frames=rate*8, data=new ArrayBuffer(44+frames*2);
      const v=new DataView(data), text=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
      text(0,'RIFF'); v.setUint32(4,data.byteLength-8,true); text(8,'WAVE'); text(12,'fmt ');
      v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
      v.setUint32(24,rate,true); v.setUint32(28,rate*2,true); v.setUint16(32,2,true);
      v.setUint16(34,16,true);text(36,'data');v.setUint32(40,frames*2,true);
      // Asymmetric triangle: rising 85% of each cycle, falling for the remaining 15%.
      for(let i=0;i<frames;i++){
        const p=(i%315)/315, x=p<.85?p/.85:(1-p)/.15;
        v.setInt16(44+i*2,Math.round(17500*(2*x-1)),true);
      }
      const src=URL.createObjectURL(new Blob([data],{type:'audio/wav'}));
      window.fixture={id:'vinyl-fixture',title:'Vinyl fixture',duration:8,bpm:120,src};
      DJEngine.load('A',fixture);DJEngine.load('B',fixture);DJEngine.setCross(-1);DJEngine.seek('A',2.5);
      addEventListener('dj-recorded',e=>window.recorded=e.detail.blob);
    }""")
    page.wait_for_function("['A','B'].every(id=>DJEngine.snapshot()[id].scratchStatus==='ready')")
    page.wait_for_function("Math.abs(DJEngine.snapshot().A.time-2.5)<.01")
    result = page.evaluate("""async() => {
      const delay=ms=>new Promise(r=>setTimeout(r,ms));
      DJEngine.toggleRecording();await delay(240);
      if(!DJEngine.beginScratch('A')) throw Error('Cannot grab paused deck');
      const stroke=async direction=>{
        for(let n=0;n<34;n++){
          DJEngine.moveScratch('A',direction*.018);
          await delay(18);
        }
      };
      await stroke(1); await delay(200); await stroke(-1); await delay(200);
      const hold=DJEngine.snapshot().meters.left, release=DJEngine.snapshot().A.time;
      DJEngine.endScratch('A'); await delay(100);
      const paused=!DJEngine.snapshot().A.playing;
      DJEngine.toggleRecording();
      while(!window.recorded)await delay(10);
      const ctx=new AudioContext(), recordedPCM=await ctx.decodeAudioData(await recorded.arrayBuffer());
      const x=recordedPCM.getChannelData(0), step=Math.round(recordedPCM.sampleRate*.10), votes=[];
      for(let start=0;start+step<x.length;start+=step){
        let up=0,down=0,power=0;
        for(let i=start+1;i<start+step;i++){
          const dx=x[i]-x[i-1];if(dx>.0002)up++;if(dx<-.0002)down++;power+=x[i]*x[i];
        }
        if(power/step>.002 && up+down>step*.25)votes.push(up/(up+down));
      }
      await ctx.close();
      return {votes,hold,release,paused};
    }""")
    votes = result["votes"]
    forward = [i for i, value in enumerate(votes) if value > .62]
    reverse = [i for i, value in enumerate(votes) if value < .38]
    assert len(forward) >= 3 and len(reverse) >= 3 and min(forward) < min(reverse), result
    assert result["paused"] and result["hold"] < .001 and abs(result["release"] - 2.5) < .01, result
    page.evaluate("DJEngine.toggle('A')")
    page.wait_for_function("DJEngine.snapshot().A.playing && DJEngine.snapshot().A.time>2.6")
    assert page.evaluate("DJEngine.beginScratch('A') && DJEngine.beginScratch('B')")
    page.evaluate("DJEngine.moveScratch('B',.4);DJEngine.endScratch('A');DJEngine.endScratch('B')")
    page.wait_for_function("DJEngine.snapshot().A.time>2.8")
    assert page.evaluate("!DJEngine.snapshot().B.playing && Math.abs(DJEngine.snapshot().B.time-.4)<.01")
    page.evaluate("DJEngine.beginScratch('A'); DJEngine.load('A',fixture); DJEngine.endScratch('A')")
    assert page.evaluate("!DJEngine.snapshot().A.scratching && !DJEngine.snapshot().A.playing")
    print(("LAN audio callback" if fallback else "AudioWorklet"),
          "recorded forward and reverse PCM, silent hold, two hands and safe track change.")


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel=os.getenv("DJ_TEST_BROWSER","msedge"), headless=True)
        try:
            for fallback in (False, True):
                page = browser.new_page(accept_downloads=True)
                exercise(page, fallback)
                page.close()
        finally:
            browser.close()
