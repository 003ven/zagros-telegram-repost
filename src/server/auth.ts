import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');

// How long a login session stays valid before the user must log in again.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface AdminRecord {
  username: string;
  salt: string;
  hash: string;
  createdAt: string;
  updatedAt: string;
}

interface Session {
  username: string;
  expiresAt: number;
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory session store. Tokens are invalidated on server restart, which
// simply means the user has to log in again — acceptable for a small
// single-admin panel and avoids storing session secrets on disk.
const sessions = new Map<string, Session>();

// --- Brute-force protection for login attempts ---
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes

interface AttemptRecord {
  failedCount: number;
  lockedUntil: number | null;
}

const loginAttempts = new Map<string, AttemptRecord>();

function getAttemptRecord(key: string): AttemptRecord {
  let rec = loginAttempts.get(key);
  if (!rec) {
    rec = { failedCount: 0, lockedUntil: null };
    loginAttempts.set(key, rec);
  }
  return rec;
}

function isLockedOut(key: string): number | null {
  const rec = loginAttempts.get(key);
  if (!rec || !rec.lockedUntil) return null;
  if (rec.lockedUntil < Date.now()) {
    // Lockout expired — reset.
    loginAttempts.delete(key);
    return null;
  }
  return rec.lockedUntil;
}

function recordFailedAttempt(key: string) {
  const rec = getAttemptRecord(key);
  rec.failedCount += 1;
  if (rec.failedCount >= MAX_FAILED_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
  }
}

function clearAttempts(key: string) {
  loginAttempts.delete(key);
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function readAdmin(): AdminRecord | null {
  try {
    if (!fs.existsSync(ADMIN_FILE)) return null;
    const raw = fs.readFileSync(ADMIN_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeAdmin(record: AdminRecord) {
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(record, null, 2), 'utf-8');
}

function createToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function createSession(username: string): string {
  const token = createToken();
  sessions.set(token, { username, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export const AuthService = {
  isAdminSetup(): boolean {
    return readAdmin() !== null;
  },

  /** Returns a timestamp (ms) if this key is currently locked out, else null. */
  checkLockout(key: string): number | null {
    return isLockedOut(key);
  },

  /** Create the single admin account. Only allowed if no admin exists yet. */
  setupAdmin(username: string, password: string): { token: string } | { error: string } {
    if (readAdmin()) {
      return { error: 'حساب مدیر قبلاً ایجاد شده است.' };
    }
    const cleanUsername = username.trim();
    if (!cleanUsername || password.length < 4) {
      return { error: 'نام کاربری یا رمز عبور نامعتبر است.' };
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const now = new Date().toISOString();
    writeAdmin({ username: cleanUsername, salt, hash, createdAt: now, updatedAt: now });
    return { token: createSession(cleanUsername) };
  },

  login(username: string, password: string, attemptKey: string): { token: string } | { error: string } {
    const admin = readAdmin();
    if (!admin) {
      return { error: 'ابتدا باید حساب مدیر را ایجاد کنید.' };
    }
    const lockedUntil = isLockedOut(attemptKey);
    if (lockedUntil) {
      const minutesLeft = Math.ceil((lockedUntil - Date.now()) / 60000);
      return { error: `به دلیل تلاش‌های ناموفق متعدد، ورود موقتاً مسدود شده است. حدود ${minutesLeft} دقیقه دیگر دوباره تلاش کنید.` };
    }
    if (admin.username !== username.trim()) {
      recordFailedAttempt(attemptKey);
      return { error: 'نام کاربری یا رمز عبور اشتباه است.' };
    }
    const attemptHash = hashPassword(password, admin.salt);
    const expected = Buffer.from(admin.hash, 'hex');
    const actual = Buffer.from(attemptHash, 'hex');
    const valid = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    if (!valid) {
      recordFailedAttempt(attemptKey);
      return { error: 'نام کاربری یا رمز عبور اشتباه است.' };
    }
    clearAttempts(attemptKey);
    return { token: createSession(admin.username) };
  },

  logout(token: string) {
    sessions.delete(token);
  },

  verifyToken(token: string | undefined | null): string | null {
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      sessions.delete(token);
      return null;
    }
    return session.username;
  },

  changePassword(token: string, oldPassword: string, newPassword: string): { success: true } | { error: string } {
    const username = AuthService.verifyToken(token);
    const admin = readAdmin();
    if (!username || !admin) {
      return { error: 'ابتدا وارد حساب کاربری خود شوید.' };
    }
    const attemptHash = hashPassword(oldPassword, admin.salt);
    if (attemptHash !== admin.hash) {
      return { error: 'رمز عبور فعلی صحیح نیست.' };
    }
    if (newPassword.length < 4) {
      return { error: 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد.' };
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(newPassword, salt);
    writeAdmin({ ...admin, salt, hash, updatedAt: new Date().toISOString() });
    return { success: true };
  },

  /**
   * Password reset for when the admin is locked out. Requires the
   * ADMIN_RECOVERY_KEY environment variable to be set by whoever deploys
   * the app (e.g. in Render's environment settings) — there is no email/SMS
   * service available, so a server-side secret is the only real fallback.
   */
  resetWithRecoveryKey(recoveryKey: string, newPassword: string): { success: true } | { error: string } {
    const expectedKey = process.env.ADMIN_RECOVERY_KEY;
    if (!expectedKey) {
      return { error: 'قابلیت بازیابی رمز عبور روی این سرور فعال نشده است (ADMIN_RECOVERY_KEY تنظیم نشده).' };
    }
    if (recoveryKey !== expectedKey) {
      return { error: 'کلید بازیابی نامعتبر است.' };
    }
    const admin = readAdmin();
    if (!admin) {
      return { error: 'حساب مدیری برای بازیابی وجود ندارد.' };
    }
    if (newPassword.length < 4) {
      return { error: 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد.' };
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(newPassword, salt);
    writeAdmin({ ...admin, salt, hash, updatedAt: new Date().toISOString() });
    return { success: true };
  },

  getUsername(): string | null {
    return readAdmin()?.username || null;
  },
};

/** Express middleware: rejects the request unless a valid Bearer token is present. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const username = AuthService.verifyToken(token);
  if (!username) {
    return res.status(401).json({ success: false, error: 'ابتدا باید وارد حساب کاربری شوید.' });
  }
  (req as any).username = username;
  next();
}
