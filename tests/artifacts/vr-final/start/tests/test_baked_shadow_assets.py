"""Offline assets must exist for every entrance, not painted runtime silhouettes."""
import json
import hashlib
import unittest
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
class BakedShadowAssets(unittest.TestCase):
    def test_twelve_actual_depth_textures(self):
        self.check_assets(ROOT / 'yard/data/shadows/manifest.json',4096)
    def test_mobile_actual_depth_textures(self):
        self.check_assets(ROOT / 'yard/data/shadows/mobile/manifest.json',1024)
    def check_assets(self,path,resolution):
        self.assertTrue(path.exists(), 'Offline scene-depth manifest missing')
        m = json.loads(path.read_text())
        self.assertEqual(len(m['presets']), 12)
        for i, row in enumerate(m['presets']):
            self.assertEqual(row['presetIndex'], i)
            im = Image.open(path.parent / row['file'])
            self.assertEqual(im.size, (resolution,resolution))
            self.assertGreater(len(im.resize((128,128)).getcolors(16385)), 100)
            self.assertEqual(len(row['matrix']), 16)
        self.assertGreater(m['meshCount'], 100)
        for name, digest in m['sourceHashes'].items():
            self.assertEqual(hashlib.sha256((ROOT/name).read_bytes()).hexdigest(), digest, f'Rebake after changing {name}')
        for row in m['presets']:
            self.assertEqual(hashlib.sha256((path.parent/row['file']).read_bytes()).hexdigest(),row['sha256'])
if __name__ == '__main__': unittest.main()
