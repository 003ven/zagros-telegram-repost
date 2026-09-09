import { PrismaClient, Prisma } from '@prisma/client';
import { TelegramConnection, LogEntry, ScheduledPost, TelegramConnectionConfig } from '../types';
import { logger } from './logger';

/**
 * لایه‌ی persistence — از فاز ۱ نقشه‌راه (references/roadmap.md) به
 * PostgreSQL از طریق Prisma تبدیل شد. قبلاً فایل JSON تخت + کش کامل در
 * حافظه بود؛ الان مستقیم روی Postgres کار می‌کند (بدون کش دستی، چون
 * Postgres خودش سریع‌تر و امن‌تر از هماهنگ نگه‌داشتن یک کش دستی است).
 *
 * نکته‌ی مهم برای توسعه‌ی بعدی: همه‌ی متدهای این کلاس async شدند (قبلاً
 * sync بودند، چون fs.readFileSync/writeFileSync بلوکه‌کننده بود ولی
 * سریع). این یعنی **هر جای کدبیس که این متدها را صدا می‌زند باید
 * await داشته باشد** — سرور (server.ts) و لایه‌ی تلگرام
 * (src/server/telegram.ts) هر دو در همین فاز آپدیت شدند؛ اگر route یا
 * تابع جدیدی اضافه می‌کنی که Storage را صدا می‌زند، حتماً async باشد.
 */

export const prisma = new PrismaClient();

function connectionFromRow(row: {
  id: string;
  sourceChannel: string;
  targetChannel: string;
  botToken: string;
  status: string;
  lastMessageId: number | null;
  lastReceivedAt: Date | null;
  transferredCount: number;
  createdAt: Date;
  updatedAt: Date;
  lastError: string | null;
  consecutiveErrors: number;
  pollIntervalMs: number;
  lastErrorAlertAt: Date | null;
  circuitOpenUntil: Date | null;
  config: Prisma.JsonValue;
}): TelegramConnection {
  return {
    id: row.id,
    sourceChannel: row.sourceChannel,
    targetChannel: row.targetChannel,
    botToken: row.botToken,
    status: row.status as TelegramConnection['status'],
    lastMessageId: row.lastMessageId,
    lastReceivedAt: row.lastReceivedAt ? row.lastReceivedAt.toISOString() : null,
    transferredCount: row.transferredCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastError: row.lastError,
    consecutiveErrors: row.consecutiveErrors,
    pollIntervalMs: row.pollIntervalMs,
    lastErrorAlertAt: row.lastErrorAlertAt ? row.lastErrorAlertAt.toISOString() : null,
    circuitOpenUntil: row.circuitOpenUntil ? row.circuitOpenUntil.toISOString() : null,
    config: row.config as unknown as TelegramConnection['config'],
  };
}

function connectionToRow(conn: TelegramConnection) {
  return {
    id: conn.id,
    sourceChannel: conn.sourceChannel,
    targetChannel: conn.targetChannel,
    botToken: conn.botToken,
    status: conn.status,
    lastMessageId: conn.lastMessageId,
    lastReceivedAt: conn.lastReceivedAt ? new Date(conn.lastReceivedAt) : null,
    transferredCount: conn.transferredCount,
    createdAt: new Date(conn.createdAt),
    updatedAt: new Date(conn.updatedAt),
    lastError: conn.lastError,
    consecutiveErrors: conn.consecutiveErrors || 0,
    pollIntervalMs: conn.pollIntervalMs,
    lastErrorAlertAt: conn.lastErrorAlertAt ? new Date(conn.lastErrorAlertAt) : null,
    circuitOpenUntil: conn.circuitOpenUntil ? new Date(conn.circuitOpenUntil) : null,
    config: conn.config as unknown as Prisma.InputJsonValue,
  };
}

function logFromRow(row: {
  id: string;
  connectionId: string;
  timestamp: Date;
  type: string;
  message: string;
  details: string | null;
}): LogEntry {
  return {
    id: row.id,
    connectionId: row.connectionId,
    timestamp: row.timestamp.toISOString(),
    type: row.type as LogEntry['type'],
    message: row.message,
    details: row.details ?? undefined,
  };
}

function scheduledPostFromRow(row: {
  id: string;
  connectionId: string;
  text: string;
  scheduledAt: Date;
  status: string;
  createdAt: Date;
  sentAt: Date | null;
  error: string | null;
}): ScheduledPost {
  return {
    id: row.id,
    connectionId: row.connectionId,
    text: row.text,
    scheduledAt: row.scheduledAt.toISOString(),
    status: row.status as ScheduledPost['status'],
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    error: row.error,
  };
}

export class Storage {
  private static maxLogs = 500;

  public static async getAllConnections(): Promise<TelegramConnection[]> {
    const rows = await prisma.connection.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(connectionFromRow);
  }

  public static async getConnection(id: string): Promise<TelegramConnection | undefined> {
    const row = await prisma.connection.findUnique({ where: { id } });
    return row ? connectionFromRow(row) : undefined;
  }

  public static async clearAllConnections(): Promise<void> {
    await prisma.$transaction([prisma.logEntry.deleteMany({}), prisma.connection.deleteMany({})]);
  }

  public static async saveConnection(conn: TelegramConnection): Promise<TelegramConnection> {
    const row = connectionToRow(conn);
    await prisma.connection.upsert({
      where: { id: conn.id },
      create: row,
      update: row,
    });
    return conn;
  }

  public static async deleteConnection(id: string): Promise<boolean> {
    try {
      await prisma.$transaction([
        prisma.logEntry.deleteMany({ where: { connectionId: id } }),
        prisma.connection.delete({ where: { id } }),
      ]);
      return true;
    } catch (e) {
      // P2025 = record to delete does not exist — همان رفتار قبلی
      // (Map.delete روی id ناموجود false برمی‌گرداند، نه throw).
      logger.warn({ err: e, id }, 'deleteConnection: connection not found or already deleted');
      return false;
    }
  }

  public static async addLog(
    connectionId: string,
    type: 'info' | 'success' | 'warning' | 'error',
    message: string,
    details?: string
  ): Promise<LogEntry> {
    const row = await prisma.logEntry.create({
      data: { connectionId, type, message, details: details ?? null },
    });

    // چرخش لاگ‌ها: نگه‌داشتن حداکثر maxLogs رکورد در کل دیتابیس (همان
    // رفتار قبلی نسخه‌ی JSON). این را fire-and-forget اجرا می‌کنیم که
    // مسیر پرتکرار addLog کند نشود.
    prisma.logEntry.count().then(async (total) => {
      if (total > Storage.maxLogs) {
        const excess = total - Storage.maxLogs;
        const oldest = await prisma.logEntry.findMany({
          orderBy: { timestamp: 'asc' },
          take: excess,
          select: { id: true },
        });
        if (oldest.length > 0) {
          await prisma.logEntry.deleteMany({ where: { id: { in: oldest.map((o) => o.id) } } });
        }
      }
    }).catch((e) => logger.error({ err: e }, 'Failed to trim old logs'));

    return logFromRow(row);
  }

  public static async getLogsForConnection(connectionId: string, limit = 100): Promise<LogEntry[]> {
    const rows = await prisma.logEntry.findMany({
      where: { connectionId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return rows.map(logFromRow);
  }

  public static async getAllLogs(limit = 200): Promise<LogEntry[]> {
    const rows = await prisma.logEntry.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return rows.map(logFromRow);
  }

  // --- فاز ۳: تشخیص محتوای تکراری (references/roadmap.md) ---
  private static readonly DEDUP_WINDOW_DAYS = 7;

  /** آیا این هش برای همین پل در بازه‌ی اخیر (پیش‌فرض ۷ روز) قبلاً دیده شده؟ */
  public static async hasSeenContentHash(connectionId: string, contentHash: string): Promise<boolean> {
    const since = new Date(Date.now() - Storage.DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const existing = await prisma.sentContentHash.findFirst({
      where: { connectionId, contentHash, sentAt: { gte: since } },
      select: { id: true },
    });
    return existing !== null;
  }

  /** بعد از ارسال موفق، هش را ثبت می‌کند. rowهای قدیمی‌تر از بازه‌ی
   * dedup را هم به‌صورت fire-and-forget پاک می‌کند تا جدول رشد نامحدود
   * نداشته باشد. */
  public static async recordContentHash(connectionId: string, contentHash: string): Promise<void> {
    await prisma.sentContentHash.create({ data: { connectionId, contentHash } });

    const cutoff = new Date(Date.now() - Storage.DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    prisma.sentContentHash
      .deleteMany({ where: { sentAt: { lt: cutoff } } })
      .catch((e) => logger.error({ err: e }, 'Failed to trim old content hashes'));
  }

  // --- فاز ۳ب: نمودار Uptime واقعی ---

  public static async recordUptimeSample(healthyCount: number, totalCount: number): Promise<void> {
    await prisma.uptimeSample.create({ data: { healthyCount, totalCount } });

    // نگه‌داشتن فقط ۷ روز اخیر — کافی برای نمودار ۲۴ ساعته + کمی حاشیه.
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    prisma.uptimeSample
      .deleteMany({ where: { timestamp: { lt: cutoff } } })
      .catch((e) => logger.error({ err: e }, 'Failed to trim old uptime samples'));
  }

  /** میانگین درصد سلامت (healthyCount/totalCount) را برای هر ساعت از
   * `hours` ساعت اخیر برمی‌گرداند — یک آرایه‌ی مرتب از قدیم به جدید،
   * دقیقاً به تعداد `hours` عنصر (ساعت‌های بدون نمونه، null می‌شوند تا
   * فرانت بتواند تصمیم بگیرد چطور نمایششان دهد). */
  public static async getUptimeHistory(hours = 24): Promise<{ hourStart: string; healthyPercent: number | null }[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const samples = await prisma.uptimeSample.findMany({
      where: { timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
      select: { timestamp: true, healthyCount: true, totalCount: true },
    });

    const buckets = new Map<string, { healthySum: number; totalSum: number; count: number }>();
    for (const s of samples) {
      const hourKey = new Date(s.timestamp);
      hourKey.setMinutes(0, 0, 0);
      const key = hourKey.toISOString();
      const bucket = buckets.get(key) || { healthySum: 0, totalSum: 0, count: 0 };
      bucket.healthySum += s.healthyCount;
      bucket.totalSum += s.totalCount;
      bucket.count += 1;
      buckets.set(key, bucket);
    }

    const result: { hourStart: string; healthyPercent: number | null }[] = [];
    const now = new Date();
    now.setMinutes(0, 0, 0);
    for (let i = hours - 1; i >= 0; i--) {
      const hourStart = new Date(now.getTime() - i * 60 * 60 * 1000);
      const key = hourStart.toISOString();
      const bucket = buckets.get(key);
      result.push({
        hourStart: key,
        healthyPercent: bucket && bucket.totalSum > 0 ? Math.round((bucket.healthySum / bucket.totalSum) * 1000) / 10 : null,
      });
    }
    return result;
  }

  // --- فاز ۳ب: کتابخانه‌ی محتوا (پست‌های زمان‌بندی‌شده) ---

  public static async createScheduledPost(input: {
    connectionId: string;
    text: string;
    scheduledAt: string;
  }): Promise<ScheduledPost> {
    const row = await prisma.scheduledPost.create({
      data: { connectionId: input.connectionId, text: input.text, scheduledAt: new Date(input.scheduledAt) },
    });
    return scheduledPostFromRow(row);
  }

  public static async getScheduledPosts(connectionId?: string): Promise<ScheduledPost[]> {
    const rows = await prisma.scheduledPost.findMany({
      where: connectionId ? { connectionId } : undefined,
      orderBy: { scheduledAt: 'asc' },
    });
    return rows.map(scheduledPostFromRow);
  }

  public static async getDueScheduledPosts(): Promise<ScheduledPost[]> {
    const rows = await prisma.scheduledPost.findMany({
      where: { status: 'pending', scheduledAt: { lte: new Date() } },
      orderBy: { scheduledAt: 'asc' },
    });
    return rows.map(scheduledPostFromRow);
  }

  public static async markScheduledPostSent(id: string): Promise<void> {
    await prisma.scheduledPost.update({ where: { id }, data: { status: 'sent', sentAt: new Date(), error: null } });
  }

  public static async markScheduledPostFailed(id: string, error: string): Promise<void> {
    await prisma.scheduledPost.update({ where: { id }, data: { status: 'failed', error } });
  }

  public static async deleteScheduledPost(id: string): Promise<boolean> {
    try {
      await prisma.scheduledPost.delete({ where: { id } });
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- فاز ۶: رصد تعامل واقعی (ری‌اکشن‌های کاربران) ---
  private static normalizeChannel(channel: string): string {
    return channel.trim().replace(/^@/, '').toLowerCase();
  }
  /** بلافاصله بعد از هر ارسال موفق صدا زده می‌شود (مستقل از فعال‌بودن
   * seedReaction) تا بعداً بشود ری‌اکشن واقعی کاربران را رویش نگاشت کرد.
   * idempotent — صدا زدن دوباره برای همان (targetChannel, messageId) فقط
   * connectionId/sentAt را به‌روز می‌کند، رکورد تکراری نمی‌سازد. */
  public static async recordOutboundPost(
    connectionId: string,
    targetChannel: string,
    messageId: number
  ): Promise<void> {
    const normalized = Storage.normalizeChannel(targetChannel);
    await prisma.outboundPost.upsert({
      where: { targetChannel_messageId: { targetChannel: normalized, messageId } },
      create: { connectionId, targetChannel: normalized, messageId },
      update: { connectionId },
    });
  }
  /** با آپدیت message_reaction_count از تلگرام صدا زده می‌شود. اگر پستی با
   * این (targetChannel, messageId) ردیابی نشده باشد (مثلاً قبل از فعال‌شدن
   * این فیچر ارسال شده)، بی‌سروصدا نادیده گرفته می‌شود. */
  public static async updatePostReactions(
    targetChannel: string,
    messageId: number,
    reactions: Record<string, number>
  ): Promise<void> {
    const normalized = Storage.normalizeChannel(targetChannel);
    try {
      await prisma.outboundPost.update({
        where: { targetChannel_messageId: { targetChannel: normalized, messageId } },
        data: { reactions, reactionsUpdatedAt: new Date() },
      });
    } catch {
      // پست ردیابی‌نشده — بی‌خطر، فقط نادیده می‌گیریم
    }
  }
  public static async getUpdateOffset(botTokenHash: string): Promise<number> {
    const row = await prisma.telegramUpdateOffset.findUnique({ where: { botTokenHash } });
    return row?.lastUpdateId ?? 0;
  }
  public static async setUpdateOffset(botTokenHash: string, updateId: number): Promise<void> {
    await prisma.telegramUpdateOffset.upsert({
      where: { botTokenHash },
      create: { botTokenHash, lastUpdateId: updateId },
      update: { lastUpdateId: updateId },
    });
  }
  // --- فاز ۹: تاریخچه‌ی تنظیمات هر پل ---
  private static readonly CONFIG_VERSION_KEEP_COUNT = 20;
  /** شکل *قبلی* config را (قبل از رونویسی) snapshot می‌کند و نسخه‌های
   * قدیمی‌تر از ۲۰ تای آخر همین پل را پاک می‌کند (fire-and-forget). */
  public static async recordConfigVersion(connectionId: string, config: TelegramConnectionConfig): Promise<void> {
    await prisma.connectionConfigVersion.create({
      data: { connectionId, config: config as unknown as Prisma.InputJsonValue },
    });
    const old = await prisma.connectionConfigVersion.findMany({
      where: { connectionId },
      orderBy: { createdAt: 'desc' },
      skip: Storage.CONFIG_VERSION_KEEP_COUNT,
      select: { id: true },
    });
    if (old.length > 0) {
      prisma.connectionConfigVersion
        .deleteMany({ where: { id: { in: old.map((o) => o.id) } } })
        .catch((e) => logger.error({ err: e }, 'Failed to trim old config versions'));
    }
  }
  public static async getConfigVersions(connectionId: string, limit = 20): Promise<{ id: string; createdAt: string }[]> {
    const rows = await prisma.connectionConfigVersion.findMany({
      where: { connectionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, createdAt: true },
    });
    return rows.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString() }));
  }
  public static async getConfigVersion(connectionId: string, versionId: string): Promise<TelegramConnectionConfig | null> {
    const row = await prisma.connectionConfigVersion.findFirst({ where: { id: versionId, connectionId } });
    if (!row) return null;
    return row.config as unknown as TelegramConnectionConfig;
  }
  /** فقط برای تست‌ها: اتصال Prisma را می‌بندد تا فرآیند تست بدون
   * handle باز خاتمه یابد. */
  public static async disconnect(): Promise<void> {
    await prisma.$disconnect();
  }
}
