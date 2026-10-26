import { Types } from 'mongoose';
import { UserModel } from '../../../models/user.model';
import { SubscriptionModel } from '../../../models/subscription.model';
import { WatchProgressModel } from '../../../models/watch-progress.model';
import { SubmissionModel } from '../../../models/submission.model';
import { ROLES, UserRole } from '../../../common/constants/roles.constant';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { PresenceTrackerService, IPresenceStatusResponse } from './presence-tracker.service';
import { GamificationService } from '../../gamification-alerts/services/gamification.service';

export interface IChildSummaryItem {
  studentId: string;
  fullName: string;
  studentCode?: string;
  curriculum?: string;
  gradeLevel?: string;
  academicTerm?: string;
  avatarUrl?: string | null;
  totalXp: number;
  badgeLevel: string;
  hasActiveSubscription: boolean;
  presence: IPresenceStatusResponse;
}

export class ParentService {
  /**
   * Retrieves all linked children for the parent with instant RAM presence.
   * GET /api/v1/parent/children-list
   */
  async getChildrenList(parentId: string): Promise<{ children: IChildSummaryItem[]; totalChildren: number }> {
    const parent = await UserModel.findById(parentId).lean();
    if (!parent) {
      throw new AppError('Parent account not found', 404, ERROR_CODES.NOT_FOUND_404);
    }

    const linkedIds: Types.ObjectId[] = (parent.linked_children ?? []).map(
      (id) => new Types.ObjectId(id)
    );

    // Auto-discover any children registered with parent's phone number
    if (parent.phone) {
      const childrenByPhone = await UserModel.find({
        parent_phone: parent.phone,
        role: ROLES.STUDENT
      })
        .select('_id')
        .lean();

      childrenByPhone.forEach((c) => {
        if (!linkedIds.some((id) => id.equals(c._id as Types.ObjectId))) {
          linkedIds.push(c._id as Types.ObjectId);
        }
      });
    }

    if (linkedIds.length === 0) {
      return { children: [], totalChildren: 0 };
    }

    const students = await UserModel.find({
      _id: { $in: linkedIds },
      role: ROLES.STUDENT
    })
      .select('full_name student_code curriculum grade_level academic_term avatar_url total_xp has_active_subscription')
      .lean();

    const children: IChildSummaryItem[] = students.map((student) => {
      const studentIdStr = (student._id as Types.ObjectId).toString();
      const presence = PresenceTrackerService.getPresence(studentIdStr);
      const badgeLevel = GamificationService.calculateBadgeLevel(student.total_xp);

      return {
        studentId: studentIdStr,
        fullName: student.full_name,
        studentCode: student.student_code,
        curriculum: student.curriculum,
        gradeLevel: student.grade_level,
        academicTerm: student.academic_term,
        avatarUrl: student.avatar_url,
        totalXp: student.total_xp,
        badgeLevel,
        hasActiveSubscription: student.has_active_subscription,
        presence
      };
    });

    return {
      children,
      totalChildren: children.length
    };
  }

  /**
   * Retrieves comprehensive 360-degree academic report for a child.
   * Verifies parent ownership, returns attendance metrics, video progress, and graded exams with clickable YouTube feedback.
   * GET /api/v1/parent/child/:studentId/full-report
   */
  async getChildFullReport(parentId: string, parentRole: UserRole, studentId: string) {
    const student = await UserModel.findById(studentId).lean();
    if (!student || student.role !== ROLES.STUDENT) {
      throw new AppError('Student not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }

    // Verify parent-child relationship (Super Admin bypasses check)
    if (parentRole !== ROLES.SUPER_ADMIN) {
      const parent = await UserModel.findById(parentId).lean();
      if (!parent) {
        throw new AppError('Parent account not found', 404, ERROR_CODES.NOT_FOUND_404);
      }

      const isLinked = (parent.linked_children ?? []).some((id) => id.toString() === studentId);
      const isPhoneMatched = parent.phone && student.parent_phone === parent.phone;

      if (!isLinked && !isPhoneMatched) {
        throw new AppError(
          'Unauthorized: You are not authorized to view this student’s report',
          403,
          ERROR_CODES.FORBIDDEN_403
        );
      }
    }

    // 1. Live Presence
    const presence = PresenceTrackerService.getPresence(studentId);

    // 2. Active Subscriptions
    const subscriptions = await SubscriptionModel.find({
      student_id: new Types.ObjectId(studentId),
      subscription_status: 'ACTIVE'
    })
      .populate('unit_package_id', 'title_ar title_en unit_code package_type')
      .lean();

    // 3. Attendance & Lecture Watch Progress
    const watchProgressRecords = await WatchProgressModel.find({
      student_id: new Types.ObjectId(studentId)
    })
      .populate('lecture_id', 'lecture_title_ar lecture_title_en video_duration_sec')
      .sort({ last_watched_at: -1 })
      .lean();

    const totalLecturesWatched = watchProgressRecords.filter((r) => r.watch_percentage > 0).length;
    const completedLecturesCount = watchProgressRecords.filter((r) => r.is_completed).length;
    const totalWatchDurationSec = watchProgressRecords.reduce((sum, r) => sum + (r.accumulated_watch_sec || 0), 0);

    // 4. Graded Exams and Homework Submissions
    const submissions = await SubmissionModel.find({
      student_id: new Types.ObjectId(studentId),
      sync_queue_status: { $in: ['SYNCED_ONLINE', 'IN_PROGRESS'] }
    })
      .populate('assessment_id', 'title_ar title_en assessment_type total_points xp_reward questions')
      .sort({ createdAt: -1 })
      .lean();

    const gradedAssessments = submissions.map((sub: any) => {
      const assessment = sub.assessment_id;
      const totalPoints = assessment ? assessment.total_points : 0;
      const percentage = totalPoints > 0 ? Math.round((sub.final_total_score / totalPoints) * 100) : 0;
      const isPendingReview = sub.result_visibility === 'HIDDEN_PENDING_TEACHER';
      const isInProgress = sub.sync_queue_status === 'IN_PROGRESS';
      const status = isInProgress ? 'IN_PROGRESS' : (isPendingReview ? 'PENDING_REVIEW' : 'PUBLISHED');

      return {
        submissionId: sub._id.toString(),
        assessmentId: assessment ? assessment._id.toString() : null,
        titleAr: assessment ? assessment.title_ar : 'تقييم دراسي',
        titleEn: assessment ? assessment.title_en : 'Assessment',
        assessmentType: assessment ? assessment.assessment_type : 'QUIZ',
        totalPoints,
        mcqAutoScore: sub.mcq_auto_score,
        essayManualScore: sub.essay_manual_score,
        finalTotalScore: sub.final_total_score,
        percentage,
        status,
        isPendingReview,
        isInProgress,
        teacherFeedbackNotes: sub.teacher_feedback_notes ?? null,
        // Clickable YouTube Solution URL feedback for teacher mistakes
        customMistakeCases: (sub.custom_mistake_cases ?? []).map((m: any) => ({
          questionId: m.question_id ? m.question_id.toString() : null,
          errorNote: m.error_note,
          youtubeSolutionUrl: m.youtube_solution_url ?? null
        })),
        submittedAt: sub.client_submitted_at ?? sub.createdAt,
        gradedAt: sub.graded_at
      };
    });

    return {
      student: {
        studentId: student._id.toString(),
        fullName: student.full_name,
        studentCode: student.student_code,
        curriculum: student.curriculum,
        gradeLevel: student.grade_level,
        academicTerm: student.academic_term,
        avatarUrl: student.avatar_url,
        totalXp: student.total_xp,
        badgeLevel: GamificationService.calculateBadgeLevel(student.total_xp)
      },
      presence,
      activeSubscriptions: subscriptions.map((s: any) => ({
        subscriptionId: s._id.toString(),
        unitPackageId: s.unit_package_id ? s.unit_package_id._id.toString() : null,
        unitTitleAr: s.unit_package_id ? s.unit_package_id.title_ar : '',
        unitTitleEn: s.unit_package_id ? s.unit_package_id.title_en : '',
        unitCode: s.unit_package_id ? s.unit_package_id.unit_code : '',
        expiresAt: s.expires_at,
        daysRemaining: Math.max(0, Math.ceil((new Date(s.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      })),
      attendanceMetrics: {
        totalLecturesWatched,
        completedLecturesCount,
        totalWatchDurationSec,
        overallWatchPercentage: totalLecturesWatched > 0 ? Math.round((completedLecturesCount / totalLecturesWatched) * 100) : 0
      },
      gradedAssessments,
      submissions: gradedAssessments
    };
  }
}
