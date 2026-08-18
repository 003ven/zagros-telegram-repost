import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TelegramService } from '../../src/server/telegram';
import { Storage } from '../../src/server/storage';
import type { TelegramConnection } from '../../src/types';
import { getDefaultTelegramConnectionConfig, type IncomingPushMessage } from '../../src/schemas';

/**
 * تست‌های موتور push-based فاز ۲ (references/roadmap.md). به Postgres
 * واقعی نیاز دارد (مثل tests/integration/api.test.ts) — اگر
 * DATABASE_URL نباشد، skip می‌شود.
 *
 * عمداً `fetch` سراسری را mock می‌کنیم به‌جای تکیه بر ترفند «توکن
 * شروع‌شده با sim_ فقط وقتی fetch واقعاً throw کند» — آن ترفند فقط در
 * sandbox بدون اینترنت قابل‌اعتماد است؛ در CI واقعی (که به اینترنت
 * دسترسی دارد) fetch به api.telegram.org یک پاسخ HTTP واقعی (نه throw)
 * برمی‌گرداند و آن ترفند کار نمی‌کند.
 */
describe.skipIf(!process.env.DATABASE_URL)('TelegramService.handleIncomingPushMessage (needs Postgres)', () => {
  const CONN_ID = 'push-test-conn';

  beforeAll(async () => {
    const conn: TelegramConnection = {
      id: CONN_ID,
      sourceChannel: '@pushsource',
      targetChannel: '@pushtarget',
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
      vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 999 } }), { status: 200 }))
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await Storage.deleteConnection(CONN_ID);
    await Storage.disconnect();
  });

  function buildPayload(overrides: Partial<IncomingPushMessage> = {}): IncomingPushMessage {
    return {
      sourceChannel: '@pushsource',
      messageId: 501,
      text: 'پیام تستی',
      html: 'پیام تستی',
      mediaType: 'text',
      publishedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it('forwards a new push message and updates lastMessageId/transferredCount', async () => {
    await TelegramService.handleIncomingPushMessage(buildPayload({ messageId: 501 }));

    const conn = await Storage.getConnection(CONN_ID);
    expect(conn?.lastMessageId).toBe(501);
    expect(conn?.transferredCount).toBe(1);
  });

  it('ignores a message with an id <= lastMessageId (idempotency — e.g. a re-delivered webhook)', async () => {
    await TelegramService.handleIncomingPushMessage(buildPayload({ messageId: 501, text: 'دوباره همون پیام' }));

    const conn = await Storage.getConnection(CONN_ID);
    expect(conn?.transferredCount).toBe(1); // بدون تغییر
  });

  it('ignores a message for a channel with no matching connection', async () => {
    await TelegramService.handleIncomingPushMessage(
      buildPayload({ sourceChannel: '@nobody_watches_this', messageId: 999 })
    );
    // فقط نباید throw کند — هیچ effect قابل مشاهده‌ای برای این تست نیست.
    expect(true).toBe(true);
  });
});

/**
 * فاز ۳: تشخیص محتوای تکراری (skipDuplicateContent). پل جدا و مستقل از
 * describe بالا تا تداخلی با lastMessageId آن نداشته باشد.
 */
describe.skipIf(!process.env.DATABASE_URL)('Duplicate content detection (فاز ۳، needs Postgres)', () => {
  const CONN_ID = 'dedup-test-conn';

  beforeAll(async () => {
    const conn: TelegramConnection = {
      id: CONN_ID,
      sourceChannel: '@deduptest',
      targetChannel: '@deduptarget',
      botToken: '123456:FAKE',
      status: 'active',
      lastMessageId: null,
      lastReceivedAt: null,
      transferredCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null,
      pollIntervalMs: 15000,
      config: { ...getDefaultTelegramConnectionConfig(), skipDuplicateContent: true },
    };
    await Storage.saveConnection(conn);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1000 } }), { status: 200 }))
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await Storage.deleteConnection(CONN_ID);
    await Storage.disconnect();
  });

  it('sends the first occurrence of a text and skips an exact repeat later', async () => {
    await TelegramService.handleIncomingPushMessage({
      sourceChannel: '@deduptest',
      messageId: 1,
      text: 'این خبر تکراری است',
      html: 'این خبر تکراری است',
      mediaType: 'text',
      publishedAt: new Date().toISOString(),
    });
    let conn = await Storage.getConnection(CONN_ID);
    expect(conn?.transferredCount).toBe(1);

    // همون متن (با فاصله‌ی اضافه و حروف بزرگ/کوچک متفاوت — باید بعد از
    // نرمال‌سازی همچنان یکی تشخیص داده شود)، پیام کد بعدی.
    await TelegramService.handleIncomingPushMessage({
      sourceChannel: '@deduptest',
      messageId: 2,
      text: '  این خبر تکراری است  ',
      html: '  این خبر تکراری است  ',
      mediaType: 'text',
      publishedAt: new Date().toISOString(),
    });
    conn = await Storage.getConnection(CONN_ID);
    // ارسال نشد (تکراری تشخیص داده شد) ولی lastMessageId باید جلو رفته باشد
    expect(conn?.transferredCount).toBe(1);
    expect(conn?.lastMessageId).toBe(2);
  });

  it('still sends a genuinely different text', async () => {
    await TelegramService.handleIncomingPushMessage({
      sourceChannel: '@deduptest',
      messageId: 3,
      text: 'این یک خبر کاملاً متفاوت است',
      html: 'این یک خبر کاملاً متفاوت است',
      mediaType: 'text',
      publishedAt: new Date().toISOString(),
    });
    const conn = await Storage.getConnection(CONN_ID);
    expect(conn?.transferredCount).toBe(2);
  });
});

/**
 * رگرسیون واقعی مشاهده‌شده در production (زاگرس، ۱۷ مرداد ۱۴۰۴): یک
 * پست با خطای دائمی («message is too long») باعث می‌شد lastMessageId
 * هیچ‌وقت جلو نرود و کل پل تا بی‌نهایت (در این مورد واقعی: ۵۵۹۹ بار
 * متوالی) روی همان یک پست گیر کند. این تست تضمین می‌کند این رفتار
 * دیگر تکرار نشود.
 */
describe.skipIf(!process.env.DATABASE_URL)('Permanent send-error skip logic (رگرسیون production، needs Postgres)', () => {
  const CONN_ID = 'permanent-error-test-conn';

  beforeAll(async () => {
    const conn: TelegramConnection = {
      id: CONN_ID,
      sourceChannel: '@permerrsource',
      targetChannel: '@permerrtarget',
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
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await Storage.deleteConnection(CONN_ID);
    await Storage.disconnect();
  });

  it('skips a post immediately (no retry loop) when Telegram returns a known-permanent error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, description: 'Bad Request: message is too long' }), { status: 400 })
      )
    );

    await TelegramService.handleIncomingPushMessage({
      sourceChannel: '@permerrsource',
      messageId: 106822,
      text: 'یک متن خیلی خیلی طولانی که تصور می‌کنیم از محدودیت تلگرام رد می‌شود',
      html: '',
      mediaType: 'text',
      publishedAt: new Date().toISOString(),
    });

    const conn = await Storage.getConnection(CONN_ID);
    // نکته‌ی اصلی رگرسیون: با اینکه ارسال شکست خورد، lastMessageId باید
    // جلو رفته باشد (نه گیر کرده روی همین پست تا ابد).
    expect(conn?.lastMessageId).toBe(106822);
    expect(conn?.consecutiveErrors).toBe(0); // ریست شد چون از پست رد شدیم
    expect(conn?.status).toBe('error'); // خود پل هنوز status=error می‌ماند تا کاربر متوجه بشود، ولی دیگر گیر نکرده

    // پست بعدی باید عادی پردازش شود (شبیه‌سازی موفقیت)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 }))
    );
    await TelegramService.handleIncomingPushMessage({
      sourceChannel: '@permerrsource',
      messageId: 106823,
      text: 'پست بعدی، عادی',
      html: '',
      mediaType: 'text',
      publishedAt: new Date().toISOString(),
    });
    const connAfter = await Storage.getConnection(CONN_ID);
    expect(connAfter?.lastMessageId).toBe(106823);
    expect(connAfter?.transferredCount).toBe(1);
    expect(connAfter?.status).toBe('active');
  });

  it('skips a post after MAX_RETRIES_BEFORE_SKIP consecutive failures even for an unrecognized (non-permanent) error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: false, description: 'Some transient-looking error' }), { status: 500 }))
    );

    // همان پست را ۵ بار پشت‌سرهم شبیه‌سازی می‌کنیم (messageId ثابت،
    // چون در سناریوی واقعی همان پست تا وقتی رد نشده دوباره fetch می‌شود).
    for (let i = 0; i < 5; i++) {
      await TelegramService.handleIncomingPushMessage({
        sourceChannel: '@permerrsource',
        messageId: 106824,
        text: 'پستی با خطای نامشخص',
        html: '',
        mediaType: 'text',
        publishedAt: new Date().toISOString(),
      });
    }

    const conn = await Storage.getConnection(CONN_ID);
    expect(conn?.lastMessageId).toBe(106824); // بعد از ۵ بار، رد شد
    expect(conn?.consecutiveErrors).toBe(0);
  });
});

/**
 * ⚠️ رفع باگ واقعی production (مرداد ۱۴۰۴/اوت ۲۰۲۶): آلبوم‌ها (چند
 * رسانه با mediaTokens مشترک) قبلاً هر عضو را جدا پردازش می‌کردند —
 * الان یوزربات همه‌ی اعضا را یک‌جا با mediaType='media_group' +
 * mediaTokens (آرایه) می‌فرستد. این تست مطمئن می‌شود Node این را به
 * یک ارسال آلبوم واحد تبدیل می‌کند (نه چند پست جدا).
 */
describe.skipIf(!process.env.DATABASE_URL)('Album (media_group) push handling (رگرسیون production، needs Postgres)', () => {
  const CONN_ID = 'album-test-conn';

  beforeAll(async () => {
    const conn: TelegramConnection = {
      id: CONN_ID,
      sourceChannel: '@albumsource',
      targetChannel: '@albumtarget',
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
    process.env.USERBOT_SERVICE_URL = process.env.USERBOT_SERVICE_URL || 'http://127.0.0.1:8081';
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await Storage.deleteConnection(CONN_ID);
    await Storage.disconnect();
  });

  it('sends a 3-item album as ONE forwarded post (transferredCount +1), not three separate posts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 }))
    );

    await TelegramService.handleIncomingPushMessage({
      sourceChannel: '@albumsource',
      messageId: 500, // یوزربات آخرین id عضو آلبوم را می‌فرستد
      groupedId: 123456789,
      text: 'کپشن آلبوم',
      html: 'کپشن آلبوم',
      mediaType: 'media_group',
      mediaTokens: ['tok1', 'tok2', 'tok3'],
      publishedAt: new Date().toISOString(),
    });

    const conn = await Storage.getConnection(CONN_ID);
    // فقط +۱ (نه +۳) — یعنی به‌عنوان یک پست واحد پردازش شد.
    expect(conn?.transferredCount).toBe(1);
    expect(conn?.lastMessageId).toBe(500);
  });

  it('falls back to a single "photo" post if only 1 media token survived (not lost entirely)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 2 } }), { status: 200 }))
    );

    await TelegramService.handleIncomingPushMessage({
      sourceChannel: '@albumsource',
      messageId: 501,
      groupedId: 987654321,
      text: '',
      html: '',
      mediaType: 'media_group',
      mediaTokens: ['tok-only-one'], // فرضاً بقیه‌ی اعضا دانلودشان شکست خورده
      publishedAt: new Date().toISOString(),
    });

    const conn = await Storage.getConnection(CONN_ID);
    expect(conn?.transferredCount).toBe(2); // یکی قبلی + این یکی — گم نشد
    expect(conn?.lastMessageId).toBe(501);
  });
});
