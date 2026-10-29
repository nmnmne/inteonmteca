"""Execute the real release script in a sandbox; AWS/Python never run.

Only PowerShell is required. The AWS function records requests and simulates
native exit codes; the Python shim prevents playlist regeneration.
"""
import json
import gzip
import base64
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
POWERSHELL = shutil.which("pwsh") or shutil.which("powershell")


@unittest.skipUnless(POWERSHELL, "PowerShell is required for release execution tests")
class DeployReleaseTests(unittest.TestCase):
    def run_release(self, fail_at=0):
        with tempfile.TemporaryDirectory(prefix="release-test-") as directory:
            root = Path(directory)
            shutil.copy2(ROOT / "deploy-site.ps1", root / "deploy-site.ps1")
            files = {
                "index.html": '<meta name="inteonmteca-api" content=""><link href="styles.css"><script src="script.js"></script><script data-development-only defer src="development-debug.js"></script><script data-development-only src="private-dev.js"></script>',
                "development-debug.js": "throw Error('development only');",
                "yard/debug-pose.js": "throw Error('development only');",
                "styles.css": "body {}", "script.js": "void 0;",
                "playlist.json": "[]", "playlist-data.js": "window.playlist=[];",
                "yard/index.html": '<link href="yard.css?v=old"><script data-development-only src="../development-debug.js"></script>',
                "yard/yard.css": "body {}", "yard/main.js": "void 0;",
                "tools/generate_playlist.py": "raise RuntimeError('must not execute')",
                "styles.20000101-000000.css": "old local asset",
            }
            for name, content in files.items():
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")
            # Script resolves Python via Get-Command; this native shim does no work.
            (root / "python.cmd").write_text("@exit /b 0\r\n", encoding="ascii")
            log = root / "aws.jsonl"
            wrapper = root / "run.ps1"
            wrapper.write_text('''$ErrorActionPreference = "Stop"
$global:calls = 0
function aws {
    $global:calls++
    $record = @{ args = @($args) }
    if ($args -contains "cp") {
        $i = [Array]::IndexOf($args, "cp")
        $source = $args[$i + 1]
        if ($args -contains "--content-encoding") { $record.gzip = [Convert]::ToBase64String([IO.File]::ReadAllBytes($source)) }
        if ($source -like "*.html") { $record.html = [IO.File]::ReadAllText($source) }
    }
    $record | ConvertTo-Json -Compress | Add-Content -LiteralPath $env:RELEASE_LOG
    $global:LASTEXITCODE = 0
    if ($global:calls -eq [int]$env:RELEASE_FAIL_AT) { $global:LASTEXITCODE = 23 }
}
try { & (Join-Path $PSScriptRoot "deploy-site.ps1") }
catch { Write-Output $_; exit 1 }
''', encoding="utf-8")
            env = dict(os.environ, RELEASE_LOG=str(log), RELEASE_FAIL_AT=str(fail_at), TEMP=str(root), TMP=str(root))
            env["PATH"] = str(root) + os.pathsep + env["PATH"]
            result = subprocess.run(
                [POWERSHELL, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(wrapper)],
                env=env, capture_output=True, text=True, timeout=45,
            )
            calls = [json.loads(line) for line in log.read_text(encoding="utf-8-sig").splitlines()] if log.exists() else []
            preserved = all((root / name).read_text(encoding="utf-8") == content for name, content in files.items())
            return result, calls, preserved

    def test_assets_precede_entry_publication(self):
        result, calls, _ = self.run_release()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        sync = next(call["args"] for call in calls if "sync" in call["args"])
        # AWS filters are ordered: the final exclusion must win over yard/*.
        self.assertEqual(sync[sync.index("--cache-control") - 2:sync.index("--cache-control")], ["--exclude", "*.html"])
        # Every actual root CSS/JS dependency must survive the public allowlist.
        import re
        includes = [sync[i + 1] for i, value in enumerate(sync) if value == '--include']
        public_html = re.sub(r'<script data-development-only[^>]*></script>', '', (ROOT / 'index.html').read_text(encoding='utf-8'))
        for asset in re.findall(r'(?:src|href)="([^"/?]+\.(?:css|js))(?:\?[^" ]*)?"', public_html):
            self.assertIn(asset, includes, f'Homepage dependency missing from publication: {asset}')
        uploads = [call for call in calls if "cp" in call["args"]]
        for call in uploads:
            if 'html' in call:
                self.assertNotIn('private-dev.js', call['html'])
        self.assertNotIn('development-debug.js', uploads[-1]['html'], 'home debug stays private')
        self.assertNotIn('development-debug.js', includes)
        self.assertIn('yard/debug-pose.js', [sync[i + 1] for i, value in enumerate(sync) if value == '--exclude'])
        for call in uploads:
            self.assertNotIn('development-debug', call['args'][call['args'].index('cp') + 2])
        self.assertNotIn('development-debug.js', uploads[-2]['html'], 'unrelated yard developer controls stay private')
        targets = [call["args"][call["args"].index("cp") + 2] for call in uploads]
        self.assertEqual(targets[-2:], ["s3://inteonmteca.online/yard/index.html", "s3://inteonmteca.online/index.html"])
        import re
        html = uploads[-1]["html"]
        self.assertIn('<meta name="inteonmteca-api" content="https://api.inteonmteca.online">', html)
        for name in re.findall(r'(?:href|src)="((?:styles|script)\.[^"/]+)"', html):
            self.assertIn("s3://inteonmteca.online/" + name, targets[:-2])
        self.assertEqual(len(re.findall(r'(?:styles|script)\.[^"/]+', html)), 2)

    def test_compressed_assets_round_trip_and_match_content_names(self):
        result, calls, _ = self.run_release()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        compressed = [c for c in calls if 'gzip' in c]
        self.assertGreaterEqual(len(compressed), 3)
        for call in compressed:
            raw = gzip.decompress(base64.b64decode(call['gzip']))
            target = call['args'][call['args'].index('cp') + 2]
            self.assertIn(hashlib.sha256(raw).hexdigest()[:16], target)
            self.assertIn('public, max-age=31536000, immutable', call['args'])
        for call in calls:
            if 'cp' in call['args'] or 'sync' in call['args']:
                self.assertFalse(any('track-covers' in a for a in call['args']))

    def test_release_retains_remote_assets_and_local_inputs(self):
        result, calls, preserved = self.run_release()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(preserved, "deployment deleted or changed local source assets")
        for call in calls:
            args = call["args"]
            self.assertNotIn("--delete", args)
            if "rm" in args:
                if "--recursive" in args:
                    target = args[args.index('rm') + 1]
                    if target.endswith('/assets/track-covers/'):
                        self.assertEqual(target, 's3://inteonmteca.online/assets/track-covers/')
                    else:
                        self.assertEqual(target, 's3://inteonmteca.online/')
                        self.assertEqual(args[args.index('--exclude') + 1], '*')
                        self.assertIn([args[i+1] for i,a in enumerate(args) if a=='--include'],
                                      [['track-covers.js', 'track-covers.css', 'track-covers.*.js', 'track-covers.*.css'],
                                       ['development-debug.*.js']])
                    entry = next(i for i,c in enumerate(calls) if c.get('html') and 's3://inteonmteca.online/index.html' in c['args'])
                    self.assertGreater(calls.index(call), entry)

    def test_failure_at_each_upload_stops_later_publication(self):
        result, success_calls, _ = self.run_release()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for number in range(1, len(success_calls) + 1):
            with self.subTest(failure_at=number):
                result, calls, _ = self.run_release(fail_at=number)
                self.assertEqual(len(calls), number)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("Done.", result.stdout)

    def test_native_aws_failure_aborts_immediately(self):
        result, calls, _ = self.run_release(fail_at=1)
        self.assertEqual(len(calls), 1, result.stdout + result.stderr)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("Done.", result.stdout)


if __name__ == "__main__":
    unittest.main()
