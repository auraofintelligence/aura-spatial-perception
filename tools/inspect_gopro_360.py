#!/usr/bin/env python3
"""Read-only native GoPro .360 container inspector.

The source file is never modified, copied or transcoded. By default this emits
only a compact JSON manifest. Optional extraction copies each data track into a
raw sidecar and records its packet timing; it never claims to decode GPMF keys.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA = "aura-gopro-native-inspection/0.1.0"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run_json(command: list[str]) -> dict[str, Any]:
    completed = subprocess.run(command, check=True, capture_output=True, text=True, encoding="utf-8")
    return json.loads(completed.stdout)


def compact_stream(stream: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "index", "codec_name", "codec_long_name", "codec_type", "codec_tag_string",
        "profile", "width", "height", "pix_fmt", "r_frame_rate", "avg_frame_rate",
        "time_base", "start_time", "duration", "nb_frames", "disposition", "tags",
        "side_data_list",
    )
    return {key: stream.get(key) for key in keys if stream.get(key) not in (None, {}, [])}


def inspect(path: Path) -> dict[str, Any]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise RuntimeError("ffprobe was not found. Install FFmpeg and try again.")
    probe = run_json([
        ffprobe, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path),
    ])
    streams = [compact_stream(stream) for stream in probe.get("streams", [])]
    videos = [stream for stream in streams if stream.get("codec_type") == "video"]
    data = [stream for stream in streams if stream.get("codec_type") == "data"]
    stat = path.stat()
    return {
        "schemaVersion": SCHEMA,
        "inspectedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "name": path.name,
            "bytes": stat.st_size,
            "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
            "sha256": sha256_file(path),
            "nativePreserved": True,
            "absolutePathRecorded": False,
        },
        "container": probe.get("format", {}),
        "streams": streams,
        "summary": {
            "videoStreamCount": len(videos),
            "dataStreamCount": len(data),
            "pairedEacCandidate": len(videos) >= 2 and all(stream.get("codec_name") in {"hevc", "h265"} for stream in videos[:2]),
            "gpmfTrackCandidates": [
                stream.get("index") for stream in data
                if str(stream.get("codec_tag_string", "")).lower() in {"gpmd", "gpmf"}
                or "gopro" in json.dumps(stream.get("tags", {})).lower()
            ],
            "gpmfKeyDecoding": "not-connected",
            "disparityInterpretation": "not-inspected",
        },
        "claims": {
            "decodedPairedEac": False,
            "decodedGpmfKeys": False,
            "metricDepthFromDisparity": False,
        },
    }


def data_packet_timing(path: Path) -> dict[str, Any]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise RuntimeError("ffprobe was not found.")
    return run_json([
        ffprobe, "-v", "error", "-select_streams", "d", "-show_packets",
        "-show_entries", "packet=stream_index,pts,pts_time,dts,dts_time,duration,duration_time,size,pos,flags",
        "-of", "json", str(path),
    ])


def extract_data_tracks(path: Path, manifest: dict[str, Any], output_dir: Path) -> list[dict[str, Any]]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg was not found. Install FFmpeg and try again.")
    output_dir.mkdir(parents=True, exist_ok=True)
    extracted: list[dict[str, Any]] = []
    data_streams = [stream for stream in manifest["streams"] if stream.get("codec_type") == "data"]
    for stream in data_streams:
        index = int(stream["index"])
        destination = output_dir / f"stream-{index:02d}-{stream.get('codec_tag_string', 'data')}.bin"
        subprocess.run([
            ffmpeg, "-v", "error", "-y", "-i", str(path), "-map", f"0:{index}",
            "-c", "copy", "-f", "data", str(destination),
        ], check=True)
        extracted.append({
            "streamIndex": index,
            "file": destination.name,
            "bytes": destination.stat().st_size,
            "sha256": sha256_file(destination),
            "relationship": "lossless raw data-track extraction from unchanged native source",
        })
    return extracted


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect an original GoPro MAX .360 file without modifying or transcoding it.")
    parser.add_argument("source", type=Path, help="Path to the original .360 file")
    parser.add_argument("--output", type=Path, help="Manifest JSON path; stdout when omitted")
    parser.add_argument("--packet-timing", action="store_true", help="Record timed data-track packet references")
    parser.add_argument("--extract-data-dir", type=Path, help="Losslessly extract raw data tracks into this directory")
    args = parser.parse_args()

    source = args.source.resolve(strict=True)
    if source.suffix.lower() != ".360":
        parser.error("source must retain its original .360 extension")
    manifest = inspect(source)
    if args.packet_timing:
        manifest["dataPacketTiming"] = data_packet_timing(source)
    if args.extract_data_dir:
        output_dir = args.extract_data_dir.resolve()
        if output_dir == source.parent or source in output_dir.parents:
            raise RuntimeError("Choose a dedicated derivative directory, not the source directory.")
        manifest["extractedDataTracks"] = extract_data_tracks(source, manifest, output_dir)
    payload = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        destination = args.output.resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(payload, encoding="utf-8")
        print(destination)
    else:
        sys.stdout.write(payload)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        print(f"inspection failed: {error}", file=sys.stderr)
        raise SystemExit(1)
