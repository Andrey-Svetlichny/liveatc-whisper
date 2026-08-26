import { useEffect, useRef } from "react";
import { formatTime, type Segment } from "./segments";

type TranscriptProps = {
  segments: Segment[];
  currentTime: number;
  onSeek: (time: number) => void;
  onPlayFrom: (time: number) => void;
};

function Transcript({
  segments,
  currentTime,
  onSeek,
  onPlayFrom,
}: TranscriptProps) {
  const activeRef = useRef<HTMLLIElement>(null);

  // -1 while playback sits in one of the gaps between segments.
  const activeIndex = segments.findIndex(
    (segment) => currentTime >= segment.start && currentTime < segment.end,
  );

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  if (segments.length === 0) return null;

  return (
    <section className="transcript" aria-label="Transcript">
      <ol>
        {segments.map((segment, index) => {
          const isActive = index === activeIndex;
          return (
            <li key={segment.start} ref={isActive ? activeRef : null}>
              <button
                type="button"
                className={isActive ? "segment active" : "segment"}
                aria-current={isActive || undefined}
                title="Double-click to play from here"
                onClick={() => onSeek(segment.start)}
                onDoubleClick={() => onPlayFrom(segment.start)}
              >
                <span className="segment-time">{formatTime(segment.start)}</span>
                <span className="segment-text">{segment.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default Transcript;
