import crypto from 'crypto';
import { Types } from 'mongoose';
import {
  AssessmentModel,
  IAssessmentDocument,
  IQuestionItem
} from '../../../models/assessment.model';
import {
  SubmissionModel,
  IMcqAnswer
} from '../../../models/submission.model';
import { SubscriptionModel } from '../../../models/subscription.model';
import { UnitPackageModel } from '../../../models/unit-package.model';
import { UserModel } from '../../../models/user.model';
import { GamificationLogModel } from '../../../models/gamification-log.model';
import {
  assessmentAnswerKeyCache,
  publicCmsCache,
  IAssessmentAnswerKeyPayload
} from '../../../config/cache.config';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { ROLES, UserRole } from '../../../common/constants/roles.constant';
import { CreateAssessmentDto } from '../dto/assessment-create.dto';
import { UpdateAssessmentDto } from '../dto/assessment-update.dto';
import { SubmissionSyncDto } from '../dto/submission-sync.dto';
import { QuestionGraderFactory } from '../factories/question-grader.factory';
import { MonotonicTimingAuditStrategy } from '../strategies/monotonic-timing-audit.strategy';
import { QuizPassedXpStrategy } from '../strategies/xp-calculation.strategy';
import { BatchAlertService } from './batch-alert.service';
import { validateAndNormalizeYouTubeUrl } from '../utils/youtube-url.util';

export interface IStartAssessmentResponse {
  assessment: Partial<IAssessmentDocument>;
  idempotencyKey: string;
  attemptNumber: number;
  serverStartedAt: Date;
}

export interface ISyncSubmissionResponse {
  submissionId: string;
  idempotencyKey: string;
  syncQueueStatus: string;
  resultVisibility: string;
  mcqAutoScore: number;
  finalTotalScore: number;
  isSuspiciousFastSolve: boolean;
  clockTamperDetected: boolean;
  xpAwarded: number;
}

/**
 * Extended cache payload to include hasEssayQuestions, timeLimitMinutes and localized titles for batch alerts.
 */
interface IExtendedAssessmentPayload extends IAssessmentAnswerKeyPayload {
  hasEssayQuestions: boolean;
  timeLimitMinutes: number;
  titleAr: string;
  titleEn: string;
}

export class AssessmentsService {
  /**
   * Creates a new assessment in Admin Studio.
   * Scoped by unitPackageId, lectureId, curriculum, gradeLevel, academicTerm.
   * Strictly enforces graphCalculator: 'NONE' | 'DESMOS'.
   */
  async createAssessment(_adminId: string, dto: CreateAssessmentDto): Promise<IAssessmentDocument> {
    const totalPoints = dto.questions.reduce((sum, q) => sum + (q.points || 1), 0);
    const hasEssayQuestions = dto.questions.some((q) => q.question_type === 'ESSAY_PHOTO');

    // Normalize YouTube solution URLs if provided
    const sanitizedQuestions = dto.questions.map((q) => ({
      ...q,
      youtube_solution_url: validateAndNormalizeYouTubeUrl(q.youtube_solution_url)
    }));

    const assessment = await AssessmentModel.create({
      unit_package_id: (dto.unit_package_id && Types.ObjectId.isValid(dto.unit_package_id)) ? new Types.ObjectId(dto.unit_package_id) : null,
      lecture_id: (dto.lecture_id && Types.ObjectId.isValid(dto.lecture_id)) ? new Types.ObjectId(dto.lecture_id) : null,
      is_placement_test: dto.is_placement_test ?? false,
      curriculum: dto.curriculum,
      grade_level: dto.grade_level,
      academic_term: dto.academic_term,
      title_ar: dto.title_ar,
      title_en: dto.title_en,
      assessment_type: dto.assessment_type,
      time_limit_minutes: dto.time_limit_minutes,
      pass_percentage: dto.pass_percentage ?? 60,
      min_expected_solve_sec: dto.min_expected_solve_sec,
      max_attempts: dto.max_attempts,
      available_from: dto.available_from ? new Date(dto.available_from) : null,
      available_until: dto.available_until ? new Date(dto.available_until) : null,
      graph_calculator: dto.graph_calculator,
      has_essay_questions: hasEssayQuestions,
      total_points: totalPoints,
      xp_reward: dto.xp_reward,
      is_published: (dto.is_published ?? true) && sanitizedQuestions.length > 0,
      questions: sanitizedQuestions
    });

    if (dto.unit_package_id) {
      await UnitPackageModel.findByIdAndUpdate(dto.unit_package_id, {
        $inc: { quizzes_count: 1 }
      });
    }

    if (dto.is_published) {
      publicCmsCache.clear();
    }

    return assessment;
  }

  /**
   * Safe Mid-Exam Editing & Automatic Regrading Pass (PATCH /api/v1/admin/assessments/:id)
   * If submissionsCount === 0: Allow full unrestricted structural edits.
   * If submissionsCount > 0: Block structural additions/deletions (400 ASSESSMENT_LOCKED_STRUCTURAL_CHANGE)
   * while allowing non-breaking typo fixes. If MCQ correct_option_index changed, trigger atomic auto-regrade.
   */
  async updateAssessment(_adminId: string, assessmentId: string, dto: UpdateAssessmentDto): Promise<IAssessmentDocument> {
    const assessment = await AssessmentModel.findById(assessmentId).select('+questions.correct_option_index');
    if (!assessment) {
      throw new AppError('Assessment not found', 404, ERROR_CODES.ASSESSMENT_NOT_FOUND_404);
    }

    const submissionsCount = await SubmissionModel.countDocuments({ assessment_id: assessment._id });

    if (dto.questions !== undefined && dto.questions.length === 0) {
      throw new AppError(
        'لا يمكن حفظ الكويز بدون إضافة سؤال واحد على الأقل!',
        400,
        ERROR_CODES.VALIDATION_ERROR_400
      );
    }

    if (dto.is_published === true) {
      const qCount = dto.questions !== undefined ? dto.questions.length : (assessment.questions?.length || 0);
      if (qCount === 0) {
        throw new AppError(
          'لا يمكن تفعيل ونشر كويز فارغ! يرجى إضافة سؤال واحد على الأقل قبل النشر.',
          400,
          ERROR_CODES.VALIDATION_ERROR_400
        );
      }
    }

    if (submissionsCount === 0) {
      // Scenario A: Zero submissions -> Full unrestricted edits
      if (dto.title_ar !== undefined) assessment.title_ar = dto.title_ar;
      if (dto.title_en !== undefined) assessment.title_en = dto.title_en;
      if (dto.curriculum !== undefined) assessment.curriculum = dto.curriculum as any;
      if (dto.grade_level !== undefined) assessment.grade_level = dto.grade_level as any;
      if (dto.academic_term !== undefined) assessment.academic_term = dto.academic_term as any;
      if (dto.assessment_type !== undefined) assessment.assessment_type = dto.assessment_type as any;
      if (dto.time_limit_minutes !== undefined) assessment.time_limit_minutes = dto.time_limit_minutes;
      if ((dto as any).pass_percentage !== undefined) assessment.pass_percentage = (dto as any).pass_percentage;
      if (dto.min_expected_solve_sec !== undefined) assessment.min_expected_solve_sec = dto.min_expected_solve_sec;
      if (dto.max_attempts !== undefined) assessment.max_attempts = dto.max_attempts;
      if (dto.available_from !== undefined) assessment.available_from = dto.available_from ? new Date(dto.available_from) : null;
      if (dto.available_until !== undefined) assessment.available_until = dto.available_until ? new Date(dto.available_until) : null;
      if (dto.graph_calculator !== undefined) assessment.graph_calculator = dto.graph_calculator as any;
      if ((dto as any).is_placement_test !== undefined) assessment.is_placement_test = (dto as any).is_placement_test;
      if (dto.xp_reward !== undefined) assessment.xp_reward = dto.xp_reward;
      if (dto.is_published !== undefined) assessment.is_published = dto.is_published;

      if (dto.questions) {
        const sanitizedQuestions = dto.questions.map((q) => ({
          ...q,
          youtube_solution_url: validateAndNormalizeYouTubeUrl(q.youtube_solution_url)
        }));
        assessment.questions = sanitizedQuestions as unknown as IQuestionItem[];
        assessment.total_points = sanitizedQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
        assessment.has_essay_questions = sanitizedQuestions.some((q) => q.question_type === 'ESSAY_PHOTO');
      }

      await assessment.save();
      assessmentAnswerKeyCache.delete(assessmentId);
      publicCmsCache.clear();
      return assessment;
    }

    // Scenario B: submissionsCount > 0 -> Students have already entered or submitted!
    let correctOptionIndexChanged = false;

    if (dto.questions) {
      // Guard against structural changes (adding or deleting questions)
      if (dto.questions.length !== assessment.questions.length) {
        throw new AppError(
          'Cannot add or remove questions because students have already entered or submitted this assessment',
          400,
          ERROR_CODES.ASSESSMENT_LOCKED_STRUCTURAL_CHANGE
        );
      }

      // Check per-question modifications
      for (let i = 0; i < dto.questions.length; i++) {
        const incomingQ = dto.questions[i];
        const currentQ = assessment.questions[i];
        if (!incomingQ || !currentQ) continue;

        if (incomingQ.question_type !== currentQ.question_type) {
          throw new AppError(
            'Cannot alter question type after student submissions have commenced',
            400,
            ERROR_CODES.ASSESSMENT_LOCKED_STRUCTURAL_CHANGE
          );
        }

        // Check if correct_option_index changed on MCQ
        if (
          incomingQ.question_type === 'MCQ' &&
          incomingQ.correct_option_index !== undefined &&
          incomingQ.correct_option_index !== currentQ.correct_option_index
        ) {
          correctOptionIndexChanged = true;
          currentQ.correct_option_index = incomingQ.correct_option_index;
        }

        // Allow non-breaking updates: typo fixes, image URLs, solution URLs, model answer
        if (incomingQ.question_text !== undefined) currentQ.question_text = incomingQ.question_text;
        if (incomingQ.question_image_url !== undefined) currentQ.question_image_url = incomingQ.question_image_url;
        if (incomingQ.question_image_size_kb !== undefined) currentQ.question_image_size_kb = incomingQ.question_image_size_kb;
        if (incomingQ.options !== undefined) currentQ.options = incomingQ.options;
        if (incomingQ.model_answer_text !== undefined) currentQ.model_answer_text = incomingQ.model_answer_text;
        if (incomingQ.youtube_solution_url !== undefined) {
          currentQ.youtube_solution_url = validateAndNormalizeYouTubeUrl(incomingQ.youtube_solution_url);
        }
      }
    }

    // Apply allowed metadata changes
    if (dto.title_ar !== undefined) assessment.title_ar = dto.title_ar;
    if (dto.title_en !== undefined) assessment.title_en = dto.title_en;
    if (dto.time_limit_minutes !== undefined) assessment.time_limit_minutes = dto.time_limit_minutes;
    if ((dto as any).pass_percentage !== undefined) assessment.pass_percentage = (dto as any).pass_percentage;
    if (dto.max_attempts !== undefined) assessment.max_attempts = dto.max_attempts;
    if (dto.available_from !== undefined) assessment.available_from = dto.available_from ? new Date(dto.available_from) : null;
    if (dto.available_until !== undefined) assessment.available_until = dto.available_until ? new Date(dto.available_until) : null;
    if (dto.graph_calculator !== undefined) assessment.graph_calculator = dto.graph_calculator as any;
    if (dto.is_published !== undefined) assessment.is_published = dto.is_published;

    await assessment.save();
    assessmentAnswerKeyCache.delete(assessmentId);
    publicCmsCache.clear();

    // Trigger atomic background re-grading pass if any MCQ answer key changed
    if (correctOptionIndexChanged) {
      await this.regradeExistingSubmissions(assessment);
    }

    return assessment;
  }

  /**
   * Executes fair automatic re-grading pass across all existing submissions.
   * Recalculates mcq_answers, mcq_auto_score, final_total_score, and adjusts student XP delta.
   */
  private async regradeExistingSubmissions(assessment: IAssessmentDocument): Promise<void> {
    const submissions = await SubmissionModel.find({ assessment_id: assessment._id });
    if (submissions.length === 0) return;

    // Create lookup map of questions
    const questionMap = new Map<string, IQuestionItem>();
    assessment.questions.forEach((q) => {
      questionMap.set((q._id as Types.ObjectId).toString(), q);
    });

    for (const sub of submissions) {
      let newMcqScore = 0;
      let answersModified = false;

      const updatedMcqAnswers: IMcqAnswer[] = sub.mcq_answers.map((ans) => {
        const q = questionMap.get(ans.question_id.toString());
        if (!q || q.question_type !== 'MCQ') return ans;

        const isCorrect = ans.selected_option_index === q.correct_option_index;
        const pointsEarned = isCorrect ? q.points : 0;

        if (ans.is_correct !== isCorrect || ans.points_earned !== pointsEarned) {
          answersModified = true;
        }

        newMcqScore += pointsEarned;
        return {
          question_id: ans.question_id,
          selected_option_index: ans.selected_option_index,
          is_correct: isCorrect,
          points_earned: pointsEarned
        };
      });

      if (answersModified || sub.mcq_auto_score !== newMcqScore) {
        const oldScore = sub.final_total_score;
        const newTotalScore = newMcqScore + sub.essay_manual_score;
        const scoreDelta = newTotalScore - oldScore;

        sub.mcq_answers = updatedMcqAnswers;
        sub.mcq_auto_score = newMcqScore;
        sub.final_total_score = newTotalScore;
        await sub.save();

        // Adjust student XP delta fairly if results were published
        if (sub.result_visibility === 'PUBLISHED_TO_STUDENT_AND_PARENT' && scoreDelta !== 0) {
          const xpAdjustment = Math.round((scoreDelta / assessment.total_points) * assessment.xp_reward);
          if (xpAdjustment !== 0) {
            await UserModel.findByIdAndUpdate(sub.student_id, {
              $inc: { total_xp: xpAdjustment }
            });

            await GamificationLogModel.create({
              student_id: sub.student_id,
              xp_delta: xpAdjustment,
              action_type: xpAdjustment > 0 ? 'TEACHER_BONUS' : 'TEACHER_PENALTY',
              reference_id: assessment._id,
              reason_note: `Auto-regrade adjustment on "${assessment.title_ar}" due to exam answer key update`
            });
          }
        }
      }
    }
  }

  /**
   * Starts an assessment attempt, creates an IN_PROGRESS submission, and returns the sanitized bundle.
   * Zero Answer Leakage Projection: strips correct_option_index, model_answer_text, youtube_solution_url.
   */
  async startAndCacheAssessment(
    studentId: string,
    userRole: UserRole,
    assessmentId: string,
    clientStartedAt?: string
  ): Promise<IStartAssessmentResponse> {
    const assessment = await AssessmentModel.findById(assessmentId);
    if (!assessment) {
      throw new AppError('Assessment not found', 404, ERROR_CODES.ASSESSMENT_NOT_FOUND_404);
    }

    if (!assessment.is_published && userRole !== ROLES.SUPER_ADMIN) {
      throw new AppError('This assessment is not currently available', 404, ERROR_CODES.ASSESSMENT_NOT_FOUND_404);
    }

    // Strict Grade-Level Isolation: Student can ONLY access and start exams for their exact grade_level
    if (userRole === ROLES.STUDENT) {
      const student = await UserModel.findById(studentId).select('grade_level curriculum');
      if (student && student.grade_level && assessment.grade_level && assessment.grade_level !== student.grade_level) {
        throw new AppError(
          'عذراً، هذا الاختبار مخصص لصف دراسي آخر فقط ولا يمكنك الوصول إليه.',
          403,
          ERROR_CODES.FORBIDDEN_403
        );
      }
    }

    // Availability dates check (Strict Window Enforcement - 403 Forbidden)
    const now = new Date();
    if (assessment.available_from && now < assessment.available_from) {
      throw new AppError('This assessment is not open yet', 403, ERROR_CODES.ASSESSMENT_NOT_STARTED_YET);
    }
    if (assessment.available_until && now > assessment.available_until) {
      throw new AppError('This assessment deadline has passed', 403, ERROR_CODES.ASSESSMENT_EXPIRED);
    }

    // Subscription authorization check for curriculum units
    if (!assessment.is_placement_test && assessment.unit_package_id) {
      if (userRole !== ROLES.SUPER_ADMIN) {
        const sub = await SubscriptionModel.findOne({
          student_id: new Types.ObjectId(studentId),
          unit_package_id: assessment.unit_package_id,
          subscription_status: 'ACTIVE'
        }).lean();

        if (!sub) {
          throw new AppError(
            'Active subscription required to access this assessment',
            403,
            ERROR_CODES.NO_ACTIVE_SUBSCRIPTION_403
          );
        }
      }
    }

    // Check if an IN_PROGRESS submission already exists for this student & assessment
    let submission = await SubmissionModel.findOne({
      assessment_id: assessment._id,
      student_id: new Types.ObjectId(studentId),
      sync_queue_status: 'IN_PROGRESS'
    });

    const timeLimitSec = (assessment.time_limit_minutes || 30) * 60 + 120; // 120s grace period

    if (submission) {
      const elapsedSec = (now.getTime() - submission.server_started_at.getTime()) / 1000;
      if (elapsedSec > timeLimitSec) {
        // Expired in-progress attempt -> finalize to SYNCED_ONLINE
        submission.sync_queue_status = 'SYNCED_ONLINE';
        submission.server_received_at = now;
        submission.elapsed_time_sec = timeLimitSec;
        await submission.save();
        submission = null;
      }
    }

    const serverStartedAt = new Date();

    if (!submission) {
      // Check maximum attempts (Strict Max Attempts Guard - 403 Forbidden)
      const completedAttempts = await SubmissionModel.countDocuments({
        assessment_id: assessment._id,
        student_id: new Types.ObjectId(studentId),
        sync_queue_status: 'SYNCED_ONLINE'
      });

      if (completedAttempts >= assessment.max_attempts && userRole !== ROLES.SUPER_ADMIN) {
        const lastCompleted = await SubmissionModel.findOne({
          assessment_id: assessment._id,
          student_id: new Types.ObjectId(studentId),
          sync_queue_status: 'SYNCED_ONLINE'
        }).sort({ attempt_number: -1, createdAt: -1 }).lean();

        throw new AppError(
          `Maximum attempts exceeded (${assessment.max_attempts} attempts allowed)`,
          403,
          ERROR_CODES.MAX_ATTEMPTS_EXCEEDED,
          {
            completedAttempts,
            maxAttempts: assessment.max_attempts,
            latestSubmissionId: lastCompleted ? lastCompleted._id.toString() : null
          }
        );
      }

      // Find the highest existing attempt number to prevent unique compound index collision
      const lastAttempt = await SubmissionModel.findOne({
        assessment_id: assessment._id,
        student_id: new Types.ObjectId(studentId)
      }).sort({ attempt_number: -1 }).lean();

      const nextAttemptNumber = lastAttempt ? lastAttempt.attempt_number + 1 : 1;

      // Create an IN_PROGRESS submission record with UUIDv4 idempotency key
      const idempotencyKey = crypto.randomUUID();

      submission = await SubmissionModel.create({
        idempotency_key: idempotencyKey,
        assessment_id: assessment._id,
        student_id: new Types.ObjectId(studentId),
        unit_package_id: assessment.unit_package_id ?? new Types.ObjectId(),
        attempt_number: nextAttemptNumber,
        is_offline_cached: false,
        sync_queue_status: 'IN_PROGRESS',
        offline_disconnect_count: 0,
        server_started_at: serverStartedAt,
        client_started_at: clientStartedAt ? new Date(clientStartedAt) : serverStartedAt,
        elapsed_time_sec: 0,
        is_suspicious_fast_solve: false,
        clock_tamper_detected: false,
        mcq_answers: [],
        uploaded_solution_imgs: [],
        result_visibility: 'HIDDEN_PENDING_TEACHER',
        mcq_auto_score: 0,
        essay_manual_score: 0,
        final_total_score: 0,
        custom_mistake_cases: []
      });
    }

    // Zero Answer Leakage Projection
    const sanitizedAssessment = await AssessmentModel.findById(assessmentId)
      .select('-questions.correct_option_index -questions.model_answer_text -questions.youtube_solution_url')
      .lean();

    return {
      assessment: (sanitizedAssessment as unknown) as Partial<IAssessmentDocument>,
      idempotencyKey: submission.idempotency_key,
      attemptNumber: submission.attempt_number,
      serverStartedAt: submission.server_started_at || serverStartedAt
    };
  }

  /**
   * Syncs and grades an assessment submission (500-Concurrent Request Spike Shield).
   * Reads from RAM LRU Cache (10m TTL), verifies anti-cheat monotonic timing,
   * performs auto-grading, and atomically saves the submission.
   */
  async syncSubmission(
    studentId: string,
    assessmentId: string,
    dto: SubmissionSyncDto
  ): Promise<ISyncSubmissionResponse> {
    // 1. RAM-First Cache Shield: Retrieve answer key from LRU cache
    let cachedPayload = assessmentAnswerKeyCache.get(assessmentId) as IExtendedAssessmentPayload | undefined;

    if (!cachedPayload) {
      const assessment = await AssessmentModel.findById(assessmentId)
        .select('+questions.correct_option_index')
        .lean();

      if (!assessment) {
        throw new AppError('Assessment not found', 404, ERROR_CODES.ASSESSMENT_NOT_FOUND_404);
      }

      cachedPayload = {
        assessmentId: assessment._id.toString(),
        assessmentType: assessment.assessment_type,
        minExpectedSolveSec: assessment.min_expected_solve_sec,
        timeLimitMinutes: assessment.time_limit_minutes || 30,
        totalPoints: assessment.total_points,
        xpReward: assessment.xp_reward,
        hasEssayQuestions: assessment.has_essay_questions,
        titleAr: assessment.title_ar,
        titleEn: assessment.title_en,
        questions: assessment.questions.map((q) => ({
          questionId: q._id ? (q._id as Types.ObjectId).toString() : '',
          questionType: q.question_type,
          correctOptionIndex: q.correct_option_index,
          points: q.points
        }))
      };

      assessmentAnswerKeyCache.set(assessmentId, cachedPayload);
    }

    // 2. Idempotency Check: Fetch submission
    let submission = await SubmissionModel.findOne({
      idempotency_key: dto.idempotency_key,
      student_id: new Types.ObjectId(studentId)
    });

    if (!submission) {
      submission = await SubmissionModel.findOne({
        student_id: new Types.ObjectId(studentId),
        assessment_id: new Types.ObjectId(assessmentId),
        sync_queue_status: 'IN_PROGRESS'
      }).sort({ attempt_number: -1 });
    }

    if (submission && submission.sync_queue_status === 'SYNCED_ONLINE') {
      // Idempotent terminal state: return existing results without double-grading or double-XP
      return {
        submissionId: submission._id.toString(),
        idempotencyKey: submission.idempotency_key,
        syncQueueStatus: 'SYNCED_ONLINE',
        resultVisibility: submission.result_visibility,
        mcqAutoScore: submission.mcq_auto_score,
        finalTotalScore: submission.final_total_score,
        isSuspiciousFastSolve: submission.is_suspicious_fast_solve,
        clockTamperDetected: submission.clock_tamper_detected,
        xpAwarded: 0
      };
    }

    const serverReceivedAt = new Date();
    const serverStartedAt = submission ? submission.server_started_at : new Date(dto.client_started_at);

    // 3. Monotonic Timing & Anti-Cheat Audit
    const timingAuditStrategy = new MonotonicTimingAuditStrategy();
    const auditResult = timingAuditStrategy.audit({
      elapsedTimeSec: dto.elapsed_time_sec,
      minExpectedSolveSec: cachedPayload.minExpectedSolveSec,
      serverStartedAt,
      serverReceivedAt,
      isOfflineSynced: dto.is_offline_cached
    });

    // 4. Auto-Grade MCQs via QuestionGraderFactory
    const questionLookup = new Map(cachedPayload.questions.map((q) => [q.questionId, q]));
    const mcqGrader = QuestionGraderFactory.getGrader('MCQ');

    let mcqAutoScore = 0;
    const gradedMcqAnswers: IMcqAnswer[] = dto.mcq_answers.map((ans) => {
      const q = questionLookup.get(ans.question_id);
      if (!q) {
        return {
          question_id: new Types.ObjectId(ans.question_id),
          selected_option_index: ans.selected_option_index,
          is_correct: false,
          points_earned: 0
        };
      }

      const gradeRes = mcqGrader.grade(q, { selectedOptionIndex: ans.selected_option_index });
      mcqAutoScore += gradeRes.pointsEarned;

      return {
        question_id: new Types.ObjectId(ans.question_id),
        selected_option_index: ans.selected_option_index,
        is_correct: gradeRes.isCorrect,
        points_earned: gradeRes.pointsEarned
      };
    });

    // 5. Result Visibility & Gamification Logic
    const hasEssayPhotos = dto.uploaded_solution_imgs && dto.uploaded_solution_imgs.length > 0;
    const requiresTeacherReview = cachedPayload.hasEssayQuestions || hasEssayPhotos;

    let resultVisibility: 'HIDDEN_PENDING_TEACHER' | 'PUBLISHED_TO_STUDENT_AND_PARENT';
    let xpAwarded = 0;

    if (requiresTeacherReview) {
      resultVisibility = 'HIDDEN_PENDING_TEACHER';
      // Record submission in BatchAlertService to aggregate teacher alerts (every 5 submissions)
      await BatchAlertService.recordSubmissionForGrading({
        assessmentId: new Types.ObjectId(assessmentId),
        assessmentTitleAr: cachedPayload.titleAr,
        assessmentTitleEn: cachedPayload.titleEn
      });
    } else {
      resultVisibility = 'PUBLISHED_TO_STUDENT_AND_PARENT';

      // Pure MCQ Quiz -> Instant XP Award with anti-cheat guard
      const scorePercentage = cachedPayload.totalPoints > 0 ? (mcqAutoScore / cachedPayload.totalPoints) * 100 : 0;
      const xpStrategy = new QuizPassedXpStrategy();
      xpAwarded = xpStrategy.calculateDelta({
        baseXpReward: cachedPayload.xpReward,
        scorePercentage,
        isSuspiciousFastSolve: auditResult.isSuspiciousFastSolve,
        clockTamperDetected: auditResult.clockTamperDetected
      });

      if (xpAwarded > 0) {
        await UserModel.findByIdAndUpdate(studentId, {
          $inc: { total_xp: xpAwarded }
        });

        await GamificationLogModel.create({
          student_id: new Types.ObjectId(studentId),
          xp_delta: xpAwarded,
          action_type: 'QUIZ_PASSED',
          reference_id: new Types.ObjectId(assessmentId),
          reason_note: `Completed quiz "${cachedPayload.titleAr}"`
        });
      }
    }

    const finalTotalScore = mcqAutoScore; // essay_manual_score = 0 until reviewed

    // 6. Atomic Save / Upsert Submission
    if (submission) {
      submission.sync_queue_status = 'SYNCED_ONLINE';
      submission.reconnect_sync_at = dto.is_offline_cached ? new Date() : null;
      submission.offline_disconnect_count = dto.offline_disconnect_count;
      submission.client_submitted_at = new Date(dto.client_submitted_at);
      submission.server_received_at = serverReceivedAt;
      submission.elapsed_time_sec = dto.elapsed_time_sec;
      submission.is_suspicious_fast_solve = auditResult.isSuspiciousFastSolve;
      submission.clock_tamper_detected = auditResult.clockTamperDetected;
      submission.mcq_answers = gradedMcqAnswers;
      submission.uploaded_solution_imgs = dto.uploaded_solution_imgs.map((img) => ({
        question_id: img.question_id ? new Types.ObjectId(img.question_id) : undefined,
        image_url: img.image_url,
        size_kb: img.size_kb,
        rotation_deg: img.rotation_deg ?? 0
      }));
      submission.idempotency_key = dto.idempotency_key || submission.idempotency_key;
      submission.result_visibility = resultVisibility;
      submission.mcq_auto_score = mcqAutoScore;
      submission.final_total_score = finalTotalScore;
      await submission.save();
    } else {
      const lastAttempt = await SubmissionModel.findOne({
        student_id: new Types.ObjectId(studentId),
        assessment_id: new Types.ObjectId(assessmentId)
      }).sort({ attempt_number: -1 });

      const nextAttemptNumber = lastAttempt ? lastAttempt.attempt_number + 1 : 1;

      submission = await SubmissionModel.create({
        idempotency_key: dto.idempotency_key,
        assessment_id: new Types.ObjectId(assessmentId),
        student_id: new Types.ObjectId(studentId),
        unit_package_id: new Types.ObjectId(),
        attempt_number: nextAttemptNumber,
        is_offline_cached: dto.is_offline_cached,
        sync_queue_status: 'SYNCED_ONLINE',
        reconnect_sync_at: dto.is_offline_cached ? new Date() : null,
        offline_disconnect_count: dto.offline_disconnect_count,
        server_started_at: serverStartedAt,
        client_started_at: new Date(dto.client_started_at),
        client_submitted_at: new Date(dto.client_submitted_at),
        server_received_at: serverReceivedAt,
        elapsed_time_sec: dto.elapsed_time_sec,
        is_suspicious_fast_solve: auditResult.isSuspiciousFastSolve,
        clock_tamper_detected: auditResult.clockTamperDetected,
        mcq_answers: gradedMcqAnswers,
        uploaded_solution_imgs: dto.uploaded_solution_imgs.map((img) => ({
          question_id: img.question_id ? new Types.ObjectId(img.question_id) : undefined,
          image_url: img.image_url,
          size_kb: img.size_kb,
          rotation_deg: img.rotation_deg ?? 0
        })),
        result_visibility: resultVisibility,
        mcq_auto_score: mcqAutoScore,
        essay_manual_score: 0,
        final_total_score: finalTotalScore,
        custom_mistake_cases: []
      });
    }

    return {
      submissionId: submission._id.toString(),
      idempotencyKey: submission.idempotency_key,
      syncQueueStatus: 'SYNCED_ONLINE',
      resultVisibility: submission.result_visibility,
      mcqAutoScore,
      finalTotalScore,
      isSuspiciousFastSolve: auditResult.isSuspiciousFastSolve,
      clockTamperDetected: auditResult.clockTamperDetected,
      xpAwarded
    };
  }

  /**
   * Deletes an assessment and decrements quizzes_count on parent unit package
   */
  async deleteAssessment(assessmentId: string): Promise<void> {
    const assessment = await AssessmentModel.findByIdAndDelete(assessmentId);
    if (!assessment) {
      throw new AppError('Assessment not found', 404, ERROR_CODES.ASSESSMENT_NOT_FOUND_404);
    }

    if (assessment.unit_package_id) {
      await UnitPackageModel.findByIdAndUpdate(assessment.unit_package_id, {
        $inc: { quizzes_count: -1 }
      });
    }

    assessmentAnswerKeyCache.delete(assessmentId);
    publicCmsCache.clear();
  }

  /**
   * Lists assessments with optional filters and strict grade-level isolation for students
   */
  async getAssessments(query: {
    unitPackageId?: string;
    curriculum?: string;
    gradeLevel?: string;
    academicTerm?: string;
    isPublished?: boolean;
    studentId?: string;
  }, isSuperAdmin = false): Promise<Partial<IAssessmentDocument>[]> {
    const filter: Record<string, any> = {};

    if (query.studentId && !isSuperAdmin) {
      if (Types.ObjectId.isValid(query.studentId)) {
        const student = await UserModel.findById(query.studentId).select('grade_level curriculum');
        if (student && student.grade_level) {
          // Force the student's grade level and curriculum so they can NEVER see other grades' quizzes
          filter.grade_level = student.grade_level;
          if (student.curriculum) {
            filter.curriculum = student.curriculum;
          }
        }
      }
    } else {
      if (query.gradeLevel) filter.grade_level = query.gradeLevel;
      if (query.curriculum) filter.curriculum = query.curriculum;
    }

    if (query.unitPackageId && Types.ObjectId.isValid(query.unitPackageId)) {
      filter.unit_package_id = new Types.ObjectId(query.unitPackageId);
    }
    if (query.academicTerm) {
      filter.$or = [
        { academic_term: query.academicTerm },
        { academic_term: { $exists: false } },
        { academic_term: null },
        { academic_term: 'ALL_TERMS' }
      ];
    }
    if (!isSuperAdmin) filter.is_published = true;

    const queryBuilder = AssessmentModel.find(filter).sort({ createdAt: -1 });

    if (!isSuperAdmin) {
      queryBuilder.select('-questions.correct_option_index -questions.model_answer_text -questions.youtube_solution_url');
      return (await queryBuilder.lean()) as any;
    }

    const assessmentDocs = await queryBuilder.lean();
    if (assessmentDocs.length === 0) return [];

    const assessmentIds = assessmentDocs.map((a: any) => a._id);
    const counts = await SubmissionModel.aggregate([
      { $match: { assessment_id: { $in: assessmentIds } } },
      { $group: { _id: '$assessment_id', count: { $sum: 1 } } }
    ]);
    const countMap = new Map(counts.map((c: any) => [c._id.toString(), c.count]));

    return assessmentDocs.map((a: any) => ({
      ...a,
      submissions_count: countMap.get(a._id.toString()) || 0
    })) as any;
  }

  /**
   * Fetches single assessment by ID with answer key protection and grade isolation
   */
  async getAssessmentById(id: string, isSuperAdmin = false, studentId?: string): Promise<any> {
    const queryBuilder = AssessmentModel.findById(id);

    if (isSuperAdmin) {
      queryBuilder.select('+questions.correct_option_index');
    } else {
      queryBuilder.select('-questions.correct_option_index -questions.model_answer_text -questions.youtube_solution_url');
    }

    const assessment = await queryBuilder.lean();
    if (!assessment) {
      throw new AppError('Assessment not found', 404, ERROR_CODES.ASSESSMENT_NOT_FOUND_404);
    }

    if (studentId && !isSuperAdmin) {
      const student = await UserModel.findById(studentId).select('grade_level curriculum');
      if (student && student.grade_level && assessment.grade_level && assessment.grade_level !== student.grade_level) {
        throw new AppError('عذراً، هذا الاختبار مخصص لصف دراسي آخر فقط ولا يمكنك الوصول إليه.', 403, ERROR_CODES.FORBIDDEN_403);
      }
    }

    return assessment as any;
  }

  /**
   * Retrieves full submission feedback for student or parent.
   * Resolves by submission._id OR latest submission for assessment_id.
   * If result is published, includes full question details, student answer, correct answer,
   * YouTube solution URLs, teacher notes, and custom mistake cases.
   */
  async getSubmissionFeedback(userId: string, userRole: string, id: string) {
    let submission: any = null;

    if (Types.ObjectId.isValid(id)) {
      submission = await SubmissionModel.findById(id)
        .populate('assessment_id')
        .populate('unit_package_id', 'title_ar title_en');
    }

    if (!submission && Types.ObjectId.isValid(id)) {
      // Fallback: check if id is assessmentId
      submission = await SubmissionModel.findOne({
        student_id: new Types.ObjectId(userId),
        assessment_id: new Types.ObjectId(id)
      })
        .sort({ attempt_number: -1, createdAt: -1 })
        .populate('assessment_id')
        .populate('unit_package_id', 'title_ar title_en');
    }

    if (!submission) {
      throw new AppError('Submission not found', 404, ERROR_CODES.NOT_FOUND_404);
    }

    // Role check: Student can only view their own; Parent can only view their child's; Super Admin can view all
    if (userRole === ROLES.STUDENT && submission.student_id.toString() !== userId) {
      throw new AppError('Unauthorized to view this submission', 403, ERROR_CODES.FORBIDDEN_403);
    }
    if (userRole === ROLES.PARENT) {
      const parentUser = await UserModel.findById(userId).lean();
      const studentUser = await UserModel.findById(submission.student_id).lean();
      const parentPhone = parentUser?.phone || (parentUser as any)?.phone_number;
      if (!parentUser || !studentUser || studentUser.parent_phone !== parentPhone) {
        throw new AppError('Unauthorized to view this child submission', 403, ERROR_CODES.FORBIDDEN_403);
      }
    }

    const assessment = submission.assessment_id;
    const unitPackage = submission.unit_package_id;
    const totalPoints = assessment ? assessment.total_points : 0;
    const isPublished = submission.result_visibility === 'PUBLISHED_TO_STUDENT_AND_PARENT';
    const scorePercentage = totalPoints > 0 ? Math.round((submission.final_total_score / totalPoints) * 100) : 0;
    // Fetch full assessment with correct options and solution URLs
    const fullAssessment = await AssessmentModel.findById(assessment._id).select('+questions.correct_option_index +questions.youtube_solution_url').lean();
    const questions = fullAssessment?.questions || [];
    const questionMap = new Map(questions.map((q: any) => [q._id.toString(), q]));

    const mcqAnswersMap = new Map<string, any>(
      (submission.mcq_answers || []).map((ans: any) => [ans.question_id.toString(), ans])
    );

    const mistakeCases: any[] = [];

    // 1. Check all MCQ questions for mistakes or unanswered
    questions.forEach((q: any, idx: number) => {
      if (q.question_type === 'MCQ') {
        const studentAns: any = mcqAnswersMap.get(q._id.toString());
        const isCorrect = studentAns ? studentAns.is_correct : false;

        if (!isCorrect) {
          const selectedIdx = studentAns ? studentAns.selected_option_index : null;
          const selectedText = selectedIdx !== null && selectedIdx !== undefined && q.options[selectedIdx]
            ? q.options[selectedIdx]
            : 'لم تتم الإجابة';
          const correctText = q.correct_option_index !== undefined && q.options[q.correct_option_index]
            ? q.options[q.correct_option_index]
            : '';

          mistakeCases.push({
            questionId: q._id.toString(),
            questionOrder: idx + 1,
            questionPromptText: q.question_text || `السؤال رقم ${idx + 1}`,
            studentAnswerText: selectedText,
            correctAnswerText: correctText,
            errorNote: `إجابة غير صحيحة. الإجابة الصحيحة هي: "${correctText}"`,
            youtubeSolutionUrl: q.youtube_solution_url || null
          });
        }
      }
    });

    // 2. Add teacher's custom mistake cases (for essay or specific questions)
    (submission.custom_mistake_cases || []).forEach((c: any, cIdx: number) => {
      const q = c.question_id ? questionMap.get(c.question_id.toString()) : null;
      mistakeCases.push({
        questionId: c.question_id ? c.question_id.toString() : undefined,
        questionOrder: q ? questions.findIndex((x: any) => x._id.toString() === c.question_id.toString()) + 1 : (c.question_order || questions.length + cIdx + 1),
        questionPromptText: q ? q.question_text : (c.question_prompt_text || 'ملاحظة تصحيح مسألة مقالية'),
        studentAnswerText: '',
        correctAnswerText: '',
        errorNote: c.error_note,
        youtubeSolutionUrl: c.youtube_solution_url || (q ? q.youtube_solution_url : null)
      });
    });

    // 3. Build full review of ALL questions (correct and incorrect) for student review
    const questionsReview: any[] = [];
    questions.forEach((q: any, idx: number) => {
      const isMcq = q.question_type === 'MCQ';
      const studentAns: any = isMcq ? mcqAnswersMap.get(q._id.toString()) : null;
      const isCorrect = isMcq ? (studentAns ? !!studentAns.is_correct : false) : false;
      const selectedIdx = studentAns ? studentAns.selected_option_index : null;
      const selectedText = selectedIdx !== null && selectedIdx !== undefined && q.options && q.options[selectedIdx]
        ? q.options[selectedIdx]
        : (isMcq ? 'لم تتم الإجابة' : '');
      const correctText = isPublished && q.correct_option_index !== undefined && q.options && q.options[q.correct_option_index]
        ? q.options[q.correct_option_index]
        : '';

      const customNote = (submission.custom_mistake_cases || []).find(
        (c: any) => c.question_id && c.question_id.toString() === q._id.toString()
      );

      questionsReview.push({
        questionId: q._id.toString(),
        questionOrder: idx + 1,
        questionType: q.question_type,
        questionText: q.question_text || `السؤال رقم ${idx + 1}`,
        questionImageUrl: q.question_image_url || null,
        options: q.options || [],
        studentSelectedOptionIndex: selectedIdx,
        studentAnswerText: selectedText,
        correctOptionIndex: isPublished ? q.correct_option_index : undefined,
        correctAnswerText: correctText,
        isCorrect: isMcq ? isCorrect : undefined,
        points: q.points || 1,
        awardedPoints: isMcq ? (isCorrect ? (q.points || 1) : 0) : undefined,
        youtubeSolutionUrl: isPublished ? (q.youtube_solution_url || customNote?.youtube_solution_url || null) : null,
        teacherNote: customNote ? customNote.error_note : null
      });
    });

    const essaySolutionImages = (submission.uploaded_solution_imgs || []).map((img: any) => ({
      imageUrl: img.image_url,
      rotationDeg: img.rotation_deg || 0,
      sizeKb: img.size_kb
    }));

    return {
      submissionId: submission._id.toString(),
      assessmentId: assessment ? assessment._id.toString() : '',
      assessmentTitleAr: assessment ? assessment.title_ar : 'تقييم تدريبي',
      assessmentTitleEn: assessment ? assessment.title_en : 'Assessment',
      unitTitleAr: unitPackage ? unitPackage.title_ar : 'الوحدة الدراسية',
      resultVisibility: submission.result_visibility,
      mcqAutoScore: submission.mcq_auto_score,
      essayManualScore: submission.essay_manual_score,
      finalTotalScore: submission.final_total_score,
      maxScore: totalPoints,
      scorePercentage,
      gradedAt: submission.graded_at ? submission.graded_at.toISOString() : (submission.createdAt ? submission.createdAt.toISOString() : ''),
      teacherFeedbackNotes: submission.teacher_feedback_notes || '',
      customMistakeCases: mistakeCases,
      questionsReview,
      essaySolutionImages
    };
  }

  /**
   * Retrieves all completed / in-progress submissions for the authenticated student
   * GET /api/v1/assessments/my-submissions
   */
  async getMySubmissions(studentId: string) {
    const submissions = await SubmissionModel.find({
      student_id: new Types.ObjectId(studentId),
      sync_queue_status: { $in: ['SYNCED_ONLINE', 'IN_PROGRESS'] }
    })
      .populate('assessment_id')
      .populate('unit_package_id', 'title_ar title_en')
      .sort({ createdAt: -1 })
      .lean();

    return submissions.map((sub: any) => {
      const assessment = sub.assessment_id;
      const unit = sub.unit_package_id;
      const totalPoints = assessment ? assessment.total_points : 0;
      const isPublished = sub.result_visibility === 'PUBLISHED_TO_STUDENT_AND_PARENT';
      const score = isPublished ? sub.final_total_score : 0;
      const percentage = (totalPoints > 0 && isPublished) ? Math.round((sub.final_total_score / totalPoints) * 100) : 0;
      const isPending = sub.result_visibility === 'HIDDEN_PENDING_TEACHER';

      let gradeLabelAr = 'قيد التصحيح';
      if (isPublished) {
        if (percentage >= 85) gradeLabelAr = 'ممتاز (Mastery)';
        else if (percentage >= 65) gradeLabelAr = 'جيد جداً (Proficient)';
        else if (percentage >= 50) gradeLabelAr = 'جيد (Developing)';
        else gradeLabelAr = 'يحتاج لمراجعة';
      }

      const formattedDate = sub.graded_at
        ? new Date(sub.graded_at).toLocaleDateString('ar-EG', { dateStyle: 'medium' })
        : (sub.createdAt ? new Date(sub.createdAt).toLocaleDateString('ar-EG', { dateStyle: 'medium' }) : '');

      return {
        id: sub._id.toString(),
        submissionId: sub._id.toString(),
        assessmentId: assessment ? assessment._id.toString() : '',
        titleAr: assessment ? assessment.title_ar : 'تقييم دراسي',
        unitTitleAr: unit ? unit.title_ar : (assessment?.title_ar || 'الوحدة الدراسية'),
        score,
        maxScore: totalPoints,
        percentage,
        gradeLabelAr,
        status: isPending ? 'PENDING_REVIEW' : (isPublished ? 'PUBLISHED' : sub.result_visibility),
        gradedBy: 'م/ هبة عبدالوهاب',
        gradedDateAr: formattedDate,
        feedbackUrl: `/student/submissions/${sub._id}/feedback`
      };
    });
  }
}

