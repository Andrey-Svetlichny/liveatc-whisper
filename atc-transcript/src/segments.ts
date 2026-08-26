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

export function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
