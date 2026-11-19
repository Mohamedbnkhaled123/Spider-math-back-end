import assert from 'assert';
import { Types } from 'mongoose';
import { GradingService } from './grading.service';
import { AssessmentsService } from './assessments.service';
import { bulkDeleteSubmissionsDtoSchema, restoreSubmissionsDtoSchema } from '../dto/manage-submissions.dto';
import { SubmissionModel } from '../../../models/submission.model';
import { AssessmentModel } from '../../../models/assessment.model';
import { UnitPackageModel } from '../../../models/unit-package.model';
import { UserModel } from '../../../models/user.model';

interface MockSubmission {
  _id: Types.ObjectId;
  assessment_id: Types.ObjectId;
  student_id: Types.ObjectId;
  unit_package_id?: Types.ObjectId | null;
  attempt_number: number;
  sync_queue_status: 'IN_PROGRESS' | 'SYNCED_ONLINE';
  result_visibility: 'HIDDEN_PENDING_TEACHER' | 'PUBLISHED_TO_STUDENT_AND_PARENT';
  final_total_score: number;
  mcq_auto_score: number;
  essay_manual_score: number;
  hidden_from_teacher?: boolean;
  hidden_from_teacher_at?: Date | null;
  graded_at?: Date | null;
  createdAt: Date;
}

async function runTests() {
  console.log('Running Submission Hide/Delete/Restore & Orphan Cleanup Requirements Suite...');

  const orig = {
    subFind: SubmissionModel.find,
    subCountDocuments: SubmissionModel.countDocuments,
    subUpdateMany: SubmissionModel.updateMany,
    subDeleteMany: SubmissionModel.deleteMany,
    asmFind: AssessmentModel.find,
    asmFindByIdAndDelete: AssessmentModel.findByIdAndDelete,
    unitFindByIdAndUpdate: UnitPackageModel.findByIdAndUpdate,
    userFind: UserModel.find
  };

  let submissionsDb: MockSubmission[] = [];
  let assessmentsDb: Array<{
    _id: Types.ObjectId;
    title_ar: string;
    title_en: string;
    total_points: number;
    assessment_type: string;
    curriculum: string;
    grade_level: string;
    academic_term: string;
    unit_package_id?: Types.ObjectId | null;
    max_attempts: number;
    questions: any[];
    has_essay_questions: boolean;
    xp_reward: number;
  }> = [];
  let studentsDb: Array<{
    _id: Types.ObjectId;
    full_name: string;
    student_code: string;
    curriculum: string;
    grade_level: string;
    academic_term: string;
    country: string;
    role: string;
  }> = [];

  const matchesId = (a: any, b: any) => String(a) === String(b);

  const matchesSubmissionFilter = (sub: MockSubmission, filter: any): boolean => {
    if (!filter || Object.keys(filter).length === 0) return true;
    if (filter.hidden_from_teacher?.$ne === true && sub.hidden_from_teacher === true) return false;
    if (filter.hidden_from_teacher === true && sub.hidden_from_teacher !== true) return false;
    if (filter.result_visibility && sub.result_visibility !== filter.result_visibility) return false;
    if (filter.sync_queue_status) {
      if (filter.sync_queue_status.$in) {
        if (!filter.sync_queue_status.$in.includes(sub.sync_queue_status)) return false;
      } else if (sub.sync_queue_status !== filter.sync_queue_status) {
        return false;
      }
    }
    if (filter.student_id && !matchesId(sub.student_id, filter.student_id)) return false;
    if (filter.assessment_id && !matchesId(sub.assessment_id, filter.assessment_id)) return false;
    return true;
  };

  const installMocks = () => {
    (SubmissionModel as any).find = (filter: any) => {
      let populateStudent = false;
      let populateAssessment = false;

      const buildRows = () =>
        submissionsDb
          .filter((s) => matchesSubmissionFilter(s, filter))
          .map((s) => {
            const out: any = { ...s };
            if (populateStudent) {
              out.student_id = studentsDb.find((st) => matchesId(st._id, s.student_id)) || null;
            }
            if (populateAssessment) {
              out.assessment_id = assessmentsDb.find((a) => matchesId(a._id, s.assessment_id)) || null;
            }
            return out;
          });

      const chain: any = {
        populate(path: string) {
          if (path === 'student_id') populateStudent = true;
          if (path === 'assessment_id') populateAssessment = true;
          return chain;
        },
        sort() {
          return chain;
        },
        skip() {
          return chain;
        },
        limit() {
          return chain;
        },
        lean: async () => buildRows()
      };
      return chain;
    };

    (SubmissionModel as any).countDocuments = async (filter: any) =>
      submissionsDb.filter((s) => matchesSubmissionFilter(s, filter)).length;

    (SubmissionModel as any).updateMany = async (filter: any, update: any) => {
      const ids: any[] = filter?._id?.$in || [];
      let modifiedCount = 0;
      for (const s of submissionsDb) {
        if (ids.some((id) => matchesId(id, s._id))) {
          if (update?.$set) Object.assign(s, update.$set);
          modifiedCount += 1;
        }
      }
      return { modifiedCount, matchedCount: modifiedCount };
    };

    (SubmissionModel as any).deleteMany = async (filter: any) => {
      const before = submissionsDb.length;
      if (filter?._id?.$in) {
        const ids: any[] = filter._id.$in;
        submissionsDb = submissionsDb.filter((s) => !ids.some((id) => matchesId(id, s._id)));
      } else if (filter?.assessment_id) {
        submissionsDb = submissionsDb.filter((s) => !matchesId(s.assessment_id, filter.assessment_id));
      }
      return { deletedCount: before - submissionsDb.length };
    };

    (AssessmentModel as any).findByIdAndDelete = async (id: string) => {
      const idx = assessmentsDb.findIndex((a) => matchesId(a._id, id));
      if (idx === -1) return null;
      const [removed] = assessmentsDb.splice(idx, 1);
      return removed;
    };

    (UnitPackageModel as any).findByIdAndUpdate = async () => ({});

    (UserModel as any).find = () => ({
      select: () => ({
        lean: async () => studentsDb
      })
    });
  };

  try {
    installMocks();

    const gradingService = new GradingService();
    const assessmentsService = new AssessmentsService();

    const studentId = new Types.ObjectId();
    const asm1Id = new Types.ObjectId();
    const asm2Id = new Types.ObjectId();
    const unitId = new Types.ObjectId();

    studentsDb = [
      {
        _id: studentId,
        full_name: 'Student One',
        student_code: 'HA5001',
        curriculum: 'EGYPTIAN',
        grade_level: 'SEC_3',
        academic_term: 'TERM_1',
        country: 'EG',
        role: 'STUDENT'
      }
    ];

    assessmentsDb = [
      {
        _id: asm1Id,
        title_ar: 'واجب التفاضل',
        title_en: 'Calculus Homework',
        total_points: 10,
        assessment_type: 'HOMEWORK',
        curriculum: 'EGYPTIAN',
        grade_level: 'SEC_3',
        academic_term: 'TERM_1',
        unit_package_id: unitId,
        max_attempts: 1,
        questions: [],
        has_essay_questions: true,
        xp_reward: 20
      },
      {
        _id: asm2Id,
        title_ar: 'كويز الجبر',
        title_en: 'Algebra Quiz',
        total_points: 10,
        assessment_type: 'QUIZ',
        curriculum: 'EGYPTIAN',
        grade_level: 'SEC_3',
        academic_term: 'TERM_1',
        unit_package_id: unitId,
        max_attempts: 1,
        questions: [],
        has_essay_questions: false,
        xp_reward: 20
      }
    ];

    const subPendingHideId = new Types.ObjectId();
    const subPublishedPermDelId = new Types.ObjectId();
    const subOtherAsmId = new Types.ObjectId();

    submissionsDb = [
      {
        _id: subPendingHideId,
        assessment_id: asm1Id,
        student_id: studentId,
        unit_package_id: unitId,
        attempt_number: 1,
        sync_queue_status: 'SYNCED_ONLINE',
        result_visibility: 'HIDDEN_PENDING_TEACHER',
        final_total_score: 8,
        mcq_auto_score: 0,
        essay_manual_score: 8,
        hidden_from_teacher: false,
        createdAt: new Date()
      },
      {
        _id: subPublishedPermDelId,
        assessment_id: asm2Id,
        student_id: studentId,
        unit_package_id: unitId,
        attempt_number: 1,
        sync_queue_status: 'SYNCED_ONLINE',
        result_visibility: 'PUBLISHED_TO_STUDENT_AND_PARENT',
        final_total_score: 10,
        mcq_auto_score: 10,
        essay_manual_score: 0,
        hidden_from_teacher: false,
        createdAt: new Date()
      },
      {
        _id: subOtherAsmId,
        assessment_id: asm1Id,
        student_id: new Types.ObjectId(),
        unit_package_id: unitId,
        attempt_number: 1,
        sync_queue_status: 'SYNCED_ONLINE',
        result_visibility: 'PUBLISHED_TO_STUDENT_AND_PARENT',
        final_total_score: 9,
        mcq_auto_score: 0,
        essay_manual_score: 9,
        hidden_from_teacher: false,
        createdAt: new Date()
      }
    ];

    // -------------------------------------------------------------------------
    // SUB-REQ-1: HIDE_FROM_TEACHER hides from teacher list & pending review, preserves student review
    // -------------------------------------------------------------------------
    console.log('--- SUB-REQ-1: Hide from Teacher While Student Keeps Review ---');
    const hideDto = bulkDeleteSubmissionsDtoSchema.parse({
      submissionIds: [subPendingHideId.toString()],
      mode: 'HIDE_FROM_TEACHER'
    });
    const hideRes = await gradingService.bulkDeleteOrHideSubmissions(hideDto.submissionIds, hideDto.mode);
    assert.strictEqual(hideRes.affectedCount, 1);

    const teacherVisibleAll = await gradingService.getAllSubmissions({});
    assert.strictEqual(
      teacherVisibleAll.submissions.some((s: any) => matchesId(s._id, subPendingHideId)),
      false,
      'Hidden submission must not appear in default teacher list'
    );
    assert.strictEqual(teacherVisibleAll.stats.hiddenCount, 1, 'Stats tracks hiddenCount = 1');

    const teacherPending = await gradingService.getPendingSubmissions({});
    assert.strictEqual(
      teacherPending.submissions.some((s: any) => matchesId(s._id, subPendingHideId)),
      false,
      'Hidden submission must not appear in teacher pending review'
    );

    const studentSubsWhileHidden = await assessmentsService.getMySubmissions(studentId.toString());
    assert.strictEqual(
      studentSubsWhileHidden.some((s: any) => s.id === subPendingHideId.toString()),
      true,
      'Student MUST still see and review submission when hidden from teacher only'
    );
    console.log('[PASS] SUB-REQ-1 verified.');

    // -------------------------------------------------------------------------
    // SUB-REQ-2: Show Hidden (includeHidden=true) and Restore to Teacher View
    // -------------------------------------------------------------------------
    console.log('--- SUB-REQ-2: Show Hidden & Restore to Teacher Dashboard ---');
    const teacherWithHidden = await gradingService.getAllSubmissions({ includeHidden: true });
    assert.strictEqual(teacherWithHidden.submissions.length, 3);
    assert.strictEqual(
      teacherWithHidden.submissions.find((s: any) => matchesId(s._id, subPendingHideId))?.hidden_from_teacher,
      true
    );

    const restoreDto = restoreSubmissionsDtoSchema.parse({
      submissionIds: [subPendingHideId.toString()]
    });
    const restoreRes = await gradingService.restoreHiddenSubmissions(restoreDto.submissionIds);
    assert.strictEqual(restoreRes.restoredCount, 1);

    const teacherAfterRestore = await gradingService.getAllSubmissions({});
    assert.strictEqual(teacherAfterRestore.submissions.length, 3);
    assert.strictEqual(teacherAfterRestore.stats.hiddenCount, 0);
    console.log('[PASS] SUB-REQ-2 verified.');

    // -------------------------------------------------------------------------
    // SUB-REQ-3: PERMANENT_DELETE deletes from MongoDB for both teacher & student
    // -------------------------------------------------------------------------
    console.log('--- SUB-REQ-3: Permanent Deletion from Database ---');
    const permDto = bulkDeleteSubmissionsDtoSchema.parse({
      submissionIds: [subPublishedPermDelId.toString()],
      mode: 'PERMANENT_DELETE'
    });
    const permRes = await gradingService.bulkDeleteOrHideSubmissions(permDto.submissionIds, permDto.mode);
    assert.strictEqual(permRes.affectedCount, 1);
    assert.strictEqual(submissionsDb.some((s) => matchesId(s._id, subPublishedPermDelId)), false);

    const studentSubsAfterPermDel = await assessmentsService.getMySubmissions(studentId.toString());
    assert.strictEqual(
      studentSubsAfterPermDel.some((s: any) => s.id === subPublishedPermDelId.toString()),
      false,
      'Permanently deleted submission removed from student history as well'
    );
    console.log('[PASS] SUB-REQ-3 verified.');

    // -------------------------------------------------------------------------
    // SUB-REQ-4: Deleting an assessment cleans up its orphaned submissions
    // -------------------------------------------------------------------------
    console.log('--- SUB-REQ-4: Orphan Submission Cleanup on deleteAssessment ---');
    assert.strictEqual(submissionsDb.filter((s) => matchesId(s.assessment_id, asm1Id)).length, 2);
    await assessmentsService.deleteAssessment(asm1Id.toString());
    assert.strictEqual(
      submissionsDb.filter((s) => matchesId(s.assessment_id, asm1Id)).length,
      0,
      'Deleting assessment must remove all submissions referencing that assessment'
    );
    console.log('[PASS] SUB-REQ-4 verified.');

    console.log('==================================================================');
    console.log('[PASS] ALL SUBMISSION MANAGEMENT REQUIREMENTS TESTS PASSED!');
    console.log('==================================================================');
  } finally {
    SubmissionModel.find = orig.subFind;
    SubmissionModel.countDocuments = orig.subCountDocuments;
    SubmissionModel.updateMany = orig.subUpdateMany;
    SubmissionModel.deleteMany = orig.subDeleteMany;
    AssessmentModel.findByIdAndDelete = orig.asmFindByIdAndDelete;
    UnitPackageModel.findByIdAndUpdate = orig.unitFindByIdAndUpdate;
    UserModel.find = orig.userFind;
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
