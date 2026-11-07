import assert from 'node:assert/strict';
import { AssessmentModel } from '../../../models/assessment.model';
import { LectureMaterialModel } from '../../../models/lecture-material.model';
import { createAssessmentDtoSchema } from '../dto/assessment-create.dto';
import { createUnitPackageDtoSchema } from '../../units-subscriptions/dto/unit-crud.dto';
import { formatArabicStudentStage } from '../../testimonials/testimonials.controller';
import { SubmissionModel } from '../../../models/submission.model';
import { deviceLockGuard } from '../../../middlewares/device-lock.middleware';
import { ROLES } from '../../../common/constants/roles.constant';

async function runTests() {
  console.log('Running Free Content & Toggle Verification Tests...');

  // Test 1: Assessment pre-save hook forces HOMEWORK to is_free = false
  const homeworkAssessment = new AssessmentModel({
    title_ar: 'واجب منزلي تجريبي',
    title_en: 'Homework Test',
    curriculum: 'EGYPTIAN',
    grade_level: 'SEC_3',
    academic_term: 'TERM_1',
    assessment_type: 'HOMEWORK',
    time_limit_minutes: 60,
    total_points: 20,
    is_free: true, // Should be forced to false
    is_published: true,
    questions: [
      {
        question_order: 1,
        question_text_ar: 'سؤال واجب',
        question_type: 'MCQ',
        points: 5,
        options: ['أ', 'ب', 'ج', 'د'],
        correct_option_index: 0
      }
    ]
  });

  // Call pre-save hook directly
  const saveHooks = (AssessmentModel.schema as any).s?.hooks?._pres?.get('save') || [];
  for (const hook of saveHooks) {
    hook.fn.call(homeworkAssessment, () => {});
  }
  assert.equal(homeworkAssessment.is_free, false, 'HOMEWORK assessment must always have is_free = false');
  console.log('✔ Test 1 Passed: HOMEWORK assessments strictly enforce is_free = false via pre-save hook.');

  // Test 2: Non-HOMEWORK assessment retains is_free = true
  const quizAssessment = new AssessmentModel({
    title_ar: 'كويز تجريبي مجاني',
    title_en: 'Free Quiz Test',
    curriculum: 'EGYPTIAN',
    grade_level: 'SEC_3',
    academic_term: 'TERM_1',
    assessment_type: 'QUIZ',
    time_limit_minutes: 20,
    total_points: 10,
    is_free: true,
    is_published: true,
    questions: []
  });
  for (const hook of saveHooks) {
    hook.fn.call(quizAssessment, () => {});
  }
  assert.equal(quizAssessment.is_free, true, 'QUIZ assessment can have is_free = true');
  console.log('✔ Test 2 Passed: QUIZ assessments preserve is_free = true.');

  // Test 3: LectureMaterial pre-save hook synchronizes is_free and is_free_trial
  const lectureMaterial = new LectureMaterialModel({
    lecture_title_ar: 'محاضرة تفاعلية مجانية',
    lecture_title_en: 'Free Interactive Lecture',
    curriculum: 'EGYPTIAN',
    grade_level: 'SEC_3',
    academic_term: 'TERM_1',
    order_index: 1,
    is_free: true,
    is_published: true
  });
  const lectureSaveHooks = (LectureMaterialModel.schema as any).s?.hooks?._pres?.get('save') || [];
  for (const hook of lectureSaveHooks) {
    hook.fn.call(lectureMaterial, () => {});
  }
  assert.equal(lectureMaterial.is_free_trial, true, 'LectureMaterial must sync is_free_trial to match is_free');
  console.log('✔ Test 3 Passed: LectureMaterial pre-save hook synchronizes is_free with is_free_trial.');

  // Test 4: createAssessmentDtoSchema parses is_free successfully
  const parsedDto = createAssessmentDtoSchema.parse({
    title_ar: 'كويز جديد',
    title_en: 'New Quiz',
    curriculum: 'EGYPTIAN',
    grade_level: 'SEC_1',
    academic_term: 'TERM_1',
    assessment_type: 'QUIZ',
    time_limit_minutes: 30,
    is_free: true
  });
  assert.equal(parsedDto.is_free, true, 'AssessmentCreateDto should accept is_free: true');
  console.log('✔ Test 4 Passed: AssessmentCreateDto validates is_free correctly.');

  // Test 5: deviceLockGuard allows Super Admin without X-Device-UUID header
  let nextCalled = false;
  let nextError: any = null;
  const mockReq: any = {
    header: () => undefined, // No X-Device-UUID
    user: { sub: 'admin-123', role: ROLES.SUPER_ADMIN }
  };
  const mockRes: any = {};
  await deviceLockGuard(mockReq, mockRes, (err?: any) => {
    nextCalled = true;
    nextError = err;
  });
  assert.equal(nextCalled, true, 'deviceLockGuard should call next()');
  assert.equal(nextError, undefined, 'deviceLockGuard should not produce an error for Super Admin even without header');
  console.log('✔ Test 5 Passed: deviceLockGuard gracefully permits Super Admin without X-Device-UUID.');

  // Test 6: deviceLockGuard rejects student without X-Device-UUID header
  let studentNextCalled = false;
  let studentNextError: any = null;
  const mockStudentReq: any = {
    header: () => undefined,
    user: { sub: 'student-123', role: ROLES.STUDENT }
  };
  await deviceLockGuard(mockStudentReq, mockRes, (err?: any) => {
    studentNextCalled = true;
    studentNextError = err;
  });
  assert.equal(studentNextCalled, true, 'deviceLockGuard should call next() with error for student');
  assert.ok(studentNextError, 'deviceLockGuard should produce an AppError for student lacking device UUID');
  assert.equal(studentNextError.statusCode, 400, 'Expected 400 Bad Request');
  console.log('✔ Test 6 Passed: deviceLockGuard enforces X-Device-UUID for student accounts.');

  // Test 7: Assessment with ESSAY_PHOTO forces requires_teacher_review = true via pre-save hook
  const essayAssessment = new AssessmentModel({
    title_ar: 'كويز به سؤال مقالي',
    title_en: 'Quiz with Essay Question',
    curriculum: 'EGYPTIAN',
    grade_level: 'SEC_1',
    academic_term: 'TERM_1',
    assessment_type: 'QUIZ',
    time_limit_minutes: 30,
    total_points: 10,
    requires_teacher_review: false, // Attempt to disable review
    questions: [
      {
        question_type: 'ESSAY_PHOTO',
        question_text: 'اشرح الخطوات بالتفصيل وارسم المنحنى',
        points: 5,
        options: []
      }
    ]
  });
  for (const hook of saveHooks) {
    hook.fn.call(essayAssessment, () => {});
  }
  assert.equal(essayAssessment.has_essay_questions, true, 'has_essay_questions must be true');
  assert.equal(essayAssessment.requires_teacher_review, true, 'Essay question must strictly force requires_teacher_review = true');
  console.log('✔ Test 7 Passed: Assessment with essay questions strictly forces requires_teacher_review = true.');

  // Test 8: MCQ-only assessment allows requires_teacher_review = false
  const mcqAssessment = new AssessmentModel({
    title_ar: 'كويز اختر فقط',
    title_en: 'MCQ Only Quiz',
    curriculum: 'EGYPTIAN',
    grade_level: 'SEC_1',
    academic_term: 'TERM_1',
    assessment_type: 'QUIZ',
    time_limit_minutes: 20,
    total_points: 5,
    requires_teacher_review: false,
    questions: [
      {
        question_type: 'MCQ',
        question_text: 'ما قيمة س؟',
        points: 5,
        options: ['1', '2', '3', '4'],
        correct_option_index: 0
      }
    ]
  });
  for (const hook of saveHooks) {
    hook.fn.call(mcqAssessment, () => {});
  }
  assert.equal(mcqAssessment.requires_teacher_review, false, 'MCQ only quiz allows requires_teacher_review = false');
  console.log('✔ Test 8 Passed: MCQ-only quiz preserves requires_teacher_review = false for immediate grading.');

  // Test 9: createAssessmentDtoSchema handles requiresTeacherReview and forces true on essay
  const parsedMcqDto = createAssessmentDtoSchema.parse({
    title_ar: 'كويز اختر',
    curriculum: 'EGYPTIAN',
    grade_level: 'SEC_1',
    requiresTeacherReview: false,
    questions: [
      {
        question_type: 'MCQ',
        question_text: 'اختر الإجابة الصحيحة',
        options: ['أ', 'ب'],
        correct_option_index: 0,
        points: 2
      }
    ]
  });
  assert.equal(parsedMcqDto.requires_teacher_review, false, 'MCQ DTO should preserve requires_teacher_review: false');

  const parsedEssayDto = createAssessmentDtoSchema.parse({
    title_ar: 'كويز مقالي',
    curriculum: 'EGYPTIAN',
    grade_level: 'SEC_1',
    requiresTeacherReview: false, // Teacher attempted false
    questions: [
      {
        question_type: 'ESSAY',
        question_text: 'مسألة مقالية تتطلب خطوات يدوية',
        points: 5
      }
    ]
  });
  assert.equal(parsedEssayDto.requires_teacher_review, true, 'Essay DTO must force requires_teacher_review: true');
  console.log('✔ Test 9 Passed: createAssessmentDtoSchema correctly manages requires_teacher_review flag.');

  // Test 10: formatArabicStudentStage generates correct Arabic text
  const stageEg = formatArabicStudentStage('EGYPTIAN', 'SEC_1');
  assert.equal(stageEg, 'الصف الأول الثانوي • المنهج المصري');
  const stageGulf = formatArabicStudentStage('GULF', 'GRADE_12');
  assert.equal(stageGulf, 'الصف الثاني عشر (توجيهي) • المنهج الخليجي');
  console.log('✔ Test 10 Passed: formatArabicStudentStage generates proper Arabic stage descriptions.');

  // Test 11: createUnitPackageDtoSchema does not fallback to literal 'Unit Package'
  const unitDto = createUnitPackageDtoSchema.parse({
    curriculum: 'EGYPTIAN',
    grade_level: 'SEC_1',
    title_ar: 'الوحدة الأولى - الجبر',
    title_en: 'Unit Package' // Default string should be discarded in favor of Arabic title
  });
  assert.equal(unitDto.title_en, 'الوحدة الأولى - الجبر', 'title_en must not fallback to Unit Package');
  console.log('✔ Test 11 Passed: createUnitPackageDtoSchema sanitizes title_en to prevent "Unit Package" default.');

  // Test 12: SubmissionSchema allows optional unit_package_id for standalone general assessments
  const generalSubmission = new SubmissionModel({
    idempotency_key: 'test_idempotency_key_gen',
    assessment_id: new AssessmentModel()._id,
    student_id: new AssessmentModel()._id,
    unit_package_id: null,
    attempt_number: 1,
    sync_queue_status: 'SYNCED_ONLINE',
    result_visibility: 'PUBLISHED_TO_STUDENT_AND_PARENT',
    server_started_at: new Date(),
    client_started_at: new Date()
  });
  const valError = generalSubmission.validateSync();
  assert.equal(valError, undefined, 'SubmissionModel should validate cleanly with unit_package_id = null');
  console.log('✔ Test 12 Passed: SubmissionModel cleanly supports unit_package_id = null for general quizzes.');

  console.log('All Free Content & Toggle Verification Tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
