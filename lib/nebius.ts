import { z } from 'zod';
import { AppError, parseRetryAfter } from './errors';

/**
 * A minimal client for Nebius Token Factory, which speaks the OpenAI
 * chat-completions dialect.
 *
 * Two decisions worth knowing about.
 *
 * There is no default model. A missing `NEBIUS_VISION_MODEL` fails loudly
 * instead of quietly falling back to something you did not choose and did not
 * budget for. That mistake is easy to make and hard to notice.
 *
 * The response is validated twice: once by the provider through `json_schema`
 * decoding where the model supports it, and again by Zod here. Provider
 * enforcement is not universal, and a model that produces almost-valid JSON is
 * worse than one that fails outright.
 */

const BASE_URL = (process.env.NEBIUS_BASE_URL ?? 'https://api.tokenfactory.nebius.com/v1').replace(
  /\/$/,
  '',
);

export type ModelPurpose = 'vision' | 'coach';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new AppError(
      `The service is not configured. Set ${name} in your environment.`,
      503,
      'not_configured',
    );
  return value;
}

export function modelFor(purpose: ModelPurpose): string {
  return requireEnv(purpose === 'vision' ? 'NEBIUS_VISION_MODEL' : 'NEBIUS_COACH_MODEL');
}

/** True when both a key and a model are present, for the health endpoint. */
export function isConfigured(purpose: ModelPurpose): boolean {
  const model = purpose === 'vision' ? 'NEBIUS_VISION_MODEL' : 'NEBIUS_COACH_MODEL';
  return Boolean(process.env.NEBIUS_API_KEY?.trim() && process.env[model]?.trim());
}

export type ImagePart = { url: string };

export type CompleteOptions<T> = {
  purpose: ModelPurpose;
  system: string;
  user: string;
  images?: readonly ImagePart[];
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  parse: z.ZodType<T>;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxTokens?: number;
};

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * Some models truncate under constrained decoding, so the mode is
 * configurable. `json_object` puts the schema in the prompt instead; Zod
 * remains the authority either way.
 */
function responseFormat(schemaName: string, jsonSchema: Record<string, unknown>) {
  if (process.env.NEBIUS_RESPONSE_FORMAT === 'json_object') return { type: 'json_object' as const };
  return {
    type: 'json_schema' as const,
    json_schema: { name: schemaName, strict: true, schema: jsonSchema },
  };
}

function contentFrom(body: unknown): string | null {
  const choices = (body as { choices?: unknown[] })?.choices;
  const first = Array.isArray(choices) ? choices[0] : null;
  const message = (first as { message?: { content?: unknown } } | null)?.message;
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const text = content
      .filter(
        (part): part is { type: string; text: string } =>
          Boolean(part) && typeof part === 'object' && (part as { type?: string }).type === 'text',
      )
      .map((part) => part.text)
      .join('');
    return text || null;
  }
  return null;
}

/** Models sometimes wrap JSON in a fence even when told not to. */
function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

export async function complete<T>(options: CompleteOptions<T>): Promise<T> {
  const apiKey = requireEnv('NEBIUS_API_KEY');
  const model = modelFor(options.purpose);
  const usePrompted = process.env.NEBIUS_RESPONSE_FORMAT === 'json_object';
  const system = usePrompted
    ? `${options.system}\nReturn exactly one JSON object matching this schema, with no markdown and no commentary:\n${JSON.stringify(options.jsonSchema)}`
    : options.system;

  const content: Array<Record<string, unknown>> = [{ type: 'text', text: options.user }];
  for (const image of options.images ?? [])
    content.push({ type: 'image_url', image_url: { url: image.url } });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: options.maxTokens ?? 4096,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
        response_format: responseFormat(options.schemaName, options.jsonSchema),
      }),
      signal,
    });
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === 'AbortError';
    throw new AppError(
      aborted
        ? 'The model did not answer in time. Try again.'
        : 'The model provider could not be reached.',
      503,
      aborted ? 'timeout' : 'network',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // A rate limit carries a wait; a rejected key does not, and retrying it
    // would fail identically.
    if (response.status === 429)
      throw new AppError(
        'The model provider is rate limiting this app. Try again shortly.',
        429,
        'rate_limited',
        parseRetryAfter(response.headers.get('retry-after')) ?? 30,
      );
    if (response.status === 401 || response.status === 403)
      throw new AppError('The model provider rejected the API key.', 503, 'bad_credentials');
    throw new AppError('The model provider is unavailable. Try again shortly.', 503, 'unavailable');
  }

  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES)
    throw new AppError('The model returned more data than expected.', 502, 'response_too_large');

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new AppError('The model returned a response this app cannot read.', 502, 'bad_response');
  }

  const raw = contentFrom(body);
  if (!raw) throw new AppError('The model returned an empty response.', 502, 'bad_response');

  let candidate: unknown;
  try {
    candidate = parseJsonContent(raw);
  } catch {
    throw new AppError('The model returned output that is not JSON.', 502, 'bad_response');
  }

  const parsed = options.parse.safeParse(candidate);
  if (!parsed.success)
    throw new AppError(
      'The model returned output that does not match the expected shape.',
      502,
      'schema_mismatch',
    );
  return parsed.data;
}
