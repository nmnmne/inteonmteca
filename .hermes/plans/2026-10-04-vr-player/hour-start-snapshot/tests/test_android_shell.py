from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
ANDROID_ROOT = ROOT / "android-app"


class AndroidShellTests(unittest.TestCase):
    def test_android_shell_points_at_shared_site(self):
        activity = (ANDROID_ROOT / "app/src/main/java/online/inteonmteca/app/MainActivity.kt").read_text(encoding="utf-8")
        manifest = (ANDROID_ROOT / "app/src/main/AndroidManifest.xml").read_text(encoding="utf-8")

        self.assertIn("https://inteonmteca.online/", activity)
        self.assertIn("WebView", activity)
        self.assertIn("INTERNET", manifest)
        self.assertIn("MainActivity", manifest)

    def test_android_shell_has_a_buildable_gradle_shape(self):
        self.assertTrue((ANDROID_ROOT / "settings.gradle.kts").exists())
        self.assertTrue((ANDROID_ROOT / "build.gradle.kts").exists())
        self.assertTrue((ANDROID_ROOT / "app/build.gradle.kts").exists())
        self.assertTrue((ANDROID_ROOT / "README.md").exists())


if __name__ == "__main__":
    unittest.main()
