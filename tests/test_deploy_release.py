"""Execute the real release script in a sandbox; AWS/Python never run.

Only PowerShell is required. The AWS function records requests and simulates
native exit codes; the Python shim prevents playlist regeneration.
"""
import json
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
                "index.html": '<link href="styles.css"><script src="script.js"></script>',
                "styles.css": "body {}", "script.js": "void 0;",
                "playlist.json": "[]", "playlist-data.js": "window.playlist=[];",
                "yard/index.html": '<link href="yard.css?v=old">',
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
        uploads = [call for call in calls if "cp" in call["args"]]
        targets = [call["args"][call["args"].index("cp") + 2] for call in uploads]
        self.assertEqual(targets[-2:], ["s3://inteonmteca.online/yard/index.html", "s3://inteonmteca.online/index.html"])
        import re
        html = uploads[-1]["html"]
        for name in re.findall(r'(?:href|src)="((?:styles|script)\.[^"/]+)"', html):
            self.assertIn("s3://inteonmteca.online/" + name, targets[:-2])
        self.assertEqual(len(re.findall(r'(?:styles|script)\.[^"/]+', html)), 2)

    def test_release_retains_remote_assets_and_local_inputs(self):
        result, calls, preserved = self.run_release()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(preserved, "deployment deleted or changed local source assets")
        for call in calls:
            args = call["args"]
            self.assertNotIn("--delete", args)
            if "rm" in args:
                self.assertNotIn("--recursive", args, "old version assets must remain available")

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
