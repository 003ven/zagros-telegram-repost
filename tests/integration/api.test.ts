import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server';
import { TelegramService } from '../../src/server/telegram';
import { Storage } from '../../src/server/storage';

/**
 * تست‌های سطح API — مستقیم به Express app متصل می‌شوند (بدون listen
 * روی پورت واقعی، بدون Vite middleware چون mountFrontend:false).
 *
 * از فاز ۱ به بعد (references/roadmap.md) این تست‌ها به یک Postgres
 * واقعی نیاز دارند (src/server/storage.ts دیگر فایل JSON نمی‌نویسد).
 * اگر DATABASE_URL تنظیم نشده باشد، این کل فایل با یک پیام واضح
 * skip می‌شود به‌جای شکست گیج‌کننده — بقیه‌ی تست‌های واحد (که به
 * دیتابیس نیازی ندارند) بدون مشکل اجرا می‌شوند.
 */
describe.skipIf(!process.env.DATABASE_URL)('API routes (needs Postgres — DATABASE_URL)', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let token: string;

  beforeAll(async () => {
    // شروع تمیز: هر داده‌ی باقی‌مانده از اجرای قبلی تست‌ها را پاک کن.
    await Storage.clearAllConnections();
    app = await createApp({ mountFrontend: false });
  });

  afterAll(async () => {
    await Storage.clearAllConnections();
    await Storage.disconnect();
  });

  it('GET /api/auth/status → isSetup:false before setup', async () => {
    const res = await request(app).get('/api/auth/status');
    expect(res.status).toBe(200);
    expect(res.body.isSetup).toBe(false);
  });

  it('POST /api/auth/setup with a too-short password → 400', async () => {
    const res = await request(app).post('/api/auth/setup').send({ username: 'admin', password: 'ab' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/setup with valid credentials → 201 + token', async () => {
    const res = await request(app).post('/api/auth/setup').send({ username: 'admin', password: 'pass1234' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    token = res.body.token;
  });

  it('GET /api/connections without a token → 401', async () => {
    const res = await request(app).get('/api/connections');
    expect(res.status).toBe(401);
  });

  it('GET /api/connections with a valid token → 200 + empty list', async () => {
    const res = await request(app).get('/api/connections').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.connections).toEqual([]);
  });

  it('POST /api/connections with missing fields → 400 with a Persian error message', async () => {
    const res = await request(app)
      .post('/api/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceChannel: '@source' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/connections with a full valid payload → 201 + persisted connection', async () => {
    const res = await request(app)
      .post('/api/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceChannel: '@source', targetChannel: '@target', botToken: 'sim_dummy_token' });
    expect(res.status).toBe(201);
    expect(res.body.connection.sourceChannel).toBe('@source');
    expect(res.body.connection.config.aiTranslate).toBe('none'); // default از schema اعمال شده

    // این endpoint حالا خودش await می‌کند تا TelegramService.startMonitoring
    // کامل تمام شود قبل از پاسخ (فاز ۲) — پس اینجا مطمئنیم مانیتورینگ
    // واقعاً شروع شده و می‌توانیم بی‌خطر متوقفش کنیم تا بعد از پایان
    // تست چیزی زنده نماند (setInterval یا تلاش برای اتصال به شبکه‌ی واقعی).
    await TelegramService.stopMonitoring(res.body.connection.id);

    // همان پل دوباره → باید ۴۰۹ بدهد (جلوگیری از پل تکراری)
    const dupRes = await request(app)
      .post('/api/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceChannel: '@source', targetChannel: '@target', botToken: 'sim_dummy_token' });
    expect(dupRes.status).toBe(409);
    if (dupRes.body?.connection?.id) {
      await TelegramService.stopMonitoring(dupRes.body.connection.id);
    }
  });

  it('POST /api/internal/incoming-message without a valid secret → 401 (فاز ۲)', async () => {
    const res = await request(app).post('/api/internal/incoming-message').send({ sourceChannel: '@x', messageId: 1 });
    expect(res.status).toBe(401);
  });
});
