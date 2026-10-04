/**
 * Fertiliv — Groq Whisper Voice Transcription Helper
 * Replaces the Manus-only voiceTranscription helper.
 * Works on any server — only requires GROQ_WHISPER_API_KEY.
 *
 * Groq Whisper free tier: 28,800 minutes/day (effectively unlimited for a clinic).
 * Model: whisper-large-v3-turbo  (fast, accurate, multilingual)
 */
import Groq from "groq-sdk";
import { Readable } from "stream";
import { createAiTelemetrySession, type AiTelemetrySession } from "../ai/usageTelemetry";

// ─── Types (kept compatible with the original helper) ────────────────────────

export type TranscribeOptions = {
  audioBase64: string; // base64-encoded audio (webm/mp3/wav/ogg/m4a)
  mimeType?: string;   // defaults to "audio/webm"
  language?: string;   // ISO-639-1 code, e.g. "en", "ar"
  prompt?: string;     // optional context hint
  /** Internal Phase 1 metadata-only session; never sent to Groq. */
  aiTelemetry?: AiTelemetrySession;
};

export type TranscriptionResult = {
  text: string;
  language: string;
  duration?: number;
};

export type TranscriptionError = {
  error: string;
  code: "FILE_TOO_LARGE" | "INVALID_FORMAT" | "TRANSCRIPTION_FAILED" | "SERVICE_ERROR";
};

// ─── Client ──────────────────────────────────────────────────────────────────

function getClient(): Groq {
  const key = process.env.GROQ_WHISPER_API_KEY;
  if (!key) throw new Error("GROQ_WHISPER_API_KEY is not set");
  return new Groq({ apiKey: key });
}

// ─── Main function ───────────────────────────────────────────────────────────

/**
 * Transcribe base64-encoded audio using Groq Whisper.
 */
export async function transcribeAudioGroq(
  options: TranscribeOptions
): Promise<TranscriptionResult | TranscriptionError> {
  const ownsTelemetrySession = !options.aiTelemetry;
  const telemetry = options.aiTelemetry ?? createAiTelemetrySession("speech_to_text");
  const telemetryAttempt = telemetry.beginAttempt({ provider: "groq", model: "whisper-large-v3-turbo" });
  try {
    const groq = getClient();
    const mime = options.mimeType ?? "audio/webm";
    const ext = mimeToExt(mime);

    // Decode base64 → Buffer → File-like object for the Groq SDK
    const audioBuffer = Buffer.from(options.audioBase64, "base64");

    // 25 MB limit on Groq (we enforce 16 MB to be safe)
    const sizeMB = audioBuffer.length / (1024 * 1024);
    if (sizeMB > 16) {
      const failure = {
        error: `Audio file is ${sizeMB.toFixed(1)} MB — maximum allowed is 16 MB`,
        code: "FILE_TOO_LARGE",
      } as const;
      const error = new Error(failure.code);
      telemetryAttempt.fail(error);
      if (ownsTelemetrySession) telemetry.fail(error);
      return failure;
    }

    // Groq SDK accepts a File object; we create one from the buffer
    const audioFile = new File([audioBuffer], `recording.${ext}`, { type: mime });

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3-turbo",
      response_format: "verbose_json",
      language: options.language,
      prompt: options.prompt ?? buildPrompt(options.language),
    });

    const result = {
      text: transcription.text,
      language: (transcription as { language?: string }).language ?? options.language ?? "en",
      duration: (transcription as { duration?: number }).duration,
    };
    const numbers = {
      nonTokenUnit: result.duration == null ? null : "audio_seconds",
      nonTokenQuantity: result.duration ?? null,
      providerUsageAvailable: result.duration != null,
    };
    telemetryAttempt.succeed(numbers);
    if (ownsTelemetrySession) telemetry.succeed(numbers);
    return result;
  } catch (err) {
    const failure = {
      error: err instanceof Error ? err.message : "Transcription failed",
      code: "TRANSCRIPTION_FAILED",
    } as const;
    const error = new Error(failure.code);
    telemetryAttempt.fail(error);
    if (ownsTelemetrySession) telemetry.fail(error);
    return failure;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
  };
  return map[mime] ?? "webm";
}

function buildPrompt(lang?: string): string {
  const langNames: Record<string, string> = {
    en: "English", ar: "Arabic", fr: "French", de: "German",
    es: "Spanish", tr: "Turkish", it: "Italian",
  };
  const langName = lang ? langNames[lang] ?? lang : undefined;
  return langName
    ? `Transcribe the fertility clinic doctor's dictation in ${langName}.`
    : "Transcribe the fertility clinic doctor's dictation.";
}

/**
 * Lightweight key validation — lists available models.
 * Returns true if the key is valid.
 */
export async function validateGroqWhisperKey(): Promise<boolean> {
  try {
    const groq = getClient();
    const models = await groq.models.list();
    return Array.isArray(models.data) && models.data.length > 0;
  } catch {
    return false;
  }
}
