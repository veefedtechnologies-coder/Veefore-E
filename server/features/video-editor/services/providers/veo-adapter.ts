/**
 * `VeoAdapter` — the Google Veo implementation of {@link VideoAIProvider}
 * (Req 7.6, 7.7, 7.8).
 *
 * Veo is generation-first (text/image → video): higher fidelity and longer
 * output clips than Omni, but its capability record declares NO guaranteed
 * preservation of source facial/voice identity. As with every adapter, all
 * bounds (editable input, output duration, resolutions, per-second cost) come
 * from the Provider_Capability_Registry seed record — nothing is hardcoded
 * (Req 7.3).
 *
 * All provider calls run SERVER-SIDE through the injected transport
 * (`AIServiceManager`/Gemini SDK); keys never reach the browser (Req 7.8). The
 * adapter is classified "integrated" ONLY after the transport returns a real,
 * validated video result (Req 7.7). Failures surface real errors and leave the
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

/** Provider/model identity for Veo (matches the capability seed). */
export const VEO_PROVIDER = 'google';
export const VEO_MODEL = 'veo-3';

function defaultVeoCapabilities(): VideoModelCapabilities {
  const rec = SEED_VIDEO_MODEL_CAPABILITIES.find(
    (c) => c.provider === VEO_PROVIDER && c.model === VEO_MODEL,
  );
  if (!rec) {
    throw new Error(
      'VeoAdapter: no seed VideoModelCapabilities for google/veo-3; capability metadata is required (Req 7.1)',
    );
  }
  return rec;
}

export class VeoAdapter extends BaseVideoAIProvider {
  /**
   * @param transport   Server-side provider transport (defaults to the real
   *                     Gemini-backed transport). Tests inject a fake.
   * @param capabilities Override capability record (defaults to the seed record).
   */
  constructor(
    transport: VideoProviderTransport = createGeminiVideoTransport(),
    capabilities: VideoModelCapabilities = defaultVeoCapabilities(),
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
