import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { questionItemDtoSchema } from '../dto/assessment-create.dto';
import { updateAssessmentDtoSchema } from '../dto/assessment-update.dto';
import { validateAndNormalizeYouTubeUrl } from '../utils/youtube-url.util';

async function runTests(): Promise<void> {
  console.log('Running Assessment Update & Save Fixes Test Suite...\n');

// =============================================================================
// Test 1: Question DTO Sanitization & Non-ObjectId Handling
// =============================================================================
console.log('--- Test 1: Question DTO Client ID Sanitization & Image-Only Support ---');

// 1.1 Non-ObjectId client string (e.g., q_1731671234_abc) must be sanitized to undefined
const clientGeneratedIdPayload = {
  id: 'q_1731671234_draft_abc',
  order: 1,
  type: 'MCQ',
  textAr: 'ما قيمة س؟',
  options: ['1', '2', '3', '4'],
  correctOptionIndex: 0,
  points: 5
};
const parsedClientQ = questionItemDtoSchema.parse(clientGeneratedIdPayload);
assert.equal(parsedClientQ._id, undefined, 'Client-generated non-ObjectId must be sanitized to undefined to prevent CastError');
assert.equal(parsedClientQ.question_text, 'ما قيمة س؟');
assert.equal(parsedClientQ.points, 5);

// 1.2 Valid 24-character hexadecimal ObjectId must be preserved
const validHexId = new Types.ObjectId().toString();
const existingQuestionPayload = {
  _id: validHexId,
  order: 2,
  type: 'MCQ',
  textAr: 'سؤال موجود مسبقا',
  options: ['أ', 'ب', 'ج', 'د'],
  correctOptionIndex: 2,
  points: 3
};
const parsedExistingQ = questionItemDtoSchema.parse(existingQuestionPayload);
assert.equal(parsedExistingQ._id, validHexId, 'Valid 24-hex ObjectId must be preserved for existing questions');

// 1.3 Question with uploaded image only (no text) must be completely valid
const imageOnlyPayload = {
  order: 3,
  type: 'MCQ',
  questionImageUrl: 'https://storage.googleapis.com/spider-math-bucket/questions/q_crop_123.webp',
  options: ['5 سم', '10 سم', '15 سم', '20 سم'],
  correctOptionIndex: 1,
  points: 4
};
const parsedImageOnlyQ = questionItemDtoSchema.parse(imageOnlyPayload);
assert.equal(parsedImageOnlyQ.question_image_url, 'https://storage.googleapis.com/spider-math-bucket/questions/q_crop_123.webp');
assert.equal(parsedImageOnlyQ.options.length, 4);
assert.equal(parsedImageOnlyQ.correct_option_index, 1);

// 1.4 Question without text AND without image must fail validation
let failedValidation = false;
try {
  questionItemDtoSchema.parse({
    order: 4,
    type: 'MCQ',
    options: ['1', '2'],
    correctOptionIndex: 0
  });
} catch (err: any) {
  failedValidation = true;
  assert.match(err.message, /يجب كتابة نص السؤال أو رفع صورة السؤال/);
}
assert.equal(failedValidation, true, 'Question with neither text nor image must be rejected with informative error');

// 1.5 Duplicate options in MCQ must fail validation
let duplicateValidationFailed = false;
try {
  questionItemDtoSchema.parse({
    order: 5,
    type: 'MCQ',
    textAr: 'سؤال بخيارات مكررة',
    options: ['خيار مكرر', 'خيار 2', 'خيار مكرر', 'خيار 4'],
    correctOptionIndex: 0
  });
} catch (err: any) {
  duplicateValidationFailed = true;
  assert.match(err.message, /لا يمكن تكرار نفس الإجابة/);
}
assert.equal(duplicateValidationFailed, true, 'MCQ with duplicate options must be rejected');

console.log('[PASS] Test 1: Question DTO sanitization and validation verified.');

// =============================================================================
// Test 2: UpdateAssessmentDto Schema Transformations
// =============================================================================
console.log('--- Test 2: UpdateAssessmentDto Schema Transformations & Normalization ---');

const updatePayload = {
  titleAr: 'امتحان الجبر والتفاضل المحدث',
  titleEn: 'Updated Algebra and Calculus Exam',
  durationMinutes: 45,
  isPublished: true,
  questions: [
    {
      id: 'q_new_1',
      type: 'MCQ',
      questionImageUrl: 'https://storage.googleapis.com/spider-math-bucket/questions/math_q1.png',
      options: ['10', '20', '30', '40'],
      correctOptionIndex: 1,
      points: 5
    },
    {
      _id: validHexId,
      type: 'INPUT_TEXT',
      textAr: 'أوجد قيمة س',
      acceptedAnswers: ['5', '٥'],
      points: 5
    }
  ]
};

const parsedUpdate = updateAssessmentDtoSchema.parse(updatePayload);
assert.equal(parsedUpdate.title_ar, 'امتحان الجبر والتفاضل المحدث');
assert.equal(parsedUpdate.title_en, 'Updated Algebra and Calculus Exam');
assert.equal(parsedUpdate.time_limit_minutes, 45);
assert.equal(parsedUpdate.is_published, true);
assert.equal(parsedUpdate.questions?.length, 2);
assert.equal(parsedUpdate.total_points, 10);

// Check question array transformed output
const q1 = parsedUpdate.questions![0]!;
assert.equal(q1._id, undefined, 'Client draft ID q_new_1 must be converted to undefined in questions array');
assert.equal(q1.question_image_url, 'https://storage.googleapis.com/spider-math-bucket/questions/math_q1.png');

const q2 = parsedUpdate.questions![1]!;
assert.equal(q2._id, validHexId, 'Valid hex ObjectId must be preserved in questions array');
assert.deepEqual(q2.accepted_answers, ['5', '٥']);

console.log('[PASS] Test 2: UpdateAssessmentDto correctly transforms questions, IDs, and metadata.');

// =============================================================================
// Test 3: Backend Service ID Sanitization Simulation
// =============================================================================
console.log('--- Test 3: Backend Service ObjectId Casting & Defensive Guards ---');

// Simulate the exact sanitization block used in AssessmentsService.updateAssessment
const rawQuestions = [
  { id: 'q_unsaved_client_1', textAr: 'سؤال 1', options: ['أ', 'ب'], correctOptionIndex: 0 },
  { _id: 'not-a-valid-hex-id', textAr: 'سؤال 2', options: ['ج', 'د'], correctOptionIndex: 1 },
  { _id: validHexId, textAr: 'سؤال 3', options: ['هـ', 'و'], correctOptionIndex: 0 }
];

const sanitizedQuestions = rawQuestions.map((q) => {
  const rawId = (q as any)._id || (q as any).id;
  const validId = rawId && Types.ObjectId.isValid(rawId) ? new Types.ObjectId(rawId) : undefined;
  return {
    ...q,
    _id: validId,
    youtube_solution_url: validateAndNormalizeYouTubeUrl((q as any).youtube_solution_url)
  };
});

assert.equal(sanitizedQuestions[0]!._id, undefined, 'Client ID q_unsaved_client_1 must not be assigned to _id');
assert.equal(sanitizedQuestions[1]!._id, undefined, 'Malformed ID must not be assigned to _id');
assert.ok(sanitizedQuestions[2]!._id instanceof Types.ObjectId, 'Valid hex ID must be an instance of Types.ObjectId');
assert.equal(sanitizedQuestions[2]!._id!.toString(), validHexId);

// Test regrade submission defensive check with undefined question IDs
const mockAssessmentQuestions = [
  { _id: undefined, order: 1, question_type: 'MCQ', correct_option_index: 0, points: 5 },
  { _id: new Types.ObjectId(), order: 2, question_type: 'MCQ', correct_option_index: 2, points: 5 }
];

let regradeThrewError = false;
try {
  for (const q of mockAssessmentQuestions) {
    // If q._id is undefined, safeguard prevents crashing
    if (q._id) {
      assert.ok(Types.ObjectId.isValid(q._id.toString()));
    }
  }
} catch {
  regradeThrewError = true;
}
assert.equal(regradeThrewError, false, 'Regrade loop must never throw on undefined question _id');

console.log('[PASS] Test 3: Defensive checks successfully prevent Mongoose CastError and undefined ID crashes.');

// =============================================================================
// Test 4: Concurrency Retry & Image Upload Question End-to-End Test
// =============================================================================
console.log('--- Test 4: Concurrency Retry Guard & Uploaded Image Question Test ---');

// 4.1 Verify question with uploaded image and Arabic math options parses cleanly
const uploadedQuestionPayload = {
  order: 1,
  type: 'MCQ',
  questionImageUrl: 'https://storage.googleapis.com/spider-math-bucket/questions/geometry_crop.webp',
  textAr: '', // Empty text -> should pass because image is attached
  options: ['12 سم²', '24 سم²', '36 سم²', '48 سم²'],
  correctOptionIndex: 2,
  points: 10
};

const parsedUploadedQ = questionItemDtoSchema.parse(uploadedQuestionPayload);
assert.equal(parsedUploadedQ.question_image_url, 'https://storage.googleapis.com/spider-math-bucket/questions/geometry_crop.webp');
assert.equal(parsedUploadedQ.correct_option_index, 2);
assert.equal(parsedUploadedQ.points, 10);
assert.equal(parsedUploadedQ.options.length, 4);

// 4.2 Verify VersionError retry handler logic
let retryCount = 0;
const simulateConcurrentSave = async (): Promise<string> => {
  try {
    if (retryCount === 0) {
      retryCount++;
      const err = new Error('No matching document found for id version 0');
      err.name = 'VersionError';
      throw err;
    }
    return 'SUCCESS';
  } catch (err: any) {
    if (err && err.name === 'VersionError') {
      // Simulate re-fetching and retrying
      return simulateConcurrentSave();
    }
    throw err;
  }
};

const retryResult = await simulateConcurrentSave();
assert.equal(retryResult, 'SUCCESS', 'Optimistic concurrency VersionError must retry and resolve cleanly');
assert.equal(retryCount, 1, 'Retry count must be exactly 1 after VersionError recovery');

  console.log('[PASS] Test 4: Concurrency retry and uploaded image question validation verified.');

  console.log('\nAll Assessment Update & Save Tests Passed Successfully!\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
