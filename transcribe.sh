#!/usr/bin/env bash
# Transcribe every recording in a folder, writing <name>.txt next to <name>.mp3.
# Per file: split on silence, peak-normalize each segment on its own, run whisper,
# and join the results with the timings of the segments.
#
# usage: ./transcribe.sh [audio_dir]        # default: audio
#   env: MODEL=<ggml model>  FORCE=1 to redo existing transcripts
#        WORKDIR=<dir> to keep the intermediate wavs instead of a temp dir
set -euo pipefail

AUDIO_DIR="${1:-audio}"
WHISPER="whisper-cli"
MODEL="${MODEL:-$HOME/models/whisper/ggml-medium.en.bin}"

NOISE="-50dB"        # everything below this counts as silence
DUR_SILENCE="0.3"    # ...for at least this long
MIN_DUR="0.05"       # drop speech intervals shorter than this
PEAK_DB="-3"         # normalization target: leave 3 dB of headroom

# Shaped like a real ENZV Ground exchange, which primes callsigns far better than a
# keyword list does -- same prompt as transcript/transcribe.py, where it was picked by
# A/B-ing over these recordings. Keep it that way: bare keyword lists bleed into the
# output as callsigns, and the numbers are deliberately unlike any real transmission.
PROMPT="Stavanger Sola Ground. Scandinavian 871, taxi via Romeo, Tango, hold short \
runway 36. Norwegian 512, push and start approved, QNH 1008, stand 21. \
Viking 1362, stand 22, information Bravo, requesting departure clearance. \
Are you able to lift your clearance via datalink? Cleared via Victor, \
2000 feet and below, squawk 5271, readback correct."

# Only ever auto-remove a directory we made ourselves.
if [ -n "${WORKDIR:-}" ]; then
  WORK="$WORKDIR"
  mkdir -p "$WORK"
  echo "keeping intermediates in $WORK" >&2
else
  WORK=$(mktemp -d)
  trap 'rm -rf "$WORK"' EXIT
fi

# Seconds -> HH:MM:SS.mmm, the format transcribe.py writes and the UI parses.
fmt_ts() {
  awk -v t="$1" 'BEGIN {
    ms = int(t * 1000 + 0.5)
    printf "%02d:%02d:%02d.%03d", int(ms/3600000), int(ms%3600000/60000), int(ms%60000/1000), ms%1000
  }'
}

# Print the non-silent intervals of $1 as "start end" pairs, one per line.
speech_intervals() {
  local src="$1" total
  total=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")

  ffmpeg -hide_banner -i "$src" -af "silencedetect=noise=${NOISE}:d=${DUR_SILENCE}" \
    -f null - 2>&1 |
  sed -n -E 's/.*silence_start: ([0-9.]+).*/START \1/p; s/.*silence_end: ([0-9.]+).*/END \1/p' |
  awk -v dur="$total" -v min_dur="$MIN_DUR" '
    $1=="START" {
      s=prev_end+0; e=$2+0
      if (e - s > min_dur) print s, e
      prev_end=""
    }
    $1=="END"   { prev_end=$2 }
    END {
      if (prev_end != "") {
        s=prev_end+0; e=dur+0
        if (e - s > min_dur) print s, e
      }
    }
  '
}

shopt -s nullglob
files=("$AUDIO_DIR"/*.mp3)
if [ ${#files[@]} -eq 0 ]; then
  echo "no mp3 files in $AUDIO_DIR" >&2
  exit 1
fi

i=0
for src in "${files[@]}"; do
  [ -f "$src" ] || continue
  i=$((i + 1))
  name=$(basename "$src" .mp3)
  out="${src%.*}.txt"

  if [ -e "$out" ] && [ -z "${FORCE:-}" ]; then
    echo "==> [$i/${#files[@]}] $name -- transcript exists, skipping" >&2
    continue
  fi
  echo "==> [$i/${#files[@]}] $name" >&2

  # Built up here and moved into place only once the file is done, so an interrupted
  # run never leaves a truncated .txt that the skip above would take for finished.
  : > "$WORK/out.txt"
  n=0

  while read -r start end; do
    ffmpeg -v error -y -i "$src" -ss "$start" -to "$end" -c copy "$WORK/raw.wav"

    # Peak normalization. The dB suffix matters: a bare number is a linear multiplier.
    peak=$(ffmpeg -i "$WORK/raw.wav" -af volumedetect -f null - 2>&1 |
           sed -nE 's/.*max_volume: ([-0-9.]+) dB.*/\1/p')
    if [ -z "$peak" ]; then
      echo "  skip ${start}-${end}: silent or unreadable" >&2
      continue
    fi
    gain=$(awk -v p="$peak" -v target="$PEAK_DB" 'BEGIN { print target - p }')

    # Sample rate is left alone -- whisper-cli reads the native 11025 Hz, and
    # resampling here only loses quality.
    seg="$WORK/${name}_$(fmt_ts "$start" | tr ':.' '__')"
    ffmpeg -v error -y -i "$WORK/raw.wav" -af "volume=${gain}dB" "$seg.wav"

    # Quiet unless it actually fails -- the ggml backend chatter would bury the output.
    if ! "$WHISPER" -m "$MODEL" -f "$seg.wav" -l en -nt -np --prompt "$PROMPT" \
         -otxt -of "$seg" > "$WORK/whisper.log" 2>&1; then
      cat "$WORK/whisper.log" >&2
      exit 1
    fi

    text=$(tr '\n' ' ' < "$seg.txt" | sed -E 's/^ +| +$//g; s/ +/ /g')
    if [ -z "$text" ] || [ "$text" = "[BLANK_AUDIO]" ]; then
      continue
    fi

    line="[$(fmt_ts "$start") --> $(fmt_ts "$end")]  $text"
    echo "$line"
    echo "$line" >> "$WORK/out.txt"
    n=$((n + 1))
  done < <(speech_intervals "$src")

  mv "$WORK/out.txt" "$out"
  echo "    $n lines -> $out" >&2
done
