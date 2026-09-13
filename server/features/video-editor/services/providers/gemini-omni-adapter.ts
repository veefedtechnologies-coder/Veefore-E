/**
 * `GeminiOmniAdapter` — the Gemini Omni implementation of {@link VideoAIProvider}
 * (Req 7.6, 7.7, 7.8).
 *
 * Gemini Omni performs generative visual editing on bounded clips (object
 * removal, background replacement, inpainting, style transfer, …) and can
 * guarantee facial/voice/audio preservation on edits — as declared by its
 * capability record in the Provider_Capability_Registry seed. This adapter holds
 * no hardcoded limits: every bound comes from that capability record (Req 7.3).
 *
 * It runs every provider call SERVER-SIDE through the injected transport
 * (`AIServiceManager`/Gemini SDK), so provider keys never reach the browser
 * (Req 7.8). It is classified "integrated" ONLY after the transport returns a
 * real video result — validated by `assertRealOutput` before `markIntegrated`
 * (Req 7.7). A failed or video-less call surfaces a real error and leaves the
 * provider un-integrated (No-Mock, Req 23).
 */

import type { VideoModelCapabilities } from '../provider-capability-registry.logic';
import { SEED_VIDEO_MODEL_CAPABILITIES } from '../provider-capability-seed';
import {
  BaseVideoAIProvider,
  type VideoProviderTransport,
  type VideoGenerationRequest,
  type VideoGenerationResult,
  type VideoEditRequest,
  type VideoEditResult,
  type TransportRequest,
} from './video-ai-provider';
import { createGeminiVideoTransport } from './gemini-video-transport';

/** Provider/model identity for Gemini Omni (matches the capability seed). */
export const GEMINI_OMNI_PROVIDER = 'gemini';
export const GEMINI_OMNI_MODEL = 'omni-1';

function defaultOmniCapabilities(): VideoModelCapabilities {
  const rec = SEED_VIDEO_MODEL_CAPABILITIES.find(
    (c) => c.provider === GEMINI_OMNI_PROVIDER && c.model === GEMINI_OMNI_MODEL,
  );
  if (!rec) {
    throw new Error(
      'GeminiOmniAdapter: no seed VideoModelCapabilities for gemini/omni-1; capability metadata is required (Req 7.1)',
    );
  }
  return rec;
}

export class GeminiOmniAdapter extends BaseVideoAIProvider {
  /**
   * @param transport   Server-side provider transport (defaults to the real
   *                     Gemini-backed transport). Tests inject a fake.
   * @param capabilities Override capability record (defaults to the seed record).
   */
  constructor(
    transport: VideoProviderTransport = createGeminiVideoTransport(),
    capabilities: VideoModelCapabilities = defaultOmniCapabilities(),
  ) {
    super(capabilities, transport);
  }

  async generate(
    req: VideoGenerationRequest,
    signal?: AbortSignal,
  ): Promise<VideoGenerationResult> {
    this.validateGenerate(req);
    const transportReq: TransportRequest = {
      provider: this.provider,
      model: this.model,
      instruction: req.instruction,
      outputSeconds: req.outputSeconds,
      outputResolution: req.outputResolution,
      inputBase64: req.seedImageBase64,
      inputMimeType: req.seedImageMimeType,
    };
    try {
      const { output, raw } = await this.transport.generateVideo(transportReq, signal);
      this.assertRealOutput(output);
      this.markIntegrated('generate');
      return { provider: this.provider, model: this.model, output, raw };
    } catch (err) {
      this.recordFailure(err);
      throw err;
    }
  }

  async edit(req: VideoEditRequest, signal?: AbortSignal): Promise<VideoEditResult> {
    this.validateEdit(req);
    const transportReq: TransportRequest = {
      provider: this.provider,
      model: this.model,
      instruction: req.instruction,
      outputSeconds: req.affectedRangeMs
        ? (req.affectedRangeMs.endMs - req.affectedRangeMs.startMs) / 1000
        : this.capabilities.outputSeconds.min,
      outputResolution: req.outputResolution,
      inputBase64: req.inputVideoBase64,
      inputMimeType: req.inputVideoMimeType,
      inputUri: req.inputUri,
    };
    try {
      const { output, raw } = await this.transport.editVideo(transportReq, signal);
      this.assertRealOutput(output);
      this.markIntegrated('edit');
      return { provider: this.provider, model: this.model, output, raw };
    } catch (err) {
      this.recordFailure(err);
      throw err;
    }
  }
}
