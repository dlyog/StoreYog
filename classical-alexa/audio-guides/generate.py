# Copyright 2026 DLYog Lab Research Services LLC
# SPDX-License-Identifier: Apache-2.0
"""Voice the original StoreYog audio guides with Kokoro and convert them for Alexa.

  python3 classical-alexa/audio-guides/generate.py

Reads guides.json, synthesizes each script with the configured Kokoro TTS (TTS_API, Kokoro format) in the
voice named in guides.json, and converts it to the MP3 format Alexa's SSML <audio> tag requires (MP3,
24 kHz, 48 kbps, mono). Each clip must stay under two minutes. Writes audio/<id>.mp3 (ignored by Git) and
manifest.json (durations). Unchanged scripts are skipped."""
from __future__ import annotations

import hashlib
import re
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = HERE / "audio"
MAX_SECONDS = 120
CHUNK_CHARS = 220  # Kokoro truncates long inputs, so each script is voiced in sentence-sized chunks
SPOKEN = {r"\bdals\b": "daals"}  # pronunciation only; the scripts keep normal spelling


def chunks(text: str) -> list[str]:
    for pattern, said in SPOKEN.items():
        text = re.sub(pattern, said, text)
    parts, current = [], ""
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        if current and len(current) + len(sentence) + 1 > CHUNK_CHARS:
            parts.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    return parts + ([current] if current else [])


def tts_base() -> str:
    url = os.environ.get("TTS_API", "")
    if not url and (ROOT / ".env").exists():
        for line in (ROOT / ".env").read_text().splitlines():
            if line.startswith("TTS_API="):
                url = line.split("=", 1)[1].strip()
    if not url:
        sys.exit("Set TTS_API to a Kokoro-format text-to-speech base URL.")
    return url.rstrip("/")


def duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def main() -> None:
    data = json.loads((HERE / "guides.json").read_text())
    OUT.mkdir(exist_ok=True)
    manifest_path = HERE / "manifest.json"
    previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    base, voice, manifest = tts_base(), data["voice"], {}
    for guide in data["guides"]:
        spoken = f"{guide['title']}. {guide['text']}"
        digest = hashlib.sha256(f"chunked-v2|{voice}|{spoken}".encode()).hexdigest()[:16]
        mp3 = OUT / f"{guide['id']}.mp3"
        if previous.get(guide["id"], {}).get("hash") == digest and mp3.exists():
            manifest[guide["id"]] = previous[guide["id"]]
            continue
        pieces = []
        for i, part in enumerate(chunks(spoken)):
            request = urllib.request.Request(f"{base}/generate-audio-binary/", method="POST",
                                             data=json.dumps({"text": part, "voice": voice, "speed": 1.0}).encode(),
                                             headers={"Content-Type": "application/json"})
            piece = OUT / f"{guide['id']}-{i:02d}.wav"
            with urllib.request.urlopen(request, timeout=180) as response:
                piece.write_bytes(response.read())
            pieces.append(piece)
        # Join the chunks with a short pause, then convert to Alexa's SSML audio format.
        inputs = [arg for piece in pieces for arg in ("-i", str(piece))]
        graph = "".join(f"[{i}:a]aresample=24000,aformat=channel_layouts=mono,apad=pad_dur=0.3[a{i}];" for i in range(len(pieces)))
        graph += "".join(f"[a{i}]" for i in range(len(pieces))) + f"concat=n={len(pieces)}:v=0:a=1[out]"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", graph, "-map", "[out]",
                        "-ac", "1", "-ar", "24000", "-b:a", "48k", "-codec:a", "libmp3lame", str(mp3)], check=True)
        for piece in pieces:
            piece.unlink()
        seconds = round(duration(mp3), 1)
        if seconds > MAX_SECONDS:
            sys.exit(f"Guide {guide['id']} is {seconds}s; shorten the script to stay under {MAX_SECONDS}s.")
        manifest[guide["id"]] = {"hash": digest, "seconds": seconds, "title": guide["title"], "category": guide["category"]}
        print(f"{guide['id']} {seconds:5.1f}s {guide['title']}")
    manifest_path.write_text(json.dumps(manifest, indent=1) + "\n")
    print(f"{len(manifest)} guides, {sum(m['seconds'] for m in manifest.values()) / 60:.1f} minutes in total")


if __name__ == "__main__":
    main()
