import { z } from 'zod';
import { AppError } from './errors';

/**
 * Speech in and out, through Gradium.
 *
 * Transcription answers newline-delimited JSON rather than one object, so it
 * is read line by line with each line validated. An unguarded `JSON.parse` in
 * that loop turns a single malformed line into an unhandled crash rather than
 * a speech failure the interface can explain.
 *
 * Synthesis returns raw 16 kHz PCM, which no browser will play on its own, so
 * a WAV header is prepended here.
 */

const ASR_URL =
  'https://api.gradium.ai/api/post/speech/asr?json_config=%7B%22language%22%3A%22any%22%7D';
const TTS_URL = 'https://api.gradium.ai/api/post/speech/tts';

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024;
const MAX_SPEECH_BYTES = 3 * 1024 * 1024;
const MAX_TRANSCRIPT_LINES = 10_000;

export function isConfigured(): boolean {
  return Boolean(process.env.GRADIUM_API_KEY?.trim());
}

function apiKey(): string {
  const key = process.env.GRADIUM_API_KEY?.trim();
  if (!key)
    throw new AppError(
      'Voice is not configured. Set GRADIUM_API_KEY to enable it.',
      503,
      'not_configured',
    );
  return key;
}

const failure = () =>
  new AppError('The speech service is unavailable. Try again.', 503, 'speech_unavailable');

/** Read a response with a hard ceiling, so a runaway stream cannot exhaust memory. */
async function boundedBody(response: Response, limit: number): Promise<Buffer> {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw failure();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw failure();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

/**
 * One line of the stream. Unknown types are ignored on purpose, so a new
 * provider event does not break transcription, but every line must still be
 * an object with a string `type`.
 */
const messageSchema = z
  .object({ type: z.string().min(1).max(64), text: z.string().max(100_000).optional() })
  .loose();

export function parseTranscript(body: string): string {
  const parts: string[] = [];
  let ended = false;
  let lines = 0;
  for (const line of body.split('\n')) {
    if (!line.trim()) continue;
    if ((lines += 1) > MAX_TRANSCRIPT_LINES) throw failure();
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      throw failure();
    }
    const message = messageSchema.safeParse(raw);
    if (!message.success || message.data.type === 'error') throw failure();
    if (message.data.type === 'text' && typeof message.data.text === 'string')
      parts.push(message.data.text);
    if (message.data.type === 'end_text') ended = true;
  }
  if (!ended) throw failure();
  const text = parts
    .join(' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
  if (!text)
    throw new AppError(
      'No clear speech was found. Try again, or type the description instead.',
      422,
      'no_speech',
    );
  return text.slice(0, 4000);
}

export async function transcribe(audio: Uint8Array): Promise<string> {
  const key = apiKey();
  if (!audio.byteLength || audio.byteLength > MAX_AUDIO_BYTES)
    throw new AppError('Send between 1 byte and 8 MB of audio.', 413, 'audio_too_large');
  const response = await fetch(ASR_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'audio/wav' },
    body: audio as BodyInit,
    signal: AbortSignal.timeout(90_000),
    redirect: 'error',
  }).catch(() => {
    throw failure();
  });
  return parseTranscript((await boundedBody(response, MAX_TRANSCRIPT_BYTES)).toString('utf8'));
}

/** Wrap raw 16 kHz mono PCM so a browser will play it. */
function wav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16_000, 24);
  header.writeUInt32LE(32_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function speak(text: string): Promise<{ audioBase64: string; mimeType: string }> {
  const key = apiKey();
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 1200)
    throw new AppError('Choose between 1 and 1200 characters to read aloud.', 400, 'invalid_text');
  const response = await fetch(TTS_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: trimmed,
      voice_id: process.env.GRADIUM_VOICE_ID?.trim() || 'YTpq7expH9539ERJ',
      output_format: 'pcm_16000',
      only_audio: true,
    }),
    signal: AbortSignal.timeout(90_000),
    redirect: 'error',
  }).catch(() => {
    throw failure();
  });
  const pcm = await boundedBody(response, MAX_SPEECH_BYTES);
  // 16-bit samples: an odd byte count means the stream was cut short.
  if (!pcm.length || pcm.length % 2) throw failure();
  return { audioBase64: wav(pcm).toString('base64'), mimeType: 'audio/wav' };
}
