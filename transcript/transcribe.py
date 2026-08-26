#!/usr/bin/env python3
"""Transcribe one VAD speech segment at a time. pip install silero-vad"""
import subprocess, sys, tempfile, pathlib
import wave, numpy as np, torch
from silero_vad import load_silero_vad, get_speech_timestamps


WHISPER = "whisper-cli"
# MODEL = pathlib.Path.home() / "models/ggml/ggml-large-v3-turbo.bin"
MODEL = pathlib.Path.home() / "models/whisper/ggml-medium.en.bin"
SR = 16000
PROMPT = (
    "Air traffic control radio. Ground, tower, approach, departure. "
    "Cleared for takeoff, line up and wait, taxi via, hold short, "
    "squawk, QNH, flight level, runway, ILS, wilco, roger, standby. "
    "Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo "
    "Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform "
    "Victor Whiskey X-ray Yankee Zulu, niner."
)
PAD = int(0.2 * SR)          # samples of lead-in/out kept around each segment



def load_wav(path):
    with wave.open(str(path), "rb") as f:
        assert f.getframerate() == 16000 and f.getnchannels() == 1
        return np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16)

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

pcm = load_wav(sys.argv[1])
wav = torch.from_numpy(pcm.astype(np.float32) / 32768.0)
segments = get_speech_timestamps(wav, load_silero_vad(), sampling_rate=SR)

tmp = pathlib.Path(tempfile.mkdtemp())
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

    print(f"[{ts(seg['start'])} --> {ts(seg['end'])}]  {text}")
