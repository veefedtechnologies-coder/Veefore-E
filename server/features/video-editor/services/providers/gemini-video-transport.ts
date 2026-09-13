/**
 * Default server-side {@link VideoProviderTransport} backed by
 * `AIServiceManager`/the Gemini SDK (Req 7.8).
 *
 * This is the ONLY place the Video Editor's provider adapters reach a real
 * generative-video API. It runs entirely in the Node process: the Gemini client
 * is obtained from `aiServiceManager.getGeminiVideoClient()`, which is
 * constructed from `GOOGLE_API_KEY` server-side, so provider API keys are never
 * transmitted to the browser (Req 7.8).
 *
 * No-Mock discipline (Req 23, 7.7):
 *   • When no Google key is configured, the transport throws — it never returns
 *     a placeholder so a provider stays un-integrated.
 *   • A call succeeds ONLY when the model returns real inline video bytes. A
 *     text-only response, an empty response, or any thrown error is surfaced as
 *     a real failure; nothing is fabricated. Consequently a provider is
 *     classified "integrated" only after a genuine successful video result
 *     (Req 7.7).
 */

import { aiServiceManager } from '../../../../services/AIServiceManager';
import { resolveLiveGeminiModel } from '../../../../services/AIServiceManager';
import { logger } from '../../../../config/logger';
import {
  VideoProviderCallError,
  type TransportRequest,
  type TransportResult,
  type VideoProviderTransport,
  type VideoAnalysisResult,
  type VideoOutput,
} from './video-ai-provider';

/** Extract the first inline video part (base64) from a Gemini response, if any. */
function extractInlineVideo(
  response: unknown,
): { videoBase64: string; mimeType: string } | null {
  const candidates = (response as any)?.candidates;
  if (!Array.isArray(candidates)) return null;
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const inline = part?.inlineData;
      const mimeType: string | undefined = inline?.mimeType;
      const data: string | undefined = inline?.data;
      if (mimeType && data && mimeType.toLowerCase().startsWith('video/')) {
        return { videoBase64: data, mimeType };
      }
    }
  }
  return null;
}

/** Build the Gemini multimodal request parts for a transport request. */
function buildParts(req: TransportRequest): unknown[] {
  const parts: unknown[] = [{ text: req.instruction }];
  if (req.inputBase64 && req.inputMimeType) {
    parts.push({ inlineData: { mimeType: req.inputMimeType, data: req.inputBase64 } });
  }
  return parts;
}

/**
 * Perform one real Gemini `generateContent` call server-side and return the
 * produced video, or throw. Shared by generate and edit (they differ only in
 * whether an input segment is attached).
 */
async function callGemini(
  req: TransportRequest,
  op: 'generate' | 'edit',
  signal?: AbortSignal,
): Promise<TransportResult> {
  signal?.throwIfAborted?.();

  const client = aiServiceManager.getGeminiVideoClient();
  if (!client) {
    throw new VideoProviderCallError(
      'Gemini video client is not configured (GOOGLE_API_KEY missing); provider remains un-integrated',
      req.provider,
      req.model,
    );
  }

  const modelId = resolveLiveGeminiModel(req.model);
  try {
    const model = client.getGenerativeModel({ model: modelId });
    const result = await model.generateContent(
      { contents: [{ role: 'user', parts: buildParts(req) as any }] },
      signal ? { signal } : undefined,
    );

    const inline = extractInlineVideo(result?.response);
    if (!inline) {
      // A real response that produced no video is NOT a successful video op.
      throw new VideoProviderCallError(
        `Gemini ${op} for ${req.provider}/${req.model} returned no video output`,
        req.provider,
        req.model,
      );
    }

    const output: VideoOutput = {
      videoBase64: inline.videoBase64,
      mimeType: inline.mimeType,
      outputSeconds: req.outputSeconds,
    };
    return { output, raw: result?.response };
  } catch (err) {
    if (err instanceof VideoProviderCallError) throw err;
    logger.warn('[video-editor] Gemini video transport call failed', {
      provider: req.provider,
      model: req.model,
      op,
      err: (err as Error)?.message,
    });
    throw new VideoProviderCallError(
      `Gemini ${op} call failed for ${req.provider}/${req.model}: ${(err as Error)?.message ?? String(err)}`,
      req.provider,
      req.model,
      err,
    );
  }
}

/**
 * Create the default Gemini-backed transport. Adapters accept a transport so
 * tests can inject a fake; production uses this real, server-side implementation.
 */
export function createGeminiVideoTransport(): VideoProviderTransport {
  return {
    generateVideo(req: TransportRequest, signal?: AbortSignal): Promise<TransportResult> {
      return callGemini(req, 'generate', signal);
    },
    editVideo(req: TransportRequest, signal?: AbortSignal): Promise<TransportResult> {
      return callGemini(req, 'edit', signal);
    },
    async analyzeVideo(req: TransportRequest, signal?: AbortSignal): Promise<VideoAnalysisResult> {
      signal?.throwIfAborted?.();
      const client = aiServiceManager.getGeminiVideoClient();
      if (!client) {
        throw new VideoProviderCallError(
          'Gemini video client is not configured (GOOGLE_API_KEY missing)',
          req.provider,
          req.model,
        );
      }
      try {
        const model = client.getGenerativeModel({ model: resolveLiveGeminiModel(req.model) });
        const result = await model.generateContent(
          { contents: [{ role: 'user', parts: buildParts(req) as any }] },
          signal ? { signal } : undefined,
        );
        const text = result?.response?.text?.() ?? '';
        if (!text) {
          throw new VideoProviderCallError(
            `Gemini analyze for ${req.provider}/${req.model} returned no analysis`,
            req.provider,
            req.model,
          );
        }
        return { provider: req.provider, model: req.model, analysis: text, raw: result?.response };
      } catch (err) {
        if (err instanceof VideoProviderCallError) throw err;
        throw new VideoProviderCallError(
          `Gemini analyze call failed for ${req.provider}/${req.model}: ${(err as Error)?.message ?? String(err)}`,
          req.provider,
          req.model,
          err,
        );
      }
    },
  };
}
