import { describe, expect, test } from 'vitest';
import { calculateScore } from './scoring.js';

describe('calculateScore', () => {
  test('awards base + bonuses for correct fast answers', () => {
    const out = calculateScore({
      baseScore: 100,
      isCorrect: true,
      responseTimeMs: 1000,
      timeLimitSeconds: 10,
      speedBonusEnabled: true,
      firstCorrectBonusEnabled: true,
      rankAmongCorrect: 1,
      firstBonuses: [20, 10, 5]
    });
    expect(out.total).toBeGreaterThan(120);
  });

  test('awards 0 for wrong answers', () => {
    const out = calculateScore({
      baseScore: 100,
      isCorrect: false,
      responseTimeMs: 500,
      timeLimitSeconds: 10,
      speedBonusEnabled: true,
      firstCorrectBonusEnabled: true,
      rankAmongCorrect: 1,
      firstBonuses: [20, 10, 5]
    });
    expect(out.total).toBe(0);
  });
});
