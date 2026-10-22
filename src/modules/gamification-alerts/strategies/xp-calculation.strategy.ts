import { XpActionType } from '../../../models/gamification-log.model';

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

/**
 * Strategy for lecture completion (>= 85% watch time).
 */
export class LectureCompletedXpStrategy implements IXpCalculationStrategy {
  calculateDelta(ctx: IXpStrategyContext): number {
    return ctx.baseXpReward > 0 ? ctx.baseXpReward : 25; // Default 25 XP per lecture
  }
}

/**
 * Strategy for passed quizzes.
 * Anti-cheat: 0 XP if suspicious fast solve or clock tamper detected.
 * Mastery bonus: 1.25x (25% extra) if score is 100%.
 */
export class QuizPassedXpStrategy implements IXpCalculationStrategy {
  calculateDelta(ctx: IXpStrategyContext): number {
    if (ctx.isSuspiciousFastSolve || ctx.clockTamperDetected) {
      return 0; // Anti-cheat zero-XP guard
    }
    const scorePercentage = ctx.scorePercentage ?? 0;
    if (scorePercentage < 50) {
      return 0; // Did not pass (minimum 50%)
    }
    return scorePercentage === 100 ? Math.round(ctx.baseXpReward * 1.25) : ctx.baseXpReward;
  }
}

/**
 * Strategy for graded homework and essay solutions.
 */
export class HomeworkSubmittedXpStrategy implements IXpCalculationStrategy {
  calculateDelta(ctx: IXpStrategyContext): number {
    if (ctx.manualDelta !== undefined) {
      return ctx.manualDelta;
    }
    const scorePercentage = ctx.scorePercentage ?? 0;
    if (scorePercentage < 50) {
      return Math.round(ctx.baseXpReward * 0.5); // Partial effort reward
    }
    return scorePercentage === 100 ? Math.round(ctx.baseXpReward * 1.25) : ctx.baseXpReward;
  }
}

/**
 * Strategy for direct teacher bonus / penalty adjustments by Eng. Heba Abdel-Wahab.
 */
export class TeacherManualXpStrategy implements IXpCalculationStrategy {
  calculateDelta(ctx: IXpStrategyContext): number {
    return ctx.manualDelta ?? 0;
  }
}

/**
 * Factory for XP Calculation Strategies
 */
export class XpStrategyFactory {
  static getStrategy(actionType: XpActionType): IXpCalculationStrategy {
    switch (actionType) {
      case 'LECTURE_COMPLETED_85':
        return new LectureCompletedXpStrategy();
      case 'QUIZ_PASSED':
        return new QuizPassedXpStrategy();
      case 'HOMEWORK_SUBMITTED':
        return new HomeworkSubmittedXpStrategy();
      case 'TEACHER_BONUS':
      case 'TEACHER_PENALTY':
        return new TeacherManualXpStrategy();
      default:
        return new LectureCompletedXpStrategy();
    }
  }
}
