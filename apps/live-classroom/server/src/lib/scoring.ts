export interface ScoreInput {
  baseScore: number;
  isCorrect: boolean;
  responseTimeMs: number;
  timeLimitSeconds: number;
  speedBonusEnabled: boolean;
  firstCorrectBonusEnabled: boolean;
  rankAmongCorrect: number | null;
  firstBonuses: [number, number, number];
}

export interface ScoreOutput {
  baseScore: number;
  speedBonus: number;
  rankBonus: number;
  total: number;
}

export function calculateScore(input: ScoreInput): ScoreOutput {
  if (!input.isCorrect) {
    return { baseScore: 0, speedBonus: 0, rankBonus: 0, total: 0 };
  }

  const speedBonus = input.speedBonusEnabled
    ? Math.max(
        0,
        Math.round(
          30 * (1 - input.responseTimeMs / Math.max(1, input.timeLimitSeconds * 1000))
        )
      )
    : 0;

  let rankBonus = 0;
  if (input.firstCorrectBonusEnabled && input.rankAmongCorrect && input.rankAmongCorrect <= 3) {
    rankBonus = input.firstBonuses[input.rankAmongCorrect - 1] ?? 0;
  }

  const total = input.baseScore + speedBonus + rankBonus;
  return { baseScore: input.baseScore, speedBonus, rankBonus, total };
}
