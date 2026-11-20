import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { submitPlacementDtoSchema } from '../../leads-placement/dto/submit-placement.dto';
import { PlacementService } from '../../leads-placement/services/placement.service';
import { AssessmentModel } from '../../../models/assessment.model';
import { PlacementAttemptModel } from '../../../models/placement-attempt.model';
import { SubmissionModel } from '../../../models/submission.model';
import { UserModel } from '../../../models/user.model';
import { NotificationModel } from '../../../models/notification.model';
import { GamificationLogModel } from '../../../models/gamification-log.model';
import { GradingService } from './grading.service';
import { AssessmentsService } from './assessments.service';
import { CloudinarySignedUploadAdapter } from '../adapters/cloudinary-signed-upload.adapter';
import { directRegisterStudentDtoSchema } from '../../auth/dto/direct-register.dto';
import { completeProfileDtoSchema } from '../../auth/dto/complete-profile.dto';

async function runSuite(): Promise<void> {
  console.log('Running Placement Input/Essay, Half-Point Grading, and Image Isolation Suite...\n');

  // =========================================================================
  // 1. Placement Test DTO + Input Text & Essay Photo Evaluation
  // =========================================================================
  console.log('--- Test 1: Placement DTO & Multi-Type Question Evaluation ---');

  const dtoParsed = submitPlacementDtoSchema.safeParse({
    curriculum: 'INTERNATIONAL',
    gradeLevel: 'US_GRADE_1',
    academicTerm: 'TERM_1',
    answers: [
      { questionId: 'q1', selectedOption: 2 },
      { questionId: 'q7', textAnswer: '24' },
      { questionId: 'q9', uploadedImageUrls: ['https://cdn.example.com/spider-math-homework/q9_sol.webp'] }
    ]
  });
  assert.equal(dtoParsed.success, true, 'Placement DTO must accept MCQ, INPUT_TEXT, and ESSAY_PHOTO answers');

  const emptyAutoSubmit = submitPlacementDtoSchema.safeParse({
    curriculum: 'EGYPTIAN',
    gradeLevel: 'SEC_3',
    academicTerm: 'TERM_1',
    answers: []
  });
  assert.equal(emptyAutoSubmit.success, true, 'Placement DTO must allow empty auto-submit array');

  // Verify scoped public placement upload signature works without admin/student role guard failure
  const sigPayload = CloudinarySignedUploadAdapter.generatePlacementHomeworkSignature();
  assert.equal(sigPayload.folder, CloudinarySignedUploadAdapter.HOMEWORK_FOLDER);
  assert.ok(sigPayload.signature.length > 10, 'Placement upload signature must be generated');

  // Stub AssessmentModel & PlacementAttemptModel for PlacementService unit checks
  const q1Id = new Types.ObjectId();
  const q7Id = new Types.ObjectId();
  const q9Id = new Types.ObjectId();

  const origAssessmentFindOne = AssessmentModel.findOne;
  const origAttemptCreate = PlacementAttemptModel.create;

  let capturedAttemptCreatePayload: any = null;
  (AssessmentModel as any).findOne = () => ({
    select: async () => ({
      _id: new Types.ObjectId(),
      curriculum: 'INTERNATIONAL',
      grade_level: 'US_GRADE_1',
      academic_term: 'TERM_1',
      pass_percentage: 50,
      questions: [
        {
          _id: q1Id,
          question_type: 'MCQ',
          question_text: 'MCQ Q1',
          correct_option_index: 1,
          points: 1
        },
        {
          _id: q7Id,
          question_type: 'INPUT_TEXT',
          question_text: 'Find LCM of 8 and 12',
          accepted_answers: ['24'],
          points: 1
        },
        {
          _id: q9Id,
          question_type: 'ESSAY_PHOTO',
          question_text: 'Fruit baskets problem',
          points: 1
        }
      ]
    })
  });
  (PlacementAttemptModel as any).create = async (payload: any) => {
    capturedAttemptCreatePayload = payload;
    return { _id: new Types.ObjectId(), ...payload };
  };

  try {
    const placementService = new PlacementService();
    const res = await placementService.submitAnonymousPlacement({
      curriculum: 'INTERNATIONAL',
      gradeLevel: 'US_GRADE_1',
      academicTerm: 'TERM_1',
      answers: [
        { questionId: q1Id.toString(), selectedOption: 1, uploadedImageUrls: [] },
        { questionId: q7Id.toString(), textAnswer: '٢٤', uploadedImageUrls: [] },
        { questionId: q9Id.toString(), uploadedImageUrls: ['https://cdn.example.com/sol9.webp'] }
      ]
    });

    assert.equal(res.score, 3, 'MCQ + normalized INPUT_TEXT + ESSAY_PHOTO must all earn points');
    assert.equal(res.maxScore, 3);
    assert.equal(res.percentage, 100);
    assert.equal(res.correctAnswersCount, 3);
    assert.equal(capturedAttemptCreatePayload.answers.length, 3);
    assert.equal(capturedAttemptCreatePayload.answers[1].text_answer, '٢٤');
    assert.equal(capturedAttemptCreatePayload.answers[1].is_correct, true);
    assert.deepEqual(capturedAttemptCreatePayload.answers[2].uploaded_image_urls, ['https://cdn.example.com/sol9.webp']);
    assert.equal(capturedAttemptCreatePayload.answers[2].is_correct, true);
  } finally {
    (AssessmentModel as any).findOne = origAssessmentFindOne;
    (PlacementAttemptModel as any).create = origAttemptCreate;
  }
  console.log('[PASS] Test 1 Passed: Placement test evaluates MCQ, INPUT_TEXT, and ESSAY_PHOTO accurately.');

  // =========================================================================
  // 2. Half-Point (0.5) Manual Grading Precision (No Math.max Full Overwrite)
  // =========================================================================
  console.log('--- Test 2: Half-Point (0.5) Grading Precision ---');

  const origSubFindById = SubmissionModel.findById;
  const origAssFindById = AssessmentModel.findById;
  const origUserFindById = UserModel.findById;
  const origUserFindOne = UserModel.findOne;
  const origNotifCreate = NotificationModel.create;
  const origGamificationFindOne = GamificationLogModel.findOne;

  const submissionId = new Types.ObjectId();
  const assessmentId = new Types.ObjectId();
  const studentId = new Types.ObjectId();
  const essayQId = new Types.ObjectId();

  const mockSubmissionDoc: any = {
    _id: submissionId,
    assessment_id: assessmentId,
    student_id: studentId,
    mcq_answers: [],
    text_answers: [],
    essay_answers: [{ question_id: essayQId, points_earned: 1, decision: 'FULL', teacher_note: '' }],
    uploaded_solution_imgs: [{ question_id: essayQId, image_url: 'https://cdn.example.com/sol.webp', rotation_deg: 0 }],
    mcq_auto_score: 0,
    essay_manual_score: 1,
    final_total_score: 1,
    custom_mistake_cases: [],
    result_visibility: 'HIDDEN_PENDING_TEACHER',
    save: async () => mockSubmissionDoc
  };

  (SubmissionModel as any).findById = async () => mockSubmissionDoc;
  (AssessmentModel as any).findById = async () => ({
    _id: assessmentId,
    title_ar: 'اختبار نصف درجة',
    title_en: 'Half Point Quiz',
    total_points: 1,
    xp_reward: 10,
    questions: [{ _id: essayQId, question_type: 'ESSAY_PHOTO', points: 1, question_text: 'Essay 1' }]
  });
  (UserModel as any).findById = async () => ({ _id: studentId, parent_phone: null });
  (UserModel as any).findOne = () => ({ select: () => ({ lean: async () => null }) });
  (NotificationModel as any).create = async () => ({});
  (GamificationLogModel as any).findOne = async () => ({ _id: new Types.ObjectId() });

  try {
    const gradingService = new GradingService();
    const graded = await gradingService.gradeSubmission(new Types.ObjectId().toString(), submissionId.toString(), {
      essay_manual_score: 0.5,
      teacher_feedback_notes: 'نصف درجة',
      custom_mistake_cases: [],
      essay_answers: [{ question_id: essayQId.toString(), points_earned: 0.5, decision: 'HALF', teacher_note: '' }],
      publish: false
    });

    assert.equal(graded.essay_manual_score, 0.5, 'Downgrading from 1 to 0.5 must persist strictly as 0.5');
    assert.equal(graded.final_total_score, 0.5, 'Final score must strictly be 0.5, NOT 1');

    // Now simulate stale higher essay_manual_score = 1 before approveSubmission runs:
    mockSubmissionDoc.essay_manual_score = 1;
    mockSubmissionDoc.essay_answers = [{ question_id: essayQId, points_earned: 0.5, decision: 'HALF', teacher_note: '' }];
    mockSubmissionDoc.result_visibility = 'HIDDEN_PENDING_TEACHER';

    const approved = await gradingService.approveSubmission(new Types.ObjectId().toString(), submissionId.toString());
    assert.equal(approved.essay_manual_score, 0.5, 'approveSubmission must honor 0.5 from essay_answers over stale 1');
    assert.equal(approved.final_total_score, 0.5, 'Approved student score must strictly be 0.5');
  } finally {
    (SubmissionModel as any).findById = origSubFindById;
    (AssessmentModel as any).findById = origAssFindById;
    (UserModel as any).findById = origUserFindById;
    (UserModel as any).findOne = origUserFindOne;
    (NotificationModel as any).create = origNotifCreate;
    (GamificationLogModel as any).findOne = origGamificationFindOne;
  }
  console.log('[PASS] Test 2 Passed: Half-point (0.5) grades are strictly preserved across grade & approve.');

  // =========================================================================
  // 3. Per-Question Solution Image & Half-Point Isolation in Feedback Viewer
  // =========================================================================
  console.log('--- Test 3: Question 8 & Question 9 Image Isolation in Feedback ---');

  const q8Id = new Types.ObjectId();
  const q9IdFeedback = new Types.ObjectId();
  const feedbackSubId = new Types.ObjectId();
  const feedbackAsmId = new Types.ObjectId();
  const feedbackStudentId = new Types.ObjectId();

  const origSubCountDocs = SubmissionModel.countDocuments;

  (SubmissionModel as any).findById = () => ({
    populate: () => ({
      populate: async () => ({
        _id: feedbackSubId,
        student_id: feedbackStudentId,
        assessment_id: {
          _id: feedbackAsmId,
          title_ar: 'امتحان تجريبي',
          title_en: 'Test Quiz',
          total_points: 2,
          has_essay_questions: true,
          max_attempts: 1
        },
        unit_package_id: { _id: new Types.ObjectId(), title_ar: 'الوحدة 1', title_en: 'Unit 1' },
        result_visibility: 'PUBLISHED_TO_STUDENT_AND_PARENT',
        mcq_auto_score: 0,
        essay_manual_score: 1.5,
        final_total_score: 1.5,
        graded_at: new Date(),
        mcq_answers: [],
        text_answers: [],
        essay_answers: [
          { question_id: q8Id, points_earned: 1, decision: 'FULL' },
          { question_id: q9IdFeedback, points_earned: 0.5, decision: 'HALF' }
        ],
        uploaded_solution_imgs: [
          { question_id: q8Id, image_url: 'https://cdn.example.com/q8_solution.webp', rotation_deg: 0 },
          { question_id: q9IdFeedback, image_url: 'https://cdn.example.com/q9_solution.webp', rotation_deg: 0 }
        ],
        custom_mistake_cases: []
      })
    })
  });

  (AssessmentModel as any).findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: feedbackAsmId,
        total_points: 2,
        max_attempts: 1,
        questions: [
          { _id: q8Id, question_type: 'ESSAY_PHOTO', question_text: 'Question 8', points: 1 },
          { _id: q9IdFeedback, question_type: 'ESSAY_PHOTO', question_text: 'Question 9', points: 1 }
        ]
      })
    })
  });
  (SubmissionModel as any).countDocuments = async () => 1;

  try {
    const assessmentsService = new AssessmentsService();
    const feedback = await assessmentsService.getSubmissionFeedback(
      feedbackStudentId.toString(),
      'STUDENT',
      feedbackSubId.toString()
    );

    assert.equal(feedback.finalTotalScore, 1.5);
    assert.equal(feedback.questionsReview.length, 2);

    const revQ8 = feedback.questionsReview[0];
    const revQ9 = feedback.questionsReview[1];

    assert.equal(revQ8.awardedPoints, 1);
    assert.equal(revQ9.awardedPoints, 0.5, 'Student feedback must preserve exact 0.5 half point on Question 9');

    assert.equal(revQ8.studentSolutionImages.length, 1, 'Question 8 must only contain Question 8 image');
    assert.equal(revQ8.studentSolutionImages[0].imageUrl, 'https://cdn.example.com/q8_solution.webp');

    assert.equal(revQ9.studentSolutionImages.length, 1, 'Question 9 must NOT show Question 8 image alongside Question 9');
    assert.equal(revQ9.studentSolutionImages[0].imageUrl, 'https://cdn.example.com/q9_solution.webp');
  } finally {
    (SubmissionModel as any).findById = origSubFindById;
    (AssessmentModel as any).findById = origAssFindById;
    (SubmissionModel as any).countDocuments = origSubCountDocs;
  }

  console.log('[PASS] Test 3 Passed: Question 8 & Question 9 images are strictly isolated in student feedback.\n');

  // =========================================================================
  // 4. Placement Post-Auth Claiming & Auto-Linking (User Login/Register Flow)
  // =========================================================================
  console.log('--- Test 4: Placement Attempt Claim & Auth Linking ---');

  const claimAttemptId = new Types.ObjectId();
  const claimStudentId = new Types.ObjectId();
  const otherStudentId = new Types.ObjectId();
  const origAttemptFindById = PlacementAttemptModel.findById;

  const mockClaimAttemptDoc: any = {
    _id: claimAttemptId,
    curriculum: 'EGYPTIAN',
    grade_level: 'SEC_3',
    academic_term: 'TERM_1',
    total_questions: 5,
    correct_count: 4,
    score_percentage: 80,
    earned_score: 4,
    max_score: 5,
    passed: true,
    academic_level_badge: 'GOOD',
    strengths_weaknesses: { strong_topics: ['Topic 1'], weak_topics: ['Topic 2'] },
    is_unlocked_by_auth: false,
    linked_user_id: null,
    student_code: null,
    save: async function () { return this; }
  };

  (PlacementAttemptModel as any).findById = async () => mockClaimAttemptDoc;

  try {
    const placementService = new PlacementService();
    const claimed = await placementService.claimPlacementAttemptForUser(
      claimAttemptId.toString(),
      claimStudentId.toString(),
      'HA9001'
    );

    assert.equal(claimed.attemptId, claimAttemptId.toString());
    assert.equal(claimed.score, 4);
    assert.equal(claimed.maxScore, 5);
    assert.equal(claimed.percentage, 80);
    assert.equal(claimed.passed, true);
    assert.equal(claimed.isUnlocked, true);
    assert.equal(mockClaimAttemptDoc.is_unlocked_by_auth, true);
    assert.equal(mockClaimAttemptDoc.linked_user_id.toString(), claimStudentId.toString());
    assert.equal(mockClaimAttemptDoc.student_code, 'HA9001');

    // Ownership guard: a different student must receive 403
    let forbiddenThrown = false;
    try {
      await placementService.claimPlacementAttemptForUser(
        claimAttemptId.toString(),
        otherStudentId.toString(),
        'HA9002'
      );
    } catch (err: any) {
      forbiddenThrown = err?.statusCode === 403;
    }
    assert.equal(forbiddenThrown, true, 'Claiming another student attempt must throw 403');
  } finally {
    (PlacementAttemptModel as any).findById = origAttemptFindById;
  }

  // Verify directRegisterStudentDtoSchema & completeProfileDtoSchema accept optional placementAttemptId
  const regDtoCheck = directRegisterStudentDtoSchema.safeParse({
    fullName: 'Omar Khaled',
    phone: '01012345678',
    parentPhone: '01112345678',
    curriculum: 'EGYPTIAN',
    gradeLevel: 'SEC_3',
    country: 'EG',
    governorate: 'CAIRO',
    placementAttemptId: claimAttemptId.toString()
  });
  assert.equal(regDtoCheck.success, true, 'directRegisterStudentDtoSchema must accept valid placementAttemptId');

  const compDtoCheck = completeProfileDtoSchema.safeParse({
    fullName: 'Omar Khaled',
    phone: '01012345678',
    parentPhone: '01112345678',
    curriculum: 'EGYPTIAN',
    gradeLevel: 'SEC_3',
    country: 'EG',
    governorate: 'CAIRO',
    placementAttemptId: claimAttemptId.toString()
  });
  assert.equal(compDtoCheck.success, true, 'completeProfileDtoSchema must accept valid placementAttemptId');

  console.log('[PASS] Test 4 Passed: Placement claim, ownership enforcement, and auth DTO linking verified.\n');
}

runSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
