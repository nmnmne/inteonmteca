import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from unittest.mock import patch

from tools import prepare_dj_library as library

with patch.object(Path, "exists", return_value=False):
    from server.app import Store, make_handler
    from server.lan_preview import public_file


def wait_for(predicate):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(.08)
    raise AssertionError("Timed out waiting for prepared music")


def song(target, hz, channels):
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    f"sine=frequency={hz}:sample_rate=44100:duration=3.2", "-ac", str(channels), target],
                   check=True)


class DJLibraryRefreshTests(unittest.TestCase):
    def test_single_writer(self):
        with tempfile.TemporaryDirectory() as tmp, library.build_lock(Path(tmp)):
            with self.assertRaises(library.LibraryBusy), library.build_lock(Path(tmp)):
                self.fail("A second server acquired the active build lock")

    def test_watched_addition_replacement_and_recovery(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"INTEONMTECA_QUIET": "1"}):
            root = Path(tmp)
            spatial_dir = root / "assets/dj-spatial"
            spatial_dir.mkdir(parents=True)
            shutil.copy2(library.TOOLS.parent / "assets/dj-spatial/preset.json", spatial_dir)
            media = root / "media"
            media.mkdir()
            key = "media/Artist - First.mp3"
            first = root / key
            second = media / "Artist - Second.wav"
            store = Store(root / "test.db")
            handler = make_handler(root, store, None, prepared_catalog=True)
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            base = f"http://127.0.0.1:{server.server_port}"
            thread = threading.Thread(target=server.serve_forever)
            thread.start()

            def catalog():
                with urlopen(base + "/api/playlist") as response:
                    return json.load(response)

            def master():
                file = root / "dj-loudness.js"
                if not file.exists():
                    return {}
                records = json.loads(file.read_text().strip().removeprefix("window.DJ_LOUDNESS = ")[:-1])
                return records.get(key, {})

            try:
                with library.watch_library(root, poll=.08, settle=.2, retry=1):
                    song(first, 205, 1)
                    self.assertEqual(catalog(), [])
                    wait_for(lambda: len(catalog()) == 1)
                    first_master = master()
                    self.assertEqual(first_master["frames"], 141120)
                    self.assertEqual(first_master["scratchFrames"], 141120)
                    self.assertEqual(first_master["scratchRate"], 44100)
                    scratch_path = first_master["scratchSrc"]
                    self.assertTrue(public_file("/" + scratch_path))
                    with (root / scratch_path).open("rb") as src:
                        src.seek(44100 * 4)
                        samples = src.read(128)
                    with urlopen(Request(base + "/" + scratch_path, headers={"Range": "bytes=176400-176527"})) as response:
                        self.assertEqual((response.status, response.read()), (206, samples))
                    self.assertLessEqual(abs(first_master["integrated"] + 14), .25)
                    song(second, 820, 2)
                    wait_for(lambda: len(catalog()) == 2)
                    self.assertEqual(first_master, master())
                    song(first, 467, 1)
                    digest = hashlib.sha256(first.read_bytes()).hexdigest()
                    wait_for(lambda: master().get("sourceHash") == digest)
                    self.assertNotEqual(master()["src"], first_master["src"])
                    wait_for(lambda: library.current(root, library.snapshot(root)[1], library.read_state(root)))
                before = [(root / name).read_bytes() for name in library.MANIFESTS]
                bad = media / "Broken.mp3"
                bad.write_bytes(b"unfinished transfer")
                with self.assertRaises(subprocess.CalledProcessError):
                    library.prepare(root)
                self.assertEqual(before, [(root / name).read_bytes() for name in library.MANIFESTS])
                self.assertEqual(len(catalog()), 2)
                with library.watch_library(root, poll=.08, settle=.2, retry=1):
                    song(bad, 725, 1)
                    wait_for(lambda: len(catalog()) == 3)
                state = library.read_state(root)
                wv = next(name for name in state["outputs"] if name.endswith(".wv"))
                self.assertTrue(public_file("/" + wv))
                with urlopen(Request(base + "/" + wv, headers={"Range": "bytes=0-3"})) as response:
                    self.assertEqual((response.status, response.read()), (206, b"wvpk"))
                with patch.object(subprocess, "run", side_effect=AssertionError("Unchanged catalog was rebuilt")):
                    library.prepare(root)
            finally:
                server.shutdown()
                server.server_close()
                thread.join()
                store.close()


if __name__ == "__main__":
    unittest.main()
