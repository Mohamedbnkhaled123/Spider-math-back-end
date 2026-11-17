import assert from 'assert';
import { hashAccessCode, verifyAccessCode } from '../../../common/utils/access-code-hash.util';
import { authService } from './auth.service';
import { UserModel } from '../../../models/user.model';
import { ROLES } from '../../../common/constants/roles.constant';

async function runTests() {
  console.log('Running Admin & Developer Portal Auth Security Tests...');

  // 1. Hashing & timing-safe comparison tests
  const hashed = hashAccessCode('MySecretDev#2026');
  assert.ok(hashed.includes(':'), 'Salted hash should contain salt:digest separator');
  assert.strictEqual(verifyAccessCode('MySecretDev#2026', hashed), true, 'Valid code should verify true');
  assert.strictEqual(verifyAccessCode('WrongCode', hashed), false, 'Wrong code should verify false');
  assert.strictEqual(verifyAccessCode('', hashed), false, 'Empty code should return false');
  assert.strictEqual(verifyAccessCode('MySecretDev#2026', null), false, 'Null hash should return false');

  // Mock UserModel methods safely in-memory without touching live MongoDB
  const originalFindOne = UserModel.findOne;
  const originalFindOneAndUpdate = UserModel.findOneAndUpdate;
  const originalUpdateOne = UserModel.updateOne;

  try {
    let mockAdmin: any = {
      _id: '507f1f77bcf86cd799439011',
      role: ROLES.SUPER_ADMIN,
      full_name: 'Eng. Heba Abdel-Wahab',
      email: 'admin@spidermath.com',
      teacher_access_code_hash: null,
      teacher_google_email: null,
      dev_access_code_hash: null,
      google_id: null
    };
    let mockStudentUser: any = null;

    (UserModel as any).findOne = (query: any) => ({
      select: async (_sel?: string) => {
        if (query?.role === ROLES.SUPER_ADMIN) {
          return mockAdmin ? { ...mockAdmin } : null;
        }
        if (query?.email && mockStudentUser && mockStudentUser.email === query.email) {
          return { ...mockStudentUser };
        }
        return null;
      }
    });

    (UserModel as any).findOneAndUpdate = async (query: any, update: any) => {
      if (query?.role !== ROLES.SUPER_ADMIN || !mockAdmin) return null;
      if (query.$or?.some((cond: any) => 'dev_access_code_hash' in cond) && mockAdmin.dev_access_code_hash) {
        return null;
      }
      if (query.$or?.some((cond: any) => 'teacher_access_code_hash' in cond) && mockAdmin.teacher_access_code_hash) {
        return null;
      }
      if (query.$or?.some((cond: any) => 'teacher_google_email' in cond) && mockAdmin.teacher_google_email) {
        return null;
      }
      if (update?.$set) {
        mockAdmin = { ...mockAdmin, ...update.$set };
      }
      return { ...mockAdmin };
    };

    (UserModel as any).updateOne = async (_query: any, update: any) => {
      if (update?.$set && mockAdmin) {
        mockAdmin = { ...mockAdmin, ...update.$set };
      }
      return { modifiedCount: 1 };
    };

    // 2. Initial status shows all unconfigured
    let status = await authService.getAdminPortalStatus();
    assert.deepStrictEqual(status, {
      teacherCodeSet: false,
      teacherGoogleSet: false,
      devCodeSet: false
    });

    // 3. Developer 1-time code setup via 12-click Nav works ONCE ONLY
    const devSession = await authService.setupDevAccessCode({ accessCode: 'DevMaster!99' }, '127.0.0.1');
    assert.ok(devSession.token, 'Dev setup should issue valid JWT token');
    assert.strictEqual(devSession.portalScope, 'dev');
    assert.ok(mockAdmin.dev_access_code_hash, 'Dev hash should be stored');

    // Second unauthenticated Dev setup attempt MUST be rejected (403)
    await assert.rejects(
      () => authService.setupDevAccessCode({ accessCode: 'AttackerCode' }, '127.0.0.1'),
      (err: any) => err?.statusCode === 403
    );

    // 4. Teacher setup cannot collide with Dev code
    await assert.rejects(
      () => authService.setupTeacherAccessCode({ accessCode: 'DevMaster!99' }, '127.0.0.1'),
      (err: any) => err?.statusCode === 409
    );

    // Valid Teacher 1-time code setup succeeds
    const teacherSession = await authService.setupTeacherAccessCode({ accessCode: 'HebaSecret#2026' }, '127.0.0.1');
    assert.ok(teacherSession.token, 'Teacher setup should issue valid JWT token');
    assert.strictEqual(teacherSession.portalScope, 'teacher');

    // Second unauthenticated Teacher setup attempt MUST fail
    await assert.rejects(
      () => authService.setupTeacherAccessCode({ accessCode: 'NewHebaPass' }, '127.0.0.1'),
      (err: any) => err?.statusCode === 403
    );

    // 5. Mode isolation & password verification
    const devLoginOk = await authService.adminLogin({ accessCode: 'DevMaster!99', mode: 'dev' }, '10.0.0.1');
    assert.ok(devLoginOk.token);

    // Teacher password MUST NOT work for Dev mode and vice-versa
    await assert.rejects(
      () => authService.adminLogin({ accessCode: 'HebaSecret#2026', mode: 'dev' }, '10.0.0.1'),
      (err: any) => err?.statusCode === 401
    );
    await assert.rejects(
      () => authService.adminLogin({ accessCode: 'DevMaster!99', mode: 'teacher' }, '10.0.0.1'),
      (err: any) => err?.statusCode === 401
    );

    const teacherLoginOk = await authService.adminLogin({ accessCode: 'HebaSecret#2026', mode: 'teacher' }, '10.0.0.2');
    assert.ok(teacherLoginOk.token);

    // 6. Teacher Google login blocked until Gmail bound when teacher code is set
    await assert.rejects(
      () =>
        authService.teacherGoogleLogin(
          { idToken: 'DEV_MOCK_GOOGLE_TOKEN', email: 'heba@gmail.com' },
          '10.0.0.3'
        ),
      (err: any) => err?.statusCode === 403
    );

    // Authenticated Super Admin binds her Gmail via security settings
    await authService.updateAdminSecuritySettings({ teacherGoogleEmail: 'Heba@Gmail.com' });
    const secSettings = await authService.getAdminSecuritySettings();
    assert.strictEqual(secSettings.teacherGoogleEmail, 'heba@gmail.com');

    // Bound teacher email succeeds; unrelated email is rejected
    const googleSession = await authService.teacherGoogleLogin(
      { idToken: 'DEV_MOCK_GOOGLE_TOKEN', email: 'heba@gmail.com' },
      '10.0.0.4'
    );
    assert.ok(googleSession.token);

    await assert.rejects(
      () =>
        authService.teacherGoogleLogin(
          { idToken: 'DEV_MOCK_GOOGLE_TOKEN', email: 'student@gmail.com' },
          '10.0.0.5'
        ),
      (err: any) => err?.statusCode === 403
    );

    // 7. Authenticated Dev code update requires valid currentDevCode
    await assert.rejects(
      () =>
        authService.updateAdminSecuritySettings({
          newDevCode: 'UpdatedDev#2026',
          currentDevCode: 'WrongCurrent'
        }),
      (err: any) => err?.statusCode === 401
    );

    await authService.updateAdminSecuritySettings({
      newDevCode: 'UpdatedDev#2026',
      currentDevCode: 'DevMaster!99'
    });
    const devLoginUpdated = await authService.adminLogin({ accessCode: 'UpdatedDev#2026', mode: 'dev' }, '10.0.0.6');
    assert.ok(devLoginUpdated.token);

    console.log('ALL ADMIN & DEVELOPER PORTAL AUTH SECURITY TESTS PASSED!');
  } finally {
    (UserModel as any).findOne = originalFindOne;
    (UserModel as any).findOneAndUpdate = originalFindOneAndUpdate;
    (UserModel as any).updateOne = originalUpdateOne;
  }
}

runTests().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});
