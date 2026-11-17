from __future__ import annotations
import argparse, subprocess, wave
import numpy as np
from faster_whisper import WhisperModel
from opencc import OpenCC

def fmt(t: float) -> str:
    h = int(t // 3600)
    m = int(t % 3600 // 60)
    s = t % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--model", default="small")
    a = ap.parse_args()
    wav = a.out + ".wav"
    subprocess.run([
        "ffmpeg", "-y", "-v", "quiet", "-i", a.src,
        "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav
    ], check=True)
    with wave.open(wav, "rb") as w:
        audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    model = WhisperModel(a.model, device="cpu", compute_type="int8")
    segs, _ = model.transcribe(audio, language="zh", vad_filter=True, beam_size=5)
    cc = OpenCC("t2s")
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        for s in segs:
            f.write(fmt(s.start) + " --> " + fmt(s.end) + "\n")
            f.write(cc.convert(s.text.strip()) + "\n\n")

if __name__ == "__main__":
    main()
