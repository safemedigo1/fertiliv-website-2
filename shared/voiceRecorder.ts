/** Browsers record different Opus containers. WhatsApp voice notes are Ogg Opus; the server remuxes the others. */
export const VOICE_RECORDER_MIME_CANDIDATES = [
  "audio/ogg;codecs=opus",
  "audio/webm;codecs=opus",
  "audio/webm",
] as const;

export function preferredVoiceRecorderMime(isSupported: (mime: string) => boolean): string | null {
  for (const mime of VOICE_RECORDER_MIME_CANDIDATES) {
    if (isSupported(mime)) return mime;
  }
  return null;
}

/** Stable filename so the server can tell a microphone note from an attached audio file. */
export function voiceRecordingFile(mime: string): { filename: string; mimeType: string } {
  const base = mime.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (base === "audio/ogg") return { filename: "voice-note.ogg", mimeType: "audio/ogg" };
  return { filename: "voice-note.webm", mimeType: "audio/webm" };
}
