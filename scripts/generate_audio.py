#!/usr/bin/env python3
"""从 lessons.json 预生成中文 mp3（字 + 整句），供手机 <audio> 播放。"""

from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "lessons.json"
AUDIO_DIR = ROOT / "audio"
MANIFEST = AUDIO_DIR / "manifest.json"
VOICE = "Tingting"

FIXED = [
    "下一个。",
    "学完了。做得很好！",
]


def key(text: str) -> str:
    return f"zh|{text}"


def file_stem(text: str) -> str:
    h = hashlib.md5(key(text).encode("utf-8")).hexdigest()[:12]
    return f"zh_{h}"


def is_punct(c: str) -> bool:
    return (not c) or c in "。，、？！；：…—· \t\n"


def collect_phrases(data: dict) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []

    def add(text: str) -> None:
        text = (text or "").strip()
        if not text or is_punct(text):
            return
        if text in seen:
            return
        seen.add(text)
        out.append(text)

    for t in FIXED:
        add(t)

    for lesson in data.get("lessons", []):
        for sent in lesson.get("sentences", []):
            add(sent.get("text") or "")
            for ch in sent.get("chars") or []:
                add(ch.get("c") or "")

    return out


def synth(text: str, mp3: Path) -> None:
    with tempfile.TemporaryDirectory() as td:
        aiff = Path(td) / "out.aiff"
        subprocess.run(["say", "-v", VOICE, "-r", "150", "-o", str(aiff), text], check=True)
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(aiff),
                "-codec:a",
                "libmp3lame",
                "-qscale:a",
                "4",
                str(mp3),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def main() -> None:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    phrases = collect_phrases(data)
    manifest: dict[str, str] = {}
    made = 0
    for text in phrases:
        stem = file_stem(text)
        mp3 = AUDIO_DIR / f"{stem}.mp3"
        rel = f"./audio/{stem}.mp3"
        if not mp3.exists():
            synth(text, mp3)
            made += 1
        manifest[key(text)] = rel
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"phrases={len(phrases)} newly_made={made} manifest={MANIFEST}")


if __name__ == "__main__":
    main()
