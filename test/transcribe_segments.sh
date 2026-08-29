#!/usr/bin/env bash
# Transcribe the segments cut by detect_segments.sh into one transcript, taking the
# timing straight from the file names (seg_<start>-<end>.wav, dots written as _).
#
# usage: ./transcribe_segments.sh [segments_dir] [output.txt]
#   env: MODEL=<ggml model>   LIMIT=<n> to stop after n segments (smoke test)
set -euo pipefail

SEGDIR="${1:-segments}"
OUT="${2:-transcript.txt}"
WHISPER="whisper-cli"
MODEL="${MODEL:-$HOME/models/whisper/ggml-medium.en.bin}"
LIMIT="${LIMIT:-0}"
PEAK_DB="-3"   # normalize.sh's target: leave 3 dB of headroom

# Shaped like a real ENZV Ground exchange, which primes callsigns far better than a
# keyword list does -- same prompt as transcript/transcribe.py, where it was picked by
# A/B-ing over these same segments. Keep it that way: bare keyword lists bleed into the
# output as callsigns, and the numbers are deliberately unlike any real transmission.
PROMPT="Hello Ground. Scandinavian 871, taxi via Romeo, Tango, hold short \
runway 36. Norwegian 512, push and start approved, QNH 1008, stand 21. \
Viking 1362, stand 22, information Bravo, requesting departure clearance. \
Finnair 27 taxi via T Q, stand 13. \
Lima Tango X-ray taxi Tango, hold short Bravo 2. \
Are you able to lift your clearance via datalink? Cleared via Victor, \
2000 feet and below, squawk 5271, readback correct."

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# WORK=ASDF
# mkdir -p "$WORK"

# Seconds -> HH:MM:SS.mmm, the format transcribe.py writes and the UI parses.
fmt_ts() {
  awk -v t="$1" 'BEGIN {
    ms = int(t * 1000 + 0.5)
    printf "%02d:%02d:%02d.%03d", int(ms/3600000), int(ms%3600000/60000), int(ms%60000/1000), ms%1000
  }'
}

: > "$OUT"
n=0

for f in "$SEGDIR"/seg_*.wav; do
  [ -e "$f" ] || { echo "no segments in $SEGDIR" >&2; exit 1; }

  # seg_0174_434-0176_034.wav -> start 174.434, end 176.034. Zero padding means the
  # glob is already in start-time order.
  name=$(basename "$f" .wav)
  name=${name#seg_}
  start=$(echo "${name%%-*}" | tr '_' '.')
  end=$(echo "${name##*-}" | tr '_' '.')

  # Peak normalization, as in normalize.sh (which passes the dB gain as a linear
  # multiplier -- fixed here and there with the dB suffix).
  peak=$(ffmpeg -i "$f" -af volumedetect -f null - 2>&1 |
         sed -nE 's/.*max_volume: ([-0-9.]+) dB.*/\1/p')
  if [ -z "$peak" ]; then
    echo "skip $name: silent or unreadable" >&2
    continue
  fi
  gain=$(awk -v p="$peak" -v target="$PEAK_DB" 'BEGIN { print target - p }')

  # whisper-cli internally use 16 kHz, accept 11025 Hz. Do not convert here - degrade quality.
  ffmpeg -v error -y -i "$f" -af "volume=${gain}dB" "$WORK/seg.wav"

  # Quiet unless it actually fails -- the ggml backend chatter would bury the transcript.
  if ! "$WHISPER" -m "$MODEL" -f "$WORK/seg.wav" -l en -nt -np --prompt "$PROMPT" \
       -otxt -of "$WORK/seg" > "$WORK/whisper.log" 2>&1; then
    cat "$WORK/whisper.log" >&2
    exit 1
  fi

  text=$(tr '\n' ' ' < "$WORK/seg.txt" | sed -E 's/^ +| +$//g; s/ +/ /g')
  if [ -z "$text" ] || [ "$text" = "[BLANK_AUDIO]" ]; then
    continue
  fi

  # Written line by line: a full run takes minutes, so partial output is useful.
  line="[$(fmt_ts "$start") --> $(fmt_ts "$end")]  $text"
  echo "$line"
  echo "$line" >> "$OUT"

  n=$((n + 1))
  if [ "$LIMIT" -gt 0 ] && [ "$n" -ge "$LIMIT" ]; then
    break
  fi
done

echo "wrote $n lines to $OUT" >&2
