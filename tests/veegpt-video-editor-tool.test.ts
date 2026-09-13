/**
 * VeeGPT `video_editor` tool wiring (chat → AI Video Editor).
 *
 * Verifies the deterministic, DB-free wiring that routes a "user attached a
 * video and asked for an edit" turn into the existing AI Video Editor pipeline:
 *   1. Tier gating — `video_editor` is Creator+ (Full), matching the image tools.
 *   2. Registry inclusion — the tool is part of `ALL_VEEGPT_TOOLS`.
 *   3. Intent → tool selection — the `video_edit` capability (from an attached
 *      video + a video-edit keyword, or a forced `video_editor`) surfaces the
 *      `video_editor` tool via `selectTools`, and video keywords are NEVER
 *      sufficient on their own (hybrid gate).
 *
 * These are pure functions, so no network/DB is needed.
 */

import { describe, it, expect } from 'vitest';

import {
  isToolAllowedForTier,
  filterToolsByTier,
  TOOL_MIN_TIER,
} from '../server/config/veegpt-tiers';
import {
  selectTools,
  ALL_VEEGPT_TOOLS,
} from '../server/routes/veegpt-tool-selection.logic';
import { classifyIntent } from '../server/routes/veegpt-intent.logic';
import { VIDEO_EDITOR_TOOL, VEEGPT_VIDEO_TOOLS } from '../server/routes/veegpt-tools';

const toolNames = (tools: Array<{ function?: { name?: string } }>) =>
  tools.map((t) => t.function?.name).filter(Boolean) as string[];

describe('video_editor — tool definition', () => {
  it('is named video_editor, requires an instruction, and forbids extra props', () => {
    expect(VIDEO_EDITOR_TOOL.function.name).toBe('video_editor');
    const params = VIDEO_EDITOR_TOOL.function.parameters as {
      required?: string[];
      additionalProperties?: boolean;
      properties?: Record<string, unknown>;
    };
    expect(params.required).toContain('instruction');
    expect(params.additionalProperties).toBe(false);
    expect(params.properties).toHaveProperty('instruction');
    expect(params.properties).toHaveProperty('preserve');
  });

  it('is exported as its own VEEGPT_VIDEO_TOOLS group', () => {
    expect(toolNames(VEEGPT_VIDEO_TOOLS)).toEqual(['video_editor']);
  });
});

describe('video_editor — tier gating (Creator+, matches image tools)', () => {
  it('is registered as a Full-tier tool', () => {
    expect(TOOL_MIN_TIER.video_editor).toBe('full');
  });

  it('is denied to Basic (Free) and allowed to Full/Advanced', () => {
    expect(isToolAllowedForTier('video_editor', 'basic')).toBe(false);
    expect(isToolAllowedForTier('video_editor', 'full')).toBe(true);
    expect(isToolAllowedForTier('video_editor', 'advanced')).toBe(true);
  });

  it('filterToolsByTier drops it for Basic but keeps it for Full', () => {
    expect(toolNames(filterToolsByTier(VEEGPT_VIDEO_TOOLS, 'basic'))).toEqual([]);
    expect(toolNames(filterToolsByTier(VEEGPT_VIDEO_TOOLS, 'full'))).toEqual([
      'video_editor',
    ]);
  });
});

describe('video_editor — registry + selection', () => {
  it('is part of the master ALL_VEEGPT_TOOLS registry', () => {
    expect(toolNames([...ALL_VEEGPT_TOOLS])).toContain('video_editor');
  });

  it('an attached video + an edit keyword surfaces the video_editor tool (Full)', () => {
    const intent = classifyIntent({
      message: 'remove the person behind me in this video',
      priorMessages: [],
      hasMedia: true,
      hasVideo: true,
    });
    expect(intent.intents).toContain('video_edit');

    const sel = selectTools({ tier: 'full', intents: intent.intents, ambiguous: intent.ambiguous });
    expect(toolNames(sel.tools)).toContain('video_editor');
  });

  it('an explicitly forced video_editor is always exposed (Full)', () => {
    const intent = classifyIntent({
      message: 'help me with this',
      priorMessages: [],
      hasMedia: true,
      hasVideo: true,
      forcedTool: 'video_editor',
    });
    expect(intent.intents).toContain('video_edit');

    const sel = selectTools({
      tier: 'full',
      intents: intent.intents,
      ambiguous: intent.ambiguous,
      forcedTool: 'video_editor',
    });
    expect(toolNames(sel.tools)).toContain('video_editor');
  });

  it('a video-edit keyword WITHOUT an attached video does NOT activate video_edit (hybrid gate)', () => {
    const intent = classifyIntent({
      message: 'how do I trim a video for a reel?',
      priorMessages: [],
      hasMedia: false,
      hasVideo: false,
    });
    expect(intent.intents).not.toContain('video_edit');
  });

  it('never exposes video_editor to a Basic (Free) tier, even on a video-edit turn', () => {
    const intent = classifyIntent({
      message: 'make this cinematic',
      priorMessages: [],
      hasMedia: true,
      hasVideo: true,
    });
    const sel = selectTools({ tier: 'basic', intents: intent.intents, ambiguous: intent.ambiguous });
    expect(toolNames(sel.tools)).not.toContain('video_editor');
  });
});
