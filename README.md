# Get transcrips from https://www.liveatc.net/archive.php audio files

## install whisper-cpp

brew install whisper-cpp

## download models

https://huggingface.co/ggerganov/whisper.cpp/tree/main

# extract test audio and prepare for Whisper

ffmpeg -ss 27:15 -to 30:00 -i ENZV5-Gnd-Aug-24-2026-1530Z.mp3 -c copy test_sample.mp3

ffmpeg -i test_sample.mp3 -af "highpass=f=300, lowpass=f=3400, volume=1.5" -ar 16000 -ac 1 clean_sample.wav

## whisper with local names

whisper-cli -m ~/models/whisper/ggml-medium.en.bin -f clean_sample.wav -l en --prompt "Norwegian place names: Stavanger, Sandnes, Sola. ATC terms: request taxi, XRay, correction" > transcript.txt
