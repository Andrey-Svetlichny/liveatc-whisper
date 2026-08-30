import { useCallback, useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import Timeline from "wavesurfer.js/dist/plugins/timeline.esm.js";
import records, { type RecordFile } from "virtual:records";
import RecordList from "./RecordList";
import Transcript from "./Transcript";
import { formatTime, parseTranscript, type Segment } from "./segments";
import "./App.css";

type LoadedTranscript = { url: string; segments: Segment[] };

/** Larger than any recording, so a seconds-based label rule never matches. */
const UNREACHABLE_INTERVAL = 1e9;

/**
 * Seconds of audio to play before a segment's timestamp. Starting exactly on it
 * clips the attack of the first word, which makes it hard to catch.
 */
const PLAY_LEAD_IN = 0.2;

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
  const [selected, setSelected] = useState<RecordFile | undefined>(records[0]);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState<LoadedTranscript | null>(null);

  // Derived, not stored: segments only count when they belong to the selected
  // record, so switching records never flashes the previous transcript.
  const segments =
    loaded && loaded.url === selected?.transcriptUrl ? loaded.segments : [];

  useEffect(() => {
    const ws = WaveSurfer.create({
      container: containerRef.current!,
      // original LiveATC's mp3s carry no Xing header,
      // backend: "WebAudio" can fix duration shift, but slow down loading
      // backend: "WebAudio",
      height: 128,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      ...themeColors(),
      plugins: [
        Timeline.create({
          height: 20,
          // Notch spacing is left to the plugin, which derives it from
          // pixels-per-second — a 30 min file gets minute notches rather than
          // the 360 five-second ones a fixed interval would draw.
          //
          // Labels are then placed every Nth notch instead of every N seconds,
          // so the ruler stays equally readable at 3 minutes and at 30. The
          // *LabelInterval values are set out of reach so only the spacings
          // apply; the plugin ORs the two conditions together.
          primaryLabelInterval: UNREACHABLE_INTERVAL,
          primaryLabelSpacing: 8,
          secondaryLabelInterval: UNREACHABLE_INTERVAL,
          secondaryLabelSpacing: 4,
          formatTimeCallback: formatTime,
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
    const ws = wavesurferRef.current;
    if (!ws || !selected) return;

    setIsReady(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    ws.load(selected.audioUrl).catch((error: unknown) => {
      // Switching records aborts the in-flight load; that is expected.
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("Could not load the recording", error);
    });
  }, [selected]);

  useEffect(() => {
    const url = selected?.transcriptUrl;
    if (!url) return;

    let ignore = false;

    fetch(url)
      .then((res) => {
        if (!res.ok)
          throw new Error(`Transcript request failed: ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!ignore) setLoaded({ url, segments: parseTranscript(text) });
      })
      .catch((error: unknown) => {
        console.error("Could not load the transcript", error);
      });

    return () => {
      ignore = true;
    };
  }, [selected]);

  const togglePlay = useCallback(() => {
    wavesurferRef.current?.playPause();
  }, []);

  const handleSeek = useCallback((time: number) => {
    wavesurferRef.current?.setTime(time);
  }, []);

  const handlePlayFrom = useCallback((time: number) => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    ws.setTime(Math.max(0, time - PLAY_LEAD_IN));
    ws.play().catch((error: unknown) => {
      console.error("Could not start playback", error);
    });
  }, []);

  return (
    <>
      <RecordList
        records={records}
        selected={selected}
        onSelect={setSelected}
      />

      <main>
        <h1>{selected?.name ?? "No recordings"}</h1>

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
            {formatTime(currentTime)} /{" "}
            {isReady ? formatTime(duration) : "--:--"}
          </span>
        </div>

        <Transcript
          segments={segments}
          currentTime={currentTime}
          onSeek={handleSeek}
          onPlayFrom={handlePlayFrom}
        />
      </main>
    </>
  );
}

export default App;
