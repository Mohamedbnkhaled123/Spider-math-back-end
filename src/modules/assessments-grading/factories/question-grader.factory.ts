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
  acceptedAnswers?: string[];
  modelAnswerText?: string;
  points: number;
}

export interface IStudentAnswerData {
  selectedOptionIndex?: number;
  textAnswer?: string;
  solutionImgsCount?: number;
}

export interface IQuestionGrader {
  grade(question: IQuestionData, answer?: IStudentAnswerData): IQuestionGradeResult;
}

/**
 * Converts Eastern Arabic (Arabic-Indic: ٠-٩) and Persian (۰-۹) digits to Western ASCII digits (0-9).
 */
export function normalizeDigits(str: string): string {
  const easternToWestern: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
  };
  return str.replace(/[٠-٩۰-۹]/g, (d) => easternToWestern[d] || d);
}

/**
 * Normalizes text for comparison:
 * 1. Converts Arabic/Persian digits to standard 0-9.
 * 2. Strips Arabic diacritics (tashkeel).
 * 3. Normalizes Arabic letters: [أإآٱ] -> ا, ة -> ه, ى -> ي, removes tatweel.
 * 4. Strips spaces around math operators (+, -, *, /, =, ^, <, >, (, )).
 * 5. Collapses multiple whitespace to a single space, lowercases, and trims.
 */
export function normalizeTextAnswer(str: string): string {
  if (!str) return '';
  let res = normalizeDigits(str.trim());
  // Remove Arabic diacritics: U+064B to U+065F, U+0670
  res = res.replace(/[\u064B-\u065F\u0670]/g, '');
  // Remove Tatweel
  res = res.replace(/\u0640/g, '');
  // Normalize alef
  res = res.replace(/[أإآٱ]/g, 'ا');
  // Normalize taa marbuta
  res = res.replace(/ة/g, 'ه');
  // Normalize alef maqsura
  res = res.replace(/ى/g, 'ي');
  // Convert to lowercase
  res = res.toLowerCase();
  // Remove spaces around common math symbols and delimiters
  res = res.replace(/\s*([+\-*/=^<>()\[\],])\s*/g, '$1');
  // Collapse remaining spaces
  res = res.replace(/\s+/g, ' ').trim();
  return res;
}

/**
 * Attempts to parse a string into a numeric value (including decimals and simple fractions).
 */
export function parseMathNumericValue(str: string): number | null {
  if (!str) return null;
  const cleaned = normalizeDigits(str.trim()).replace(/\s+/g, '');

  // Handle single comma as decimal point (e.g. "5,5" -> "5.5")
  let normalizedDec = cleaned;
  if (/^-?\d+,\d+$/.test(normalizedDec)) {
    normalizedDec = normalizedDec.replace(',', '.');
  }

  // Fraction format e.g. "1/2" or "-3/4"
  const fractionMatch = normalizedDec.match(/^(-?\d+)\/(\d+)$/);
  if (fractionMatch) {
    const num = parseFloat(fractionMatch[1]);
    const den = parseFloat(fractionMatch[2]);
    if (den !== 0) return num / den;
  }

  // Pure number check (e.g. "5", "5.0", "-2.5", "+3")
  if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(normalizedDec)) {
    const val = Number(normalizedDec);
    if (!isNaN(val) && isFinite(val)) {
      return val;
    }
  }

  return null;
}

/**
 * Checks if student answer matches an accepted answer string
 * using textual normalization, math spacing, and numeric equivalence.
 */
export function isTextAnswerMatch(studentAns: string, acceptedAns: string): boolean {
  if (!studentAns || !acceptedAns) return false;

  const normStudent = normalizeTextAnswer(studentAns);
  const normAccepted = normalizeTextAnswer(acceptedAns);

  // Exact normalized string match
  if (normStudent === normAccepted) {
    return true;
  }

  // Numeric / Mathematical equivalence
  const studentNum = parseMathNumericValue(studentAns);
  const acceptedNum = parseMathNumericValue(acceptedAns);

  if (studentNum !== null && acceptedNum !== null) {
    if (Math.abs(studentNum - acceptedNum) < 1e-6) {
      return true;
    }
  }

  return false;
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
      answer.selectedOptionIndex !== null &&
      question.correctOptionIndex !== undefined &&
      question.correctOptionIndex !== null &&
      !isNaN(Number(answer.selectedOptionIndex)) &&
      Number(answer.selectedOptionIndex) === Number(question.correctOptionIndex)
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
 * Grader implementation for Short Answer / Text Input Questions (INPUT_TEXT).
 * Evaluates student text answer against teacher's accepted_answers and model_answer_text
 * using robust Arabic & math normalization, operator spacing, and numeric equivalence.
 */
export class InputTextQuestionGrader implements IQuestionGrader {
  grade(question: IQuestionData, answer?: IStudentAnswerData): IQuestionGradeResult {
    if (!answer || answer.textAnswer === undefined || answer.textAnswer === null) {
      return {
        isCorrect: false,
        pointsEarned: 0
      };
    }

    const studentText = answer.textAnswer.trim();
    if (!studentText) {
      return {
        isCorrect: false,
        pointsEarned: 0
      };
    }

    // Collect all candidate accepted answers
    const candidates: string[] = [];

    if (Array.isArray(question.acceptedAnswers)) {
      for (const ans of question.acceptedAnswers) {
        if (typeof ans === 'string' && ans.trim()) {
          candidates.push(ans);
          if (ans.includes('/') && !parseMathNumericValue(ans)) {
            ans.split('/').forEach((part) => {
              if (part.trim()) candidates.push(part.trim());
            });
          }
          if (ans.includes(',')) {
            ans.split(',').forEach((part) => {
              if (part.trim()) candidates.push(part.trim());
            });
          }
        }
      }
    }

    if (question.modelAnswerText && typeof question.modelAnswerText === 'string') {
      const modelText = question.modelAnswerText.trim();
      if (modelText) {
        candidates.push(modelText);
        if (modelText.includes('/') && !parseMathNumericValue(modelText)) {
          modelText.split('/').forEach((part) => {
            if (part.trim()) candidates.push(part.trim());
          });
        }
      }
    }

    if (candidates.length === 0) {
      return {
        isCorrect: false,
        pointsEarned: 0
      };
    }

    const isMatch = candidates.some((candidate) => isTextAnswerMatch(studentText, candidate));

    return {
      isCorrect: isMatch,
      pointsEarned: isMatch ? question.points : 0
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
      case 'INPUT_TEXT':
        return new InputTextQuestionGrader();
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
