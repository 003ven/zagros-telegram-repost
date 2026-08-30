// همیشه اول .env.local را بخوان — چه با pm2 اجرا شود (که خودش هم
// dotenv دارد در ecosystem.config.cjs)، چه با `node dist/server.cjs`
// دستی (مثلاً برای تست، طبق deploy/MIGRATION_RUNBOOK_FA.md مرحله‌ی ۵)،
// چه با tsx در dev. اگر .env.local وجود نداشته باشد (مثلاً در Docker
// که env vars مستقیم توسط docker-compose تزریق می‌شوند)، dotenv بی‌خطا
// و بی‌صدا رد می‌شود — هیچ فایلی لازم نیست از قبل وجود داشته باشد.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import express from 'express';
import path from 'path';
import os from 'os';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { Storage } from './src/server/storage';
import { TelegramService } from './src/server/telegram';
import { TelegramConnection } from './src/types';
import { AuthService, requireAuth } from './src/server/auth';
import {
  ConnectionCreateInputSchema,
  TelegramConnectionConfigSchema,
  BulkActionSchema,
  AuthSetupSchema,
  AuthLoginSchema,
  AuthResetPasswordSchema,
  AuthChangePasswordSchema,
  IncomingPushMessageSchema,
  ScheduledPostCreateSchema,
  type ScheduledPostCreateInput,
} from './src/schemas';
import { logger } from './src/server/logger';

/**
 * اعتبارسنجی بدنه‌ی request با یک شمای Zod. اگر معتبر نبود، خودش پاسخ
 * ۴۰۰ با اولین پیام خطای فارسی را می‌فرستد و false برمی‌گرداند (route
 * باید بلافاصله return کند). اگر معتبر بود، داده‌ی پارس‌شده (با
 * پیش‌فرض‌های اعمال‌شده) را برمی‌گرداند.
 */
function validateBody<T extends z.ZodTypeAny>(
  schema: T,
  req: express.Request,
  res: express.Response
): z.infer<T> | false {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    res.status(400).json({
      success: false,
      error: firstIssue?.message || 'ورودی نامعتبر است',
    });
    return false;
  }
  return result.data;
}

/**
 * برنامه‌ی Express را می‌سازد و همه‌ی route ها را ثبت می‌کند، بدون این‌که
 * روی هیچ پورتی listen کند یا مانیتورینگ پس‌زمینه‌ی پل‌ها را استارت کند.
 * این جداسازی برای تست‌پذیری اضافه شده: تست‌های API (tests/) این تابع
 * را صدا می‌زنند و با supertest مستقیم به app متصل می‌شوند، بدون این‌که
 * یک سرور واقعی بالا بیاید یا پولینگ واقعی تلگرام شروع شود.
 *
 * @param opts.mountFrontend اگر false باشد، میدل‌ور Vite/static (که فقط
 *   برای serve کردن HTML/JS فرانت لازم است، نه برای API) اضافه نمی‌شود
 *   — در تست‌ها معمولاً نیازی به آن نیست و راه‌اندازی Vite را کند می‌کند.
 */
export async function createApp(opts: { mountFrontend?: boolean } = {}) {
  const { mountFrontend = true } = opts;
  const app = express();

  // Render (and most PaaS providers) sit behind a reverse proxy — trust the
  // X-Forwarded-For header so req.ip reflects the real client IP (used for
  // login rate-limiting).
  app.set('trust proxy', 1);

  app.use(express.json());

  // فاز ۳ (references/roadmap.md): محدودیت نرخ درخواست روی کل API —
  // دفاع تکمیلی، جدا از قفل brute-force اختصاصی لاگین در AuthService.
  // در تست‌ها (NODE_ENV=test) غیرفعال است تا اجرای پشت‌سرهم تست‌ها به
  // آن برخورد نکند.
  if (process.env.NODE_ENV !== 'test') {
    app.use(
      '/api',
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 600,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: 'تعداد درخواست‌ها بیش از حد مجاز است، کمی بعد دوباره امتحان کنید.' },
      })
    );
  }

  // --- AUTH ROUTES (public) ---

  // Whether the initial admin account has been created yet
  app.get('/api/auth/status', (req, res) => {
    res.json({ success: true, isSetup: AuthService.isAdminSetup() });
  });

  // Create the single admin account (only works once)
  app.post('/api/auth/setup', (req, res) => {
    const body = validateBody(AuthSetupSchema, req, res);
    if (!body) return;
    const { username, password } = body;
    const result = AuthService.setupAdmin(String(username), String(password));
    if ('error' in result) {
      return res.status(400).json({ success: false, error: result.error });
    }
    return res.status(201).json({ success: true, token: result.token, username: AuthService.getUsername() });
  });

  // Log in with existing admin credentials
  app.post('/api/auth/login', (req, res) => {
    const body = validateBody(AuthLoginSchema, req, res);
    if (!body) return;
    const { username, password } = body;
    const attemptKey = req.ip || 'unknown';
    const result = AuthService.login(String(username), String(password), attemptKey);
    if ('error' in result) {
      return res.status(401).json({ success: false, error: result.error });
    }
    return res.json({ success: true, token: result.token, username: AuthService.getUsername() });
  });

  // Reset password using the server-side recovery key (ADMIN_RECOVERY_KEY env var)
  app.post('/api/auth/reset-password', (req, res) => {
    const body = validateBody(AuthResetPasswordSchema, req, res);
    if (!body) return;
    const { recoveryKey, newPassword } = body;
    const result = AuthService.resetWithRecoveryKey(String(recoveryKey), String(newPassword));
    if ('error' in result) {
      return res.status(400).json({ success: false, error: result.error });
    }
    return res.json({ success: true, message: 'رمز عبور با موفقیت بازیابی شد. اکنون می‌توانید وارد شوید.' });
  });

  // Log out (invalidate current token)
  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) AuthService.logout(token);
    return res.json({ success: true });
  });

  // فاز ۲ (references/roadmap.md): webhook داخلی که سرویس Python
  // (userbot/userbot_service.py) با هر پیام تازه‌ی کشف‌شده از طریق
  // Telethon push صدا می‌زند. عمداً قبل از requireAuth است — این یک
  // کاربر انسانی نیست، سرویس داخلی است و با X-Userbot-Secret احراز
  // هویت می‌شود، نه توکن session.
  app.post('/api/internal/incoming-message', (req, res) => {
    const secret = req.headers['x-userbot-secret'];
    if (!process.env.USERBOT_SECRET || secret !== process.env.USERBOT_SECRET) {
      return res.status(401).json({ success: false, error: 'unauthorized' });
    }
    const body = validateBody(IncomingPushMessageSchema, req, res);
    if (!body) return;

    // پاسخ فوری — پردازش واقعی (فیلتر/بازنویسی/ارسال) ممکن است چند
    // ثانیه طول بکشد و لازم نیست userbot منتظرش بماند؛ اگر پردازش خطا
    // بدهد، در لاگ‌های خود پل ثبت می‌شود (همان مسیر خطای pollConnection).
    res.json({ success: true });
    TelegramService.handleIncomingPushMessage(body).catch((err) => {
      logger.error({ err }, 'خطا در پردازش پیام push از یوزربات');
    });
  });

  // Everything below this line requires a valid session token
  app.use('/api', requireAuth);

  // Current logged-in admin info
  app.get('/api/auth/me', (req, res) => {
    res.json({ success: true, username: (req as any).username });
  });

  // Change password (requires current password)
  app.post('/api/auth/change-password', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const body = validateBody(AuthChangePasswordSchema, req, res);
    if (!body) return;
    const { oldPassword, newPassword } = body;
    const result = AuthService.changePassword(token, String(oldPassword), String(newPassword));
    if ('error' in result) {
      return res.status(400).json({ success: false, error: result.error });
    }
    return res.json({ success: true, message: 'رمز عبور با موفقیت تغییر یافت.' });
  });

  // --- API ROUTES ---

  // Get all connections
  app.get('/api/connections', async (req, res) => {
    try {
      const connections = await Storage.getAllConnections();
      res.json({ success: true, connections });
    } catch (err) {
      res.status(500).json({ success: false, error: 'خطا در دریافت لیست اتصال‌ها' });
    }
  });

  // Create new connection
  app.post('/api/connections', async (req, res) => {
    try {
      const body = validateBody(ConnectionCreateInputSchema, req, res);
      if (!body) return;
      const { sourceChannel, targetChannel, botToken, config } = body;

      const cleanSource = TelegramService.cleanChannelName(sourceChannel);
      const cleanTarget = TelegramService.cleanChannelName(targetChannel);
      const cleanToken = botToken.trim();

      // Prevent creating an identical bridge twice — the same source/target
      // pair with the same bot polling in parallel would double-post.
      const allConnections = await Storage.getAllConnections();
      const isDuplicate = allConnections.some(
        (c) => c.sourceChannel === cleanSource && c.targetChannel === cleanTarget && c.botToken === cleanToken
      );
      if (isDuplicate) {
        return res.status(409).json({
          success: false,
          error: 'این پل (کانال مبدأ، مقصد و ربات) قبلاً ایجاد شده است.',
        });
      }

      const defaultConfig = TelegramService.getDefaultConfig();
      const mergedConfig = { ...defaultConfig, ...(config || {}) };

      const newConnection: TelegramConnection = {
        id: Math.random().toString(36).substring(2, 11),
        sourceChannel: cleanSource,
        targetChannel: cleanTarget,
        botToken: cleanToken,
        status: 'active',
        lastMessageId: null,
        lastReceivedAt: null,
        transferredCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastError: null,
        pollIntervalMs: 15000,
        config: mergedConfig,
      };

      await Storage.saveConnection(newConnection);
      await Storage.addLog(
        newConnection.id,
        'info',
        `اتصال جدید زاگرس ریپوست ایجاد شد: ${cleanSource} ➔ ${cleanTarget}`
      );

      // Start background monitoring for this new connection
      await TelegramService.startMonitoring(newConnection.id);

      return res.status(201).json({
        success: true,
        connection: newConnection,
        message: 'اتصال جدید با موفقیت ایجاد و مانیتورینگ هوشمند شروع شد.',
      });
    } catch (err) {
      logger.error({ err }, 'Error creating connection');
      return res.status(500).json({
        success: false,
        error: 'خطا در ایجاد اتصال جدید',
      });
    }
  });

  // Update connection rules & config (FoxRepost features)
  app.put('/api/connections/:id/config', async (req, res) => {
    try {
      const { id } = req.params;
      const conn = await Storage.getConnection(id);

      if (!conn) {
        return res.status(404).json({ success: false, error: 'اتصال یافت نشد' });
      }

      const partialResult = TelegramConnectionConfigSchema.partial().safeParse(req.body?.config || {});
      if (!partialResult.success) {
        return res.status(400).json({
          success: false,
          error: partialResult.error.issues[0]?.message || 'تنظیمات ارسالی نامعتبر است',
        });
      }
      const newConfig = partialResult.data;
      conn.config = {
        ...TelegramService.getDefaultConfig(),
        ...(conn.config || {}),
        ...newConfig,
      };

      conn.updatedAt = new Date().toISOString();
      await Storage.saveConnection(conn);
      await Storage.addLog(id, 'info', 'تنظیمات و قوانین بازنویسی / فیلتر پست‌ها به‌روزرسانی شد');

      return res.json({ success: true, connection: conn });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در ذخیره تنظیمات اتصال' });
    }
  });

  // Test post send to target channel
  app.post('/api/connections/:id/test-send', async (req, res) => {
    try {
      const { id } = req.params;
      const { messageText } = req.body;
      const conn = await Storage.getConnection(id);

      if (!conn) {
        return res.status(404).json({ success: false, error: 'اتصال یافت نشد' });
      }

      const result = await TelegramService.sendTestMessage(conn, messageText);
      if (result.success) {
        await Storage.addLog(id, 'success', `ارسال تست به کانال مقصد (${conn.targetChannel}) با موفقیت انجام شد`);
        return res.json({ success: true, message: 'پیام تست با موفقیت ارسال گردید' });
      } else {
        await Storage.addLog(id, 'error', `خطا در ارسال تست به کانال مقصد: ${result.error}`);
        return res.status(400).json({ success: false, error: result.error });
      }
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در اجرای ارسال تست' });
    }
  });

  // Edit source/target channel and bot token of an existing connection —
  // بدون نیاز به حذف و ساخت دوباره‌ی پل. چون شماره‌ی پیام‌ها با کانال
  // مبدأ جدید بی‌معنی می‌شود، lastMessageId ریست می‌شود.
  app.put('/api/connections/:id/channels', async (req, res) => {
    try {
      const { id } = req.params;
      const conn = await Storage.getConnection(id);
      if (!conn) {
        return res.status(404).json({ success: false, error: 'اتصال یافت نشد' });
      }
      const { sourceChannel, targetChannel, botToken } = req.body || {};
      if (typeof sourceChannel === 'string' && sourceChannel.trim()) {
        conn.sourceChannel = TelegramService.cleanChannelName(sourceChannel.trim());
      }
      if (typeof targetChannel === 'string' && targetChannel.trim()) {
        conn.targetChannel = targetChannel.trim();
      }
      if (typeof botToken === 'string' && botToken.trim()) {
        conn.botToken = botToken.trim();
      }
      conn.lastMessageId = null;
      conn.lastError = null;
      conn.consecutiveErrors = 0;
      conn.status = 'active';
      conn.updatedAt = new Date().toISOString();
      await Storage.saveConnection(conn);
      await TelegramService.stopMonitoring(id);
      await TelegramService.startMonitoring(id);
      await Storage.addLog(
        id,
        'info',
        `کانال‌ها/توکن این پل ویرایش شد: ${conn.sourceChannel} ➔ ${conn.targetChannel}`
      );
      return res.json({ success: true, connection: conn });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در ویرایش کانال‌های اتصال' });
    }
  });
  // Toggle connection status (Pause / Resume)
  app.put('/api/connections/:id/toggle', async (req, res) => {
    try {
      const { id } = req.params;
      const conn = await Storage.getConnection(id);

      if (!conn) {
        return res.status(404).json({ success: false, error: 'اتصال یافت نشد' });
      }

      if (conn.status === 'active' || conn.status === 'error') {
        conn.status = 'inactive';
        await TelegramService.stopMonitoring(id);
        await Storage.addLog(id, 'info', 'وضعیت اتصال به غیرفعال (متوقف) تغییر یافت');
      } else {
        conn.status = 'active';
        conn.lastError = null;
        await TelegramService.startMonitoring(id);
        await Storage.addLog(id, 'info', 'وضعیت اتصال مجدداً فعال شد');
      }

      conn.updatedAt = new Date().toISOString();
      await Storage.saveConnection(conn);

      return res.json({ success: true, connection: conn });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در تغییر وضعیت اتصال' });
    }
  });

  // Force restart connection
  app.post('/api/connections/:id/restart', async (req, res) => {
    try {
      const { id } = req.params;
      const conn = await Storage.getConnection(id);

      if (!conn) {
        return res.status(404).json({ success: false, error: 'اتصال یافت نشد' });
      }

      conn.status = 'active';
      conn.lastError = null;
      conn.updatedAt = new Date().toISOString();
      await Storage.saveConnection(conn);

      await TelegramService.startMonitoring(id);
      await Storage.addLog(id, 'info', 'راه‌اندازی مجدد مانیتورینگ اتصال با موفقیت انجام شد');

      return res.json({ success: true, connection: conn });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در راه‌اندازی مجدد' });
    }
  });

  // Bulk action for connections (start, stop, delete)
  app.post('/api/connections/bulk-action', async (req, res) => {
    try {
      const body = validateBody(BulkActionSchema, req, res);
      if (!body) return;
      const { ids, action } = body;

      let affectedCount = 0;
      for (const id of ids) {
        const conn = await Storage.getConnection(id);
        if (!conn) continue;

        if (action === 'start') {
          conn.status = 'active';
          conn.lastError = null;
          conn.updatedAt = new Date().toISOString();
          await Storage.saveConnection(conn);
          await TelegramService.startMonitoring(id);
          await Storage.addLog(id, 'info', 'فعال‌سازی دسته‌جمعی پل');
          affectedCount++;
        } else if (action === 'stop') {
          conn.status = 'inactive';
          conn.updatedAt = new Date().toISOString();
          await Storage.saveConnection(conn);
          await TelegramService.stopMonitoring(id);
          await Storage.addLog(id, 'info', 'متوقف‌سازی دسته‌جمعی پل');
          affectedCount++;
        } else if (action === 'delete') {
          await TelegramService.stopMonitoring(id);
          await Storage.deleteConnection(id);
          await Storage.addLog('system', 'info', `پل ${conn.sourceChannel} -> ${conn.targetChannel} به‌صورت دسته‌جمعی حذف شد`);
          affectedCount++;
        }
      }

      return res.json({
        success: true,
        affectedCount,
        message: `عملیات روی ${affectedCount} پل انجام شد.`,
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در اجرای عملیات دسته‌جمعی' });
    }
  });

  // Delete connection
  app.delete('/api/connections/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await TelegramService.stopMonitoring(id);
      const deleted = await Storage.deleteConnection(id);

      if (deleted) {
        return res.json({ success: true, message: 'اتصال با موفقیت حذف گردید' });
      } else {
        return res.status(404).json({ success: false, error: 'اتصال یافت نشد' });
      }
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در حذف اتصال' });
    }
  });

  // Get logs for a specific connection
  app.get('/api/connections/:id/logs', async (req, res) => {
    try {
      const { id } = req.params;
      const logs = await Storage.getLogsForConnection(id);
      return res.json({ success: true, logs });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در دریافت لاگ‌ها' });
    }
  });

  // Get overall logs
  app.get('/api/logs', async (req, res) => {
    try {
      const logs = await Storage.getAllLogs();
      return res.json({ success: true, logs });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در دریافت کلی لاگ‌ها' });
    }
  });

  // فاز ۳ (references/roadmap.md): متریک واقعی سرور — جایگزین کارت‌های
  // CPU/RAM شبیه‌سازی‌شده‌ی قدیمی در App.tsx (که فقط بر اساس تعداد پل
  // فعال یک عدد تصادفی می‌ساختند). از ماژول داخلی `os` نود می‌آید، بدون
  // وابستگی خارجی — برای مقیاس بزرگ‌تر (چند instance)، جایگزینی با
  // Prometheus/Grafana در references/roadmap.md فاز ۳ پیشنهاد شده.
  app.get('/api/system-metrics', (req, res) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMemPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

    // os.loadavg() روی ویندوز پشتیبانی نمی‌شود (همیشه [0,0,0] برمی‌گرداند)
    // — این پروژه در Linux (Docker/VPS) دیپلوی می‌شود، پس مشکلی نیست.
    const [load1] = os.loadavg();
    const cpuCount = os.cpus().length || 1;
    const cpuPercent = Math.min(100, Math.round((load1 / cpuCount) * 100));

    return res.json({
      success: true,
      metrics: {
        cpuPercent,
        memoryPercent: usedMemPercent,
        totalMemoryMB: Math.round(totalMem / 1024 / 1024),
        freeMemoryMB: Math.round(freeMem / 1024 / 1024),
        processUptimeSeconds: Math.round(process.uptime()),
        loadAverage1m: Number(load1.toFixed(2)),
      },
    });
  });

  // فاز ۳ب: تاریخچه‌ی واقعی uptime برای نمودار ۲۴ ساعته (UptimeChart.tsx)
  app.get('/api/uptime-history', async (req, res) => {
    try {
      const hours = Math.min(168, Math.max(1, parseInt(String(req.query.hours || '24'), 10) || 24));
      const history = await Storage.getUptimeHistory(hours);
      return res.json({ success: true, history });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در دریافت تاریخچه‌ی uptime' });
    }
  });

  // فاز ۳ب: کتابخانه‌ی محتوا — پست‌های متنی زمان‌بندی‌شده
  app.get('/api/scheduled-posts', async (req, res) => {
    try {
      const connectionId = typeof req.query.connectionId === 'string' ? req.query.connectionId : undefined;
      const posts = await Storage.getScheduledPosts(connectionId);
      return res.json({ success: true, posts });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در دریافت لیست پست‌های زمان‌بندی‌شده' });
    }
  });

  app.post('/api/scheduled-posts', async (req, res) => {
    try {
      const body = validateBody<typeof ScheduledPostCreateSchema>(ScheduledPostCreateSchema, req, res);
      if (!body) return;

      const conn = await Storage.getConnection(body.connectionId);
      if (!conn) {
        return res.status(404).json({ success: false, error: 'پل انتخاب‌شده یافت نشد' });
      }
      if (new Date(body.scheduledAt).getTime() <= Date.now()) {
        return res.status(400).json({ success: false, error: 'زمان زمان‌بندی باید در آینده باشد' });
      }

      const post = await Storage.createScheduledPost({
        connectionId: body.connectionId,
        text: body.text,
        scheduledAt: body.scheduledAt,
      });
      await Storage.addLog(conn.id, 'info', `یک پست جدید در کتابخانه‌ی محتوا برای ${post.scheduledAt} زمان‌بندی شد`);
      return res.status(201).json({ success: true, post });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در ایجاد پست زمان‌بندی‌شده' });
    }
  });

  app.delete('/api/scheduled-posts/:id', async (req, res) => {
    try {
      const deleted = await Storage.deleteScheduledPost(req.params.id);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'پست زمان‌بندی‌شده یافت نشد' });
      }
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در حذف پست زمان‌بندی‌شده' });
    }
  });

  // Export full backup JSON
  app.get('/api/backup', async (req, res) => {
    try {
      const connections = await Storage.getAllConnections();
      const backupData = {
        app: 'Zagros Repost',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        totalConnections: connections.length,
        connections,
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=zagros_backup_${new Date().toISOString().slice(0, 10)}.json`);
      return res.json(backupData);
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در ایجاد فایل پشتیبان' });
    }
  });

  // Restore backup JSON
  app.post('/api/restore', async (req, res) => {
    try {
      const { connections, mode = 'merge' } = req.body;

      if (!Array.isArray(connections)) {
        return res.status(400).json({
          success: false,
          error: 'فایل پشتیبان معتبر نیست. آرایه connections یافت نشد.',
        });
      }

      if (mode === 'overwrite') {
        // Stop all active monitorings
        const existing = await Storage.getAllConnections();
        for (const c of existing) { await TelegramService.stopMonitoring(c.id); }
        await Storage.clearAllConnections();
      }

      let restoredCount = 0;
      for (const item of connections) {
        if (!item.sourceChannel || !item.targetChannel) continue;

        const cleanSource = TelegramService.cleanChannelName(item.sourceChannel);
        const cleanTarget = TelegramService.cleanChannelName(item.targetChannel);

        const restoredConn = {
          id: item.id || 'conn_' + Math.random().toString(36).substring(2, 9),
          sourceChannel: cleanSource,
          targetChannel: cleanTarget,
          botToken: item.botToken || '',
          status: item.status || 'active',
          lastMessageId: item.lastMessageId || null,
          lastReceivedAt: item.lastReceivedAt || null,
          transferredCount: item.transferredCount || 0,
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastError: item.lastError || null,
          pollIntervalMs: item.pollIntervalMs || 15000,
          config: {
            ...TelegramService.getDefaultConfig(),
            ...(item.config || {}),
          },
        };

        await Storage.saveConnection(restoredConn);
        if (restoredConn.status === 'active') {
          await TelegramService.startMonitoring(restoredConn.id);
        }
        restoredCount++;
      }

      await Storage.addLog('system', 'info', `بازیابی پشتیبان با موفقیت انجام شد (${restoredCount} پل بازیابی شد)`);

      return res.json({
        success: true,
        restoredCount,
        message: `تعداد ${restoredCount} پل با موفقیت بازیابی و فعال گردید.`,
      });
    } catch (err) {
      logger.error({ err }, 'Error restoring backup');
      return res.status(500).json({ success: false, error: 'خطا در بازگردانی پشتیبان' });
    }
  });

  // Validate bot token
  app.post('/api/connections/validate-bot', async (req, res) => {
    try {
      const { token } = req.body;
      const result = await TelegramService.validateBotToken(token);
      return res.json({ success: true, result });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در اعتبارسنچی توکن ربات' });
    }
  });

  // Channel preview
  app.post('/api/connections/preview-channel', async (req, res) => {
    try {
      const { channel } = req.body;
      const result = await TelegramService.fetchPublicChannelPosts(channel);
      return res.json({ success: true, result });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در دریافت اطلاعات کانال' });
    }
  });

  // Trigger immediate poll
  app.post('/api/connections/:id/trigger', async (req, res) => {
    try {
      const { id } = req.params;
      await TelegramService.pollConnection(id);
      const conn = await Storage.getConnection(id);
      return res.json({ success: true, connection: conn });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'خطا در اجرای فوری مانیتورینگ' });
    }
  });

  // --- VITE / STATIC MIDDLEWARE ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // --- VITE / STATIC MIDDLEWARE ---

  if (mountFrontend) {
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return app;
}

async function startServer() {
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Initialize storage & start background monitoring tasks — فقط برای
  // اجرای واقعی سرور، نه برای createApp() که تست‌ها صدا می‌زنند.
  await TelegramService.startAllActiveConnections();
  startUptimeSampler();
  startScheduledPostRunner();

  const app = await createApp({ mountFrontend: true });

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Telegram Auto-Forwarder Server listening on http://0.0.0.0:${PORT}`);
  });
}

/**
 * فاز ۳ب: هر ۵ دقیقه یک نمونه از وضعیت سلامت پل‌ها ثبت می‌کند —
 * تغذیه‌کننده‌ی نمودار Uptime واقعی (GET /api/uptime-history،
 * src/components/UptimeChart.tsx). فقط در اجرای واقعی سرور فعال است.
 */
function startUptimeSampler() {
  const sample = async () => {
    try {
      const connections = await Storage.getAllConnections();
      const totalCount = connections.length;
      const healthyCount = connections.filter((c) => c.status !== 'error').length;
      await Storage.recordUptimeSample(healthyCount, totalCount);
    } catch (err) {
      logger.error({ err }, 'ثبت نمونه‌ی uptime شکست خورد');
    }
  };
  sample();
  setInterval(sample, 5 * 60 * 1000);
}

/**
 * فاز ۳ب: هر ۶۰ ثانیه پست‌های زمان‌بندی‌شده‌ی «کتابخانه‌ی محتوا» که
 * زمانشان رسیده را ارسال می‌کند.
 */
function startScheduledPostRunner() {
  const run = () => {
    TelegramService.runDueScheduledPosts().catch((err) => logger.error({ err }, 'اجرای پست‌های زمان‌بندی‌شده شکست خورد'));
  };
  run();
  setInterval(run, 60 * 1000);
}

// وقتی این فایل مستقیم اجرا می‌شود (نه import شده از یک فایل تست)
// سرور واقعی بالا بیاید. tsx/esbuild این فایل را همیشه به‌عنوان
// entrypoint اجرا می‌کنند، پس این شرط عملاً همیشه در dev/production
// true است؛ فقط وقتی از داخل تست با `import { createApp } from
// '../server'` استفاده شود این فایل صرفاً تعریف را export می‌کند بدون
// اجرای سرور واقعی، چون NODE_ENV=test است.
if (process.env.NODE_ENV !== 'test') {
  startServer();
}
