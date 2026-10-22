/**
 * Spider Math WhatsApp Pre-Filled Message Payload Generator
 * Formats international phone numbers and generates URL-encoded WhatsApp click-to-chat links.
 */

function cleanPhoneNumber(phone: string): string {
  // Strip all non-digit characters (+, spaces, dashes)
  return phone.replace(/\D/g, '');
}

export function generatePlacementLeadWhatsAppLink(params: {
  teacherPhone: string;
  studentName: string;
  studentPhone?: string | null;
  curriculum: string;
  gradeLevel: string;
  academicTerm: string;
  scorePct: number;
  badge: string;
  attemptId: string;
}): string {
  const phone = cleanPhoneNumber(params.teacherPhone);
  const text =
    `مرحباً باشمهندسة هبة عبدالوهاب، أنا ولي أمر / طالب: ${params.studentName}.\n` +
    `لقد أتممت اختبار تحديد المستوى لمنهج: ${params.curriculum} - ${params.gradeLevel} (${params.academicTerm}).\n` +
    `النتيجة: ${params.scorePct}% (${params.badge}).\n` +
    `رقم المحاولة: ${params.attemptId}\n` +
    `أرغب في متابعة الخطة الدراسية والاشتراك بالمنصة.`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function generateSubscriptionRequestWhatsAppLink(params: {
  teacherPhone: string;
  studentName: string;
  studentCode?: string;
  curriculum: string;
  gradeLevel: string;
  academicTerm: string;
  unitTitle: string;
}): string {
  const phone = cleanPhoneNumber(params.teacherPhone);
  const codeTag = params.studentCode ? ` (كود: ${params.studentCode})` : '';
  const text =
    `مرحباً باشمهندسة هبة عبدالوهاب، أنا الطالب: ${params.studentName}${codeTag}.\n` +
    `أرغب في الاشتراك بوحدة: "${params.unitTitle}"\n` +
    `المسار التعليمي: ${params.curriculum} - ${params.gradeLevel} - ${params.academicTerm}.\n` +
    `يرجى تزويدي بتفاصيل التفعيل ورابط السداد.`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
