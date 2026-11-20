from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import wave

import numpy as np
from faster_whisper import WhisperModel
from opencc import OpenCC

END_PUNCT = ("。", "！", "？", "，", "、", "；", ";", ",", ".", "!", "?")


def fmt(t: float) -> str:
    h = int(t // 3600)
    m = int(t % 3600 // 60)
    s = t % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--model", default=os.environ.get("LYVIDEO_ASR_MODEL", "small"))
    ap.add_argument("--threads", type=int, default=int(os.environ.get("LYVIDEO_ASR_THREADS", "0")))
    ap.add_argument("--beam", type=int, default=5)
    a = ap.parse_args()

    ffmpeg = os.environ.get("LYVIDEO_FFMPEG") or shutil.which("ffmpeg") or "ffmpeg"
    wav = a.out + ".wav"
    try:
        subprocess.run([
            ffmpeg, "-y", "-v", "quiet", "-i", a.src,
            "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav,
        ], check=True)
        with wave.open(wav, "rb") as w:
            audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

        kwargs = {
            "device": os.environ.get("LYVIDEO_ASR_DEVICE", "cpu"),
            "compute_type": os.environ.get("LYVIDEO_ASR_COMPUTE", "int8"),
        }
        if a.threads > 0:
            kwargs["cpu_threads"] = a.threads
        model = WhisperModel(a.model, **kwargs)
        prompt = os.environ.get(
            "LYVIDEO_ASR_PROMPT",
            "以下是中文视频，使用简体中文转写。",
        )
        segs, info = model.transcribe(
            audio, language="zh", vad_filter=True, beam_size=a.beam,
            condition_on_previous_text=False, initial_prompt=prompt,
        )
        cc = OpenCC("t2s")
        n = 0
        with open(a.out, "w", encoding="utf-8") as f:
            f.write("WEBVTT\n\n")
            for s in segs:
                text = cc.convert(s.text.strip()).strip()
                if not text:
                    continue
                f.write(fmt(s.start) + " --> " + fmt(s.end) + "\n")
                f.write(text + "\n\n")
                n += 1
        print(f"segments={n} duration={info.duration:.2f}s language={info.language}")
    finally:
        try:
            os.unlink(wav)
        except OSError:
            pass


if __name__ == "__main__":
    main()