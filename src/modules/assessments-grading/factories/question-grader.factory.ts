import { QuestionType } from '../../../models/assessment.model';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';

export interface IQuestionGradeResult {
  isCorrect: boolean;
  pointsEarned: number;
}

export interface IQuestionData {
  questionId: string;
  questionType: QuestionType;
  correctOptionIndex?: number;
  points: number;
}

export interface IStudentAnswerData {
  selectedOptionIndex?: number;
  solutionImgsCount?: number;
}

export interface IQuestionGrader {
  grade(question: IQuestionData, answer?: IStudentAnswerData): IQuestionGradeResult;
}

/**
 * Grader implementation for Multiple Choice Questions (MCQ).
 * Evaluates student's selected_option_index against correct_option_index.
 */
export class McqQuestionGrader implements IQuestionGrader {
  grade(question: IQuestionData, answer?: IStudentAnswerData): IQuestionGradeResult {
    if (
      answer !== undefined &&
      answer.selectedOptionIndex !== undefined &&
      question.correctOptionIndex !== undefined &&
      answer.selectedOptionIndex === question.correctOptionIndex
    ) {
      return {
        isCorrect: true,
        pointsEarned: question.points
      };
    }

    return {
      isCorrect: false,
      pointsEarned: 0
    };
  }
}

/**
 * Grader implementation for Essay & Photo Questions (ESSAY_PHOTO).
 * Auto-grades as 0 pending manual review by Eng. Heba Abdel-Wahab in Grading Studio.
 */
export class EssayPhotoQuestionGrader implements IQuestionGrader {
  grade(_question: IQuestionData, _answer?: IStudentAnswerData): IQuestionGradeResult {
    return {
      isCorrect: false,
      pointsEarned: 0
    };
  }
}

/**
 * QuestionGraderFactory
 * Returns the appropriate question grader based on question type.
 */
export class QuestionGraderFactory {
  static getGrader(questionType: QuestionType): IQuestionGrader {
    switch (questionType) {
      case 'MCQ':
        return new McqQuestionGrader();
      case 'ESSAY_PHOTO':
        return new EssayPhotoQuestionGrader();
      default:
        throw new AppError(
          `Unsupported question type: ${questionType}`,
          400,
          ERROR_CODES.BAD_REQUEST_400
        );
    }
  }
}
