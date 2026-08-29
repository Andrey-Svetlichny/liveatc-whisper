#!/usr/bin/env python3
"""Transcribe one VAD speech segment at a time. pip install silero-vad; needs ffmpeg."""
import subprocess, sys, tempfile, pathlib
import wave, numpy as np, torch
from silero_vad import load_silero_vad, get_speech_timestamps


WHISPER = "whisper-cli"
# MODEL = pathlib.Path.home() / "models/ggml/ggml-large-v3-turbo.bin"
MODEL = pathlib.Path.home() / "models/whisper/ggml-medium.en.bin"
SR = 16000
# Applied to every input. Measured against 9 alternatives (raw, extra gain, dynaudnorm,
# speechnorm, loudnorm, afftdn, wider passband): none beat this, several were worse.
# Applied unconditionally, so feed originals -- re-running it on an already-filtered
# file would apply volume=1.5 twice and clip.
FILTERS = "highpass=f=300, lowpass=f=3400, volume=1.5"
# Shaped like a real ENZV Ground exchange, which primes callsigns far better than a
# keyword list does. Two rules, both learned by A/B-ing prompts over the same segments:
#   * no bare keyword or place-name lists; they bleed into the output as callsigns
#   * the numbers here are deliberately unlike any real transmission, for the same reason
# PROMPT = (
#     "Stavanger Sola Ground. Scandinavian 871, taxi via Romeo, Tango, hold short "
#     "runway 36. Norwegian 512, push and start approved, QNH 1008, stand 21. "
#     "Viking 1362, stand 22, information Bravo, requesting departure clearance. "
#     "Are you able to lift your clearance via datalink? Cleared via Victor, "
#     "2000 feet and below, squawk 5271, readback correct."
# )
PROMPT = (
    "Stavanger Sola Ground. Scandinavian 871, taxi via Romeo, Tango, hold short "
    "runway 36. Norwegian 512, push and start approved, QNH 1008, stand 21. "
    "Viking 1362, stand 22, information Bravo, requesting departure clearance. "
    "Are you able to lift your clearance via datalink? Cleared via Victor, "
    "2000 feet and below, squawk 5271, readback correct."
)
PAD = int(0.2 * SR)          # samples of lead-in/out kept around each segment



def load_audio(path):
    """Decode anything ffmpeg reads, filter it, and hand back mono 16 kHz PCM."""
    out = subprocess.run(
        ["ffmpeg", "-i", str(path), "-af", FILTERS, "-ar", str(SR), "-ac", "1",
         "-f", "s16le", "-loglevel", "error", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(out, dtype=np.int16)

def save_wav(path, pcm, sr=16000):
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr)
        f.writeframes(pcm.tobytes())

def ts(samples, sr=SR):
    ms = round(samples * 1000 / sr)
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"

src = pathlib.Path(sys.argv[1])
pcm = load_audio(src)
wav = torch.from_numpy(pcm.astype(np.float32) / 32768.0)
segments = get_speech_timestamps(wav, load_silero_vad(), sampling_rate=SR)

tmp = pathlib.Path(tempfile.mkdtemp())
# Written line by line: a full recording takes minutes, so partial output is useful.
with src.with_suffix(".txt").open("w") as out:
    for i, seg in enumerate(segments):
        a = max(0, seg["start"] - PAD)
        b = min(len(wav), seg["end"] + PAD)
        save_wav(tmp / f"{i}.wav", pcm[a:b], SR)

        subprocess.run(
            [WHISPER, "-m", str(MODEL), "-f", str(tmp / f"{i}.wav"),
             "-l", "en", "-nt", "-np", "--prompt", PROMPT,
             "-otxt", "-of", str(tmp / f"{i}")],
            check=True, capture_output=True,
        )
        text = (tmp / f"{i}.txt").read_text().strip().replace("\n", " ")

        line = f"[{ts(seg['start'])} --> {ts(seg['end'])}]  {text}"
        print(line)
        out.write(line + "\n"); out.flush()
