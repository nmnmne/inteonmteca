"""Compare browser import measurements with FFmpeg's EBU R128 meter in a clean Edge profile."""
import math
import os
import re
import subprocess
import wave
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from playwright.sync_api import sync_playwright


BASE = os.environ.get("INTEON_BASE_URL", "http://127.0.0.1:8080").rstrip("/")


def wave_fixture(folder, name, rate, samples):
    path = folder / (name + ".wav")
    with wave.open(str(path), "wb") as wav:
        wav.setparams((samples.shape[1], 2, rate, 0, "NONE", ""))
        wav.writeframes(np.round(np.clip(samples, -.99999, .99999) * 32767).astype("<i2").tobytes())
    return path


def reference(path):
    output = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", str(path), "-af",
        "ebur128=peak=true", "-f", "null", "-"], capture_output=True, check=True).stderr.decode()
    summary = output.rsplit("Summary:", 1)[1]
    integrated = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summary).group(1))
    true_peak = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", summary).group(1))
    return integrated, true_peak


def run(page, path):
    page.locator("#import-files").set_input_files(str(path))
    page.wait_for_function("document.querySelector('#import:not(:disabled)') && document.querySelector('#track-list .remove-track')", timeout=30000)
    page.wait_for_function("title => DJStorage.list().then(rows => rows.some(t => t.title === title))", arg=path.stem)
    return page.evaluate("title => DJStorage.list().then(rows => rows.find(t => t.title === title))", path.stem)

def check_streaming_fallback(page, folder):
    # A 21-minute FLAC costs only a few MB on disk because most of it is
    # silence. Native floating-point stereo decoding would require >440 MB.
    path=folder/'Adaptive-Level.flac'
    subprocess.run(['ffmpeg','-nostdin','-loglevel','error','-f','lavfi','-i',
        'sine=frequency=997:sample_rate=48000:duration=12','-af',
        "volume='if(lt(t,6),0.1,7)':eval=frame,apad=whole_dur=1260",
        '-ac','2','-c:a','flac','-compression_level','0','-y',str(path)], check=True)
    record=run(page,path)
    n=record['normalization']
    assert n['mode']=='adaptive' and n['integrated'] is None, n
    if page.locator('#dialog').is_visible():
        page.locator('#dialog-close').click()
    page.locator('#track-list tr').filter(has_text=record['title']).locator('[data-action=A]').click()
    page.locator('#deck-a .dd-play').click()
    page.wait_for_function("DJEngine.snapshot().A.time>3 && DJEngine.snapshot().A.time<6 && DJEngine.snapshot().A.level>.075")
    page.wait_for_function("""() => {
      const a=DJEngine.snapshot().A;
      return a.time>8 && a.time<12 && a.level>.07 && a.level<.33;
    }""")
    page.locator('#deck-a .dd-play').click()
    # Switching inputs clears the adaptive gain envelope. The deck meter
    # follows the new static trim and the existing channel fader.
    page.get_by_role('button', name='Mono — загрузить в деку A').click()
    page.wait_for_function("DJEngine.snapshot().A.track?.title==='Mono'")
    page.locator('#deck-a .dd-play').click()
    page.wait_for_function("DJEngine.snapshot().A.time>.5")
    peak,channel,gain=page.evaluate("() => {const a=DJEngine.snapshot().A; return [a.level,a.channel,a.track.normalization.gainDb]}")
    expected=.09 * 10**(gain/20) * channel
    assert abs(peak-expected)<.006, ('switched to measured mono',peak,expected)
    page.locator('#deck-a .dd-play').click()


def main():
    with TemporaryDirectory() as scratch, sync_playwright() as playwright:
        folder = Path(scratch)
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page()
        page.goto(BASE+"/", wait_until="domcontentloaded")
        page.wait_for_function("window.DJImport && window.DJStorage && window.DJImportLoudness")
        for phase, rate, name in [(0,44100,'Quiet'), (.25,48000,'Loud')]:
            t=np.arange(rate*5)/rate
            a=np.where(t<2,.002 if not phase else .2,.11 if not phase else .65)
            left=np.sin(2*np.pi*997*t)*a
            right=np.sin(2*np.pi*997*t + np.pi)*a*.83
            path=wave_fixture(folder,name,rate,np.column_stack([left,right]))
            measured=run(page,path)['normalization']
            actual_i, actual_peak=reference(path)
            assert measured['status']=='measured' and measured['sampleRate']==rate
            assert abs(measured['integrated']-actual_i)<.14, (measured,actual_i)
            assert abs(measured['truePeak']-actual_peak)<.18, (measured,actual_peak)
            assert abs(measured['gainDb']-min(-14-actual_i,-1-actual_peak))<.18
        mono=wave_fixture(folder,'Mono',48000,
            (.09*np.sin(2*np.pi*997*np.arange(48000*2)/48000))[:,None])
        measured=run(page,mono)['normalization']
        actual_i,actual_peak=reference(mono)
        assert abs(measured['integrated']-actual_i)<.14 and measured['channels']==1
        assert abs(measured['playbackIntegrated']-actual_i-10*math.log10(2))<.14
        assert abs(measured['gainDb']-min(-14-actual_i-10*math.log10(2),-1-actual_peak))<.18
        # At fs/4 with a pi/4 phase offset the reconstructed sine is 3 dB higher
        # than its samples. Isolated high crest also exercises the peak ceiling.
        t=np.arange(48000*2)/48000
        samples=np.sin(2*np.pi*12000*t + np.pi/4)*.02
        samples[48000:48032]*=45
        path=wave_fixture(folder,'InterSample',48000,np.column_stack([samples,samples]))
        record=run(page,path)
        measured=record['normalization']
        assert measured['truePeak'] > 20*math.log10(max(abs(samples)))+1.4, measured
        assert abs(measured['gainDb']+measured['truePeak']+1) < 1e-6

        # Simulate a pre-migration entry, reload normally, and hydrate both decks
        # concurrently. The measured result must also survive the next reload.
        page.evaluate("""async id => {
            const db = await new Promise(resolve => {
              const request = indexedDB.open('inteonmteca-dj-imports');
              request.onsuccess = () => resolve(request.result);
            });
            await new Promise((resolve, reject) => {
              const tx=db.transaction('tracks','readwrite'), store=tx.objectStore('tracks');
              const read=store.get(id);
              read.onsuccess=()=>{const row=read.result;delete row.normalization;store.put(row)};
              tx.oncomplete=resolve;tx.onerror=reject;
            });
            db.close();
        }""", record['id'])
        page.reload(wait_until='domcontentloaded')
        restored=page.evaluate("""async id => {
            const row=(await DJStorage.list()).find(r=>r.id===id);
            if(row.normalization) throw Error('test setup left saved measurement');
            await Promise.all([DJStorage.hydrate(row), DJStorage.hydrate(row)]);
            const saved=(await DJStorage.list()).find(r=>r.id===id);
            return [row.normalization, saved.normalization, row.src.startsWith('blob:')];
        }""",record['id'])
        assert restored == [measured,measured,True], restored
        check_streaming_fallback(page,folder)
        browser.close()
    print("Import gating, mono/stereo gain, true peak, legacy upgrades and live adaptive gain on a long FLAC passed.")


if __name__ == "__main__":
    main()
