from pathlib import Path
import tempfile
import unittest

from tools.generate_playlist import build_playlist


class PlaylistGeneratorTests(unittest.TestCase):
    def test_legacy_catalog_cannot_restore_artwork(self):
        import json
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            media = root / 'media'
            assets = root / 'assets'
            (media / 'Release').mkdir(parents=True)
            (assets / 'track-covers').mkdir(parents=True)
            for name in ['Artist - Song.flac', 'Artist - Song remix.flac']:
                (media / 'Release' / name).write_bytes(b'audio')
            covers = ['assets/track-covers/release/first.webp', 'assets/track-covers/release/draft.webp']
            (assets / 'track-covers/catalog.json').write_text(json.dumps({'collections': [{
                'mediaDirectory': 'release', 'artwork': [{'url': url} for url in covers],
            }]}), encoding='utf-8')
            playlist = build_playlist(media, assets, root)
        self.assertEqual(len(playlist), 2)
        for track in playlist:
            self.assertEqual(set(track), {'id', 'artist', 'title', 'audio'})

    def test_build_playlist_reads_artist_title_and_ignores_matching_image(self):
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
