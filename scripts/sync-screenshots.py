import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import struct
import subprocess
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".capture-cache"
MAX_BYTES = 256 * 1024 * 1024


def read_json(file, default=None):
    return json.loads(file.read_text(encoding="utf-8")) if file.exists() else default


def write_json(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def api(url):
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "taonity-portfolio"}
    if os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as response:
        return json.load(response)


def resolve_captures(projects, request=api):
    plan = {}
    for project in projects:
        project_id = project["id"]
        source = project["captures"]
        repository = source["repository"]
        prefix = source.get("releasePrefix", "portfolio-screenshots-")
        asset_name = source.get("asset", "screenshots.zip")
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", project_id) or not re.fullmatch(r"[\w.-]+/[\w.-]+", repository):
            raise ValueError("Invalid project or capture repository")
        candidates = []
        page = 1
        while page <= 20:
            releases = request(f"https://api.github.com/repos/{repository}/releases?per_page=100&page={page}")
            for release in releases:
                if release["draft"] or not re.fullmatch(re.escape(prefix) + r"[a-f0-9]{40}", release["tag_name"]):
                    continue
                for asset in release["assets"]:
                    if asset["name"] == asset_name and asset["state"] == "uploaded" and 0 < asset["size"] <= MAX_BYTES:
                        candidates.append((release["published_at"], {
                            "repository": repository, "tag": release["tag_name"], "sha": release["tag_name"][len(prefix):],
                            "assetId": asset["id"], "url": asset["browser_download_url"], "digest": asset.get("digest"),
                        }))
            if candidates or len(releases) < 100:
                break
            page += 1
        if not candidates:
            raise ValueError(f"No published screenshot release found for {repository}")
        plan[project_id] = max(candidates, key=lambda item: item[0])[1]
    return plan


def extract_bundle(archive_path, destination, capture):
    with zipfile.ZipFile(archive_path) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        if len(entries) > 5000 or len(names) != len(set(names)) or sum(entry.file_size for entry in entries) > MAX_BYTES:
            raise ValueError("Screenshot archive exceeds limits or has duplicate entries")
        for entry in entries:
            name = entry.filename
            relative = PurePosixPath(name)
            if relative.is_absolute() or ".." in relative.parts or "\\" in name or ":" in name or entry.is_dir() or (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError("Unsafe screenshot archive path")
        provenance = json.loads(archive.read("capture.json"))
        if provenance["repository"] != capture["repository"] or provenance["sha"] != capture["sha"]:
            raise ValueError("Screenshot bundle source does not match its release")
        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("status") != "passed" or not manifest.get("images"):
            raise ValueError("Only successful captures can be imported")
        groups = {(theme, device): set() for theme in ("light", "dark") for device in ("desktop", "phone")}
        expected_files = {"capture.json", "manifest.json", "index.html"}
        for image in manifest["images"]:
            if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", image["scene"]):
                raise ValueError("Invalid screenshot scene")
            group = groups[(image["theme"], image["format"])]
            if image["scene"] in group or image["file"] in expected_files:
                raise ValueError("Duplicate screenshot")
            group.add(image["scene"])
            expected_files.add(image["file"])
            with archive.open(image["file"]) as stream:
                header = stream.read(24)
            if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", header[16:24]) != (image["width"], image["height"]):
                raise ValueError("PNG dimensions do not match the manifest")
        expected_scenes = next(iter(groups.values()))
        if not expected_scenes or any(value != expected_scenes for value in groups.values()) or set(names) != expected_files:
            raise ValueError("Incomplete screenshot bundle")
        archive.extractall(destination)


def sync(plan):
    CACHE.mkdir(exist_ok=True)
    for project_id, capture in plan.items():
        expected_prefix = f"https://github.com/{capture['repository']}/releases/download/{capture['tag']}/"
        if not capture["url"].startswith(expected_prefix):
            raise ValueError("Unexpected screenshot download URL")
        with tempfile.TemporaryDirectory(prefix="import-", dir=CACHE) as temporary:
            temporary = Path(temporary)
            archive = temporary / "screenshots.zip"
            with urllib.request.urlopen(capture["url"], timeout=120) as response, archive.open("wb") as output:
                size = 0
                while chunk := response.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise ValueError("Screenshot download exceeds limit")
                    output.write(chunk)
            digest = capture.get("digest")
            if digest and digest != "sha256:" + hashlib.sha256(archive.read_bytes()).hexdigest():
                raise ValueError("Screenshot archive checksum mismatch")
            extracted = temporary / "gallery"
            extract_bundle(archive, extracted, capture)
            subprocess.run(["node", str(ROOT / "scripts/import-screenshots.mjs"), str(extracted), project_id], cwd=ROOT, check=True)
    write_json(ROOT / "data/capture-state.json", plan)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--plan", type=Path)
    args = parser.parse_args()
    if args.plan:
        sync(read_json(args.plan))
        return
    plan = resolve_captures(read_json(ROOT / "data/projects.json"))
    if args.check:
        write_json(CACHE / "plan.json", plan)
        changed = os.environ.get("FORCE_BUILD") == "true" or plan != read_json(CACHE / "deployed.json", {})
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
                output.write(f"build_required={str(changed).lower()}\n")
        print("New screenshots or site changes: building" if changed else "Published screenshots are unchanged")
    else:
        sync(plan)


if __name__ == "__main__":
    main()
