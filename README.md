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

LiveATC's mp3s carry no Xing/Info header, so players guess the duration from the bitrate
and come out 8.9 s short over a 32 min file -- every seek drifts ~0.5% late. Remuxing with
`-c:a copy` leaves the audio untouched and writes a real header with a seek table.

./fix-mp3-headers.sh                     # audio/**, recursive, in place, safe to re-run
./fix-mp3-headers.sh viewer/public/audio # the viewer serves its own copy -- do this too

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

---

# correct a transcript in the viewer

Click the pencil on a transcript line to fix what Whisper misheard. Enter or clicking away
commits, Escape cancels, and clearing a line restores the original text. Corrected lines are
marked in the margin.

Start a line's text with `#` to flag it -- the viewer colours the whole row and hides the `#`,
which is visible again in edit mode, where you add or remove it. The `#` is kept in the file:

[00:02:54.434 --> 00:02:56.034]  # Hello Ground, Niner 2-7.

Corrections live in the browser's localStorage, per recording -- they survive a reload and
switching between recordings, but nothing is written to disk. The app is fully static (no API),
so exporting is manual: **Download .txt** produces a file byte-identical in format to what
transcribe.sh writes, and you move it into place.

mv ~/Downloads/ENZV5-Gnd-Aug-24-2026-1530Z.txt audio/GND/
cp audio/GND/ENZV5-Gnd-Aug-24-2026-1530Z.txt viewer/public/audio/

The second copy is the same manual mirroring step the MP3 header fix needs -- viewer/public/audio
is a separate copy of the files, not a symlink.
