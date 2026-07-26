/**
 * LandingCaptionService
 *
 * Thin server-side AI caller for the public landing-page caption demo
 * (Caption_Proxy). It reuses the shared, server-held OpenAI client
 * (`server/openai-client.ts`, configured via the `OPENAI_API_KEY` env var)
 * so the API key never reaches the client and is never returned or logged.
 *
 * Contract (design.md "Caption_Proxy request flow" + Correctness Property 11):
 * - Builds a system/user prompt for the given topic/niche/tone.
 * - Instructs the model to return ONLY JSON `{ "captions": ["...","...","..."] }`.
 * - Parses the model output robustly (strips markdown fences, JSON.parse,
 *   validates an array of >= 3 non-empty strings, takes the first 3).
 * - Performs ONE server-side retry with a short backoff on transient failure.
 * - On unparseable output / too few captions / provider failure, throws a
 *   typed `CaptionGenerationError` that NEVER contains the API key or the raw
 *   provider error/stack. Callers (the route) map this to 502 generation_failed.
 *
 * Requirements: 12.5, 12.7
 */

import { getOpenAIClient, isOpenAIAvailable } from '../openai-client';

/** Number of captions the service is contractually required to return. */
const REQUIRED_CAPTION_COUNT = 3;

/** Model used for the lightweight public caption demo. */
const CAPTION_MODEL = 'gpt-4o-mini';

/** Short backoff (ms) before the single server-side retry. */
const RETRY_BACKOFF_MS = 350;

export interface GenerateLandingCaptionsInput {
  topic: string;
  niche: string;
  tone: string;
}

/**
 * Typed error surfaced to callers. It carries only a safe, user-facing
 * message — never the provider's raw error, stack, or the API key.
 */
export class CaptionGenerationError extends Error {
  public readonly code = 'generation_failed';

  constructor(message: string) {
    super(message);
    this.name = 'CaptionGenerationError';
    // Maintain a clean prototype chain when targeting ES5/ES2015.
    Object.setPrototypeOf(this, CaptionGenerationError.prototype);
  }
}

/**
 * Decide whether a provider failure is transient (worth one retry).
 * Network blips, rate limits, and 5xx responses are treated as transient.
 * We inspect only status/code shapes — never log the error object itself.
 */
function isTransientProviderError(error: unknown): boolean {
  const status =
    (error as { status?: number; statusCode?: number })?.status ??
    (error as { statusCode?: number })?.statusCode;

  if (typeof status === 'number') {
    return status === 408 || status === 429 || status >= 500;
  }

  const code = (error as { code?: string })?.code;
  if (typeof code === 'string') {
    return (
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET' ||
      code === 'ECONNREFUSED' ||
      code === 'EAI_AGAIN'
    );
  }

  // Unknown shape: treat as transient once so we get a single retry.
  return true;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSystemPrompt(): string {
  return [
    'You are an expert Instagram copywriter for an AI social-media tool.',
    'You write punchy, scroll-stopping Instagram captions tailored to a creator\'s niche and tone.',
    `Generate exactly ${REQUIRED_CAPTION_COUNT} distinct captions.`,
    'Each caption should be concise, engaging, and ready to post (you may include a few relevant hashtags).',
    'Respond with ONLY a JSON object in this exact shape and nothing else:',
    '{ "captions": ["caption one", "caption two", "caption three"] }',
    'Do not wrap the JSON in markdown code fences. Do not add commentary before or after the JSON.',
  ].join('\n');
}

function buildUserPrompt({ topic, niche, tone }: GenerateLandingCaptionsInput): string {
  return [
    `Topic: ${topic}`,
    `Niche: ${niche || 'general'}`,
    `Tone: ${tone || 'friendly'}`,
    '',
    `Write ${REQUIRED_CAPTION_COUNT} Instagram captions for this topic in the given niche and tone.`,
    'Return ONLY the JSON object described in the system instructions.',
  ].join('\n');
}

/**
 * Strip common markdown code fences (```json ... ``` or ``` ... ```) and
 * trim surrounding whitespace so JSON.parse can succeed on fenced output.
 */
function stripCodeFences(raw: string): string {
  let text = raw.trim();

  // Remove a leading fence like ```json or ```
  text = text.replace(/^```[a-zA-Z]*\s*\n?/, '');
  // Remove a trailing fence
  text = text.replace(/\n?```\s*$/, '');

  return text.trim();
}

/**
 * Parse the raw model output into exactly REQUIRED_CAPTION_COUNT captions.
 * Throws CaptionGenerationError (safe message) when the output cannot be
 * parsed or does not contain enough valid captions.
 */
function parseCaptions(raw: string): string[] {
  const cleaned = stripCodeFences(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new CaptionGenerationError('The caption response could not be parsed.');
  }

  const captionsValue = (parsed as { captions?: unknown })?.captions;
  if (!Array.isArray(captionsValue)) {
    throw new CaptionGenerationError('The caption response was not in the expected format.');
  }

  const captions = captionsValue
    .filter((c): c is string => typeof c === 'string')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  if (captions.length < REQUIRED_CAPTION_COUNT) {
    throw new CaptionGenerationError('The caption response did not contain enough captions.');
  }

  return captions.slice(0, REQUIRED_CAPTION_COUNT);
}

/**
 * Perform a single provider call and parse the result.
 * Parse failures are non-transient (rethrown as-is); provider failures
 * bubble up for the caller's retry/backoff decision.
 */
async function requestCaptionsOnce(input: GenerateLandingCaptionsInput): Promise<string[]> {
  const client = getOpenAIClient();

  const completion = await client.chat.completions.create({
    model: CAPTION_MODEL,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
    max_tokens: 500,
  });

  const text = completion.choices[0]?.message?.content ?? '';
  return parseCaptions(text);
}

/**
 * Generate exactly 3 Instagram captions for the given topic/niche/tone.
 *
 * Implements one server-side retry with a short backoff on transient
 * provider failures. Never returns or leaks the API key; all thrown errors
 * are typed CaptionGenerationError instances with safe messages.
 */
export async function generateLandingCaptions(
  input: GenerateLandingCaptionsInput
): Promise<string[]> {
  if (!isOpenAIAvailable()) {
    // Do not reveal configuration details beyond "unavailable".
    throw new CaptionGenerationError('The caption service is not available right now.');
  }

  const maxAttempts = 2; // initial attempt + one retry

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await requestCaptionsOnce(input);
    } catch (error) {
      // Parse/validation errors are deterministic — do not retry them.
      if (error instanceof CaptionGenerationError) {
        throw error;
      }

      const canRetry = attempt < maxAttempts && isTransientProviderError(error);
      if (!canRetry) {
        // Wrap provider errors in a safe typed error (no raw message/stack/key).
        throw new CaptionGenerationError('Caption generation failed. Please try again.');
      }

      await delay(RETRY_BACKOFF_MS);
    }
  }

  // Unreachable in practice; satisfies the type checker.
  throw new CaptionGenerationError('Caption generation failed. Please try again.');
}
