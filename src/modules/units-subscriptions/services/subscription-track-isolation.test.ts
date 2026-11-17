import assert from 'assert';
import { Types } from 'mongoose';
import {
  getCompatibleCurriculumsForQuery,
  getEffectiveCurriculumForRecord,
  isAcademicTrackCompatible,
  isValidGradeForCurriculum
} from '../../../common/constants/curriculum-hierarchy.constant';
import { SubscriptionsService } from './subscriptions.service';
import { UnitsService } from './units.service';
import { AssessmentsService } from '../../assessments-grading/services/assessments.service';
import { UserModel } from '../../../models/user.model';
import { UnitPackageModel } from '../../../models/unit-package.model';
import { SubscriptionModel } from '../../../models/subscription.model';
import { LectureMaterialModel } from '../../../models/lecture-material.model';
import { AssessmentModel } from '../../../models/assessment.model';

function chainableResult<T>(value: T): any {
  const chain: any = {
    select: () => chain,
    sort: () => chain,
    populate: () => chain,
    lean: async () => value,
    then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject)
  };
  return chain;
}

async function runTests() {
  console.log('Running Subscription Track Isolation & Content Visibility Tests...');

  // 1. Academic track normalization & non-collision guarantees
  assert.strictEqual(getEffectiveCurriculumForRecord('AMERICAN', 'US_GRADE_1'), 'INTERNATIONAL');
  assert.strictEqual(getEffectiveCurriculumForRecord('AMERICAN', 'SAT'), 'AMERICAN');
  assert.strictEqual(isValidGradeForCurriculum('AMERICAN', 'SAT'), true);
  assert.strictEqual(isValidGradeForCurriculum('AMERICAN', 'EST_1'), true);
  assert.strictEqual(isValidGradeForCurriculum('AMERICAN', 'ACT_1'), true);

  assert.strictEqual(
    isAcademicTrackCompatible('AMERICAN', 'US_GRADE_1', 'INTERNATIONAL', 'US_GRADE_1'),
    true,
    'Legacy (AMERICAN, US_GRADE_1) student must match (INTERNATIONAL, US_GRADE_1) unit'
  );
  assert.strictEqual(
    isAcademicTrackCompatible('AMERICAN', 'US_GRADE_12', 'GULF', 'GRADE_12'),
    false,
    'US_GRADE_12 must never collide with GULF GRADE_12'
  );
  assert.strictEqual(
    isAcademicTrackCompatible('EGYPTIAN', 'SEC_1', 'EGYPTIAN', 'SEC_3'),
    false,
    'Cross-grade activation in same curriculum must be rejected'
  );
  assert.strictEqual(
    isAcademicTrackCompatible('AMERICAN', 'SAT_MATH', 'INTERNATIONAL', 'US_GRADE_1'),
    false,
    'SAT_MATH must not match US_GRADE_1'
  );
  assert.deepStrictEqual(
    getCompatibleCurriculumsForQuery('AMERICAN', 'US_GRADE_1'),
    ['INTERNATIONAL', 'AMERICAN']
  );

  const origUserFindById = (UserModel as any).findById;
  const origUserFindByIdAndUpdate = (UserModel as any).findByIdAndUpdate;
  const origUnitFindById = (UnitPackageModel as any).findById;
  const origUnitFind = (UnitPackageModel as any).find;
  const origSubFindOneAndUpdate = (SubscriptionModel as any).findOneAndUpdate;
  const origSubFind = (SubscriptionModel as any).find;
  const origLecAggregate = (LectureMaterialModel as any).aggregate;
  const origAsmAggregate = (AssessmentModel as any).aggregate;
  const origAsmFind = (AssessmentModel as any).find;

  try {
    const subscriptionsService = new SubscriptionsService();
    const unitsService = new UnitsService();
    const assessmentsService = new AssessmentsService();

    const adminId = new Types.ObjectId().toString();
    const studentId = new Types.ObjectId();
    const unitNumbersId = new Types.ObjectId();
    const unitSec1Id = new Types.ObjectId();

    const hebaStudent: any = {
      _id: studentId,
      role: 'STUDENT',
      student_code: 'HA1004',
      curriculum: 'AMERICAN',
      grade_level: 'US_GRADE_1'
    };

    const numbersUnit: any = {
      _id: unitNumbersId,
      title_ar: 'Numbers',
      title_en: 'Numbers',
      curriculum: 'INTERNATIONAL',
      grade_level: 'US_GRADE_1',
      academic_term: 'TERM_1',
      price_egp: 250,
      validity_days: 90,
      is_published: true
    };

    const wrongUnit: any = {
      _id: unitSec1Id,
      title_ar: 'الوحدة 3',
      title_en: 'Unit 3',
      curriculum: 'EGYPTIAN',
      grade_level: 'SEC_1',
      academic_term: 'TERM_1',
      price_egp: 3500,
      validity_days: 90,
      is_published: true
    };

    // 2. Reject cross-curriculum/cross-grade unit activation
    (UserModel as any).findById = () => chainableResult(hebaStudent);
    (UnitPackageModel as any).findById = (id: any) =>
      chainableResult(String(id) === unitSec1Id.toString() ? wrongUnit : numbersUnit);

    let rejectedWrongUnit = false;
    try {
      await subscriptionsService.activateSubscription(adminId, {
        student_id: studentId.toString(),
        unit_id: unitSec1Id.toString(),
        access_scope: 'FULL'
      });
    } catch (err: any) {
      rejectedWrongUnit = err?.statusCode === 400;
    }
    assert.strictEqual(rejectedWrongUnit, true, 'Activating EGYPTIAN SEC_1 unit for US_GRADE_1 student must return 400');

    // 3. Allow compatible unit activation ((AMERICAN, US_GRADE_1) <-> (INTERNATIONAL, US_GRADE_1))
    let upsertedSub = false;
    (SubscriptionModel as any).findOneAndUpdate = async () => {
      upsertedSub = true;
      return { _id: new Types.ObjectId(), student_id: studentId, unit_package_id: unitNumbersId, subscription_status: 'ACTIVE' };
    };
    (UserModel as any).findByIdAndUpdate = async () => hebaStudent;

    const activated = await subscriptionsService.activateSubscription(adminId, {
      student_id: studentId.toString(),
      unit_id: unitNumbersId.toString(),
      access_scope: 'FULL'
    });
    assert.strictEqual(upsertedSub, true);
    assert.strictEqual(activated.subscription_status, 'ACTIVE');

    // 4. UnitsService.getUnitsCatalog returns subscribed INTERNATIONAL US_GRADE_1 unit even for legacy AMERICAN US_GRADE_1 student
    let capturedUnitFilter: any = null;
    (SubscriptionModel as any).find = () =>
      chainableResult([
        {
          unit_package_id: unitNumbersId,
          expires_at: new Date(Date.now() + 86400000),
          access_scope: 'FULL'
        }
      ]);
    (UnitPackageModel as any).find = (filter: any) => {
      capturedUnitFilter = filter;
      return chainableResult([numbersUnit]);
    };
    (LectureMaterialModel as any).aggregate = async () => [{ _id: unitNumbersId, count: 3 }];
    (AssessmentModel as any).aggregate = async () => [{ _id: unitNumbersId, count: 2 }];

    const catalogUnits = await unitsService.getUnitsCatalog(
      { curriculum: 'AMERICAN', gradeLevel: 'US_GRADE_1' } as any,
      studentId.toString(),
      false
    );
    assert.strictEqual(catalogUnits.length, 1);
    assert.strictEqual(catalogUnits[0].isSubscribed, true);
    assert.strictEqual(catalogUnits[0].lectures_count, 3);
    assert.strictEqual(catalogUnits[0].quizzes_count, 2);
    assert.ok(Array.isArray(capturedUnitFilter?.$or), 'Unit catalog query must combine compatible track filter and active subscriptions');

    // 5. AssessmentsService.getAssessments includes quizzes inside student's active subscribed units
    let capturedAsmFilter: any = null;
    (AssessmentModel as any).find = (filter: any) => {
      capturedAsmFilter = filter;
      return chainableResult([
        {
          _id: new Types.ObjectId(),
          title_ar: 'Numbers Quiz 1',
          unit_package_id: { _id: unitNumbersId, title_ar: 'Numbers' },
          curriculum: 'INTERNATIONAL',
          grade_level: 'US_GRADE_1',
          is_published: true,
          questions: [{ prompt: '1+1' }]
        }
      ]);
    };

    const studentAsms = await assessmentsService.getAssessments(
      { studentId: studentId.toString(), curriculum: 'AMERICAN', gradeLevel: 'US_GRADE_1' },
      false
    );
    assert.strictEqual(studentAsms.length, 1);
    assert.ok(Array.isArray(capturedAsmFilter?.$and), 'Assessment query must use $and to include active subscribed unit assessments safely');

    console.log('ALL SUBSCRIPTION TRACK ISOLATION & CONTENT VISIBILITY TESTS PASSED!');
  } finally {
    (UserModel as any).findById = origUserFindById;
    (UserModel as any).findByIdAndUpdate = origUserFindByIdAndUpdate;
    (UnitPackageModel as any).findById = origUnitFindById;
    (UnitPackageModel as any).find = origUnitFind;
    (SubscriptionModel as any).findOneAndUpdate = origSubFindOneAndUpdate;
    (SubscriptionModel as any).find = origSubFind;
    (LectureMaterialModel as any).aggregate = origLecAggregate;
    (AssessmentModel as any).aggregate = origAsmAggregate;
    (AssessmentModel as any).find = origAsmFind;
  }
}

runTests().catch((err) => {
  console.error('Subscription track isolation tests failed:', err);
  process.exit(1);
});
