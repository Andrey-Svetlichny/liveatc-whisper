#!/usr/bin/env bash
set -euo pipefail

INPUT="ENZV5-Gnd-Aug-24-2026-1530Z.mp3"
NOISE="-50dB"
DUR_SILENCE="0.3"
MIN_DUR="0.05"   # skip intervals shorter than this (seconds)
OUTDIR="segments"

mkdir -p "$OUTDIR"

TOTAL_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$INPUT")

ffmpeg -hide_banner -i "$INPUT" -af "silencedetect=noise=${NOISE}:d=${DUR_SILENCE}" -f null - 2>&1 | \
sed -n -E 's/.*silence_start: ([0-9.]+).*/START \1/p; s/.*silence_end: ([0-9.]+).*/END \1/p' | \
awk -v dur="$TOTAL_DUR" -v min_dur="$MIN_DUR" '
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
' | \
while read -r start end; do
    # format with 3 decimal places, dots replaced by underscores for filename safety
    s_fmt=$(printf "%08.3f" "$start" | tr '.' '_')
    e_fmt=$(printf "%08.3f" "$end" | tr '.' '_')
    outfile="${OUTDIR}/seg_${s_fmt}-${e_fmt}.wav"
    echo "Extracting $outfile ($start -> $end)"
    ffmpeg -hide_banner -loglevel error -y -i "$INPUT" -ss "$start" -to "$end" -c copy "$outfile"
done
