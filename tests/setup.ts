/**
 * قبل از هر import از src/server/* (که env var ها را در زمان بارگذاری
 * ماژول می‌خوانند)، این فایل اجرا می‌شود — Vitest تضمین می‌کند
 * setupFiles قبل از فایل تست خودش اجرا شوند.
 *
 * دو چیز جدا از هم:
 * - DATA_DIR: هنوز فقط برای src/server/auth.ts (حساب ادمین + قفل
 *   brute-force) استفاده می‌شود — به یک پوشه‌ی موقت تازه هدایت می‌شود
 *   تا تست‌ها داده‌ی واقعی production را لمس نکنند. auth هنوز به
 *   Postgres منتقل نشده (تصمیم عمدی فاز ۱، نگاه کن به
 *   references/roadmap.md و prisma/schema.prisma).
 * - DATABASE_URL: از فاز ۱ به بعد، src/server/storage.ts (پل‌ها/لاگ‌ها)
 *   واقعاً به یک Postgres وصل می‌شود — این فایل آن را نمی‌سازد، فقط
 *   چک می‌کند که تنظیم شده باشد. برای اجرای `npm test` روی سیستم خودتان
 *   باید یک Postgres در دسترس باشد (مثلاً با `docker compose up -d postgres`
 *   از docker-compose.yml همین پروژه) و DATABASE_URL را به همان اشاره کنید
 *   — و migration را یک‌بار اجرا کرده باشید: `npx prisma migrate deploy`.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zagros-repost-test-'));
process.env.DATA_DIR = testDataDir;
process.env.NODE_ENV = 'test';
// کلید بازیابی تستی — resetWithRecoveryKey فقط وقتی کار می‌کند که این
// env var ست شده باشد.
process.env.ADMIN_RECOVERY_KEY = process.env.ADMIN_RECOVERY_KEY || 'test-recovery-key';

// توجه: عمداً اینجا اگر DATABASE_URL نبود throw نمی‌کنیم — چون این
// setup برای همه‌ی فایل‌های تست اجرا می‌شود، از جمله آن‌هایی که اصلاً
// Storage/Postgres را لمس نمی‌کنند (telegram-service, schemas,
// auth-service). فقط tests/integration/api.test.ts که واقعاً به
// دیتابیس نیاز دارد، خودش با `describe.skipIf` چک می‌کند — نگاه کن
// به همان فایل.
