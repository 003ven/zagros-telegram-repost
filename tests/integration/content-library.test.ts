import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TelegramService } from '../../src/server/telegram';
import { Storage } from '../../src/server/storage';
import type { TelegramConnection } from '../../src/types';
import { getDefaultTelegramConnectionConfig } from '../../src/schemas';

/**
 * فاز ۳ب (references/roadmap.md): کتابخانه‌ی محتوا (پست‌های
 * زمان‌بندی‌شده‌ی متنی) + نمودار Uptime واقعی. به Postgres واقعی نیاز
 * دارد — اگر DATABASE_URL نباشد، skip می‌شود.
 */
describe.skipIf(!process.env.DATABASE_URL)('Content library — scheduled posts (فاز ۳ب، needs Postgres)', () => {
  const CONN_ID = 'content-lib-test-conn';

  beforeAll(async () => {
    const conn: TelegramConnection = {
      id: CONN_ID,
      sourceChannel: '@libsource',
      targetChannel: '@libtarget',
      botToken: '123456:FAKE',
      status: 'active',
      lastMessageId: null,
      lastReceivedAt: null,
      transferredCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null,
      pollIntervalMs: 15000,
      config: getDefaultTelegramConnectionConfig(),
    };
    await Storage.saveConnection(conn);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 }))
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await Storage.deleteConnection(CONN_ID);
    await Storage.disconnect();
  });

  it('creates a scheduled post in pending status', async () => {
    const post = await Storage.createScheduledPost({
      connectionId: CONN_ID,
      text: 'یک پست زمان‌بندی‌شده',
      scheduledAt: new Date(Date.now() + 60_000).toISOString(), // یک دقیقه‌ی بعد — هنوز due نیست
    });
    expect(post.status).toBe('pending');

    const dueNow = await Storage.getDueScheduledPosts();
    expect(dueNow.find((p) => p.id === post.id)).toBeUndefined();

    await Storage.deleteScheduledPost(post.id);
  });

  it('sends a due post via runDueScheduledPosts and marks it sent', async () => {
    const post = await Storage.createScheduledPost({
      connectionId: CONN_ID,
      text: 'این پست الان باید ارسال شود',
      scheduledAt: new Date(Date.now() - 1000).toISOString(), // در گذشته — due است
    });

    await TelegramService.runDueScheduledPosts();

    const all = await Storage.getScheduledPosts(CONN_ID);
    const updated = all.find((p) => p.id === post.id);
    expect(updated?.status).toBe('sent');
    expect(updated?.sentAt).not.toBeNull();
  });

  it('marks a due post as failed if its connection was deleted', async () => {
    const orphanConnId = 'ghost-connection-id';
    const post = await Storage.createScheduledPost({
      connectionId: orphanConnId,
      text: 'این پل دیگر وجود ندارد',
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
    });

    await TelegramService.runDueScheduledPosts();

    const all = await Storage.getScheduledPosts(orphanConnId);
    const updated = all.find((p) => p.id === post.id);
    expect(updated?.status).toBe('failed');

    await Storage.deleteScheduledPost(post.id);
  });
});

describe.skipIf(!process.env.DATABASE_URL)('Uptime history (فاز ۳ب، needs Postgres)', () => {
  afterAll(async () => {
    await Storage.disconnect();
  });

  it('records a sample and includes it in the current hour bucket', async () => {
    await Storage.recordUptimeSample(3, 4); // 75%

    const history = await Storage.getUptimeHistory(24);
    expect(history).toHaveLength(24);

    const currentHourKey = new Date();
    currentHourKey.setMinutes(0, 0, 0);
    const currentBucket = history.find((h) => h.hourStart === currentHourKey.toISOString());
    expect(currentBucket).toBeDefined();
    expect(currentBucket?.healthyPercent).not.toBeNull();
  });
});
