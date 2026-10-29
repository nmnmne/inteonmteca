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

class CoverLibraryTests(unittest.TestCase):
    def test_retired_full_size_cover_paths_stay_removed(self):
        for cover in COVERS:
            self.assertFalse((ROOT / cover).exists(), cover)

    def test_playlist_has_no_artwork(self):
        playlist = json.loads((ROOT / 'playlist.json').read_text(encoding='utf-8'))
        for track in playlist:
            self.assertFalse({'cover', 'covers', 'coverRenditions', 'artwork'} & track.keys())
        self.assertTrue((ROOT / 'assets/og-image.png').exists())
        self.assertTrue((ROOT / 'assets/logo-wordmark.svg').exists())

    def test_cover_library_is_removed(self):
        self.assertFalse((ROOT / 'assets/track-covers').exists())
