import { CounterModel } from '../../models/counter.model';
import { UserModel } from '../../models/user.model';
import { AppError } from './app-error.util';
import { ERROR_CODES } from '../constants/error-codes.constant';

export const STUDENT_CODE_REGEX = /^HA\d+$/;

/**
 * Generates an atomic, sequential student identifier starting at HA1001 (HA1001, HA1002, etc.)
 * Strictly validates that the output matches /^HA\d+$/ with digits only after HA.
 * Guarantees zero duplicate collision against existing users in UserModel.
 */
export async function generateStudentHaCode(): Promise<string> {
  let attempts = 0;
  while (attempts < 50) {
    attempts++;

    // 1. Try atomic increment if counter already initialized
    let counter = await CounterModel.findByIdAndUpdate(
      'student_ha_code',
      { $inc: { seq: 1 } },
      { new: true }
    );

    // 2. Initialize sequence at 1001 if first time, or if below 1001
    if (!counter) {
      try {
        counter = await CounterModel.create({
          _id: 'student_ha_code',
          seq: 1001
        });
      } catch {
        // Handle race condition where another request created it simultaneously
        counter = await CounterModel.findByIdAndUpdate(
          'student_ha_code',
          { $inc: { seq: 1 } },
          { new: true }
        );
      }
    } else if (counter.seq < 1001) {
      counter = await CounterModel.findByIdAndUpdate(
        'student_ha_code',
        { $set: { seq: 1001 } },
        { new: true }
      );
    }

    if (!counter || typeof counter.seq !== 'number') {
      throw new AppError(
        'Failed to generate atomic student HA code sequence',
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR_500
      );
    }

    const generatedCode = `HA${counter.seq}`;

    if (!STUDENT_CODE_REGEX.test(generatedCode)) {
      throw new AppError(
        `Generated student code "${generatedCode}" violated format constraint /^HA\\d+$/`,
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR_500
      );
    }

    // Verify code does not collide with any existing user
    const existing = await UserModel.findOne({ student_code: generatedCode }).select('_id').lean();
    if (!existing) {
      return generatedCode;
    }
    // If it exists in users, the loop repeats and increments counter.seq to next number
  }

  throw new AppError(
    'Failed to allocate a unique student HA code after multiple attempts',
    500,
    ERROR_CODES.INTERNAL_SERVER_ERROR_500
  );
}
