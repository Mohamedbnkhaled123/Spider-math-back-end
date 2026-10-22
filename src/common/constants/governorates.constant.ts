/**
 * 27 Official Egyptian Governorates (محافظات جمهورية مصر العربية)
 * Used for conditional geographic gating and analytics on student profiles.
 */
export interface IEgyptGovernorate {
  readonly code: string;
  readonly name_en: string;
  readonly name_ar: string;
}

export const EGYPT_GOVERNORATES: readonly IEgyptGovernorate[] = [
  { code: 'CAIRO', name_en: 'Cairo', name_ar: 'القاهرة' },
  { code: 'GIZA', name_en: 'Giza', name_ar: 'الجيزة' },
  { code: 'ALEXANDRIA', name_en: 'Alexandria', name_ar: 'الإسكندرية' },
  { code: 'QALYUBIA', name_en: 'Qalyubia', name_ar: 'القليوبية' },
  { code: 'SHARQIA', name_en: 'Sharqia', name_ar: 'الشرقية' },
  { code: 'DAKAHLIA', name_en: 'Dakahlia', name_ar: 'الدقهلية' },
  { code: 'GHARBIA', name_en: 'Gharbia', name_ar: 'الغربية' },
  { code: 'MONUFIA', name_en: 'Monufia', name_ar: 'المنوفية' },
  { code: 'BEHEIRA', name_en: 'Beheira', name_ar: 'البحيرة' },
  { code: 'KAFR_EL_SHEIKH', name_en: 'Kafr El Sheikh', name_ar: 'كفر الشيخ' },
  { code: 'DAMIETTA', name_en: 'Damietta', name_ar: 'دمياط' },
  { code: 'PORT_SAID', name_en: 'Port Said', name_ar: 'بورسعيد' },
  { code: 'ISMAILIA', name_en: 'Ismailia', name_ar: 'الإسماعيلية' },
  { code: 'SUEZ', name_en: 'Suez', name_ar: 'السويس' },
  { code: 'NORTH_SINAI', name_en: 'North Sinai', name_ar: 'شمال سيناء' },
  { code: 'SOUTH_SINAI', name_en: 'South Sinai', name_ar: 'جنوب سيناء' },
  { code: 'BENI_SUEF', name_en: 'Beni Suef', name_ar: 'بني سويف' },
  { code: 'FAIYUM', name_en: 'Faiyum', name_ar: 'الفيوم' },
  { code: 'MINYA', name_en: 'Minya', name_ar: 'المنيا' },
  { code: 'ASYUT', name_en: 'Asyut', name_ar: 'أسيوط' },
  { code: 'SOHAG', name_en: 'Sohag', name_ar: 'سوهاج' },
  { code: 'QENA', name_en: 'Qena', name_ar: 'قنا' },
  { code: 'LUXOR', name_en: 'Luxor', name_ar: 'الأقصر' },
  { code: 'ASWAN', name_en: 'Aswan', name_ar: 'أسوان' },
  { code: 'RED_SEA', name_en: 'Red Sea', name_ar: 'البحر الأحمر' },
  { code: 'NEW_VALLEY', name_en: 'New Valley', name_ar: 'الوادي الجديد' },
  { code: 'MATRUH', name_en: 'Matruh', name_ar: 'مطروح' }
] as const;

export const GOVERNORATE_CODES = EGYPT_GOVERNORATES.map((g) => g.code) as [string, ...string[]];
export type GovernorateCode = (typeof EGYPT_GOVERNORATES)[number]['code'];
