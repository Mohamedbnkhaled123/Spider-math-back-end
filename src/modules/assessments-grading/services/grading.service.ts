import { Types } from 'mongoose';
import { SubmissionModel, ISubmissionDocument } from '../../../models/submission.model';
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
import { HomeworkGradedXpStrategy } from '../strategies/xp-calculation.strategy';

export interface IPendingSubmissionsQuery {
  assessmentId?: string;
  page?: number;
  limit?: number;
}

export interface IAllSubmissionsQuery {
  assessmentId?: string;
  curriculum?: string;
  gradeLevel?: string;
  status?: string; // 'ALL' | 'PENDING' | 'PUBLISHED' | 'IN_PROGRESS'
  search?: string;
  page?: number;
  limit?: number;
}

export class GradingService {
  /**
   * Lists all submissions with comprehensive filtering (GET /api/v1/admin/submissions).
   * Supports filtering by assessment, curriculum, grade, status, search, and returns analytics.
   */
  async getAllSubmissions(query: IAllSubmissionsQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

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

    // Filter by student properties (curriculum, gradeLevel, search)
    const studentFilter: Record<string, unknown> = { role: ROLES.STUDENT };
    let needsStudentFilter = false;

    if (query.curriculum) {
      studentFilter.curriculum = query.curriculum;
      needsStudentFilter = true;
    }
    if (query.gradeLevel) {
      studentFilter.grade_level = query.gradeLevel;
      needsStudentFilter = true;
    }
    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      studentFilter.$or = [
        { full_name: { $regex: s, $options: 'i' } },
        { student_code: { $regex: s, $options: 'i' } },
        { phone_number: { $regex: s, $options: 'i' } }
      ];
      needsStudentFilter = true;
    }

    if (needsStudentFilter) {
      const matchingStudents = await UserModel.find(studentFilter).select('_id').lean();
      const studentIds = matchingStudents.map((s) => s._id);
      filter.student_id = { $in: studentIds };
    }

    const [submissions, total, totalPending, totalPublished, totalInProgress] = await Promise.all([
      SubmissionModel.find(filter)
        .populate<{ student_id: IUserDocument }>('student_id', 'full_name student_code phone_number parent_phone curriculum grade_level email')
        .populate<{ assessment_id: IAssessmentDocument }>('assessment_id', 'title_ar title_en total_points assessment_type questions has_essay_questions xp_reward')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SubmissionModel.countDocuments(filter),
      SubmissionModel.countDocuments({ result_visibility: 'HIDDEN_PENDING_TEACHER', sync_queue_status: 'SYNCED_ONLINE' }),
      SubmissionModel.countDocuments({ result_visibility: 'PUBLISHED_TO_STUDENT_AND_PARENT', sync_queue_status: 'SYNCED_ONLINE' }),
      SubmissionModel.countDocuments({ sync_queue_status: 'IN_PROGRESS' })
    ]);

    return {
      submissions,
      stats: {
        totalSubmissions: total,
        pendingReviewCount: totalPending,
        publishedCount: totalPublished,
        inProgressCount: totalInProgress
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
      sync_queue_status: 'SYNCED_ONLINE'
    };

    if (query.assessmentId) {
      filter.assessment_id = new Types.ObjectId(query.assessmentId);
    }

    const [submissions, total] = await Promise.all([
      SubmissionModel.find(filter)
        .populate<{ student_id: IUserDocument }>('student_id', 'full_name student_code phone_number curriculum grade_level')
        .populate<{ assessment_id: IAssessmentDocument }>('assessment_id', 'title_ar title_en total_points assessment_type questions')
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
    const submission = await SubmissionModel.findById(submissionId);
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
      question_id: c.question_id ? new Types.ObjectId(c.question_id) : undefined,
      error_note: c.error_note.trim(),
      youtube_solution_url: validateAndNormalizeYouTubeUrl(c.youtube_solution_url)
    }));

    const finalTotalScore = submission.mcq_auto_score + dto.essay_manual_score;

    submission.essay_manual_score = dto.essay_manual_score;
    submission.final_total_score = finalTotalScore;
    submission.teacher_feedback_notes = dto.teacher_feedback_notes;
    submission.custom_mistake_cases = sanitizedMistakes;
    submission.result_visibility = 'PUBLISHED_TO_STUDENT_AND_PARENT';
    submission.graded_at = new Date();

    await submission.save();

    // Calculate & award XP if not already awarded
    const existingXpLog = await GamificationLogModel.findOne({
      student_id: student._id,
      reference_id: submission._id
    });

    if (!existingXpLog) {
      const scorePercentage = assessment.total_points > 0 ? (finalTotalScore / assessment.total_points) * 100 : 0;
      const xpStrategy = new HomeworkGradedXpStrategy();
      const xpToAward = xpStrategy.calculateDelta({
        baseXpReward: assessment.xp_reward,
        scorePercentage
      });

      if (xpToAward > 0) {
        await UserModel.findByIdAndUpdate(student._id, {
          $inc: { total_xp: xpToAward }
        });

        await GamificationLogModel.create({
          student_id: student._id,
          xp_delta: xpToAward,
          action_type: 'HOMEWORK_SUBMITTED',
          reference_id: submission._id,
          reason_note: `Graded homework "${assessment.title_ar}"`
        });
      }
    }

    // Pick first YouTube solution URL if available for notification
    const firstSolutionUrl = sanitizedMistakes.find((m) => m.youtube_solution_url)?.youtube_solution_url ?? null;

    // Dispatch instant notification to Student
    const studentAlert = NotificationFactory.createHomeworkGradedAlert({
      recipientId: student._id as Types.ObjectId,
      recipientRole: ROLES.STUDENT,
      assessmentTitleAr: assessment.title_ar,
      assessmentTitleEn: assessment.title_en,
      score: finalTotalScore,
      totalPoints: assessment.total_points,
      youtubeSolutionUrl: firstSolutionUrl
    });
    await NotificationModel.create(studentAlert);

    // If student has a parent, also notify parent
    if (student.parent_phone) {
      const parentUser = await UserModel.findOne({
        phone_number: student.parent_phone,
        role: ROLES.PARENT
      }).select('_id').lean();

      if (parentUser) {
        const parentAlert = NotificationFactory.createHomeworkGradedAlert({
          recipientId: parentUser._id as Types.ObjectId,
          recipientRole: ROLES.PARENT,
          assessmentTitleAr: assessment.title_ar,
          assessmentTitleEn: assessment.title_en,
          score: finalTotalScore,
          totalPoints: assessment.total_points,
          youtubeSolutionUrl: firstSolutionUrl
        });
        await NotificationModel.create(parentAlert);
      }
    }

    return submission;
  }
}
