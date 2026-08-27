/// <reference types="vite/client" />

declare module "virtual:records" {
  export type RecordFile = {
    /** File name without the .mp3 extension. */
    name: string;
    audioUrl: string;
    /** null when no same-named .txt sits next to the audio. */
    transcriptUrl: string | null;
  };

  const records: RecordFile[];
  export default records;
}
