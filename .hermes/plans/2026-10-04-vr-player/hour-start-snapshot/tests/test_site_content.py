from pathlib import Path
import json
import re
import unittest

from tools.generate_playlist import build_playlist


ROOT = Path(__file__).resolve().parents[1]


class SiteContentTests(unittest.TestCase):
    def test_home_lists_the_four_selected_tracks_in_release_order(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")

        self.assertEqual(html.count('class="track-item"'), 4)
        self.assertNotIn('class="track-toggle"', html)
        self.assertNotIn('class="track-cover"', html)
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertIn("overflow: visible", styles)
        self.assertIn("scrollbar-width: none", styles)
        self.assertIn('class="track-title"', html)
        self.assertIn('class="track-artist"', html)
        self.assertNotIn("decimal-leading-zero", styles)
        self.assertIn("artistFlicker", styles)
        self.assertEqual(
            re.findall(r'data-track-title="([^"]+)"', html),
            ["Light Of The Night", "Inteonmteca_", "Высоко до предела", "Last Eclipse"],
        )
        self.assertNotIn('class="track-cover"', html)
        self.assertNotIn('class="track-toggle"', html)
        self.assertIn('media/Light Of The Night/Sonyx - Light Of The Night.flac', (ROOT / "playlist.json").read_text(encoding="utf-8"))
        self.assertNotIn('Heavenly Melody', html)
        self.assertNotIn('media/Heavenly_Melody/Sonyx - Heavenly Melody.flac', html)
        self.assertNotIn('assets/Heavenly_Melody/Heavenly Melody.jpg', html)
        manifest = (ROOT / "playlist.json").read_text(encoding="utf-8")
        self.assertIn('media/inteonmteca_/ыьек - Inteonmteca_.flac', manifest)
        self.assertIn('media/Last_Eclipse/Матт - Last Eclipse (Negative Space Resonance).flac', manifest)
        self.assertNotIn('Faded Astral Rumble', manifest)
        self.assertNotIn('Матт - Кимпинтяу.flac', html)
        self.assertNotIn('Матт - Base.flac', html)
        self.assertNotIn('Матт - Может.flac', html)
        self.assertNotIn('Матт - Сигнал.flac', html)

    def test_clip_is_absent_from_site_source_and_deployment(self):
        for relative_path in ("index.html", "script.js", "styles.css", "deploy-site.ps1", "update-site.cmd"):
            source = (ROOT / relative_path).read_text(encoding="utf-8")
            self.assertNotIn("loud-silence", source.lower(), relative_path)
            self.assertNotIn("data-show-clip", source.lower(), relative_path)
            self.assertNotIn("clip-panel", source.lower(), relative_path)

        self.assertFalse((ROOT / "media" / "loud-silence.mp4").exists())

    def test_tracks_do_not_start_without_a_click(self):
        script = (ROOT / "script.js").read_text(encoding="utf-8")

        self.assertNotIn("enterFrozenListeningMode", script)
        self.assertNotIn("introFreezeTimeout", script)

    def test_site_descriptions_use_the_wave_manifesto(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        description = "Погрузись в глубину звука. Почувствуй волновую природу мира — музыку, которая остаётся внутри."

        self.assertGreaterEqual(html.count(description), 3)

    def test_page_and_social_titles_are_inteonmteca(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")

        self.assertIn("<title>inteonmteca</title>", html)
        self.assertIn('<meta property="og:title" content="inteonmteca">', html)
        self.assertIn('<meta name="twitter:title" content="inteonmteca">', html)

    def test_selected_track_label_is_absent(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")

        self.assertNotIn("выбранный трек", html.lower())
        self.assertIn('<ol class="track-list" id="track-list" data-layout="catalog" aria-label="Треки">', html)

    def test_homepage_uses_the_liquid_perception_copy(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")

        self.assertIn('<p class="topline matrix-text">от всех наших</p>', html)
        self.assertIn('<p class="text matrix-text">Музыка, люди, вайб. Уже здесь</p>', html)
        self.assertIn('<p class="label matrix-text">music label</p>', html)
        self.assertIn('<p class="ours matrix-text">from all ours</p>', html)
        self.assertNotIn("Выбери сигнал", html)
        self.assertNotIn("архив изменённых состояний", html)
        self.assertNotIn("Волны, люди и состояния", html)
        self.assertNotIn("музыка в движении", html)

    def test_search_snippet_metadata_is_exact(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        description = "Погрузись в глубину звука. Почувствуй волновую природу мира — музыку, которая остаётся внутри."

        self.assertIn("<title>inteonmteca</title>", html)
        self.assertIn('<meta name="description" content="' + description + '">', html)
        self.assertIn('<meta property="og:title" content="inteonmteca">', html)
        self.assertIn('<meta name="twitter:title" content="inteonmteca">', html)
        self.assertIn('<p class="visually-hidden">' + description + '</p>', html)
        self.assertIn('"description": "' + description + '"', html)
        self.assertNotIn("sound / matter / motion", html)
        self.assertNotIn("live field 001", html)
        self.assertNotIn("different music", html)
        self.assertNotIn("now listening", html)
        self.assertNotIn("Волны, люди и состояния", html)

    def test_manifest_contains_every_current_non_legacy_audio(self):
        manifest = json.loads((ROOT / "playlist.json").read_text(encoding="utf-8"))
        generated = build_playlist(ROOT / "media", ROOT / "assets", ROOT)

        self.assertEqual(manifest, generated)
        self.assertGreaterEqual(len(manifest), 1)
        self.assertTrue(all("wave-phonk" not in item["audio"] for item in manifest))

    def test_manifest_generator_excludes_legacy_media_folder(self):
        self.assertIn("LEGACY_MEDIA_DIRECTORIES", (ROOT / "tools" / "generate_playlist.py").read_text(encoding="utf-8"))

    def test_homepage_uses_the_new_brand_copy(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")

        self.assertIn('<p class="topline matrix-text">от всех наших</p>', html)
        self.assertIn('<p class="text matrix-text">Музыка, люди, вайб. Уже здесь</p>', html)
        self.assertIn('<p class="ours matrix-text">from all ours</p>', html)
        self.assertNotIn("Выбери сигнал", html)
        self.assertNotIn("архив изменённых состояний", html)
        self.assertNotIn("Волны, люди и состояния", html)
        self.assertNotIn("музыка в движении", html)

    def test_immersive_audio_mode_is_wired_into_the_page(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "script.js").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")

        self.assertIn('id="perception-visual"', html)
        self.assertIn('id="immersive-mode"', html)
        self.assertIn('id="immersive-visual"', html)
        self.assertIn('id="immersive-title"', html)
        self.assertIn('id="immersive-back"', html)
        self.assertIn("enterImmersiveMode", script)
        self.assertIn("exitImmersiveMode", script)
        self.assertIn("AudioContext", script)
        self.assertIn("drawLiquid", script)
        self.assertIn("drawImmersiveScene", script)
        self.assertIn("body.is-immersive", styles)
        self.assertIn(".perception-visual", styles)

    def test_playlist_is_loaded_from_the_manual_embedded_manifest(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "script.js").read_text(encoding="utf-8")

        self.assertIn('id="track-list"', html)
        self.assertIn("window.INTEONMTECA_PLAYLIST", script)
        self.assertIn("renderPlaylist", script)
        self.assertIn("shuffle", script)
        self.assertNotIn("/api/playlist", script)
        self.assertNotIn("loadPlaylist", script)

    def test_playlist_manifest_is_generated_and_deployed(self):
        manifest = json.loads((ROOT / "playlist.json").read_text(encoding="utf-8"))
        deploy = (ROOT / "deploy-site.ps1").read_text(encoding="utf-8")

        self.assertGreaterEqual(len(manifest), 1)
        self.assertTrue(all(item.get("audio", "").startswith("media/") for item in manifest))
        self.assertIn("playlist.json", deploy)
        self.assertIn("generate_playlist.py", deploy)

    def test_homepage_uses_a_centered_vr_player_shell(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "script.js").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")

        self.assertIn('class="hero-header"', html)
        self.assertNotIn("Волны, люди и состояния", html)
        self.assertNotIn("hero-brand-mark", html)
        self.assertNotIn('class="hero-brand"', html)
        self.assertIn("player-console", html)
        self.assertIn('id="ink-field"', html)
        self.assertNotIn('class="perception-depth"', html)
        self.assertNotIn("perception-glow", html)
        self.assertIn("modernHeroBreath", styles)
        self.assertIn("align-content: center", styles)
        self.assertIn("holo-stage", html)
        self.assertIn("player-dock", html)
        self.assertIn('class="mirage-layer"', html)
        self.assertIn('id="perception-visual"', html)
        self.assertIn("drawLiquid", script)
        self.assertIn("renderPerceptionField", script)
        self.assertIn("logoAtmosphere", styles)
        self.assertIn("logoFloat", styles)
        self.assertIn("logo-particle", styles)
        self.assertIn("motionStrength", script)
        self.assertIn("setMotion", script)
        self.assertIn("--motion-strength", styles)
        self.assertIn("DeviceMotionEvent", script)
        self.assertIn("deviceorientation", script)
        self.assertIn("audioEnergy", script)
        self.assertIn("perceptionChars", script)
        self.assertIn("perception-interface", html)
        self.assertIn("perception-field", html)
        self.assertNotIn("cosmic-field", html)
        self.assertNotIn("open-space", html)
        self.assertIn('id="album-player"', html)
        self.assertIn("playTrack", script)
        self.assertIn("let playbackRequestId = 0", script)
        self.assertIn("immersive-mode", html)
        self.assertNotIn('window.addEventListener("DOMContentLoaded", () => {\n  setupVisitCounter();\n  updateTransportButtons();\n  playNext();', script)
        self.assertIn('button.className = "track-select"', script)
        self.assertIn("meta.append(title, artist)", script)
        self.assertIn('playlistList?.addEventListener("click"', script)
        self.assertIn("track-play.js", html)
        self.assertIn("track-viewport", html)
        self.assertIn("--track-row", styles)
        self.assertIn("track-scrollbar", html)

    def test_perceptual_vr_shell_replaces_cosmic_shell(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        script = (ROOT / "script.js").read_text(encoding="utf-8")

        self.assertIn('class="perception-interface listening-room spatial-room"', html)
        self.assertIn('class="perception-field"', html)
        self.assertIn('id="perception-visual"', html)
        self.assertIn("perception-field", styles)
        self.assertIn("renderPerceptionField", script)
        self.assertIn("sceneClock", script)
        self.assertNotIn("cosmic-field", html)
        self.assertNotIn("open-space", html)
        self.assertNotIn("cosmic-field", styles)
        self.assertNotIn(".open-space", styles)

    def test_selected_track_uses_manifest_audio_and_passes_track_to_immersive_mode(self):
        script = (ROOT / "script.js").read_text(encoding="utf-8")
        self.assertIn("track.audio ||", script)
        self.assertIn("enterImmersiveMode(player, track)", script)
        self.assertIn("track.audio", script)

    def test_player_shows_four_tracks_and_a_custom_scrollbar_when_needed(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        script = (ROOT / "script.js").read_text(encoding="utf-8")

        self.assertIn("calc(var(--track-row) * 5)", styles)
        self.assertIn("updateTrackFold", script)
        self.assertIn("updateScrollbar", script)
        self.assertIn("is-departing", styles)
        self.assertIn('id="track-scrollbar"', html)
        self.assertIn("scrollbarPulse", styles)

    def test_liquid_ink_glyph_mutation_and_transport_are_wired(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        script = (ROOT / "script.js").read_text(encoding="utf-8")

        self.assertIn('id="ink-field"', html)
        self.assertIn("renderInkField", script)
        self.assertIn("pointerState", script)
        self.assertIn("mutateGlyphString", script)
        self.assertIn('id="logo-symbol-echo"', html)
        self.assertIn("renderLogoSymbolEcho", script)
        self.assertIn('id="immersive-play"', html)
        self.assertIn('id="track-progress"', html)
        self.assertIn("playRelativeTrack", script)
        self.assertIn("inkBleed", styles)
        self.assertNotIn("playlist-count", html)
        self.assertNotIn("perception-glow", styles)
        self.assertIn("length > TRACK_VIEW", script)
        self.assertIn("balanceInfiniteWheel", script)
        self.assertIn("fillInfiniteWheel", script)

    def test_random_playlist_theme_rotation_and_adaptive_rendering_are_wired(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        script = (ROOT / "script.js").read_text(encoding="utf-8")

        self.assertIn("tracks = shuffle(discovered)", script)
        self.assertIn("playRelativeTrack", script)
        self.assertNotIn("schedulePlaylistRefresh", script)
        self.assertNotIn('id="refresh-media"', html)
        self.assertIn('value="desert"', html)
        registry = script.split("const themeRegistry = Object.freeze([", 1)[1].split("].map", 1)[0]
        self.assertEqual(len(re.findall(r'^  "[a-z-]+\|', registry, re.MULTILINE)), 99)
        self.assertIn("populateThemeSelect();", script)
        self.assertIn("themeCoreFilters", script)
        self.assertNotIn('grayscale(1)', script)
        self.assertNotIn('"--theme-fog-blur": "32px"', script)
        self.assertIn('data-min-seconds="4"', html)
        self.assertIn('data-max-seconds="604800"', html)
        self.assertIn("THEME_MIN_MS = 4 * 1000", script)
        self.assertIn("THEME_MAX_MS = 7 * 24 * 60 * 60 * 1000", script)
        self.assertIn("scheduleThemeRotation", script)
        self.assertIn(".theme-light-a", styles)
        self.assertIn('html[data-theme="sunset"]', styles)
        self.assertIn('html[data-theme="glacier"]', styles)
        self.assertIn("setAnimationQuality", script)
        self.assertIn("tickVisuals", script)
        self.assertIn("drawWindField", script)
        self.assertIn("windDigits", script)
        self.assertIn("recordFramePacing", script)
        self.assertIn('data-animation-quality="low"', styles)

    def test_playback_keeps_homepage_logo_and_animations(self):
        script = (ROOT / "script.js").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")

        self.assertNotIn("body.is-immersive .logo-wrap { opacity: .28 }", styles)
        self.assertIn("body.is-immersive .logo-wrap.release-logo", styles)
        self.assertRegex(styles, r"\.immersive-logo-echo\s*\{[^}]*display:\s*none")
        self.assertNotIn("if (document.hidden || immersiveState.active || elapsed < renderInterval())", script)
        self.assertNotIn("if (!inkField || !inkFieldBounds || immersiveState.active) return;", script)
        self.assertNotRegex(script, r"if \(immersiveState\.active\) \{\s*if \(logoReactiveCanvas")

    def test_immersive_mode_has_large_volumetric_seek_field(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")

        self.assertIn('class="transport-seek-field"', html)
        self.assertIn('class="transport-seek-volume"', html)
        self.assertIn(".transport-seek-volume", styles)
        self.assertIn("width: min(142vw, 1500px)", styles)

    def test_email_auth_and_airborne_chat_are_wired(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "script.js").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")

        self.assertIn('id="auth-hint"', html)
        self.assertIn('id="auth-email"', html)
        self.assertIn('id="chat-hint"', html)
        self.assertIn('id="chat-panel"', html)
        self.assertIn("/api/auth/request-code", script)
        self.assertIn("login_code", script)
        self.assertIn("canUseNetwork", script)
        self.assertIn("INTEONMTECA_PLAYLIST", script)
        self.assertIn("chat-glyph", styles)
        self.assertIn("chatFloat", styles)
        self.assertNotIn("chatNeonFlicker", styles)
        self.assertNotIn('id="chat-sign"', html)
        self.assertIn("animateChatGlyphs", script)

    def test_immersive_background_uses_analog_smoke_electricity_and_grid(self):
        script = (ROOT / "script.js").read_text(encoding="utf-8")
        self.assertIn("drawSmoke", script)
        self.assertIn("drawElectricity", script)
        self.assertIn("drawGrid", script)

    def test_original_wordmark_is_traced_to_a_reactive_vector(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "script.js").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        vector = (ROOT / "assets" / "logo-wordmark.svg").read_text(encoding="utf-8")

        self.assertGreaterEqual(vector.count("<path"), 10)
        self.assertIn('id="wordmark"', vector)
        self.assertIn('id="logo-vector"', html)
        self.assertIn('id="logo-turbulence"', html)
        self.assertIn('id="logo-displacement"', html)
        self.assertIn('id="logo-reactive-canvas"', html)
        self.assertIn("setupLogoSlices", script)
        self.assertIn("renderReactiveLogo", script)
        self.assertIn("averageBand", script)
        self.assertIn(".logo-vector-core", styles)
        self.assertNotIn("assets/logo-full.png", html)
        self.assertNotIn('url("assets/logo-full.png")', styles)

    def test_fractal_lattice_is_revealed_only_through_smoke(self):
        script = (ROOT / "script.js").read_text(encoding="utf-8")

        self.assertIn("drawSmokeRevealedFractal", script)
        self.assertIn("paintSmokeMask", script)
        self.assertIn("traceFractalBranch", script)
        self.assertIn("traceFractalCell", script)
        self.assertIn('"destination-in"', script)
        self.assertNotIn("strokeRect(", script)


if __name__ == "__main__":
    unittest.main()
