/**
 * Corrections to a transcript, keyed by the segment's start time in seconds.
 *
 * Deliberately a sparse diff rather than a copy of the whole transcript: if a recording
 * is re-transcribed the start times move, and a stale draft then simply stops applying.
 * A stored full text would mask the new transcript forever instead.
 */
export type Edits = Record<string, string>;

const PREFIX = "atc-transcript-edits:";

/**
 * Every access is guarded: localStorage throws outright in private browsing and when
 * the quota is gone, and losing a draft must never take the app down with it.
 */
export function readDraft(url: string): Edits {
  try {
    const stored = localStorage.getItem(PREFIX + url);
    if (!stored) return {};

    // Anything could be under that key -- an older shape, or hand-edited junk. Only
    // keep string values, so a bad entry degrades to "no corrections" rather than
    // putting a non-string where a segment's text belongs.
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    const edits: Edits = {};
    for (const [start, text] of Object.entries(parsed)) {
      if (typeof text === "string") edits[start] = text;
    }
    return edits;
  } catch (error: unknown) {
    console.error("Could not read the saved corrections", error);
    return {};
  }
}

export function writeDraft(url: string, edits: Edits) {
  try {
    localStorage.setItem(PREFIX + url, JSON.stringify(edits));
  } catch (error: unknown) {
    console.error("Could not save the corrections", error);
  }
}

export function clearDraft(url: string) {
  try {
    localStorage.removeItem(PREFIX + url);
  } catch (error: unknown) {
    console.error("Could not clear the corrections", error);
  }
}
