import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("sync", Path(__file__).resolve().parents[1] / "scripts/sync-screenshots.py")
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)
SHA = "a" * 40
CAPTURE = {"repository": "example/app", "sha": SHA}


def write_bundle(file, status="passed", extra=None):
    images = []
    with zipfile.ZipFile(file, "w") as archive:
        for theme in ("light", "dark"):
            for device in ("desktop", "phone"):
                name = f"{device}-{theme}/home.png"
                archive.writestr(name, b"\x89PNG\r\n\x1a\n" + b"\0" * 8 + struct.pack(">II", 40, 80))
                images.append({"file": name, "theme": theme, "format": device, "scene": "home", "width": 40, "height": 80})
        archive.writestr("manifest.json", json.dumps({"status": status, "images": images}))
        archive.writestr("capture.json", json.dumps(CAPTURE))
        archive.writestr("index.html", "gallery")
        if extra:
            archive.writestr(extra, "unexpected")


class CaptureSyncTest(unittest.TestCase):
    def test_extracts_a_complete_successful_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_bundle(root / "bundle.zip")
            sync.extract_bundle(root / "bundle.zip", root / "gallery", CAPTURE)
            self.assertTrue((root / "gallery/phone-light/home.png").is_file())

    def test_rejects_failed_mismatched_or_unsafe_bundles_before_extraction(self):
        for status, extra, capture in (("failed", None, CAPTURE), ("passed", "../outside", CAPTURE), ("passed", None, {**CAPTURE, "sha": "b" * 40}), ("passed", "surprise.js", CAPTURE)):
            with self.subTest(status=status, extra=extra, capture=capture), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                write_bundle(root / "bundle.zip", status, extra)
                with self.assertRaises(ValueError):
                    sync.extract_bundle(root / "bundle.zip", root / "gallery", capture)
                self.assertFalse((root / "gallery").exists())

    def test_ignores_drafts_and_application_releases_and_selects_latest_capture(self):
        def release(sha, date, draft=False, prefix="portfolio-screenshots-"):
            return {"tag_name": prefix + sha, "published_at": date, "draft": draft, "assets": [{"id": date, "name": "screenshots.zip", "state": "uploaded", "size": 100, "browser_download_url": "https://github.com/example/app/releases/download/bundle"}]}
        releases = [release(SHA, "2026-01-01"), release("b" * 40, "2026-02-01"), release("c" * 40, "2026-03-01", True), release("d" * 40, "2026-04-01", prefix="app-")]
        result = sync.resolve_captures([{"id": "app", "captures": {"repository": "example/app"}}], lambda url: releases)
        self.assertEqual(result["app"]["sha"], "b" * 40)


if __name__ == "__main__":
    unittest.main()
