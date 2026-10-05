"""Run local regression commands with separate logs and an exit-code manifest."""
import json
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = root / 'tests/artifacts/vr-player/checks'
out.mkdir(parents=True, exist_ok=True)
commands = {
    'syntax': ['node', '--check', 'script.js'],
    'picker-syntax': ['node', '--check', 'track-play.js'],
    'diff': ['git', 'diff', '--check'],
    'node': ['node', '--test', *[str(p.relative_to(root)) for p in (root/'tests').glob('*.cjs')]],
    'python': [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-q'],
    'persistent': [sys.executable, 'tests/browser_player_close.py'],
    'heading': [sys.executable, 'tests/browser_home_finish.py'],
    'faults': [sys.executable, 'tests/browser_vr_faults.py'],
    'breakpoints': [sys.executable, 'tests/browser_home_breakpoint.py'],
    'origin': [sys.executable, 'tests/browser_playback_origin.py'],
    'boundary-end': [sys.executable, 'tests/browser_boundary_end.py'],
    'static-logo': [sys.executable, 'tests/browser_static_logo.py'],
    'mobile-transition': [sys.executable, 'tests/browser_mobile_transition.py'],
}
requested = sys.argv[1:] or list(commands)
results_file = out / 'results.json'
results = json.loads(results_file.read_text(encoding='utf-8')) if results_file.exists() else {}
for name in requested:
    print(f'Running {name}', flush=True)
    with (out / f'{name}.txt').open('w', encoding='utf-8') as log:
        try:
            result = subprocess.run(commands[name], cwd=root, stdout=log, stderr=subprocess.STDOUT, timeout=240)
            results[name] = result.returncode
        except subprocess.TimeoutExpired:
            results[name] = 'timeout'
    print(f'{name}: {results[name]}', flush=True)
    (out / 'results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
sys.exit(any(results[name] != 0 for name in requested))
