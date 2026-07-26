import { describe, it, expect } from 'vitest';
import {
  labelFromScore,
  normalizeTopic,
  prettyTopic,
  SENTIMENT_POSITIVE_THRESHOLD,
  SENTIMENT_NEGATIVE_THRESHOLD,
} from './ai-extraction.service';

describe('labelFromScore (-1..1 sentiment scale)', () => {
  it('labels clearly positive scores as positive', () => {
    expect(labelFromScore(0.8)).toBe('positive');
    expect(labelFromScore(SENTIMENT_POSITIVE_THRESHOLD)).toBe('positive');
  });

  it('labels clearly negative scores as negative', () => {
    expect(labelFromScore(-0.8)).toBe('negative');
    expect(labelFromScore(SENTIMENT_NEGATIVE_THRESHOLD)).toBe('negative');
  });

  it('labels middling scores as neutral', () => {
    expect(labelFromScore(0)).toBe('neutral');
    expect(labelFromScore(0.1)).toBe('neutral');
    expect(labelFromScore(-0.1)).toBe('neutral');
  });
});

describe('normalizeTopic', () => {
  it('merges case and punctuation variants to the same key', () => {
    expect(normalizeTopic('Travel Tips')).toBe('travel tips');
    expect(normalizeTopic('travel  tips!')).toBe('travel tips');
    expect(normalizeTopic('TRAVEL-TIPS')).toBe('travel tips');
  });

  it('trims and collapses whitespace', () => {
    expect(normalizeTopic('   AI   Automation  ')).toBe('ai automation');
  });
});

describe('prettyTopic', () => {
  it('title-cases a normalized topic for display', () => {
    expect(prettyTopic('travel tips')).toBe('Travel Tips');
    expect(prettyTopic('ai automation')).toBe('Ai Automation');
  });
});
