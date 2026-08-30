import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import Timeline from "wavesurfer.js/dist/plugins/timeline.esm.js";
import records, { type RecordFile } from "virtual:records";
import RecordList from "./RecordList";
import Transcript from "./Transcript";
import {
  formatTime,
  normalizeSegmentText,
  parseTranscript,
  serializeTranscript,
  stripMark,
  type Segment,
} from "./segments";
import { clearDraft, readDraft, writeDraft, type Edits } from "./drafts";
import "./App.css";

/**
 * The transcript as it sits on disk, plus the corrections made on top of it. Keeping
 * the two apart is what lets a line be reverted, and what makes "is this edited?"
 * answerable without diffing against a second copy of the text.
 */
type LoadedTranscript = { url: string; base: Segment[]; edits: Edits };

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
  const [status, setStatus] = useState("");

  // Derived, not stored: segments only count when they belong to the selected
  // record, so switching records never flashes the previous transcript.
  const current = loaded && loaded.url === selected?.transcriptUrl ? loaded : null;

  const segments = useMemo(() => {
    if (!current) return [];
    return current.base.map((segment) =>
      Object.hasOwn(current.edits, segment.start)
        ? { ...segment, text: current.edits[segment.start] }
        : segment,
    );
  }, [current]);

  // Passed down so a corrected row can mark itself without re-deriving the diff there.
  const editedStarts = useMemo(
    () => new Set(Object.keys(current?.edits ?? {}).map(Number)),
    [current],
  );

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
        // Corrections are restored here rather than held in memory, so they survive a
        // reload and switching away and back -- which the guard above would otherwise
        // discard along with the rest of the previous record's transcript.
        if (!ignore) {
          setLoaded({ url, base: parseTranscript(text), edits: readDraft(url) });
        }
      })
      .catch((error: unknown) => {
        console.error("Could not load the transcript", error);
      });

    return () => {
      ignore = true;
    };
  }, [selected]);

  useEffect(() => {
    if (!loaded) return;
    if (Object.keys(loaded.edits).length === 0) clearDraft(loaded.url);
    else writeDraft(loaded.url, loaded.edits);
  }, [loaded]);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(""), 3000);
    return () => clearTimeout(timer);
  }, [status]);

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

  const handleEditSegment = useCallback((start: number, text: string) => {
    const corrected = normalizeSegmentText(text);

    setLoaded((prev) => {
      if (!prev) return prev;
      const original = prev.base.find((segment) => segment.start === start);
      if (!original) return prev;

      const edits = { ...prev.edits };
      // Emptying a line restores what was transcribed rather than blanking it: an
      // empty line would not survive the next parse, and deleting segments is not
      // something this editor does. A line left holding nothing but its `#` counts as
      // empty too, or it would render as a blank coloured row.
      if (!stripMark(corrected) || corrected === original.text) delete edits[start];
      else edits[start] = corrected;

      return { ...prev, edits };
    });
  }, []);

  const handleDiscardEdits = useCallback(() => {
    setLoaded((prev) => (prev ? { ...prev, edits: {} } : prev));
    setStatus("Corrections discarded");
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(serializeTranscript(segments))
      .then(() => setStatus("Transcript copied"))
      .catch((error: unknown) => {
        console.error("Could not copy the transcript", error);
        setStatus("Could not copy -- see the console");
      });
  }, [segments]);

  const handleDownload = useCallback(() => {
    if (!selected) return;

    // A Blob built from a JS string is UTF-8 with no BOM, which is what the files on
    // disk are -- several transcripts carry names like "Hellebas" with an umlaut.
    const blob = new Blob([serializeTranscript(segments)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selected.name}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`Downloaded ${selected.name}.txt`);
  }, [segments, selected]);

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

        {segments.length > 0 && (
          <div className="transcript-bar">
            <span className="transcript-status" role="status">
              {status ||
                (editedStarts.size > 0
                  ? `${editedStarts.size} line${editedStarts.size === 1 ? "" : "s"} corrected -- not yet saved to disk`
                  : "")}
            </span>
            {editedStarts.size > 0 && (
              <button type="button" className="action" onClick={handleDiscardEdits}>
                Discard
              </button>
            )}
            <button type="button" className="action" onClick={handleCopy}>
              Copy
            </button>
            <button type="button" className="action" onClick={handleDownload}>
              Download .txt
            </button>
          </div>
        )}

        <Transcript
          // Remounting on record switch drops any half-finished edit along with the
          // scroll position, instead of carrying it over to a different recording.
          key={selected?.transcriptUrl ?? "none"}
          segments={segments}
          currentTime={currentTime}
          editedStarts={editedStarts}
          onSeek={handleSeek}
          onPlayFrom={handlePlayFrom}
          onEditSegment={handleEditSegment}
        />
      </main>
    </>
  );
}

export default App;
