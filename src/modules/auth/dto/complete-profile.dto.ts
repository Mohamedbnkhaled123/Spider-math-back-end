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

export const completeProfileDtoSchema = z
  .object({
    fullName: z
      .string({ required_error: 'Full name is required' })
      .min(3, 'Full name must be at least 3 characters')
      .max(100),

    phone: z
      .string({ required_error: 'Student phone number is required' })
      .min(8, 'Phone number must be at least 8 digits')
      .max(25),

    parentPhone: z
      .string({ required_error: 'Parent phone number is required for notification and tracking' })
      .min(8, 'Parent phone must be at least 8 digits')
      .max(25),

    curriculum: z.enum(CURRICULUMS, {
      required_error: 'Curriculum track is required'
    }),

    gradeLevel: z.enum(ALL_GRADE_LEVELS, {
      required_error: 'Grade level is required'
    }),

    academicTerm: z.enum(ACADEMIC_TERMS).default('TERM_1'),

    country: z.string().default('EG'),

    governorate: z
      .string()
      .optional()
      .nullable(),

    avatarUrl: z.string().url().optional().nullable()
  })
  .superRefine((data, ctx) => {
    // 1. Validate that gradeLevel belongs to the chosen curriculum
    if (!isValidGradeForCurriculum(data.curriculum as CurriculumType, data.gradeLevel)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gradeLevel'],
        message: `Grade level '${data.gradeLevel}' does not belong to curriculum track '${data.curriculum}'`
      });
    }

    // 2. Validate conditional Egyptian governorate
    if (data.country === 'EG') {
      if (!data.governorate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['governorate'],
          message: 'Governorate is required for students residing in Egypt'
        });
      } else if (!(GOVERNORATE_CODES as readonly string[]).includes(data.governorate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['governorate'],
          message: `Governorate code '${data.governorate}' is not a valid Egyptian governorate`
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

export type CompleteProfileDto = z.infer<typeof completeProfileDtoSchema>;
