import { Types } from 'mongoose';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { ROLES } from '../../../common/constants/roles.constant';
import {
  evaluateStudentPromotion,
  IStudentPromotionEvaluation
} from '../../../common/constants/curriculum-hierarchy.constant';
import { deviceWhitelistCache, studentPresenceCache } from '../../../config/cache.config';
import { UserModel, IUserDocument } from '../../../models/user.model';
import { SubscriptionModel } from '../../../models/subscription.model';
import { SubmissionModel } from '../../../models/submission.model';
import { WatchProgressModel } from '../../../models/watch-progress.model';
import { GamificationLogModel } from '../../../models/gamification-log.model';
import { NotificationModel } from '../../../models/notification.model';
import { TestimonialModel } from '../../../models/testimonial.model';
import { PlacementAttemptModel } from '../../../models/placement-attempt.model';
import { LeadModel } from '../../../models/lead.model';
import { PromoteStudentsDto } from '../dto/promote-students.dto';

export interface IPromotionActionItem {
  studentId: string;
  fullName: string;
  studentCode?: string;
  curriculum?: string;
  fromGrade?: string;
  toGrade?: string | null;
  fromTerm?: string | null;
  toTerm?: string | null;
  status: string;
  reasonAr?: string;
  reasonEn?: string;
}

export interface IPromoteStudentsResult {
  mode: 'TERM' | 'GRADE';
  promotedCount: number;
  archivedCount: number;
  deletedCount: number;
  skippedCount: number;
  excludedCount: number;
  promoted: IPromotionActionItem[];
  archived: IPromotionActionItem[];
  deleted: IPromotionActionItem[];
  skipped: IPromotionActionItem[];
}

export class StudentPromotionService {
  /**
   * Manually promotes selected students (either TERM_1 -> TERM_2 or to the next grade level).
   * Enforces:
   * - Teacher exclusions via excludedStudentIds
   * - Term-less curriculum & already-Term-2 protection in TERM mode
   * - Strict Graduation Decision Gate (409 GRADUATION_DECISION_REQUIRED_409) before any DB mutation
   * - Archive or Permanent Delete for graduating final-grade students
   */
  public async promoteStudents(dto: PromoteStudentsDto): Promise<IPromoteStudentsResult> {
    const excludedSet = new Set((dto.excludedStudentIds || []).map((id) => id.trim()).filter(Boolean));
    const uniqueRequestedIds = Array.from(
      new Set((dto.studentIds || []).map((id) => id.trim()).filter(Boolean))
    );
    const targetIds = uniqueRequestedIds.filter((id) => !excludedSet.has(id));
    const excludedCount = excludedSet.size;

    const emptyResult: IPromoteStudentsResult = {
      mode: dto.mode,
      promotedCount: 0,
      archivedCount: 0,
      deletedCount: 0,
      skippedCount: 0,
      excludedCount,
      promoted: [],
      archived: [],
      deleted: [],
      skipped: []
    };

    if (targetIds.length === 0) {
      return emptyResult;
    }

    const users = await UserModel.find({ _id: { $in: targetIds } });
    const evaluations = users.map((user) => ({
      user,
      id: user._id.toString(),
      evalRes: evaluateStudentPromotion(
        {
          role: user.role,
          is_profile_completed: user.is_profile_completed,
          is_archived: user.is_archived,
          curriculum: user.curriculum,
          grade_level: user.grade_level,
          academic_term: user.academic_term
        },
        dto.mode
      )
    }));

    this.assertGraduationDecisionsPresent(evaluations, dto);

    const promoted: IPromotionActionItem[] = [];
    const archived: IPromotionActionItem[] = [];
    const deleted: IPromotionActionItem[] = [];
    const skipped: IPromotionActionItem[] = [];
    const now = new Date();

    for (const { user, id, evalRes } of evaluations) {
      if (evalRes.status === 'PROMOTABLE') {
        const updateSet: Record<string, unknown> =
          dto.mode === 'TERM'
            ? { academic_term: 'TERM_2' }
            : {
                grade_level: evalRes.nextGrade,
                ...(evalRes.nextTerm ? { academic_term: evalRes.nextTerm } : {})
              };

        await UserModel.updateOne({ _id: user._id, role: ROLES.STUDENT }, { $set: updateSet });

        promoted.push({
          studentId: id,
          fullName: user.full_name,
          studentCode: user.student_code,
          curriculum: evalRes.currentCurriculum,
          fromGrade: evalRes.currentGrade,
          toGrade: evalRes.nextGrade,
          fromTerm: evalRes.currentTerm,
          toTerm: evalRes.nextTerm,
          status: 'PROMOTED'
        });
        continue;
      }

      if (evalRes.status === 'GRADUATING') {
        const decision = dto.graduationDecisions?.[id] || dto.defaultGraduationAction;

        if (decision === 'ARCHIVE') {
          await UserModel.updateOne(
            { _id: user._id, role: ROLES.STUDENT },
            {
              $set: {
                is_archived: true,
                archived_at: now,
                graduation_status: 'GRADUATED',
                graduated_from_grade: user.grade_level || evalRes.currentGrade,
                graduated_at: now,
                is_leaderboard_hidden: true
              }
            }
          );

          archived.push({
            studentId: id,
            fullName: user.full_name,
            studentCode: user.student_code,
            curriculum: evalRes.currentCurriculum,
            fromGrade: evalRes.currentGrade,
            toGrade: null,
            status: 'ARCHIVED'
          });
        } else if (decision === 'DELETE') {
          await this.permanentlyDeleteStudent(id);

          deleted.push({
            studentId: id,
            fullName: user.full_name,
            studentCode: user.student_code,
            curriculum: evalRes.currentCurriculum,
            fromGrade: evalRes.currentGrade,
            toGrade: null,
            status: 'DELETED'
          });
        } else {
          skipped.push({
            studentId: id,
            fullName: user.full_name,
            studentCode: user.student_code,
            curriculum: evalRes.currentCurriculum,
            fromGrade: evalRes.currentGrade,
            status: 'SKIPPED_GRADUATING',
            reasonAr: 'تم استثناء الطالب الخريج بناءً على اختيار المعلمة',
            reasonEn: 'Graduating student skipped by teacher choice'
          });
        }
        continue;
      }

      skipped.push({
        studentId: id,
        fullName: user.full_name,
        studentCode: user.student_code,
        curriculum: evalRes.currentCurriculum,
        fromGrade: evalRes.currentGrade,
        fromTerm: evalRes.currentTerm,
        status: evalRes.status,
        reasonAr: evalRes.reasonAr,
        reasonEn: evalRes.reasonEn
      });
    }

    return {
      mode: dto.mode,
      promotedCount: promoted.length,
      archivedCount: archived.length,
      deletedCount: deleted.length,
      skippedCount: skipped.length,
      excludedCount,
      promoted,
      archived,
      deleted,
      skipped
    };
  }

  /**
   * Archives or restores an individual student without deleting historical data or identity.
   */
  public async setStudentArchiveStatus(studentId: string, archived: boolean) {
    const user = await UserModel.findById(studentId);
    if (!user) {
      throw new AppError('Student not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }
    if (user.role !== ROLES.STUDENT) {
      throw new AppError('Only student accounts can be archived or restored', 403, ERROR_CODES.FORBIDDEN_403);
    }

    const now = new Date();
    const updateSet = archived
      ? {
          is_archived: true,
          archived_at: now,
          graduation_status: 'GRADUATED' as const,
          graduated_from_grade: user.graduated_from_grade || user.grade_level || null,
          graduated_at: user.graduated_at || now,
          is_leaderboard_hidden: true
        }
      : {
          is_archived: false,
          archived_at: null,
          graduation_status: 'ACTIVE' as const,
          is_leaderboard_hidden: false
        };

    await UserModel.updateOne({ _id: user._id, role: ROLES.STUDENT }, { $set: updateSet });

    return {
      studentId: user._id.toString(),
      fullName: user.full_name,
      studentCode: user.student_code,
      curriculum: user.curriculum,
      gradeLevel: user.grade_level,
      isArchived: updateSet.is_archived,
      archivedAt: updateSet.archived_at,
      graduationStatus: updateSet.graduation_status,
      graduatedFromGrade: archived ? updateSet.graduated_from_grade : user.graduated_from_grade || null
    };
  }

  /**
   * Permanently deletes a student account and cleans up dependent records & caches.
   * Strictly refuses to delete non-student accounts (Admin / Teacher / Parent).
   */
  public async permanentlyDeleteStudent(studentId: string) {
    const user = await UserModel.findById(studentId);
    if (!user) {
      throw new AppError('Student not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }
    if (user.role !== ROLES.STUDENT) {
      throw new AppError('Only student accounts can be permanently deleted via student lifecycle', 403, ERROR_CODES.FORBIDDEN_403);
    }

    const userObjectId = user._id as Types.ObjectId;
    const summary = {
      deletedStudentId: userObjectId.toString(),
      fullName: user.full_name,
      studentCode: user.student_code,
      graduatedFromGrade: user.graduated_from_grade || user.grade_level || null
    };

    await UserModel.deleteOne({ _id: userObjectId, role: ROLES.STUDENT });
    await UserModel.updateMany(
      { linked_children: userObjectId },
      { $pull: { linked_children: userObjectId } }
    );
    await SubscriptionModel.deleteMany({ student_id: userObjectId });
    await SubmissionModel.deleteMany({ student_id: userObjectId });
    await WatchProgressModel.deleteMany({ student_id: userObjectId });
    await GamificationLogModel.deleteMany({ student_id: userObjectId });
    await NotificationModel.deleteMany({ recipient_id: userObjectId });
    await TestimonialModel.deleteMany({ user_id: userObjectId });
    await PlacementAttemptModel.updateMany(
      { linked_user_id: userObjectId },
      { $set: { linked_user_id: null } }
    );
    await LeadModel.updateMany(
      { user_id: userObjectId },
      { $set: { user_id: null } }
    );

    deviceWhitelistCache.delete(summary.deletedStudentId);
    studentPresenceCache.delete(summary.deletedStudentId);

    return summary;
  }

  private assertGraduationDecisionsPresent(
    evaluations: Array<{ user: IUserDocument; id: string; evalRes: IStudentPromotionEvaluation }>,
    dto: PromoteStudentsDto
  ): void {
    const missingGraduating = evaluations
      .filter(({ id, evalRes }) => {
        if (evalRes.status !== 'GRADUATING') return false;
        const explicitDecision = dto.graduationDecisions?.[id];
        return !explicitDecision && !dto.defaultGraduationAction;
      })
      .map(({ user, id, evalRes }) => ({
        studentId: id,
        fullName: user.full_name,
        studentCode: user.student_code,
        curriculum: evalRes.currentCurriculum,
        gradeLevel: evalRes.currentGrade
      }));

    if (missingGraduating.length > 0) {
      throw new AppError(
        'تم تخرج بعض الطلاب المحددين — يرجى اختيار الأرشفة أو الحذف النهائي قبل المتابعة',
        409,
        ERROR_CODES.GRADUATION_DECISION_REQUIRED_409,
        {
          requiresGraduationDecision: true,
          graduatingStudents: missingGraduating
        }
      );
    }
  }
}

export const studentPromotionService = new StudentPromotionService();
