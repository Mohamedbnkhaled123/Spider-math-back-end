import { z } from 'zod';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS,
  isValidGradeForCurriculum,
  CurriculumType
} from '../../../common/constants/curriculum-hierarchy.constant';
import { GOVERNORATE_CODES } from '../../../common/constants/governorates.constant';
import {
  validatePhoneNumber,
  arePhoneNumbersIdentical
} from '../../../common/utils/phone-validator.util';

export const directRegisterStudentDtoSchema = z
  .object({
    fullName: z
      .string({ required_error: 'اسم الطالب بالكامل مطلوب' })
      .min(3, 'يجب أن يتكون اسم الطالب من 3 أحرف على الأقل')
      .max(100),

    email: z
      .string()
      .email('البريد الإلكتروني غير صالح')
      .optional()
      .or(z.literal('')),

    phone: z
      .string({ required_error: 'رقم هاتف الطالب مطلوب' })
      .min(8, 'رقم الهاتف قصير جداً')
      .max(25),

    parentPhone: z
      .string({ required_error: 'رقم هاتف ولي الأمر مطلوب لمتابعة الدرجات والتقارير' })
      .min(8, 'رقم هاتف ولي الأمر قصير جداً')
      .max(25),

    curriculum: z.enum(CURRICULUMS, {
      required_error: 'المسار الدراسي مطلوب'
    }),

    gradeLevel: z.enum(ALL_GRADE_LEVELS, {
      required_error: 'الصف الدراسي مطلوب'
    }),

    academicTerm: z.enum(ACADEMIC_TERMS).default('TERM_1'),

    country: z.string().default('EG'),

    governorate: z
      .string()
      .optional()
      .nullable(),

    avatarUrl: z.string().optional().nullable(),

    deviceUuid: z.string().optional().default('direct_reg_device'),
    deviceType: z.string().optional().default('Browser'),
    browserInfo: z.string().optional().default('Web Client')
  })
  .superRefine((data, ctx) => {
    // 1. Validate that gradeLevel belongs to the chosen curriculum
    if (!isValidGradeForCurriculum(data.curriculum as CurriculumType, data.gradeLevel)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gradeLevel'],
        message: `الصف الدراسي المختصر لا ينتمي للمسار الدراسي المحدد`
      });
    }

    // 2. Validate conditional Egyptian governorate
    if (data.country === 'EG') {
      if (!data.governorate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['governorate'],
          message: 'يرجى اختيار المحافظة للطلاب المقيمين داخل مصر'
        });
      } else if (!(GOVERNORATE_CODES as readonly string[]).includes(data.governorate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['governorate'],
          message: `المحافظة المحددة غير صحيحة`
        });
      }
    }

    // 3. Country-specific student phone validation
    const studentPhoneRes = validatePhoneNumber(data.phone, data.country);
    if (!studentPhoneRes.isValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phone'],
        message: studentPhoneRes.messageAr
      });
    }

    // 4. Country-specific parent phone validation
    const parentPhoneRes = validatePhoneNumber(data.parentPhone, data.country);
    if (!parentPhoneRes.isValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentPhone'],
        message: parentPhoneRes.messageAr
      });
    }

    // 5. Strict constraint: Parent phone CANNOT be identical to student phone
    if (arePhoneNumbersIdentical(data.phone, data.parentPhone, data.country)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentPhone'],
        message: 'رقم هاتف ولي الأمر لا يمكن أن يكون مطابقاً لرقم هاتف الطالب نهائياً. يرجى إدخال رقم هاتف مختلف لولي الأمر.'
      });
    }
  });

export type DirectRegisterStudentDto = z.infer<typeof directRegisterStudentDtoSchema>;
