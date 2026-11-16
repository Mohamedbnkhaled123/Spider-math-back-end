import {
  isValidGradeForCurriculum
} from '../../../common/constants/curriculum-hierarchy.constant';
import { directRegisterStudentDtoSchema } from '../../auth/dto/direct-register.dto';
import { completeProfileDtoSchema } from '../../auth/dto/complete-profile.dto';
import { createUnitPackageDtoSchema } from '../dto/unit-crud.dto';
import { unitsQueryDtoSchema } from '../dto/units-query.dto';
import { placementQueryDtoSchema } from '../../leads-placement/dto/placement-query.dto';
import { submitPlacementDtoSchema } from '../../leads-placement/dto/submit-placement.dto';
import { createAssessmentDtoSchema } from '../../assessments-grading/dto/assessment-create.dto';
import { UnitPackageModel } from '../../../models/unit-package.model';
import { UserModel } from '../../../models/user.model';
import { AssessmentModel } from '../../../models/assessment.model';
import { SubscriptionModel } from '../../../models/subscription.model';

async function runTests() {
  console.log('Running Dynamic Curriculum Tracks & Custom Stages Verification Suite...\n');

  // Test 1: isValidGradeForCurriculum canonical checks
  console.log('--- Test 1: Canonical Grade Validation ---');
  if (!isValidGradeForCurriculum('EGYPTIAN', 'SEC_3')) {
    throw new Error('SEC_3 should be valid for EGYPTIAN');
  }
  if (!isValidGradeForCurriculum('GULF', 'GRADE_12')) {
    throw new Error('GRADE_12 should be valid for GULF');
  }
  if (!isValidGradeForCurriculum('INTERNATIONAL', 'IGCSE_OL')) {
    throw new Error('IGCSE_OL should be valid for INTERNATIONAL');
  }
  if (!isValidGradeForCurriculum('AMERICAN', 'SAT_MATH')) {
    throw new Error('SAT_MATH should be valid for AMERICAN');
  }
  console.log('Test 1 Passed: Canonical grades validated correctly.');

  // Test 2: isValidGradeForCurriculum cross-curriculum mismatch rejection
  console.log('--- Test 2: Cross-Curriculum Mismatch Rejection ---');
  if (isValidGradeForCurriculum('GULF', 'PRI_1')) {
    throw new Error('PRI_1 must NOT be valid for GULF');
  }
  if (isValidGradeForCurriculum('EGYPTIAN', 'GRADE_10')) {
    throw new Error('GRADE_10 must NOT be valid for EGYPTIAN');
  }
  if (isValidGradeForCurriculum('AMERICAN', 'PREP_2')) {
    throw new Error('PREP_2 must NOT be valid for AMERICAN');
  }
  console.log('Test 2 Passed: Canonical grades from other curricula are correctly rejected.');

  // Test 3: isValidGradeForCurriculum custom grade codes
  console.log('--- Test 3: Custom Grade Codes for Custom Stages (QODORAT / GAT) ---');
  if (!isValidGradeForCurriculum('GULF', 'QODORAT')) {
    throw new Error('QODORAT must be valid for GULF custom track');
  }
  if (!isValidGradeForCurriculum('GULF', 'GAT')) {
    throw new Error('GAT must be valid for GULF custom track');
  }
  if (!isValidGradeForCurriculum('GULF', 'QODORAT_1')) {
    throw new Error('QODORAT_1 must be valid for GULF custom track');
  }
  if (!isValidGradeForCurriculum('EGYPTIAN', 'CUSTOM_MATH_SPECIAL')) {
    throw new Error('CUSTOM_MATH_SPECIAL must be valid for EGYPTIAN custom track');
  }
  if (!isValidGradeForCurriculum('INTERNATIONAL', 'OXFORD_AQA_MATH')) {
    throw new Error('OXFORD_AQA_MATH must be valid for INTERNATIONAL custom track');
  }
  if (isValidGradeForCurriculum(null as any, 'QODORAT')) {
    throw new Error('null curriculum must be rejected');
  }
  if (isValidGradeForCurriculum('GULF', '')) {
    throw new Error('empty grade level must be rejected');
  }
  console.log('Test 3 Passed: Custom grade codes across curricula are accepted cleanly.');

  // Test 4: Direct Student Registration DTO with Custom Grades
  console.log('--- Test 4: Direct Registration with Custom Grade (QODORAT) ---');
  const validRegisterPayload = {
    fullName: 'أحمد السعيد محمد',
    email: 'ahmed.student@example.com',
    phone: '0551234567',
    parentPhone: '0559876543',
    curriculum: 'GULF',
    gradeLevel: 'QODORAT',
    academicTerm: 'TERM_1',
    country: 'SA'
  };
  const registerResult = directRegisterStudentDtoSchema.safeParse(validRegisterPayload);
  if (!registerResult.success) {
    throw new Error(`Direct registration failed for custom grade QODORAT: ${JSON.stringify(registerResult.error.format())}`);
  }

  // Reject register with cross-curriculum grade
  const invalidRegisterPayload = {
    ...validRegisterPayload,
    gradeLevel: 'PRI_1' // Egyptian canonical in Gulf
  };
  const invalidRegisterResult = directRegisterStudentDtoSchema.safeParse(invalidRegisterPayload);
  if (invalidRegisterResult.success) {
    throw new Error('Direct registration must reject cross-curriculum canonical mismatch');
  }
  console.log('Test 4 Passed: Direct registration accepts custom grades and enforces curriculum boundaries.');

  // Test 5: Complete Profile DTO with Custom Grades
  console.log('--- Test 5: Complete Profile DTO with Custom Grade ---');
  const completeProfilePayload = {
    fullName: 'طالب قدرات تجريبي',
    phone: '0501234567',
    parentPhone: '0507654321',
    curriculum: 'GULF',
    gradeLevel: 'GAT',
    academicTerm: 'TERM_1',
    country: 'SA'
  };
  const profileResult = completeProfileDtoSchema.safeParse(completeProfilePayload);
  if (!profileResult.success) {
    throw new Error(`Complete profile failed for custom grade GAT: ${JSON.stringify(profileResult.error.format())}`);
  }
  console.log('Test 5 Passed: Profile completion cleanly accepts custom grades.');

  // Test 6: Unit CRUD & Query DTO with Custom Grades
  console.log('--- Test 6: Unit CRUD & Query DTOs with Custom Grade ---');
  const createUnitPayload = {
    curriculum: 'GULF',
    grade_level: 'QODORAT',
    academic_term: 'TERM_1',
    title_ar: 'حزمة تأسيس واختبارات القدرات العامة',
    title_en: 'General Abilities Test (GAT) Foundations',
    price_egp: 500,
    is_published: true
  };
  const unitResult = createUnitPackageDtoSchema.safeParse(createUnitPayload);
  if (!unitResult.success) {
    throw new Error(`Unit package creation failed for custom grade: ${JSON.stringify(unitResult.error.format())}`);
  }

  const queryResult = unitsQueryDtoSchema.safeParse({ curriculum: 'GULF', gradeLevel: 'QODORAT' });
  if (!queryResult.success) {
    throw new Error(`Units query failed for custom grade: ${JSON.stringify(queryResult.error.format())}`);
  }
  console.log('Test 6 Passed: Unit CRUD & Units Query DTOs accept custom grade levels.');

  // Test 7: Placement Query & Submit DTOs with Custom Grades
  console.log('--- Test 7: Placement Query & Submit DTOs with Custom Grade ---');
  const placementQuery = placementQueryDtoSchema.safeParse({
    curriculum: 'GULF',
    gradeLevel: 'QODORAT',
    term: 'TERM_1'
  });
  if (!placementQuery.success) {
    throw new Error(`Placement query failed for custom grade: ${JSON.stringify(placementQuery.error.format())}`);
  }

  const placementSubmit = submitPlacementDtoSchema.safeParse({
    curriculum: 'GULF',
    gradeLevel: 'QODORAT',
    academicTerm: 'TERM_1',
    answers: [
      { questionId: '507f1f77bcf86cd799439011', selectedOption: 0 }
    ]
  });
  if (!placementSubmit.success) {
    throw new Error(`Placement submit failed for custom grade: ${JSON.stringify(placementSubmit.error.format())}`);
  }
  console.log('Test 7 Passed: Placement exam query & submission support custom grades.');

  // Test 7b: Assessment Create DTO with Custom Grade
  console.log('--- Test 7b: Assessment Create DTO with Custom Grade ---');
  const asmCreateResult = createAssessmentDtoSchema.safeParse({
    curriculum: 'GULF',
    grade_level: 'QODORAT',
    academic_term: 'TERM_1',
    title_ar: 'اختبار تجريبي في مهارات القدرات الكمية',
    time_limit_minutes: 45
  });
  if (!asmCreateResult.success) {
    throw new Error(`Assessment creation failed for custom grade: ${JSON.stringify(asmCreateResult.error.format())}`);
  }
  console.log('Test 7b Passed: Assessment creation DTO supports custom grade levels.');

  // Test 8: Mongoose Models Schema Validation
  console.log('--- Test 8: Mongoose Models Grade Validation ---');
  const unitDoc = new UnitPackageModel({
    curriculum: 'GULF',
    grade_level: 'QODORAT',
    academic_term: 'TERM_1',
    title_ar: 'اختبارات القدرات التجريبية',
    price_egp: 350
  });
  const unitValidation = unitDoc.validateSync(['grade_level']);
  if (unitValidation) {
    throw new Error(`UnitPackageModel rejected custom grade QODORAT: ${unitValidation.message}`);
  }

  const userDoc = new UserModel({
    fullName: 'طالب قدرات',
    phone: '0551112233',
    role: 'STUDENT',
    curriculum: 'GULF',
    grade_level: 'QODORAT',
    is_profile_completed: true
  });
  const userValidation = userDoc.validateSync(['grade_level']);
  if (userValidation) {
    throw new Error(`UserModel rejected custom grade QODORAT: ${userValidation.message}`);
  }

  const assessmentDoc = new AssessmentModel({
    curriculum: 'GULF',
    grade_level: 'QODORAT',
    academic_term: 'TERM_1',
    title_ar: 'امتحان القدرات التجريبي الأول',
    questions: []
  });
  const asmValidation = assessmentDoc.validateSync(['grade_level']);
  if (asmValidation) {
    throw new Error(`AssessmentModel rejected custom grade QODORAT: ${asmValidation.message}`);
  }

  const subDoc = new SubscriptionModel({
    student_id: '507f1f77bcf86cd799439011',
    unit_package_id: '507f1f77bcf86cd799439012',
    curriculum: 'GULF',
    grade_level: 'QODORAT',
    academic_term: 'TERM_1'
  });
  const subValidation = subDoc.validateSync(['grade_level']);
  if (subValidation) {
    throw new Error(`SubscriptionModel rejected custom grade QODORAT: ${subValidation.message}`);
  }
  console.log('Test 8 Passed: Mongoose models cleanly persist custom grades without enum restriction.');

  console.log('\n================================================================');
  console.log('ALL DYNAMIC CURRICULUM TRACKS & CUSTOM STAGES TESTS PASSED!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('\nTest Suite Failed:', err);
  process.exit(1);
});
