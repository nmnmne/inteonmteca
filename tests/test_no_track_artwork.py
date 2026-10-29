"""Regression: production playlists and UI remain artwork-free."""
import json
import unittest
from pathlib import Path
from tools.generate_playlist import build_playlist

ROOT = Path(__file__).resolve().parents[1]

class NoTrackArtworkTests(unittest.TestCase):
    def test_assets_and_runtime_removed(self):
        for name in ('assets/track-covers', 'track-covers.js', 'track-covers.css',
                     'tools/import_desktop_covers.py', 'tools/generate_cover_renditions.py',
                     'tools/desktop-cover-sources.json'):
            self.assertFalse((ROOT / name).exists(), name)

    def test_generated_catalogue_is_audio_only_and_current(self):
        playlist = json.loads((ROOT / 'playlist.json').read_text(encoding='utf-8'))
        self.assertTrue(playlist)
        self.assertEqual(playlist, build_playlist(ROOT / 'media', ROOT / 'assets', ROOT))
        script = (ROOT / 'playlist-data.js').read_text(encoding='utf-8')
        self.assertEqual(playlist, json.loads(script.removeprefix('window.INTEONMTECA_PLAYLIST = ').strip().removesuffix(';')))
        for track in playlist:
            self.assertEqual(set(track), {'id', 'artist', 'title', 'audio'})
            self.assertTrue((ROOT / track['audio']).is_file())

    def test_no_live_cover_consumers(self):
        for name in ('index.html', 'script.js', 'playlist-curve.js', 'desktop-edition.css', 'mobile-stage.css', 'responsive-ui.css'):
            text = (ROOT / name).read_text(encoding='utf-8')
            for retired in ('inteonCovers', 'track-covers.', 'cover-image', 'has-cover', 'active-cover'):
                self.assertNotIn(retired, text, name)

    def test_shared_identity_is_preserved(self):
        for name in ('assets/og-image.png', 'assets/logo-wordmark.svg', 'assets/favicon.ico', 'yard/assets/spawn-desktop.jpg'):
            self.assertTrue((ROOT / name).is_file(), name)

if __name__ == '__main__':
    unittest.main()
