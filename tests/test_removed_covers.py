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

    def test_desktop_variants_are_available_in_the_playlist(self):
        playlist = json.loads((ROOT / 'playlist.json').read_text(encoding='utf-8'))
        cold = next(track for track in playlist if track['title'] == 'Слишком холод')
        self.assertGreaterEqual(len(cold['covers']), 5)
        for track in playlist:
            if 'covers' not in track:
                continue
            self.assertEqual(track['cover'], track['covers'][0])
            self.assertEqual(len(track['covers']), len(set(track['covers'])))
            for url in track['covers']:
                self.assertTrue((ROOT / url).is_file(), url)
        self.assertTrue((ROOT / 'assets/og-image.png').exists())
        self.assertTrue((ROOT / 'assets/logo-wordmark.svg').exists())

    def test_archived_and_unpublished_artwork_is_retained_with_provenance(self):
        catalog = json.loads((ROOT / 'assets/track-covers/catalog.json').read_text(encoding='utf-8'))
        self.assertTrue(any(not item['mediaDirectory'] for item in catalog['collections']))
        images = [art for item in catalog['collections'] for art in item['artwork']]
        self.assertTrue(any('Архив/' in source for image in images for source in image['sources']))
        self.assertTrue(any(source.endswith('.psd') for image in images for source in image['sources']))
        for image in images:
            self.assertTrue((ROOT / image['url']).is_file(), image['url'])
