import assert from 'assert';
import { Types } from 'mongoose';
import { studentPromotionService } from './student-promotion.service';
import { promoteStudentsDtoSchema } from '../dto/promote-students.dto';
import { GamificationService } from '../../gamification-alerts/services/gamification.service';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { ROLES } from '../../../common/constants/roles.constant';
import { deviceWhitelistCache, studentPresenceCache } from '../../../config/cache.config';
import { UserModel } from '../../../models/user.model';
import { SubscriptionModel } from '../../../models/subscription.model';
import { SubmissionModel } from '../../../models/submission.model';
import { WatchProgressModel } from '../../../models/watch-progress.model';
import { GamificationLogModel } from '../../../models/gamification-log.model';
import { NotificationModel } from '../../../models/notification.model';
import { TestimonialModel } from '../../../models/testimonial.model';
import { PlacementAttemptModel } from '../../../models/placement-attempt.model';
import { LeadModel } from '../../../models/lead.model';

interface MockUserDoc {
  _id: Types.ObjectId;
  full_name: string;
  student_code?: string;
  role: string;
  curriculum?: string;
  grade_level?: string;
  academic_term?: 'TERM_1' | 'TERM_2';
  total_xp: number;
  has_active_subscription?: boolean;
  is_profile_completed?: boolean;
  is_leaderboard_hidden?: boolean;
  is_archived?: boolean;
  archived_at?: Date | null;
  graduation_status?: 'ACTIVE' | 'GRADUATED';
  graduated_from_grade?: string | null;
  graduated_at?: Date | null;
  linked_children?: Types.ObjectId[];
}

async function runTests() {
  console.log('Running Student Academic Promotion & Graduation Requirements Suite...');

  // Save originals so we restore cleanly in finally
  const orig = {
    userFind: UserModel.find,
    userFindById: UserModel.findById,
    userUpdateOne: UserModel.updateOne,
    userDeleteOne: UserModel.deleteOne,
    userUpdateMany: UserModel.updateMany,
    subDeleteMany: SubscriptionModel.deleteMany,
    submissionDeleteMany: SubmissionModel.deleteMany,
    watchDeleteMany: WatchProgressModel.deleteMany,
    gamLogDeleteMany: GamificationLogModel.deleteMany,
    notifDeleteMany: NotificationModel.deleteMany,
    testimDeleteMany: TestimonialModel.deleteMany,
    placementUpdateMany: PlacementAttemptModel.updateMany,
    leadUpdateMany: LeadModel.updateMany
  };

  let usersDb: MockUserDoc[] = [];
  let subscriptionsDb: Array<{ _id: string; student_id: Types.ObjectId }> = [];
  let submissionsDb: Array<{ _id: string; student_id: Types.ObjectId }> = [];
  let watchProgressDb: Array<{ _id: string; student_id: Types.ObjectId }> = [];
  let gamLogsDb: Array<{ _id: string; student_id: Types.ObjectId }> = [];
  let notificationsDb: Array<{ _id: string; recipient_id: Types.ObjectId }> = [];
  let testimonialsDb: Array<{ _id: string; user_id: Types.ObjectId }> = [];
  let placementDb: Array<{ _id: string; linked_user_id: Types.ObjectId | null }> = [];
  let leadsDb: Array<{ _id: string; user_id: Types.ObjectId | null }> = [];

  const matchesId = (a: any, b: any) => String(a) === String(b);

  const installInMemoryMocks = () => {
    (UserModel as any).find = (filter: any) => {
      const execute = () =>
        usersDb.filter((u) => {
          if (filter?._id?.$in) {
            return filter._id.$in.some((id: any) => matchesId(id, u._id));
          }
          if (filter?.role && u.role !== filter.role) return false;
          if (filter?.curriculum && u.curriculum !== filter.curriculum) return false;
          if (filter?.grade_level && u.grade_level !== filter.grade_level) return false;
          if (filter?.has_active_subscription !== undefined && !!u.has_active_subscription !== filter.has_active_subscription) return false;
          if (filter?.is_leaderboard_hidden?.$ne !== undefined && u.is_leaderboard_hidden === filter.is_leaderboard_hidden.$ne) return false;
          if (filter?.is_archived?.$ne !== undefined && !!u.is_archived === filter.is_archived.$ne) return false;
          return true;
        });

      const queryObj: any = Promise.resolve(execute());
      queryObj.select = () => queryObj;
      queryObj.sort = () => queryObj;
      queryObj.limit = (n: number) => {
        const sliced = execute().slice(0, n);
        return { lean: async () => sliced };
      };
      queryObj.lean = async () => execute();
      return queryObj;
    };

    (UserModel as any).findById = async (id: string) =>
      usersDb.find((u) => matchesId(u._id, id)) || null;

    (UserModel as any).updateOne = async (filter: any, update: any) => {
      const target = usersDb.find(
        (u) => matchesId(u._id, filter?._id) && (!filter?.role || u.role === filter.role)
      );
      if (!target) return { modifiedCount: 0 };
      if (update?.$set) {
        Object.assign(target, update.$set);
      }
      return { modifiedCount: 1 };
    };

    (UserModel as any).deleteOne = async (filter: any) => {
      const before = usersDb.length;
      usersDb = usersDb.filter(
        (u) => !(matchesId(u._id, filter?._id) && (!filter?.role || u.role === filter.role))
      );
      return { deletedCount: before - usersDb.length };
    };

    (UserModel as any).updateMany = async (filter: any, update: any) => {
      if (filter?.linked_children && update?.$pull?.linked_children) {
        const pullId = update.$pull.linked_children;
        for (const u of usersDb) {
          if (Array.isArray(u.linked_children)) {
            u.linked_children = u.linked_children.filter((cid) => !matchesId(cid, pullId));
          }
        }
      }
      return { modifiedCount: 1 };
    };

    (SubscriptionModel as any).deleteMany = async (f: any) => {
      subscriptionsDb = subscriptionsDb.filter((s) => !matchesId(s.student_id, f.student_id));
      return { deletedCount: 1 };
    };
    (SubmissionModel as any).deleteMany = async (f: any) => {
      submissionsDb = submissionsDb.filter((s) => !matchesId(s.student_id, f.student_id));
      return { deletedCount: 1 };
    };
    (WatchProgressModel as any).deleteMany = async (f: any) => {
      watchProgressDb = watchProgressDb.filter((s) => !matchesId(s.student_id, f.student_id));
      return { deletedCount: 1 };
    };
    (GamificationLogModel as any).deleteMany = async (f: any) => {
      gamLogsDb = gamLogsDb.filter((s) => !matchesId(s.student_id, f.student_id));
      return { deletedCount: 1 };
    };
    (NotificationModel as any).deleteMany = async (f: any) => {
      notificationsDb = notificationsDb.filter((s) => !matchesId(s.recipient_id, f.recipient_id));
      return { deletedCount: 1 };
    };
    (TestimonialModel as any).deleteMany = async (f: any) => {
      testimonialsDb = testimonialsDb.filter((s) => !matchesId(s.user_id, f.user_id));
      return { deletedCount: 1 };
    };
    (PlacementAttemptModel as any).updateMany = async (f: any, u: any) => {
      for (const p of placementDb) {
        if (matchesId(p.linked_user_id, f.linked_user_id)) {
          p.linked_user_id = u.$set.linked_user_id;
        }
      }
      return { modifiedCount: 1 };
    };
    (LeadModel as any).updateMany = async (f: any, u: any) => {
      for (const l of leadsDb) {
        if (matchesId(l.user_id, f.user_id)) {
          l.user_id = u.$set.user_id;
        }
      }
      return { modifiedCount: 1 };
    };
  };

  try {
    installInMemoryMocks();

    // -------------------------------------------------------------------------
    // REQ-1 & REQ-2: Term promotion moves TERM_1 -> TERM_2 and skips term-less & already-TERM_2
    // -------------------------------------------------------------------------
    console.log('--- REQ-1 & REQ-2: Term Promotion & Term-less Curriculum Safeguards ---');
    const idEgPri5 = new Types.ObjectId();
    const idGulfG8 = new Types.ObjectId();
    const idEgAlreadyT2 = new Types.ObjectId();
    const idSatStudent = new Types.ObjectId();
    const idIntlUsStudent = new Types.ObjectId();
    const idIntlBritStudent = new Types.ObjectId();

    usersDb = [
      {
        _id: idEgPri5,
        full_name: 'Ahmed Primary 5',
        student_code: 'HA1001',
        role: ROLES.STUDENT,
        curriculum: 'EGYPTIAN',
        grade_level: 'PRI_5',
        academic_term: 'TERM_1',
        total_xp: 250,
        is_profile_completed: true
      },
      {
        _id: idGulfG8,
        full_name: 'Noura Gulf Grade 8',
        student_code: 'HA1002',
        role: ROLES.STUDENT,
        curriculum: 'GULF',
        grade_level: 'GRADE_8',
        academic_term: 'TERM_1',
        total_xp: 180,
        is_profile_completed: true
      },
      {
        _id: idEgAlreadyT2,
        full_name: 'Omar Already Term 2',
        student_code: 'HA1003',
        role: ROLES.STUDENT,
        curriculum: 'EGYPTIAN',
        grade_level: 'PREP_1',
        academic_term: 'TERM_2',
        total_xp: 90,
        is_profile_completed: true
      },
      {
        _id: idSatStudent,
        full_name: 'Laila SAT Student',
        student_code: 'HA1004',
        role: ROLES.STUDENT,
        curriculum: 'AMERICAN',
        grade_level: 'SAT_MATH',
        total_xp: 400,
        is_profile_completed: true
      },
      {
        _id: idIntlUsStudent,
        full_name: 'Youssef US Grade 10',
        student_code: 'HA1005',
        role: ROLES.STUDENT,
        curriculum: 'INTERNATIONAL',
        grade_level: 'US_GRADE_10',
        total_xp: 310,
        is_profile_completed: true
      },
      {
        _id: idIntlBritStudent,
        full_name: 'Hana British Year 10',
        student_code: 'HA1006',
        role: ROLES.STUDENT,
        curriculum: 'INTERNATIONAL',
        grade_level: 'IGCSE_YEAR_10',
        total_xp: 290,
        is_profile_completed: true
      }
    ];

    submissionsDb = [
      { _id: 'sub_eg_t1', student_id: idEgPri5 },
      { _id: 'sub_gulf_t1', student_id: idGulfG8 },
      { _id: 'sub_t2_keep', student_id: idEgAlreadyT2 },
      { _id: 'sub_sat_keep', student_id: idSatStudent }
    ];

    const termResult = await studentPromotionService.promoteStudents(
      promoteStudentsDtoSchema.parse({
        mode: 'TERM',
        studentIds: usersDb.map((u) => u._id.toString())
      })
    );

    assert.strictEqual(termResult.promotedCount, 2, 'Only TERM_1 Egyptian and Gulf students promote in TERM mode');
    assert.strictEqual(termResult.skippedCount, 4, 'SAT, US K-12, British IGCSE, and already-TERM_2 must be skipped');
    assert.strictEqual(usersDb.find((u) => u._id === idEgPri5)!.academic_term, 'TERM_2');
    assert.strictEqual(usersDb.find((u) => u._id === idEgPri5)!.grade_level, 'PRI_5', 'Grade level unchanged during term promotion');
    assert.strictEqual(usersDb.find((u) => u._id === idEgPri5)!.student_code, 'HA1001', 'HA code preserved');
    assert.strictEqual(usersDb.find((u) => u._id === idEgPri5)!.total_xp, 250, 'XP preserved during TERM promotion');
    assert.strictEqual(usersDb.find((u) => u._id === idGulfG8)!.academic_term, 'TERM_2');
    assert.strictEqual(usersDb.find((u) => u._id === idSatStudent)!.grade_level, 'SAT_MATH');
    assert.strictEqual(usersDb.find((u) => u._id === idSatStudent)!.academic_term, undefined, 'SAT student never assigned TERM_2');
    assert.strictEqual(
      termResult.skipped.find((s) => s.studentId === idSatStudent.toString())?.status,
      'INELIGIBLE_NO_TERMS'
    );
    assert.strictEqual(
      termResult.skipped.find((s) => s.studentId === idEgAlreadyT2.toString())?.status,
      'INELIGIBLE_ALREADY_TERM_2'
    );
    // Term promotion MUST auto-delete old Term 1 submissions for promoted students while leaving skipped untouched
    assert.strictEqual(submissionsDb.some((s) => matchesId(s.student_id, idEgPri5)), false, 'Promoted student Term 1 submissions deleted automatically');
    assert.strictEqual(submissionsDb.some((s) => matchesId(s.student_id, idGulfG8)), false, 'Promoted Gulf student Term 1 submissions deleted automatically');
    assert.strictEqual(submissionsDb.some((s) => matchesId(s.student_id, idEgAlreadyT2)), true, 'Already-Term-2 student submissions preserved');
    assert.strictEqual(submissionsDb.some((s) => matchesId(s.student_id, idSatStudent)), true, 'SAT student submissions preserved');
    console.log('[PASS] REQ-1 & REQ-2 verified.');

    // -------------------------------------------------------------------------
    // REQ-3 & REQ-4: Grade Promotion Full Reset + Exclusions (Failed / Cancelled Students)
    // -------------------------------------------------------------------------
    console.log('--- REQ-3 & REQ-4: Grade Promotion Full Reset & Teacher Exclusions ---');
    const idFailedPri5 = new Types.ObjectId();
    const idCancelledPri6 = new Types.ObjectId();
    const idPri6Promote = new Types.ObjectId();
    const idUs11Promote = new Types.ObjectId();
    const idUk12Promote = new Types.ObjectId();
    const idUkOlPromote = new Types.ObjectId();

    usersDb = [
      {
        _id: idEgPri5,
        full_name: 'Ahmed Promotable PRI_5',
        student_code: 'HA2001',
        role: ROLES.STUDENT,
        curriculum: 'EGYPTIAN',
        grade_level: 'PRI_5',
        academic_term: 'TERM_2',
        has_active_subscription: true,
        total_xp: 250,
        is_profile_completed: true
      },
      {
        _id: idFailedPri5,
        full_name: 'Karim Failed Year',
        student_code: 'HA2002',
        role: ROLES.STUDENT,
        curriculum: 'EGYPTIAN',
        grade_level: 'PRI_5',
        academic_term: 'TERM_2',
        has_active_subscription: true,
        total_xp: 40,
        is_profile_completed: true
      },
      {
        _id: idCancelledPri6,
        full_name: 'Salma Cancelled Sub',
        student_code: 'HA2003',
        role: ROLES.STUDENT,
        curriculum: 'EGYPTIAN',
        grade_level: 'PRI_6',
        academic_term: 'TERM_2',
        has_active_subscription: false,
        total_xp: 120,
        is_profile_completed: true
      },
      {
        _id: idPri6Promote,
        full_name: 'Mostafa PRI_6 -> PREP_1',
        student_code: 'HA2004',
        role: ROLES.STUDENT,
        curriculum: 'EGYPTIAN',
        grade_level: 'PRI_6',
        academic_term: 'TERM_2',
        has_active_subscription: true,
        total_xp: 500,
        is_profile_completed: true
      },
      {
        _id: idUs11Promote,
        full_name: 'Ziad US_11 -> US_12',
        student_code: 'HA2005',
        role: ROLES.STUDENT,
        curriculum: 'INTERNATIONAL',
        grade_level: 'US_GRADE_11',
        total_xp: 100,
        is_profile_completed: true
      },
      {
        _id: idUk12Promote,
        full_name: 'Farah IGCSE_12 -> IGCSE_13',
        student_code: 'HA2006',
        role: ROLES.STUDENT,
        curriculum: 'INTERNATIONAL',
        grade_level: 'IGCSE_YEAR_12',
        total_xp: 100,
        is_profile_completed: true
      },
      {
        _id: idUkOlPromote,
        full_name: 'Ali IGCSE_OL -> IGCSE_AS',
        student_code: 'HA2007',
        role: ROLES.STUDENT,
        curriculum: 'INTERNATIONAL',
        grade_level: 'IGCSE_OL',
        total_xp: 100,
        is_profile_completed: true
      }
    ];

    subscriptionsDb = [
      { _id: 'sub_eg5', student_id: idEgPri5 },
      { _id: 'sub_fail', student_id: idFailedPri5 }
    ];
    submissionsDb = [
      { _id: 's_eg5', student_id: idEgPri5 },
      { _id: 's_fail', student_id: idFailedPri5 }
    ];
    watchProgressDb = [
      { _id: 'wp_eg5', student_id: idEgPri5 },
      { _id: 'wp_fail', student_id: idFailedPri5 }
    ];
    gamLogsDb = [
      { _id: 'gl_eg5', student_id: idEgPri5 },
      { _id: 'gl_fail', student_id: idFailedPri5 }
    ];
    notificationsDb = [
      { _id: 'n_eg5', recipient_id: idEgPri5 },
      { _id: 'n_fail', recipient_id: idFailedPri5 }
    ];
    studentPresenceCache.set(idEgPri5.toString(), {
      studentId: idEgPri5.toString(),
      studentName: 'Ahmed Promotable PRI_5',
      activityType: 'WATCHING_LECTURE',
      referenceId: 'lec1',
      referenceTitle: 'Lec 1',
      lastHeartbeatAt: new Date()
    });

    const gradeResult = await studentPromotionService.promoteStudents(
      promoteStudentsDtoSchema.parse({
        mode: 'GRADE',
        studentIds: usersDb.map((u) => u._id.toString()),
        excludedStudentIds: [idFailedPri5.toString(), idCancelledPri6.toString()]
      })
    );

    assert.strictEqual(gradeResult.promotedCount, 5);
    assert.strictEqual(gradeResult.excludedCount, 2);
    const promotedEg5 = usersDb.find((u) => u._id === idEgPri5)!;
    assert.strictEqual(promotedEg5.grade_level, 'PRI_6');
    assert.strictEqual(promotedEg5.academic_term, 'TERM_1', 'Grade promotion resets term to TERM_1');
    assert.strictEqual(promotedEg5.total_xp, 0, 'Grade promotion resets XP to 0');
    assert.strictEqual(promotedEg5.has_active_subscription, false, 'Grade promotion resets active subscription flag');
    assert.strictEqual(promotedEg5.student_code, 'HA2001', 'Student HA code preserved on reset');
    assert.strictEqual(promotedEg5.full_name, 'Ahmed Promotable PRI_5', 'Student name preserved on reset');
    assert.strictEqual(subscriptionsDb.some((s) => matchesId(s.student_id, idEgPri5)), false, 'Old subscriptions cleared');
    assert.strictEqual(submissionsDb.some((s) => matchesId(s.student_id, idEgPri5)), false, 'Old submissions cleared');
    assert.strictEqual(watchProgressDb.some((s) => matchesId(s.student_id, idEgPri5)), false, 'Old watch progress cleared');
    assert.strictEqual(gamLogsDb.some((s) => matchesId(s.student_id, idEgPri5)), false, 'Old gamification logs cleared');
    assert.strictEqual(notificationsDb.some((s) => matchesId(s.recipient_id, idEgPri5)), false, 'Old notifications cleared');
    assert.strictEqual(studentPresenceCache.has(idEgPri5.toString()), false, 'Presence cache cleared');

    assert.strictEqual(usersDb.find((u) => u._id === idPri6Promote)!.grade_level, 'PREP_1');
    assert.strictEqual(usersDb.find((u) => u._id === idUs11Promote)!.grade_level, 'US_GRADE_12');
    assert.strictEqual(usersDb.find((u) => u._id === idUk12Promote)!.grade_level, 'IGCSE_YEAR_13');
    assert.strictEqual(usersDb.find((u) => u._id === idUkOlPromote)!.grade_level, 'IGCSE_AS');
    // Excluded students remain 100% untouched (no reset)
    const failedStudentAfter = usersDb.find((u) => u._id === idFailedPri5)!;
    assert.strictEqual(failedStudentAfter.grade_level, 'PRI_5');
    assert.strictEqual(failedStudentAfter.academic_term, 'TERM_2');
    assert.strictEqual(failedStudentAfter.total_xp, 40);
    assert.strictEqual(failedStudentAfter.has_active_subscription, true);
    assert.strictEqual(submissionsDb.some((s) => matchesId(s.student_id, idFailedPri5)), true, 'Excluded student keeps submissions');
    assert.strictEqual(subscriptionsDb.some((s) => matchesId(s.student_id, idFailedPri5)), true, 'Excluded student keeps subscription');
    assert.strictEqual(watchProgressDb.some((s) => matchesId(s.student_id, idFailedPri5)), true, 'Excluded student keeps watch progress');
    assert.strictEqual(usersDb.find((u) => u._id === idCancelledPri6)!.grade_level, 'PRI_6');
    console.log('[PASS] REQ-3 & REQ-4 verified.');

    // -------------------------------------------------------------------------
    // REQ-5, REQ-6 & REQ-7: Graduation Gate (409), Archive vs Permanent Delete, Restore, Cascade Cleanup
    // -------------------------------------------------------------------------
    console.log('--- REQ-5, REQ-6 & REQ-7: Final-Grade Graduation, Archive, Delete & Leaderboard Exclusion ---');
    const idSec3GraduateArchive = new Types.ObjectId();
    const idGulf12GraduateDelete = new Types.ObjectId();
    const idUs12GraduateSkip = new Types.ObjectId();
    const idIg13Graduate = new Types.ObjectId();
    const idIgAlGraduate = new Types.ObjectId();
    const idSatGraduate = new Types.ObjectId();
    const idSec2Advance = new Types.ObjectId();
    const idActiveSec3 = new Types.ObjectId();
    const idParentUser = new Types.ObjectId();

    usersDb = [
      {
        _id: idActiveSec3,
        full_name: 'Active Existing Sec 3 Student',
        student_code: 'HA3008',
        role: ROLES.STUDENT,
        curriculum: 'EGYPTIAN',
        grade_level: 'SEC_3',
        academic_term: 'TERM_2',
        has_active_subscription: true,
        total_xp: 800,
        is_profile_completed: true
      },
      {
        _id: idSec3GraduateArchive,
        full_name: 'Graduated Sec 3 Archived',
        student_code: 'HA3001',
        role: ROLES.STUDENT,
        curriculum: 'EGYPTIAN',
        grade_level: 'SEC_3',
        academic_term: 'TERM_2',
        has_active_subscription: true,
        total_xp: 900,
        is_profile_completed: true
      },
      {
        _id: idGulf12GraduateDelete,
        full_name: 'Graduated Gulf 12 Deleted',
        student_code: 'HA3002',
        role: ROLES.STUDENT,
        curriculum: 'GULF',
        grade_level: 'GRADE_12',
        academic_term: 'TERM_2',
        total_xp: 700,
        is_profile_completed: true
      },
      {
        _id: idUs12GraduateSkip,
        full_name: 'Graduated US 12 Must Not Become IGCSE',
        student_code: 'HA3003',
        role: ROLES.STUDENT,
        curriculum: 'INTERNATIONAL',
        grade_level: 'US_GRADE_12',
        total_xp: 500,
        is_profile_completed: true
      },
      {
        _id: idIg13Graduate,
        full_name: 'Graduated UK Year 13',
        student_code: 'HA3004',
        role: ROLES.STUDENT,
        curriculum: 'INTERNATIONAL',
        grade_level: 'IGCSE_YEAR_13',
        total_xp: 500,
        is_profile_completed: true
      },
      {
        _id: idIgAlGraduate,
        full_name: 'Graduated A-Level',
        student_code: 'HA3005',
        role: ROLES.STUDENT,
        curriculum: 'INTERNATIONAL',
        grade_level: 'IGCSE_AL',
        total_xp: 500,
        is_profile_completed: true
      },
      {
        _id: idSatGraduate,
        full_name: 'Graduated SAT',
        student_code: 'HA3006',
        role: ROLES.STUDENT,
        curriculum: 'AMERICAN',
        grade_level: 'SAT_MATH',
        total_xp: 600,
        is_profile_completed: true
      },
      {
        _id: idSec2Advance,
        full_name: 'Sec 2 Student Advancing',
        student_code: 'HA3007',
        role: ROLES.STUDENT,
        curriculum: 'EGYPTIAN',
        grade_level: 'SEC_2',
        academic_term: 'TERM_2',
        has_active_subscription: true,
        total_xp: 450,
        is_profile_completed: true
      },
      {
        _id: idParentUser,
        full_name: 'Parent Of Deleted Student',
        role: ROLES.PARENT,
        total_xp: 0,
        linked_children: [idGulf12GraduateDelete, idSec3GraduateArchive]
      }
    ];

    subscriptionsDb = [
      { _id: 'sub_del', student_id: idGulf12GraduateDelete },
      { _id: 'sub_keep', student_id: idSec3GraduateArchive }
    ];
    submissionsDb = [{ _id: 'submission_del', student_id: idGulf12GraduateDelete }];
    watchProgressDb = [{ _id: 'wp_del', student_id: idGulf12GraduateDelete }];
    gamLogsDb = [{ _id: 'gl_del', student_id: idGulf12GraduateDelete }];
    notificationsDb = [{ _id: 'not_del', recipient_id: idGulf12GraduateDelete }];
    testimonialsDb = [{ _id: 'testim_del', user_id: idGulf12GraduateDelete }];
    placementDb = [{ _id: 'pa_del', linked_user_id: idGulf12GraduateDelete }];
    leadsDb = [{ _id: 'lead_del', user_id: idGulf12GraduateDelete }];
    deviceWhitelistCache.set(idGulf12GraduateDelete.toString(), new Set(['dev_1']));
    studentPresenceCache.set(idGulf12GraduateDelete.toString(), {
      studentId: idGulf12GraduateDelete.toString(),
      studentName: 'Graduated Gulf 12 Deleted',
      activityType: 'IDLE',
      referenceId: '',
      referenceTitle: '',
      lastHeartbeatAt: new Date()
    });

    // 5a. Attempting promotion without graduation decision MUST fail with 409 AND perform ZERO partial writes
    let thrownErr: any = null;
    try {
      await studentPromotionService.promoteStudents(
        promoteStudentsDtoSchema.parse({
          mode: 'GRADE',
          studentIds: [
            idSec3GraduateArchive.toString(),
            idUs12GraduateSkip.toString(),
            idSec2Advance.toString()
          ]
        })
      );
    } catch (err) {
      thrownErr = err;
    }

    assert.ok(thrownErr, 'Must throw 409 when graduating students lack decisions');
    assert.strictEqual(thrownErr.statusCode, 409);
    assert.strictEqual(thrownErr.errorCode, ERROR_CODES.GRADUATION_DECISION_REQUIRED_409);
    assert.strictEqual(thrownErr.details.graduatingStudents.length, 2, 'SEC_3 and US_GRADE_12 detected (not crossing US->UK)');
    assert.strictEqual(
      usersDb.find((u) => u._id === idSec2Advance)!.grade_level,
      'SEC_2',
      'Atomic gate: SEC_2 must NOT mutate if graduation decision is missing'
    );

    // 5b. Execute mixed batch with ARCHIVE, DELETE, SKIP, and normal GRADE promotion
    const gradBatchResult = await studentPromotionService.promoteStudents(
      promoteStudentsDtoSchema.parse({
        mode: 'GRADE',
        studentIds: [
          idSec3GraduateArchive.toString(),
          idGulf12GraduateDelete.toString(),
          idUs12GraduateSkip.toString(),
          idIg13Graduate.toString(),
          idIgAlGraduate.toString(),
          idSatGraduate.toString(),
          idSec2Advance.toString()
        ],
        graduationDecisions: {
          [idSec3GraduateArchive.toString()]: 'ARCHIVE',
          [idGulf12GraduateDelete.toString()]: 'DELETE',
          [idUs12GraduateSkip.toString()]: 'SKIP',
          [idIg13Graduate.toString()]: 'ARCHIVE',
          [idIgAlGraduate.toString()]: 'ARCHIVE',
          [idSatGraduate.toString()]: 'ARCHIVE'
        }
      })
    );

    assert.strictEqual(gradBatchResult.promotedCount, 1, 'SEC_2 promoted to SEC_3');
    assert.strictEqual(gradBatchResult.archivedCount, 4, 'SEC_3, IGCSE_YEAR_13, IGCSE_AL, SAT_MATH archived');
    assert.strictEqual(gradBatchResult.deletedCount, 1, 'GRADE_12 permanently deleted');
    assert.strictEqual(gradBatchResult.skippedCount, 1, 'US_GRADE_12 skipped (and NOT turned into IGCSE_YEAR_1)');

    // Verify SEC_3 archived state + preserved identity
    const sec3Archived = usersDb.find((u) => u._id === idSec3GraduateArchive)!;
    assert.ok(sec3Archived, 'Archived student remains in DB');
    assert.strictEqual(sec3Archived.is_archived, true);
    assert.strictEqual(sec3Archived.graduation_status, 'GRADUATED');
    assert.strictEqual(sec3Archived.graduated_from_grade, 'SEC_3');
    assert.strictEqual(sec3Archived.is_leaderboard_hidden, true);
    assert.strictEqual(sec3Archived.student_code, 'HA3001');

    // Verify Leaderboard hides archived SEC_3 student even with high XP and subscription,
    // and also excludes newly promoted SEC_2 -> SEC_3 whose subscription/XP was reset for the new grade
    const leaderboardSvc = new GamificationService();
    const lbSec3 = await leaderboardSvc.getLeaderboard({
      curriculum: 'EGYPTIAN',
      gradeLevel: 'SEC_3',
      limit: 20
    });
    assert.strictEqual(lbSec3.totalStudents, 1, 'Only non-archived active SEC_3 student in leaderboard');
    assert.strictEqual(lbSec3.leaderboard[0]?.studentId, idActiveSec3.toString());

    // Verify already-archived student cannot be re-promoted
    const rePromoteArchived = await studentPromotionService.promoteStudents(
      promoteStudentsDtoSchema.parse({
        mode: 'GRADE',
        studentIds: [idSec3GraduateArchive.toString()]
      })
    );
    assert.strictEqual(rePromoteArchived.skipped[0]?.status, 'INELIGIBLE_ARCHIVED');

    // Verify restore from archive brings student back as ACTIVE
    const restored = await studentPromotionService.setStudentArchiveStatus(idSec3GraduateArchive.toString(), false);
    assert.strictEqual(restored.isArchived, false);
    assert.strictEqual(restored.graduationStatus, 'ACTIVE');
    assert.strictEqual(usersDb.find((u) => u._id === idSec3GraduateArchive)!.is_archived, false);

    // Verify US_12 skipped remains US_GRADE_12
    assert.strictEqual(usersDb.find((u) => u._id === idUs12GraduateSkip)!.grade_level, 'US_GRADE_12');

    // Verify Permanent Delete removed user + dependent rows + parent link + caches (leaving other student untouched)
    assert.strictEqual(usersDb.some((u) => u._id === idGulf12GraduateDelete), false, 'Deleted student gone from UserModel');
    assert.strictEqual(subscriptionsDb.length, 1);
    assert.strictEqual(submissionsDb.length, 0);
    assert.strictEqual(watchProgressDb.length, 0);
    assert.strictEqual(gamLogsDb.length, 0);
    assert.strictEqual(notificationsDb.length, 0);
    assert.strictEqual(testimonialsDb.length, 0);
    assert.strictEqual(placementDb[0]?.linked_user_id, null);
    assert.strictEqual(leadsDb[0]?.user_id, null);
    assert.strictEqual(deviceWhitelistCache.has(idGulf12GraduateDelete.toString()), false);
    assert.strictEqual(studentPresenceCache.has(idGulf12GraduateDelete.toString()), false);
    const parentAfter = usersDb.find((u) => u._id === idParentUser)!;
    assert.deepStrictEqual(parentAfter.linked_children, [idSec3GraduateArchive]);
    console.log('[PASS] REQ-5, REQ-6 & REQ-7 verified.');

    // -------------------------------------------------------------------------
    // REQ-8: Non-student accounts (Parent / Admin / Teacher) are strictly protected
    // -------------------------------------------------------------------------
    console.log('--- REQ-8: Non-Student Account Protection ---');
    let parentDeleteErr: any = null;
    try {
      await studentPromotionService.permanentlyDeleteStudent(idParentUser.toString());
    } catch (err) {
      parentDeleteErr = err;
    }
    assert.strictEqual(parentDeleteErr?.statusCode, 403, 'Cannot permanently delete a parent via student endpoint');

    let parentArchiveErr: any = null;
    try {
      await studentPromotionService.setStudentArchiveStatus(idParentUser.toString(), true);
    } catch (err) {
      parentArchiveErr = err;
    }
    assert.strictEqual(parentArchiveErr?.statusCode, 403, 'Cannot archive a parent via student endpoint');

    const parentPromoAttempt = await studentPromotionService.promoteStudents(
      promoteStudentsDtoSchema.parse({
        mode: 'GRADE',
        studentIds: [idParentUser.toString()]
      })
    );
    assert.strictEqual(parentPromoAttempt.promotedCount, 0);
    assert.strictEqual(parentPromoAttempt.skipped[0]?.status, 'INELIGIBLE_NOT_STUDENT');
    console.log('[PASS] REQ-8 verified.');

    console.log('==================================================================');
    console.log('[PASS] ALL STUDENT ACADEMIC PROMOTION & GRADUATION TESTS PASSED!');
    console.log('==================================================================');
  } finally {
    UserModel.find = orig.userFind;
    UserModel.findById = orig.userFindById;
    UserModel.updateOne = orig.userUpdateOne;
    UserModel.deleteOne = orig.userDeleteOne;
    UserModel.updateMany = orig.userUpdateMany;
    SubscriptionModel.deleteMany = orig.subDeleteMany;
    SubmissionModel.deleteMany = orig.submissionDeleteMany;
    WatchProgressModel.deleteMany = orig.watchDeleteMany;
    GamificationLogModel.deleteMany = orig.gamLogDeleteMany;
    NotificationModel.deleteMany = orig.notifDeleteMany;
    TestimonialModel.deleteMany = orig.testimDeleteMany;
    PlacementAttemptModel.updateMany = orig.placementUpdateMany;
    LeadModel.updateMany = orig.leadUpdateMany;
    deviceWhitelistCache.clear();
    studentPresenceCache.clear();
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
