import { useCallback, useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import Timeline from "wavesurfer.js/dist/plugins/timeline.esm.js";
import Transcript from "./Transcript";
import { formatTime, parseTranscript, type Segment } from "./segments";
import "./App.css";

const AUDIO_URL = "/recording.wav";
const TRANSCRIPT_URL = "/transcript.txt";
const AUDIO_NAME = decodeURIComponent(
  AUDIO_URL.split("/").pop() ?? AUDIO_URL,
).replace(/\.[^.]+$/, "");

/** Pull the palette out of the CSS custom properties so the waveform follows the theme. */
function themeColors() {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    waveColor: token("--text"),
    progressColor: token("--accent"),
    cursorColor: token("--text-h"),
  };
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);

  useEffect(() => {
    const ws = WaveSurfer.create({
      container: containerRef.current!,
      url: AUDIO_URL,
      height: 128,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      ...themeColors(),
      plugins: [
        Timeline.create({
          height: 20,
          timeInterval: 5,
          primaryLabelInterval: 30,
          style: { fontSize: "12px" },
        }),
      ],
    });
    wavesurferRef.current = ws;

    ws.on("ready", () => {
      setIsReady(true);
      setDuration(ws.getDuration());
    });
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));
    ws.on("timeupdate", setCurrentTime);

    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const onSchemeChange = () => ws.setOptions(themeColors());
    scheme.addEventListener("change", onSchemeChange);

    return () => {
      scheme.removeEventListener("change", onSchemeChange);
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    fetch(TRANSCRIPT_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Transcript request failed: ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!ignore) setSegments(parseTranscript(text));
      })
      .catch((error: unknown) => {
        console.error("Could not load the transcript", error);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const togglePlay = useCallback(() => {
    wavesurferRef.current?.playPause();
  }, []);

  const handleSeek = useCallback((time: number) => {
    wavesurferRef.current?.setTime(time);
  }, []);

  const handlePlayFrom = useCallback((time: number) => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    ws.setTime(time);
    ws.play().catch((error: unknown) => {
      console.error("Could not start playback", error);
    });
  }, []);

  return (
    <main>
      <h1>{AUDIO_NAME}</h1>

      <div className="waveform" ref={containerRef} />

      <div className="controls">
        <button
          type="button"
          className="play"
          onClick={togglePlay}
          disabled={!isReady}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <span className="time">
          {formatTime(currentTime)} / {isReady ? formatTime(duration) : "--:--"}
        </span>
      </div>

      <Transcript
        segments={segments}
        currentTime={currentTime}
        onSeek={handleSeek}
        onPlayFrom={handlePlayFrom}
      />
    </main>
  );
}

export default App;
