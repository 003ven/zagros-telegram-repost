/**
 * اسکریپت یک‌باره‌ی مهاجرت داده: فایل‌های JSON قدیمی
 * (data/connections.json, data/logs.json — یا هر مسیری که DATA_DIR
 * نشان می‌دهد) را می‌خواند و در Postgres (از طریق Prisma) درج می‌کند.
 *
 * استفاده:
 *   npm run db:migrate-from-json
 *   (یا با override دستی: DATA_DIR="/root/zagros-data" npm run db:migrate-from-json)
 *
 * این اسکریپت خودش .env.local را می‌خواند (با dotenv) — نیازی نیست
 * قبلش دستی DATABASE_URL را export کنید.
 *
 * قبل از اجرا حتماً یک‌بار migration را اعمال کرده باشید:
 *   npx prisma migrate deploy
 *
 * این اسکریپت idempotent است (safe برای اجرای دوباره): از upsert روی
 * id استفاده می‌کند، پس رکوردهای تکراری نمی‌سازد.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { getDefaultTelegramConnectionConfig } from '../src/schemas';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const CONNECTIONS_FILE = path.join(DATA_DIR, 'connections.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

const prisma = new PrismaClient();

async function main() {
  console.log(`در حال خواندن داده از: ${DATA_DIR}`);

  let migratedConnections = 0;
  let migratedLogs = 0;

  if (fs.existsSync(CONNECTIONS_FILE)) {
    const raw = fs.readFileSync(CONNECTIONS_FILE, 'utf-8');
    const connections: any[] = JSON.parse(raw);
    console.log(`${connections.length} پل در فایل JSON یافت شد.`);

    for (const conn of connections) {
      const config = { ...getDefaultTelegramConnectionConfig(), ...(conn.config || {}) };
      await prisma.connection.upsert({
        where: { id: conn.id },
        create: {
          id: conn.id,
          sourceChannel: conn.sourceChannel,
          targetChannel: conn.targetChannel,
          botToken: conn.botToken,
          status: conn.status || 'active',
          lastMessageId: conn.lastMessageId ?? null,
          lastReceivedAt: conn.lastReceivedAt ? new Date(conn.lastReceivedAt) : null,
          transferredCount: conn.transferredCount || 0,
          createdAt: conn.createdAt ? new Date(conn.createdAt) : new Date(),
          updatedAt: conn.updatedAt ? new Date(conn.updatedAt) : new Date(),
          lastError: conn.lastError ?? null,
          consecutiveErrors: conn.consecutiveErrors || 0,
          pollIntervalMs: conn.pollIntervalMs || 15000,
          config: config as any,
        },
        update: {
          sourceChannel: conn.sourceChannel,
          targetChannel: conn.targetChannel,
          botToken: conn.botToken,
          status: conn.status || 'active',
          config: config as any,
        },
      });
      migratedConnections++;
    }
  } else {
    console.log('فایل connections.json پیدا نشد — رد شد.');
  }

  if (fs.existsSync(LOGS_FILE)) {
    const existingLogCount = await prisma.logEntry.count();
    if (existingLogCount > 0) {
      console.log(
        `دیتابیس از قبل ${existingLogCount} لاگ دارد — برای جلوگیری از تکرار، مهاجرت لاگ‌ها رد شد. ` +
          'اگر عمداً می‌خواهید دوباره مهاجرت کنید، اول جدول logs را در Postgres خالی کنید.'
      );
    } else {
      const raw = fs.readFileSync(LOGS_FILE, 'utf-8');
      const logs: any[] = JSON.parse(raw);
      console.log(`${logs.length} لاگ در فایل JSON یافت شد.`);

      for (const log of logs) {
        await prisma.logEntry.create({
          data: {
            connectionId: log.connectionId,
            timestamp: log.timestamp ? new Date(log.timestamp) : new Date(),
            type: log.type || 'info',
            message: log.message || '',
            details: log.details ?? null,
          },
        });
        migratedLogs++;
      }
    }
  } else {
    console.log('فایل logs.json پیدا نشد — رد شد.');
  }

  console.log(`\nتمام شد: ${migratedConnections} پل و ${migratedLogs} لاگ به Postgres منتقل شد.`);
  console.log('توصیه: بعد از تأیید صحت داده در دیتابیس، فایل‌های JSON قدیمی را (فقط برای اطمینان) یک‌جا بکاپ بگیرید و کنار بگذارید — این اسکریپت آن‌ها را پاک نمی‌کند.');
}

main()
  .catch((e) => {
    console.error('خطا در مهاجرت داده:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
