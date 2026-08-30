#!/usr/bin/env bash
# Rewrite every mp3 in a folder with a proper Info/Xing header, in place.
#
# LiveATC's archive mp3s carry no Xing/Info frame at all: the first frame looks like a
# LAME info frame -- the LAME3.96 string sits right where the tag belongs -- but the
# magic, the frame count and the seek TOC were never written. On top of that the
# encoder never inserts the padding byte, so every frame is 104 bytes where a
# 16 kbps / 11025 Hz MPEG-2.5 Layer III frame should alternate 104/105. The real rate
# is 15925 bps, not the 16000 the header claims.
#
# With no frame count a player can only guess size*8/bitrate, which comes out 8.9 s
# short over a 32 min recording, and byte-offset seeking is stretched by the same
# 0.47 % -- roughly 4.5 s early at the middle, 8.9 s early at the end. The viewer used
# to work around this with wavesurfer's WebAudio backend, which decodes the whole file
# up front to recover the true sample count; that is exactly what made it slow.
#
# `-c:a copy` remuxes without touching the audio bitstream: ffmpeg walks and counts the
# frames, then writes a real Info header with a seek TOC. The default MediaElement
# backend then gets an exact duration and seeks correctly, with no decode.
#
# Only *.mp3 containers are rewritten. The .txt transcripts next to them are untouched
# and stay valid -- transcribe.sh takes its timings from ffmpeg's silencedetect, which
# decodes actual frames, so they were always in real time. It was only the player that
# was wrong.
#
# usage: ./fix-mp3-headers.sh [audio_dir]   # default: audio, searched recursively
#   env: FORCE=1 to redo files that already carry a header
set -euo pipefail

AUDIO_DIR="${1:-audio}"

# The header frame sits at the top of the file, after at most a small ID3v2 tag
# (ffmpeg writes ~109 bytes here, putting Info at 0x77), so a 4 KiB window is plenty.
# -a because the surrounding audio frames are binary and grep would otherwise bail.
has_header() {
  head -c 4096 "$1" | LC_ALL=C grep -qa 'Xing\|Info'
}

# Two decimals is all the precision that matters when the bug being fixed is 8.9 s.
duration() {
  ffprobe -v error -show_entries format=duration -of csv=p=0 "$1" |
    awk '{ printf "%.2f", $1 }' || true
}

shopt -s nullglob
files=()
while IFS= read -r -d '' f; do
  files+=("$f")
done < <(find "$AUDIO_DIR" -type f -name '*.mp3' -print0 | sort -z)

if [ ${#files[@]} -eq 0 ]; then
  echo "no mp3 files in $AUDIO_DIR" >&2
  exit 1
fi

LOG=$(mktemp)
# $tmp is reassigned per file; the trap always names whichever one is in flight, so an
# interrupt never leaves a stray .fixing.mp3 behind.
tmp=""
trap 'rm -f "$LOG" "${tmp:-}"' EXIT

i=0
failed=0
for src in "${files[@]}"; do
  i=$((i + 1))
  name=$(basename "$src" .mp3)

  if has_header "$src" && [ -z "${FORCE:-}" ]; then
    echo "==> [$i/${#files[@]}] $name -- header present, skipping" >&2
    continue
  fi
  echo "==> [$i/${#files[@]}] $name" >&2

  # Same directory so the mv below stays on one filesystem, and the .mp3 suffix is what
  # picks the muxer.
  tmp="${src%.mp3}.fixing.mp3"

  # ffmpeg is quiet unless it actually fails: these files end on a truncated frame, so
  # a "Header missing" warning at EOF is expected and not worth printing 109 times.
  if ! ffmpeg -v error -y -i "$src" -c:a copy "$tmp" > "$LOG" 2>&1; then
    cat "$LOG" >&2
    echo "    remux failed, leaving original alone" >&2
    rm -f "$tmp"
    tmp=""
    failed=$((failed + 1))
    continue
  fi

  # Only replace something that is actually better than what we had. A zero-byte or
  # header-less result means the remux silently did nothing.
  if [ ! -s "$tmp" ] || ! has_header "$tmp"; then
    echo "    no header in output, leaving original alone" >&2
    rm -f "$tmp"
    tmp=""
    failed=$((failed + 1))
    continue
  fi

  # Both probes run before the mv, while $src is still the original.
  before=$(duration "$src")
  after=$(duration "$tmp")
  mv "$tmp" "$src"
  tmp=""
  echo "    ${before}s -> ${after}s" >&2
done

if [ "$failed" -gt 0 ]; then
  echo "$failed of ${#files[@]} file(s) could not be fixed" >&2
  exit 1
fi
