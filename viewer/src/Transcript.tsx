import { useEffect, useRef, useState } from "react";
import { formatTime, isMarked, stripMark, type Segment } from "./segments";

type TranscriptProps = {
  segments: Segment[];
  currentTime: number;
  editedStarts: ReadonlySet<number>;
  onSeek: (time: number) => void;
  onPlayFrom: (time: number) => void;
  onEditSegment: (start: number, text: string) => void;
};

function Transcript({
  segments,
  currentTime,
  editedStarts,
  onSeek,
  onPlayFrom,
  onEditSegment,
}: TranscriptProps) {
  const activeRef = useRef<HTMLLIElement>(null);

  // Which row is open for editing, by start time. Purely presentational, so it stays
  // here rather than in App -- the corrected text is what gets lifted up.
  const [editingStart, setEditingStart] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  // -1 while playback sits in one of the gaps between segments.
  const activeIndex = segments.findIndex(
    (segment) => currentTime >= segment.start && currentTime < segment.end,
  );

  useEffect(() => {
    // Playback keeps moving while you type, and scrolling the active row into view
    // would pull the field you are working in out from under the cursor.
    if (editingStart !== null) return;
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex, editingStart]);

  // Escape unmounts the input, and the blur that comes with losing focus would
  // otherwise commit the very text we are trying to throw away.
  const abandoned = useRef(false);

  const startEditing = (segment: Segment) => {
    setEditingStart(segment.start);
    setDraft(segment.text);
  };

  const commit = (start: number) => {
    if (abandoned.current) {
      abandoned.current = false;
      return;
    }
    setEditingStart(null);
    onEditSegment(start, draft);
  };

  if (segments.length === 0) {
    return (
      <section className="transcript empty" aria-label="Transcript">
        <p>No transcript for this recording.</p>
      </section>
    );
  }

  return (
    <section className="transcript" aria-label="Transcript">
      <ol>
        {segments.map((segment, index) => {
          const isActive = index === activeIndex;
          const isEditing = editingStart === segment.start;
          const marked = isMarked(segment.text);
          const classes = ["segment"];
          if (isActive) classes.push("active");
          if (editedStarts.has(segment.start)) classes.push("edited");
          if (marked) classes.push("marked");

          return (
            <li
              key={segment.start}
              ref={isActive ? activeRef : null}
              className={classes.join(" ")}
              aria-current={isActive || undefined}
            >
              <button
                type="button"
                className="segment-time"
                title="Double-click to play from here"
                onClick={() => onSeek(segment.start)}
                onDoubleClick={() => onPlayFrom(segment.start)}
              >
                {formatTime(segment.start)}
              </button>

              {isEditing ? (
                <input
                  type="text"
                  className="segment-text editing"
                  aria-label={`Transcript at ${formatTime(segment.start)}`}
                  value={draft}
                  autoFocus
                  onFocus={(event) => event.target.select()}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => commit(segment.start)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commit(segment.start);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      abandoned.current = true;
                      setEditingStart(null);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="segment-text"
                  // Spelled out rather than left to the colour alone, which carries no
                  // meaning for anyone who cannot pick it out.
                  title={
                    marked
                      ? "Marked line -- double-click to play from here"
                      : "Double-click to play from here"
                  }
                  onClick={() => onSeek(segment.start)}
                  onDoubleClick={() => onPlayFrom(segment.start)}
                >
                  {stripMark(segment.text)}
                </button>
              )}

              <button
                type="button"
                className="segment-edit"
                aria-label={`Correct the transcript at ${formatTime(segment.start)}`}
                title="Correct this line"
                onClick={() => startEditing(segment)}
              >
                ✎
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default Transcript;
