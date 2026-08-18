import { describe, it, expect } from 'vitest';
import { AuthService } from '../../src/server/auth';

/**
 * این تست‌ها همه از یک فایل استفاده می‌کنند و همه روی همان DATA_DIR
 * موقتی که tests/setup.ts ساخته کار می‌کنند (هر فایل تست، محیط ایزوله‌ی
 * خودش را دارد) — پس ترتیب تست‌ها در این فایل عمداً مهم است: ابتدا
 * setupAdmin، بعد بقیه. describe.sequential برای اطمینان از این ترتیب.
 */
describe.sequential('AuthService', () => {
  const USERNAME = 'admin';
  const PASSWORD = 'pass1234';

  it('reports admin as not set up initially', () => {
    expect(AuthService.isAdminSetup()).toBe(false);
  });

  it('creates the admin account and returns a valid session token', () => {
    const result = AuthService.setupAdmin(USERNAME, PASSWORD);
    expect('token' in result).toBe(true);
    if ('token' in result) {
      expect(AuthService.verifyToken(result.token)).toBe(USERNAME);
    }
  });

  it('refuses to create a second admin account', () => {
    const result = AuthService.setupAdmin('someone-else', 'whatever123');
    expect('error' in result).toBe(true);
  });

  it('logs in successfully with correct credentials', () => {
    const result = AuthService.login(USERNAME, PASSWORD, 'test-ip-1');
    expect('token' in result).toBe(true);
  });

  it('rejects login with a wrong password', () => {
    const result = AuthService.login(USERNAME, 'wrong-password', 'test-ip-2');
    expect('error' in result).toBe(true);
  });

  it('locks the attempt key out after 5 failed logins', () => {
    const key = 'test-ip-lockout';
    for (let i = 0; i < 5; i++) {
      AuthService.login(USERNAME, 'wrong-password', key);
    }
    const result = AuthService.login(USERNAME, PASSWORD, key);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/مسدود/);
    }
  });

  it('does NOT lock out a login attempt from a different key', () => {
    const result = AuthService.login(USERNAME, PASSWORD, 'a-totally-different-ip');
    expect('token' in result).toBe(true);
  });

  it('invalidates a token after logout', () => {
    const loginResult = AuthService.login(USERNAME, PASSWORD, 'test-ip-logout');
    if (!('token' in loginResult)) throw new Error('login failed');
    expect(AuthService.verifyToken(loginResult.token)).toBe(USERNAME);
    AuthService.logout(loginResult.token);
    expect(AuthService.verifyToken(loginResult.token)).toBeNull();
  });

  it('changes the password when the old password is correct', () => {
    const loginResult = AuthService.login(USERNAME, PASSWORD, 'test-ip-change');
    if (!('token' in loginResult)) throw new Error('login failed');
    const changeResult = AuthService.changePassword(loginResult.token, PASSWORD, 'newpass5678');
    expect('success' in changeResult).toBe(true);

    // رمز قدیمی دیگر نباید کار کند؛ رمز جدید باید کار کند.
    const oldLogin = AuthService.login(USERNAME, PASSWORD, 'test-ip-after-change-1');
    expect('error' in oldLogin).toBe(true);
    const newLogin = AuthService.login(USERNAME, 'newpass5678', 'test-ip-after-change-2');
    expect('token' in newLogin).toBe(true);
  });

  it('resets the password via the recovery key from env', () => {
    // tests/setup.ts مقدار ADMIN_RECOVERY_KEY را به 'test-recovery-key' ست کرده.
    const result = AuthService.resetWithRecoveryKey('test-recovery-key', 'recovered999');
    expect('success' in result).toBe(true);
    const login = AuthService.login(USERNAME, 'recovered999', 'test-ip-recovery');
    expect('token' in login).toBe(true);
  });

  it('rejects an incorrect recovery key', () => {
    const result = AuthService.resetWithRecoveryKey('wrong-key', 'irrelevant123');
    expect('error' in result).toBe(true);
  });
});
