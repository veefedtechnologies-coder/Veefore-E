/**
 * Tests for the chat-driven caption/subtitle burn-in branch of
 * `runChatVideoEditTurn`.
 *
 * Captions are now rendered IN-PROCESS (transcribe → deterministic caption
 * burn-in), not deferred to the async pipeline. These tests use an INJECTED fake
 * transcriber + fake caption renderer (plus fake storage + artifact repository)
 * so the branch is exercised WITHOUT hitting the network, OpenAI, or ffmpeg:
 *
 *   - a successful transcription (2 segments) yields `rendered` (not
 *     `needs_async`) and streams a transcribing → rendering → complete
 *     progression, persisting exactly one artifact;
 *   - a transcriber that throws yields an honest `error` (No-Mock, Req 23) with
 *     no fabricated result and no render;
 *   - a transcription with no speech yields a `clarification`, not a fake result.
 *
 * Framework: vitest.
 */

import fs from 'fs';
import { describe, it, expect, vi } from 'vitest';

import { runChatVideoEditTurn } from '../server/features/video-editor/services/chat-video-edit.service';
import { TranscriptionError } from '../server/features/video-editor/services/transcription.service';
import type { CaptionSegment } from '../server/features/video-editor/services/caption-layout.logic';

const source = {
  sourceId: 'src-cap-1',
  storageKey: 'video-editor/p1/sources/clip.mp4',
  fileName: 'src-cap-1.mp4',
  durationMs: 12_000,
};

const twoSegments: CaptionSegment[] = [
  { startMs: 0, endMs: 1500, text: 'Hello world', words: [{ startMs: 0, endMs: 1500, text: 'Hello world' }] },
  { startMs: 1500, endMs: 3000, text: 'Nice to meet you' },
];

/** A caption-producing plan (deterministic caption op + a render op). */
function captionPlan() {
  return {
    plan: {
      projectGoal: 'caption',
      target: {
        platform: null,
        aspectRatio: '9:16',
        maxDurationMs: null,
        recommendedDurationMs: null,
        exportProfile: '',
      },
      brand: null,
      operations: [
        {
          sequenceIndex: 0,
          type: 'deterministic',
          kind: 'caption',
          range: { startMs: 0, endMs: 12_000 },
          preservationConstraints: [],
          status: 'executable',
          params: { source: 'add captions' },
        },
        {
          sequenceIndex: 1,
          type: 'render',
          kind: 'render',
          range: { startMs: 0, endMs: 12_000 },
          preservationConstraints: [],
          status: 'executable',
          params: { source: 'final_render' },
        },
      ],
    },
    reasoning: { projectGoal: 'caption', editingStyle: null, usedLLM: false },
    usage: [],
    warnings: [],
  };
}

function baseDeps() {
  return {
    store: {
      findById: vi.fn().mockResolvedValue({
        projectId: 'p1',
        userId: 'u1',
        workspaceId: 'w1',
        name: 'x',
        activeVersionId: 'v0',
        targetPlatform: null,
        status: 'active' as const,
      }),
    } as any,
    getSourceForEdit: vi.fn().mockResolvedValue(source),
    intentRouter: {
      classify: vi.fn().mockResolvedValue({
        status: 'classified',
        usage: [],
        intent: {
          action: 'VIDEO_CAPTION',
          inputAssets: [],
          targetPlatform: null,
          targetAspectRatio: '9:16',
          targetDurationMs: null,
          editingStyle: null,
          requestedChanges: ['add captions'],
          protectedElements: [],
          brandRequirements: null,
          audioRequirements: null,
          captionRequirements: null,
          outputRequirements: null,
          qualityRequirements: null,
          confidence: 1,
          requiresGenerativeAI: false,
          requiresDeterministicEditing: true,
        },
      }),
    } as any,
    versionManager: {
      createVersion: vi.fn().mockResolvedValue({
        ok: true,
        version: { versionId: 'v1', parentVersionId: 'v0', timelineId: 't1' },
      }),
    } as any,
    planner: { plan: vi.fn().mockResolvedValue(captionPlan()) } as any,
    // Should NOT be used on the caption path.
    deterministicEditor: { execute: vi.fn() } as any,
    // Fake storage: returns some source bytes (never hits real storage).
    storage: {
      downloadFile: vi.fn().mockResolvedValue({ buffer: Buffer.from('fake-source-bytes'), contentType: 'video/mp4' }),
    } as any,
    // Fake artifact repository: returns a stable artifact id (no DB/storage).
    artifactRepository: {
      createArtifact: vi.fn().mockResolvedValue({
        artifact: { artifactId: 'cap-artifact-1' },
        storageKey: 'video-editor/p1/renders/cap.mp4',
        url: 'https://example/cap.mp4',
      }),
    } as any,
  };
}

describe('runChatVideoEditTurn — caption burn-in', () => {
  it('transcribes then renders captions IN-PROCESS and returns rendered (not needs_async)', async () => {
    const deps = baseDeps();
    const progress: string[] = [];

    // Fake transcriber returns 2 real segments (no network).
    const transcriber = { transcribeSource: vi.fn().mockResolvedValue(twoSegments) };
    // Fake caption renderer writes a real (tiny) output file so persistence works.
    const captionRenderer = {
      renderCaptions: vi.fn().mockImplementation(async (req: any) => {
        fs.writeFileSync(req.outputPath, Buffer.from('burned-in-captions'));
        return { outputPath: req.outputPath };
      }),
    };

    const result = await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        message: 'add captions',
        onProgress: (p) => progress.push(p.phase),
      },
      { ...deps, transcriber: transcriber as any, captionRenderer: captionRenderer as any },
    );

    // Transcription ran against the reused source (no new upload).
    expect(transcriber.transcribeSource).toHaveBeenCalledTimes(1);
    expect(transcriber.transcribeSource.mock.calls[0][0].storageKey).toBe(source.storageKey);

    // Deterministic caption burn-in ran with the transcribed segments.
    expect(captionRenderer.renderCaptions).toHaveBeenCalledTimes(1);
    const renderReq = captionRenderer.renderCaptions.mock.calls[0][0];
    expect(renderReq.segments).toEqual(twoSegments);
    expect(renderReq.presetKey).toBe('instagram_reel');
    expect(renderReq.dimensions).toEqual({ width: 1080, height: 1920 });

    // Exactly one artifact persisted; the deterministic editor was NOT used.
    expect(deps.artifactRepository.createArtifact).toHaveBeenCalledTimes(1);
    expect(deps.deterministicEditor.execute).not.toHaveBeenCalled();

    // Stage-derived progress: transcribing → rendering → complete.
    expect(progress).toContain('transcribing');
    expect(progress).toContain('rendering');
    expect(progress).toContain('complete');
    expect(progress.indexOf('transcribing')).toBeLessThan(progress.indexOf('rendering'));
    expect(progress.indexOf('rendering')).toBeLessThan(progress.indexOf('complete'));

    expect(result.outcome).toBe('rendered');
    if (result.outcome === 'rendered') {
      expect(result.kind).toBe('caption');
      expect(result.artifactId).toBe('cap-artifact-1');
      expect(result.versionId).toBe('v1');
    }
  });

  it('returns an honest error when transcription throws (no fabricated result, no render)', async () => {
    const deps = baseDeps();
    const transcriber = {
      transcribeSource: vi
        .fn()
        .mockRejectedValue(
          new TranscriptionError('TRANSCRIPTION_NO_API_KEY', 'Speech-to-text is not configured.'),
        ),
    };
    const captionRenderer = { renderCaptions: vi.fn() };

    const result = await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'add subtitles' },
      { ...deps, transcriber: transcriber as any, captionRenderer: captionRenderer as any },
    );

    expect(result.outcome).toBe('error');
    if (result.outcome === 'error') {
      expect(result.message).toContain('Speech-to-text is not configured.');
    }
    // No burn-in, no artifact — never fabricated.
    expect(captionRenderer.renderCaptions).not.toHaveBeenCalled();
    expect(deps.artifactRepository.createArtifact).not.toHaveBeenCalled();
  });

  it('returns a clarification (not a fake result) when there is no speech to caption', async () => {
    const deps = baseDeps();
    const transcriber = { transcribeSource: vi.fn().mockResolvedValue([]) };
    const captionRenderer = { renderCaptions: vi.fn() };

    const result = await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'caption this' },
      { ...deps, transcriber: transcriber as any, captionRenderer: captionRenderer as any },
    );

    expect(result.outcome).toBe('clarification');
    if (result.outcome === 'clarification') {
      expect(result.message.toLowerCase()).toContain('speech');
    }
    expect(captionRenderer.renderCaptions).not.toHaveBeenCalled();
    expect(deps.artifactRepository.createArtifact).not.toHaveBeenCalled();
  });
});
