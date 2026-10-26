import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

class CoverRenditions(unittest.TestCase):
    def test_playlist_candidates_are_tiny_content_addressed_files(self):
        tracks = json.loads((ROOT / 'playlist.json').read_text(encoding='utf-8'))
        checked = set()
        for track in tracks:
            for original in track.get('covers', [track.get('cover')]):
                if not original:
                    continue
                candidates = track.get('coverRenditions', {}).get(original)
                self.assertIsNotNone(candidates, original)
                self.assertEqual([c['width'] for c in candidates], [16, 24, 32, 48, 64])
                for candidate in candidates:
                    path = ROOT / candidate['url']
                    if path in checked:
                        continue
                    checked.add(path)
                    data = path.read_bytes()
                    self.assertIn(hashlib.sha256(data).hexdigest()[:16], path.name)
                    with Image.open(path) as image:
                        self.assertEqual(max(image.size), candidate['width'])
                        self.assertEqual(image.format, 'WEBP')
                    self.assertLess(len(data), 6000)
        self.assertTrue(checked)

if __name__ == '__main__':
    unittest.main()
