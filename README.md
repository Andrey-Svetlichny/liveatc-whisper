# Get transcrips from https://www.liveatc.net/archive.php audio files

## install whisper-cpp

brew install whisper-cpp

## download models

https://huggingface.co/ggerganov/whisper.cpp/tree/main

# extract test audio and convert for Whisper

ffmpeg -ss 27:15 -to 30:00 -i ENZV5-Gnd-Aug-24-2026-1530Z.mp3 -ar 16000 -ac 1 recording.wav

## whisper with local names

whisper-cli -m ~/models/whisper/ggml-medium.en.bin -f recording.wav -l en --prompt "Norwegian place names: Stavanger, Sandnes, Sola. ATC terms: request taxi, XRay, correction"
