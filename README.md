# Get transcrips from https://www.liveatc.net/archive.php audio files

## install whisper-cpp

brew install whisper-cpp

## download models

https://huggingface.co/ggerganov/whisper.cpp/tree/main

### vad

https://huggingface.co/ggml-org/whisper-vad/blob/main/ggml-silero-v6.2.0.bin

# extract test audio and prepare for Whisper

ffmpeg -ss 27:15 -to 30:00 -i ENZV5-Gnd-Aug-24-2026-1530Z.mp3 -c copy test_sample.mp3

ffmpeg -i test_sample.mp3 -af "highpass=f=300, lowpass=f=3400, volume=1.5" -ar 16000 -ac 1 clean_sample.wav

## whisper with local names

whisper-cli -m ~/models/whisper/ggml-medium.en.bin -f clean_sample.wav -l en --prompt "Norwegian place names: Stavanger, Sandnes, Sola. ATC terms: request taxi, XRay, correction" > transcript.txt

# process real file

ffmpeg -i ENZV5-Gnd-Aug-24-2026-1530Z.mp3 -af "highpass=f=300, lowpass=f=3400, volume=1.5" -ar 16000 -ac 1 rec.wav

ffmpeg -i rec.mp3 -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a libmp3lame -b:a 48k -ac 1 rec_norm2.mp3

whisper-cli -m ~/models/whisper/ggml-medium.en.bin --vad -vm ~/models/whisper/ggml-silero-v6.2.0.bin -f rec.wav -l en --prompt "Norwegian place names: Stavanger, Sandnes, Sola. ATC terms: request taxi, XRay, correction"

# fix broken MP3 header

ffmpeg -i ENZV5-Gnd-Aug-24-2026-1530Z_0.mp3 -c:a copy ENZV5-Gnd-Aug-24-2026-1530Z.mp3

ffmpeg -i ENZV5-Gnd-Aug-24-2026-1530Z.mp3 -af "highpass=f=300, lowpass=f=3400, loudnorm=I=-16:TP=-1.5:LRA=11" -c:a libmp3lame -b:a 48k -ac 1 rec_norm.mp3

# norm

ffmpeg -i ENZV5-Gnd-Aug-24-2026-1530Z.mp3 -af "highpass=f=300, lowpass=f=3400, loudnorm=I=-16:TP=-1.5:LRA=11" -c:a libmp3lame -b:a 16k -ar 11025 -ac 1 rec_norm2.mp3

---

# volume detect

ffmpeg -i seg_0174_434-0180_790.wav -af volumedetect -f null - 2>&1 | grep max_volume

# normalize

ffmpeg -i seg_0174_434-0180_790.wav -af "volume=11dB" rec.wav

# parse

whisper-cli -m ~/models/whisper/ggml-medium.en.bin -f rec.wav -l en --prompt "Hello Ground, Finnair, taxi via T Q stand 13"
