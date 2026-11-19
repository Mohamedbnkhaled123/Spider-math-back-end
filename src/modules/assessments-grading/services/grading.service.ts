import { Types } from 'mongoose';
import { SubmissionModel, ISubmissionDocument, IEssayAnswer } from '../../../models/submission.model';
import { AssessmentModel, IAssessmentDocument } from '../../../models/assessment.model';
import { UserModel, IUserDocument } from '../../../models/user.model';
import { NotificationModel } from '../../../models/notification.model';
import { GamificationLogModel } from '../../../models/gamification-log.model';
import { NotificationFactory } from '../../../common/factories/notification.factory';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { ROLES } from '../../../common/constants/roles.constant';
import { GradeSubmissionDto } from '../dto/grade-submission.dto';
import { validateAndNormalizeYouTubeUrl } from '../utils/youtube-url.util';
import { HomeworkGradedXpStrategy, QuizPassedXpStrategy } from '../strategies/xp-calculation.strategy';

export interface IPendingSubmissionsQuery {
  assessmentId?: string;
  page?: number;
  limit?: number;
}

export interface IAllSubmissionsQuery {
  assessmentId?: string;
  curriculum?: string;
  country?: string;
  intlDivision?: string;
  gradeLevel?: string;
  academicTerm?: string;
  status?: string; // 'ALL' | 'PENDING' | 'PUBLISHED' | 'IN_PROGRESS'
  search?: string;
  includeHidden?: boolean;
  page?: number;
  limit?: number;
}

const INTL_DIVISION_GRADES: Record<string, readonly string[]> = {
  AMERICAN_CURRICULUM: [
    'US_GRADE_1', 'US_GRADE_2', 'US_GRADE_3', 'US_GRADE_4',
    'US_GRADE_5', 'US_GRADE_6', 'US_GRADE_7', 'US_GRADE_8',
    'US_GRADE_9', 'US_GRADE_10', 'US_GRADE_11', 'US_GRADE_12'
  ],
  BRITISH_CURRICULUM: [
    'IGCSE_YEAR_1', 'IGCSE_YEAR_2', 'IGCSE_YEAR_3', 'IGCSE_YEAR_4',
    'IGCSE_YEAR_5', 'IGCSE_YEAR_6', 'IGCSE_YEAR_7', 'IGCSE_YEAR_8',
    'IGCSE_YEAR_9', 'IGCSE_YEAR_10', 'IGCSE_YEAR_11', 'IGCSE_YEAR_12',
    'IGCSE_YEAR_13', 'IGCSE_OL', 'IGCSE_AS', 'IGCSE_AL'
  ]
};

function expandCountryFilterVariants(raw: string): string[] {
  const code = raw.trim().toUpperCase();
  if (code === 'SA' || code === 'KSA') return ['SA', 'sa', 'KSA', 'Saudi Arabia', 'السعودية'];
  if (code === 'QA' || code === 'QAT') return ['QA', 'qa', 'QAT', 'Qatar', 'قطر'];
  if (code === 'AE' || code === 'UAE') return ['AE', 'ae', 'UAE', 'United Arab Emirates', 'الإمارات'];
  if (code === 'KW' || code === 'KWT') return ['KW', 'kw', 'KWT', 'Kuwait', 'الكويت'];
  if (code === 'EG') return ['EG', 'eg', 'Egypt', 'مصر'];
  return [raw.trim(), code];
}

export class GradingService {
  /**
   * Lists all submissions with comprehensive filtering (GET /api/v1/admin/submissions).
   * Supports filtering by assessment, curriculum, country, international division, grade, term, status, search, and returns analytics.
   */
  async getAllSubmissions(query: IAllSubmissionsQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 200));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (!query.includeHidden) {
      filter.hidden_from_teacher = { $ne: true };
    }
    const andConditions: Record<string, unknown>[] = [];

    if (query.assessmentId) {
      filter.assessment_id = new Types.ObjectId(query.assessmentId);
    }

    if (query.status === 'PENDING') {
      filter.result_visibility = 'HIDDEN_PENDING_TEACHER';
      filter.sync_queue_status = 'SYNCED_ONLINE';
    } else if (query.status === 'PUBLISHED') {
      filter.result_visibility = 'PUBLISHED_TO_STUDENT_AND_PARENT';
      filter.sync_queue_status = 'SYNCED_ONLINE';
    } else if (query.status === 'IN_PROGRESS') {
      filter.sync_queue_status = 'IN_PROGRESS';
    }

    // Filter by student properties (country, search)
    const cleanCountry = query.country && query.country !== 'ALL' ? query.country.trim() : '';
    const cleanSearch = query.search && query.search.trim() ? query.search.trim() : '';
    if (cleanCountry || cleanSearch) {
      const studentFilter: Record<string, unknown> = { role: ROLES.STUDENT };
      if (cleanCountry) {
        studentFilter.country = { $in: expandCountryFilterVariants(cleanCountry) };
      }
      if (cleanSearch) {
        studentFilter.$or = [
          { full_name: { $regex: cleanSearch, $options: 'i' } },
          { student_code: { $regex: cleanSearch, $options: 'i' } },
          { phone_number: { $regex: cleanSearch, $options: 'i' } },
          { phone: { $regex: cleanSearch, $options: 'i' } }
        ];
      }
      const matchingStudents = await UserModel.find(studentFilter).select('_id').lean();
      andConditions.push({ student_id: { $in: matchingStudents.map((s) => s._id) } });
    }

    // Filter by academic categorization hierarchy (curriculum, international division, gradeLevel, academicTerm)
    const cleanCurriculum = query.curriculum && query.curriculum !== 'ALL' ? query.curriculum.trim() : '';
    const cleanDivision = query.intlDivision && query.intlDivision !== 'ALL' ? query.intlDivision.trim() : '';
    const cleanGrade = query.gradeLevel && query.gradeLevel !== 'ALL' ? query.gradeLevel.trim() : '';
    const cleanTerm = query.academicTerm && query.academicTerm !== 'ALL' ? query.academicTerm.trim() : '';

    if ((cleanCurriculum || cleanDivision || cleanGrade || cleanTerm) && !query.assessmentId) {
      const assessmentFilter: Record<string, unknown> = {};
      if (cleanCurriculum) {
        assessmentFilter.curriculum = cleanCurriculum;
      }
      if (cleanGrade) {
        assessmentFilter.grade_level = cleanGrade;
      } else if (cleanDivision && INTL_DIVISION_GRADES[cleanDivision]) {
        assessmentFilter.grade_level = { $in: INTL_DIVISION_GRADES[cleanDivision] };
      }
      if (cleanTerm) {
        assessmentFilter.academic_term = cleanTerm;
      }
      const matchingAsms = await AssessmentModel.find(assessmentFilter).select('_id').lean();
      andConditions.push({ assessment_id: { $in: matchingAsms.map((a) => a._id) } });
    }

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    const [submissions, total, totalPending, totalPublished, totalInProgress, hiddenCount] = await Promise.all([
      SubmissionModel.find(filter)
        .populate<{ student_id: IUserDocument }>('student_id', 'full_name student_code phone phone_number parent_phone curriculum grade_level academic_term country governorate email')
        .populate<{ assessment_id: IAssessmentDocument }>(
          'assessment_id',
          'title_ar title_en total_points assessment_type curriculum grade_level academic_term questions has_essay_questions xp_reward'
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SubmissionModel.countDocuments(filter),
      SubmissionModel.countDocuments({ result_visibility: 'HIDDEN_PENDING_TEACHER', sync_queue_status: 'SYNCED_ONLINE', hidden_from_teacher: { $ne: true } }),
      SubmissionModel.countDocuments({ result_visibility: 'PUBLISHED_TO_STUDENT_AND_PARENT', sync_queue_status: 'SYNCED_ONLINE', hidden_from_teacher: { $ne: true } }),
      SubmissionModel.countDocuments({ sync_queue_status: 'IN_PROGRESS', hidden_from_teacher: { $ne: true } }),
      SubmissionModel.countDocuments({ hidden_from_teacher: true })
    ]);

    return {
      submissions,
      stats: {
        totalSubmissions: total,
        pendingReviewCount: totalPending,
        publishedCount: totalPublished,
        inProgressCount: totalInProgress,
        hiddenCount
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Lists submissions pending manual teacher review (GET /api/v1/admin/submissions/pending-review).
   * Populates student demographic identity and assessment questions.
   */
  async getPendingSubmissions(query: IPendingSubmissionsQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      result_visibility: 'HIDDEN_PENDING_TEACHER',
      sync_queue_status: 'SYNCED_ONLINE',
      hidden_from_teacher: { $ne: true }
    };

    if (query.assessmentId) {
      filter.assessment_id = new Types.ObjectId(query.assessmentId);
    }

    const [submissions, total] = await Promise.all([
      SubmissionModel.find(filter)
        .populate<{ student_id: IUserDocument }>('student_id', 'full_name student_code phone phone_number curriculum grade_level academic_term country')
        .populate<{ assessment_id: IAssessmentDocument }>(
          'assessment_id',
          'title_ar title_en total_points assessment_type curriculum grade_level academic_term questions has_essay_questions xp_reward'
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SubmissionModel.countDocuments(filter)
    ]);

    return {
      submissions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Grades a student submission (POST /api/v1/admin/submissions/:id/grade).
   * Allows Eng. Heba Abdel-Wahab to record manual essay scores, written feedback notes,
   * and custom mistake cases with unprotected YouTube solution URLs (Zero Image Bloat).
   * Flips result_visibility to PUBLISHED_TO_STUDENT_AND_PARENT, awards XP, and dispatches notifications.
   */
  async gradeSubmission(_adminId: string, submissionId: string, dto: GradeSubmissionDto): Promise<ISubmissionDocument> {
    const cleanId = String(submissionId || '').trim();
    if (!cleanId || !Types.ObjectId.isValid(cleanId)) {
      throw new AppError('Invalid submission ID format', 400, ERROR_CODES.BAD_REQUEST_400);
    }
    const submission = await SubmissionModel.findById(cleanId);
    if (!submission) {
      throw new AppError('Submission not found', 404, ERROR_CODES.NOT_FOUND_404);
    }

    const assessment = await AssessmentModel.findById(submission.assessment_id);
    if (!assessment) {
      throw new AppError('Associated assessment not found', 404, ERROR_CODES.ASSESSMENT_NOT_FOUND_404);
    }

    const student = await UserModel.findById(submission.student_id);
    if (!student) {
      throw new AppError('Student account not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }

    // Sanitize custom mistake cases: strictly text note + unprotected YouTube solution URL
    const sanitizedMistakes = dto.custom_mistake_cases.map((c) => ({
      question_id: c.question_id && Types.ObjectId.isValid(c.question_id) ? new Types.ObjectId(c.question_id) : undefined,
      error_note: (c.error_note || '').trim(),
      youtube_solution_url: validateAndNormalizeYouTubeUrl(c.youtube_solution_url)
    }));

    // Calculate total auto score dynamically from all auto-graded questions (MCQ + Text answers)
    const mcqPoints = (submission.mcq_answers || []).reduce((sum, a) => sum + (Number(a.points_earned) || 0), 0);
    const textPoints = (submission.text_answers || []).reduce((sum, a) => sum + (Number(a.points_earned) || 0), 0);
    const hasAutoAnswers = (submission.mcq_answers && submission.mcq_answers.length > 0) ||
                           (submission.text_answers && submission.text_answers.length > 0);
    const totalAutoScore = hasAutoAnswers
      ? (mcqPoints + textPoints)
      : (Number(submission.mcq_auto_score) || 0);

    let essayScore = Math.round((Number(dto.essay_manual_score) || 0) * 100) / 100;
    if (dto.essay_answers && dto.essay_answers.length > 0) {
      const existingMap = new Map<string, IEssayAnswer>();
      for (const ea of submission.essay_answers || []) {
        if (ea.question_id) {
          existingMap.set(ea.question_id.toString(), {
            question_id: ea.question_id,
            points_earned: Number(ea.points_earned) || 0,
            decision: ea.decision || null,
            teacher_note: ea.teacher_note || ''
          });
        }
      }
      for (const eq of dto.essay_answers) {
        const validQId = Types.ObjectId.isValid(eq.question_id)
          ? new Types.ObjectId(eq.question_id)
          : ((assessment.questions?.[0]?._id as Types.ObjectId) || new Types.ObjectId());
        const key = validQId.toString();
        existingMap.set(key, {
          question_id: validQId,
          points_earned: Number(eq.points_earned) || 0,
          decision: eq.decision || null,
          teacher_note: eq.teacher_note || ''
        });
      }
      submission.essay_answers = Array.from(existingMap.values());
      const fromAnswers = submission.essay_answers.reduce(
        (sum: number, ea: any) => sum + (Number(ea.points_earned) || 0),
        0
      );
      // Authoritative sum of per-question essay grades (preserves 0.5 half-points & downward adjustments)
      essayScore = Math.round(fromAnswers * 100) / 100;
    } else if (submission.essay_answers && submission.essay_answers.length > 0 && (dto.essay_manual_score === undefined || dto.essay_manual_score === null)) {
      const fromAnswers = submission.essay_answers.reduce(
        (sum: number, ea: any) => sum + (Number(ea.points_earned) || 0),
        0
      );
      essayScore = Math.round(fromAnswers * 100) / 100;
    }

    const finalTotalScore = Math.round((totalAutoScore + essayScore) * 100) / 100;

    submission.mcq_auto_score = totalAutoScore;
    submission.essay_manual_score = essayScore;
    submission.final_total_score = finalTotalScore;
    submission.teacher_feedback_notes = dto.teacher_feedback_notes;
    submission.custom_mistake_cases = sanitizedMistakes;

    // Defensive guards for legacy or offline submissions
    if (!submission.server_started_at) {
      submission.server_started_at = (submission as any).createdAt || new Date();
    }
    if (!submission.client_started_at) {
      submission.client_started_at = submission.server_started_at;
    }
    if (Array.isArray(submission.uploaded_solution_imgs)) {
      submission.uploaded_solution_imgs.forEach((img: any) => {
        if (img.question_id && !Types.ObjectId.isValid(img.question_id)) {
          img.question_id = undefined;
        }
      });
    }

    const essayQuestions = (assessment.questions || []).filter((q: any) => q.question_type === 'ESSAY_PHOTO');
    const totalEssayCount = essayQuestions.length;

    let shouldPublish = false;
    if (dto.publish !== undefined) {
      shouldPublish = dto.publish;
    } else if (dto.essay_answers && dto.essay_answers.length > 0 && totalEssayCount > 0) {
      shouldPublish = (submission.essay_answers || []).length >= totalEssayCount;
    } else {
      shouldPublish = true;
    }

    if (shouldPublish) {
      submission.result_visibility = 'PUBLISHED_TO_STUDENT_AND_PARENT';
      submission.graded_at = new Date();
    }

    await submission.save({ validateModifiedOnly: true });

    if (shouldPublish) {
      try {
        // Calculate & award XP if not already awarded
        const existingXpLog = await GamificationLogModel.findOne({
          student_id: student._id,
          reference_id: submission._id
        });

        if (!existingXpLog) {
          const scorePercentage = assessment.total_points > 0 ? (finalTotalScore / assessment.total_points) * 100 : 0;
          const xpStrategy = new HomeworkGradedXpStrategy();
          const xpToAward = xpStrategy.calculateDelta({
            baseXpReward: Number(assessment.xp_reward) || 30,
            scorePercentage
          });

          if (xpToAward > 0 && !isNaN(xpToAward)) {
            await UserModel.findByIdAndUpdate(student._id, {
              $inc: { total_xp: xpToAward }
            });

            const titleSnippet = (assessment.title_ar || assessment.title_en || 'الواجب').slice(0, 100);
            await GamificationLogModel.create({
              student_id: student._id,
              xp_delta: xpToAward,
              action_type: 'HOMEWORK_SUBMITTED',
              reference_id: submission._id,
              reason_note: `Graded homework "${titleSnippet}"`
            });
          }
        }
      } catch (xpErr) {
        console.warn('Failed to record gamification XP on homework grade:', xpErr);
      }

      // Pick first YouTube solution URL if available for notification
      const firstSolutionUrl = sanitizedMistakes.find((m) => m.youtube_solution_url)?.youtube_solution_url ?? null;

      // Dispatch instant notification to Student with feedback viewer link
      const studentAlert = NotificationFactory.createHomeworkGradedAlert({
        recipientId: student._id as Types.ObjectId,
        recipientRole: ROLES.STUDENT,
        assessmentTitleAr: assessment.title_ar,
        assessmentTitleEn: assessment.title_en,
        score: finalTotalScore,
        totalPoints: assessment.total_points,
        youtubeSolutionUrl: firstSolutionUrl,
        submissionId: submission._id
      });
      await NotificationModel.create(studentAlert);

      // If student has a linked parent or parent phone, notify parent
      const parentQuery: any[] = [{ linked_children: student._id }];
      if (student.parent_phone) {
        parentQuery.push({ phone: student.parent_phone });
        parentQuery.push({ phone_number: student.parent_phone });
      }
      const parentUser = await UserModel.findOne({
        role: ROLES.PARENT,
        $or: parentQuery
      }).select('_id').lean();

      if (parentUser) {
        const parentAlert = NotificationFactory.createHomeworkGradedAlert({
          recipientId: parentUser._id as Types.ObjectId,
          recipientRole: ROLES.PARENT,
          assessmentTitleAr: assessment.title_ar,
          assessmentTitleEn: assessment.title_en,
          score: finalTotalScore,
          totalPoints: assessment.total_points,
          youtubeSolutionUrl: firstSolutionUrl,
          submissionId: submission._id
        });
        await NotificationModel.create(parentAlert);
      }
    }

    return submission;
  }

  /**
   * Approves and publishes any pending submission with a single click.
   */
  async approveSubmission(_adminId: string, submissionId: string): Promise<ISubmissionDocument> {
    const cleanId = String(submissionId || '').trim();
    if (!cleanId || !Types.ObjectId.isValid(cleanId)) {
      throw new AppError('Invalid submission ID format', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    const submission = await SubmissionModel.findById(cleanId);
    if (!submission) {
      throw new AppError('Submission not found', 404, ERROR_CODES.NOT_FOUND_404);
    }

    // Guard against duplicate approvals / publishing:
    // If already published to student & parent, return gracefully to prevent duplicate side effects, XP & notifications
    if (submission.result_visibility === 'PUBLISHED_TO_STUDENT_AND_PARENT') {
      return submission;
    }

    const assessment = await AssessmentModel.findById(submission.assessment_id);
    if (!assessment) {
      throw new AppError('Associated assessment not found', 404, ERROR_CODES.ASSESSMENT_NOT_FOUND_404);
    }

    const student = await UserModel.findById(submission.student_id);
    if (!student) {
      throw new AppError('Student account not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }

    const mcqPoints = (submission.mcq_answers || []).reduce((sum, a) => sum + (Number(a.points_earned) || 0), 0);
    const textPoints = (submission.text_answers || []).reduce((sum, a) => sum + (Number(a.points_earned) || 0), 0);
    const hasAutoAnswers = (submission.mcq_answers && submission.mcq_answers.length > 0) ||
                           (submission.text_answers && submission.text_answers.length > 0);
    const totalAutoScore = hasAutoAnswers
      ? (mcqPoints + textPoints)
      : (Number(submission.mcq_auto_score) || 0);

    const hasEssayAnswers = Array.isArray(submission.essay_answers) && submission.essay_answers.length > 0;
    const essayAnswersScore = (submission.essay_answers || []).reduce(
      (sum: number, ea: any) => sum + (Number(ea.points_earned) || 0),
      0
    );
    const effectiveEssayScore = hasEssayAnswers
      ? Math.round(essayAnswersScore * 100) / 100
      : Math.round((Number(submission.essay_manual_score) || 0) * 100) / 100;
    const finalTotalScore = Math.round((totalAutoScore + effectiveEssayScore) * 100) / 100;

    // Defensive guards for legacy or offline submissions
    if (!submission.server_started_at) {
      submission.server_started_at = (submission as any).createdAt || new Date();
    }
    if (!submission.client_started_at) {
      submission.client_started_at = submission.server_started_at;
    }
    if (Array.isArray(submission.uploaded_solution_imgs)) {
      submission.uploaded_solution_imgs.forEach((img: any) => {
        if (img.question_id && !Types.ObjectId.isValid(img.question_id)) {
          img.question_id = undefined;
        }
      });
    }
    if (Array.isArray(submission.custom_mistake_cases)) {
      submission.custom_mistake_cases.forEach((m: any) => {
        if (m.question_id && !Types.ObjectId.isValid(m.question_id)) {
          m.question_id = undefined;
        }
      });
    }

    submission.mcq_auto_score = totalAutoScore;
    submission.essay_manual_score = effectiveEssayScore;
    submission.final_total_score = finalTotalScore;
    submission.result_visibility = 'PUBLISHED_TO_STUDENT_AND_PARENT';
    submission.graded_at = new Date();
    await submission.save({ validateModifiedOnly: true });

    // Award XP if not already awarded
    try {
      const existingXpLog = await GamificationLogModel.findOne({
        student_id: student._id,
        reference_id: submission._id
      });

      if (!existingXpLog) {
        const scorePercentage = assessment.total_points > 0 ? (finalTotalScore / assessment.total_points) * 100 : 0;
        const xpStrategy = new QuizPassedXpStrategy();
        const xpToAward = xpStrategy.calculateDelta({
          baseXpReward: Number(assessment.xp_reward) || 30,
          scorePercentage,
          isSuspiciousFastSolve: !!submission.is_suspicious_fast_solve,
          clockTamperDetected: !!submission.clock_tamper_detected
        });

        if (xpToAward > 0 && !isNaN(xpToAward)) {
          await UserModel.findByIdAndUpdate(student._id, {
            $inc: { total_xp: xpToAward }
          });

          const titleSnippet = (assessment.title_ar || assessment.title_en || 'التقييم').slice(0, 100);
          await GamificationLogModel.create({
            student_id: student._id,
            xp_delta: xpToAward,
            action_type: 'QUIZ_PASSED',
            reference_id: submission._id,
            reason_note: `Approved assessment "${titleSnippet}"`
          });
        }
      }
    } catch (xpErr) {
      console.warn('Failed to record gamification XP on approval:', xpErr);
    }

    try {
      const titleAr = assessment.title_ar || 'التقييم الدراسي';
      const titleEn = assessment.title_en || 'Academic Assessment';
      const studentAlert = NotificationFactory.createHomeworkGradedAlert({
        recipientId: student._id as Types.ObjectId,
        recipientRole: ROLES.STUDENT,
        assessmentTitleAr: titleAr,
        assessmentTitleEn: titleEn,
        score: finalTotalScore,
        totalPoints: assessment.total_points || 1,
        youtubeSolutionUrl: null,
        submissionId: submission._id
      });
      await NotificationModel.create(studentAlert);

      const parentQuery: any[] = [{ linked_children: student._id }];
      if (student.parent_phone) {
        parentQuery.push({ phone: student.parent_phone });
        parentQuery.push({ phone_number: student.parent_phone });
      }
      const parentUser = await UserModel.findOne({
        role: ROLES.PARENT,
        $or: parentQuery
      }).select('_id').lean();

      if (parentUser) {
        const parentAlert = NotificationFactory.createHomeworkGradedAlert({
          recipientId: parentUser._id as Types.ObjectId,
          recipientRole: ROLES.PARENT,
          assessmentTitleAr: titleAr,
          assessmentTitleEn: titleEn,
          score: finalTotalScore,
          totalPoints: assessment.total_points || 1,
          youtubeSolutionUrl: null,
          submissionId: submission._id
        });
        await NotificationModel.create(parentAlert);
      }
    } catch (notifErr) {
      console.warn('Failed to dispatch notifications on approval:', notifErr);
    }

    return submission;
  }

  /**
   * Bulk or single teacher action on submissions:
   * - HIDE_FROM_TEACHER: marks hidden_from_teacher=true so the teacher dashboard stays clean while student & parent retain full review access.
   * - PERMANENT_DELETE: removes submission records permanently from MongoDB.
   */
  async bulkDeleteOrHideSubmissions(
    submissionIds: string[],
    mode: 'HIDE_FROM_TEACHER' | 'PERMANENT_DELETE'
  ) {
    const validIds = Array.from(
      new Set((submissionIds || []).map((id) => id.trim()).filter((id) => Types.ObjectId.isValid(id)))
    );
    if (validIds.length === 0) {
      throw new AppError('No valid submission IDs provided', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    const objectIds = validIds.map((id) => new Types.ObjectId(id));

    if (mode === 'HIDE_FROM_TEACHER') {
      const updateRes = await SubmissionModel.updateMany(
        { _id: { $in: objectIds } },
        {
          $set: {
            hidden_from_teacher: true,
            hidden_from_teacher_at: new Date()
          }
        }
      );

      return {
        mode,
        affectedCount: updateRes.modifiedCount ?? updateRes.matchedCount ?? validIds.length,
        submissionIds: validIds
      };
    }

    const deleteRes = await SubmissionModel.deleteMany({ _id: { $in: objectIds } });
    return {
      mode,
      affectedCount: deleteRes.deletedCount ?? validIds.length,
      submissionIds: validIds
    };
  }

  /**
   * Restores previously hidden submissions back to teacher dashboard visibility.
   */
  async restoreHiddenSubmissions(submissionIds: string[]) {
    const validIds = Array.from(
      new Set((submissionIds || []).map((id) => id.trim()).filter((id) => Types.ObjectId.isValid(id)))
    );
    if (validIds.length === 0) {
      throw new AppError('No valid submission IDs provided', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    const objectIds = validIds.map((id) => new Types.ObjectId(id));
    const updateRes = await SubmissionModel.updateMany(
      { _id: { $in: objectIds } },
      {
        $set: {
          hidden_from_teacher: false,
          hidden_from_teacher_at: null
        }
      }
    );

    return {
      restoredCount: updateRes.modifiedCount ?? updateRes.matchedCount ?? validIds.length,
      submissionIds: validIds
    };
  }
}
