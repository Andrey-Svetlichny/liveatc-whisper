#!/usr/bin/env bash

peak=$(ffmpeg -i $1 -af volumedetect -f null - 2>&1 | grep max_volume | sed -E 's/.*max_volume: ([-0-9.]+) dB.*/\1/')
gain=$(awk -v p="$peak" 'BEGIN { print -3 - p }')

# echo $gain

# dB suffix matters: a bare number is a linear multiplier, not decibels.
ffmpeg -i $1 -af "volume=${gain}dB" rec.wav
