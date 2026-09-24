import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COVERS = (
    'assets/Last_Eclipse/last eclipse.png',
    'assets/Light Of The Night/Sonyx - Light Of The Night.jpg',
    'assets/inteonmteca_/inteonmteca_.png',
    'assets/kimpintyau/Cover.png',
    'assets/wave-phonk/cover.png',
)

class RemovedCoversTests(unittest.TestCase):
    def test_cover_files_and_manifest_references_are_removed(self):
        for cover in COVERS:
            self.assertFalse((ROOT / cover).exists(), cover)
        playlist = json.loads((ROOT / 'playlist.json').read_text(encoding='utf-8'))
        embedded = (ROOT / 'playlist-data.js').read_text(encoding='utf-8')
        self.assertTrue(all('cover' not in track for track in playlist))
        self.assertNotIn('"cover":', embedded)
        self.assertTrue((ROOT / 'assets/og-image.png').exists())
        self.assertTrue((ROOT / 'assets/logo-wordmark.svg').exists())
