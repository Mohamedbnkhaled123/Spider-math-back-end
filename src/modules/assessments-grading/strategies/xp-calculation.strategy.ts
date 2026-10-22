/**
 * XP Calculation Strategies for Quiz and Homework completions.
 * Strictly adheres to RULES.md Section 4.2 A.
 */

export interface IXpStrategyContext {
  baseXpReward: number;
  scorePercentage?: number;
  isSuspiciousFastSolve?: boolean;
  clockTamperDetected?: boolean;
  manualDelta?: number;
}

export interface IXpCalculationStrategy {
  calculateDelta(ctx: IXpStrategyContext): number;
}

export class QuizPassedXpStrategy implements IXpCalculationStrategy {
  calculateDelta(ctx: IXpStrategyContext): number {
    // Anti-cheat zero-XP guard: zero XP if solve was suspiciously fast or clock was tampered
    if (ctx.isSuspiciousFastSolve || ctx.clockTamperDetected) {
      return 0;
    }

    const percentage = ctx.scorePercentage ?? 0;
    if (percentage < 50) {
      return 0;
    }

    // Full score receives a 25% mastery bonus (1.25x)
    return percentage === 100 ? Math.round(ctx.baseXpReward * 1.25) : ctx.baseXpReward;
  }
}

export class HomeworkGradedXpStrategy implements IXpCalculationStrategy {
  calculateDelta(ctx: IXpStrategyContext): number {
    if (ctx.manualDelta !== undefined) {
      return ctx.manualDelta;
    }
    const percentage = ctx.scorePercentage ?? 0;
    if (percentage < 50) {
      return Math.round(ctx.baseXpReward * 0.5); // Partial effort reward
    }
    return percentage === 100 ? Math.round(ctx.baseXpReward * 1.25) : ctx.baseXpReward;
  }
}
