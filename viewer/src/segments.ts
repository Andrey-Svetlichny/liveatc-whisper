export type Segment = {
  start: number;
  end: number;
  text: string;
};

/** whisper-cli line format: `[00:00:07.000 --> 00:00:15.000]   spoken text` */
const SEGMENT_RE =
  /^\[(\d\d):(\d\d):(\d\d\.\d+)\s*-->\s*(\d\d):(\d\d):(\d\d\.\d+)\]\s*(.*)$/;

function toSeconds(hours: string, minutes: string, seconds: string) {
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/** Parse whisper-cli output, skipping blank lines and any banner text. */
export function parseTranscript(raw: string): Segment[] {
  const segments: Segment[] = [];

  for (const line of raw.split("\n")) {
    const match = SEGMENT_RE.exec(line.trim());
    if (!match) continue;

    const [, sh, sm, ss, eh, em, es, text] = match;
    const trimmed = text.trim();
    if (!trimmed) continue;

    segments.push({
      start: toSeconds(sh, sm, ss),
      end: toSeconds(eh, em, es),
      text: trimmed,
    });
  }

  return segments;
}

/**
 * Seconds -> HH:MM:SS.mmm, the inverse of the timestamps SEGMENT_RE reads. Rounding
 * through whole milliseconds first is what keeps this exact: the parse leaves floats
 * a hair off (174.434 * 1000 is 174433.99999999997), so truncating would lose a ms.
 */
function formatTimestamp(seconds: number) {
  const ms = Math.round(seconds * 1000);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return (
    `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms % 3600000) / 60000))}` +
    `:${pad(Math.floor((ms % 60000) / 1000))}.${pad(ms % 1000, 3)}`
  );
}

/**
 * Collapse an edited line back to what transcribe.sh would have written for it
 * (`s/^ +| +$//g; s/ +/ /g`). Pasting multi-line text into a segment would otherwise
 * put a newline in the middle of a record and split it in two on the next parse.
 */
export function normalizeSegmentText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * A leading `#` flags a line for attention. It rides along inside the segment's text
 * rather than being parsed out, which is what keeps the file round-trip byte-exact and
 * makes edit mode -- seeded from the raw text -- the place you add and remove it.
 *
 * Safe as a marker: `#` appears nowhere in the transcribed speech. (Square brackets
 * would not have been, whisper writes its own `[unintelligible]` annotations with them.)
 */
const MARK_RE = /^#\s*/;

export function isMarked(text: string) {
  return text.startsWith("#");
}

/** The `# ` is a marker, not something that was said, so it is not shown as speech. */
export function stripMark(text: string) {
  return text.replace(MARK_RE, "");
}

/**
 * The inverse of parseTranscript, byte-identical to the line transcribe.sh emits --
 * note the two spaces after the bracket, and the trailing newline its `echo` leaves on
 * the last line. An exported transcript has to be indistinguishable from a freshly
 * generated one, since it gets moved back over the original.
 */
export function serializeTranscript(segments: Segment[]) {
  return segments
    .map(
      (segment) =>
        `[${formatTimestamp(segment.start)} --> ${formatTimestamp(segment.end)}]` +
        `  ${segment.text}\n`,
    )
    .join("");
}

export function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
