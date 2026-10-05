"""User-authorized, scoped home rollback with a recoverable snapshot."""
from pathlib import Path
import json
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
snapshot = root / '.hermes/plans/2026-10-04-vr-player/hour-start-snapshot'
snapshot.mkdir(parents=True, exist_ok=True)
paths = ['index.html','styles.css','script.js','track-play.js','home-player.css','playback-link.js','street-return.js','playlist.json','playlist-data.js','robots.txt','sitemap.xml']
paths += [str(p.relative_to(root)) for p in (root/'tests').glob('*') if p.is_file()]
paths += [str(p.relative_to(root)) for p in (root/'yard').glob('*.js')]
paths += ['yard/yard.css']
assert not (snapshot / 'complete.json').exists(), 'Snapshot already exists; refusing to overwrite it'
for relative in paths:
    source = root / relative
    destination = snapshot / relative
    if source.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
(snapshot/'working-tree.diff').write_bytes(subprocess.check_output(['git','diff','--binary'],cwd=root))
(snapshot/'status.txt').write_bytes(subprocess.check_output(['git','status','--short'],cwd=root))
# Only the home document/styles/controller and its picker are rolled back.
# Shared playback/street policies and all yard work remain in place.
for name in ['index.html','styles.css','script.js','track-play.js']:
    data = subprocess.check_output(['git','show',f'HEAD:{name}'],cwd=root)
    (root/name).write_bytes(data)
extra = root/'home-player.css'
if extra.exists():
    assert extra.resolve().parent == root and (snapshot/extra.name).exists()
    extra.unlink()
(snapshot/'complete.json').write_text(json.dumps({'saved':paths,'rolledBack':['index.html','styles.css','script.js','track-play.js','home-player.css']},indent=2),encoding='utf-8')
print(f'Snapshot: {snapshot}; home-only rollback complete')
