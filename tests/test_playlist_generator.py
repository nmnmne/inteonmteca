from pathlib import Path
import tempfile
import unittest

from tools.generate_playlist import build_playlist


class PlaylistGeneratorTests(unittest.TestCase):
    def test_build_playlist_reads_artist_title_and_matching_cover(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            media = root / "media"
            assets = root / "assets"
            (media / "Night_Set").mkdir(parents=True)
            (assets / "night_set").mkdir(parents=True)
            (media / "Night_Set" / "Sonyx - Light Of The Night.flac").write_bytes(b"audio")
            (assets / "night_set" / "cover.jpg").write_bytes(b"image")

            playlist = build_playlist(media, assets, root)

        self.assertEqual(
            playlist,
            [
                {
                    "id": "media/Night_Set/Sonyx - Light Of The Night.flac",
                    "artist": "Sonyx",
                    "title": "Light Of The Night",
                    "audio": "media/Night_Set/Sonyx - Light Of The Night.flac",
                    "cover": "assets/night_set/cover.jpg",
                }
            ],
        )

    def test_build_playlist_ignores_legacy_wave_phonk_folder(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            media = root / "media"
            assets = root / "assets"
            (media / "wave-phonk").mkdir(parents=True)
            (media / "New_Set").mkdir(parents=True)
            (media / "wave-phonk" / "old.flac").write_bytes(b"audio")
            (media / "New_Set" / "Artist - New Track.flac").write_bytes(b"audio")

            playlist = build_playlist(media, assets, root)

        self.assertEqual([item["title"] for item in playlist], ["New Track"])

    def test_build_playlist_supports_titles_without_spaces_around_dash(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            media = root / "media"
            assets = root / "assets"
            (media / "Kimpintyau").mkdir(parents=True)
            (assets / "kimpintyau").mkdir(parents=True)
            (media / "Kimpintyau" / "Матт- Высоко до предела.flac").write_bytes(b"audio")
            (assets / "kimpintyau" / "Cover.png").write_bytes(b"image")

            playlist = build_playlist(media, assets, root)

        self.assertEqual(playlist[0]["artist"], "Матт")
        self.assertEqual(playlist[0]["title"], "Высоко до предела")


if __name__ == "__main__":
    unittest.main()
