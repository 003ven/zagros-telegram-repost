import { describe, it, expect } from 'vitest';
import { TelegramService } from '../../src/server/telegram';
import type { TelegramConnection, TelegramMessage } from '../../src/types';
import { getDefaultTelegramConnectionConfig } from '../../src/schemas';

/**
 * تست‌های واحد برای منطق پرریسک و بدون-شبکه‌ی TelegramService. عمداً
 * چیزی که نیاز به شبکه‌ی واقعی دارد (fetchPublicChannelPosts,
 * validateBotToken, ارسال واقعی به تلگرام) اینجا تست نمی‌شود — آن‌ها
 * integration test جدا با mock کردن fetch لازم دارند.
 */

function buildMessage(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    id: 1,
    channelUsername: '@source',
    text: 'سلام دنیا',
    htmlText: 'سلام <b>دنیا</b>',
    mediaType: 'text',
    mediaUrls: [],
    caption: null,
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

function buildConnection(configOverrides: Partial<ReturnType<typeof getDefaultTelegramConnectionConfig>> = {}): TelegramConnection {
  return {
    id: 'conn-1',
    sourceChannel: '@source',
    targetChannel: '@target',
    botToken: 'sim_test_token',
    status: 'active',
    lastMessageId: null,
    lastReceivedAt: null,
    transferredCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastError: null,
    pollIntervalMs: 15000,
    config: { ...getDefaultTelegramConnectionConfig(), ...configOverrides },
  };
}

describe('TelegramService.cleanChannelName', () => {
  it('adds @ prefix to a bare username', () => {
    expect(TelegramService.cleanChannelName('mychannel')).toBe('@mychannel');
  });

  it('strips a full t.me URL down to @username', () => {
    expect(TelegramService.cleanChannelName('https://t.me/mychannel')).toBe('@mychannel');
  });

  it('strips a t.me/s/ preview URL down to @username', () => {
    expect(TelegramService.cleanChannelName('https://t.me/s/mychannel')).toBe('@mychannel');
  });

  it('keeps a numeric chat id as-is, without @', () => {
    expect(TelegramService.cleanChannelName('-1001234567890')).toBe('-1001234567890');
  });

  it('returns empty string for empty input', () => {
    expect(TelegramService.cleanChannelName('')).toBe('');
  });
});

describe('TelegramService.getDefaultConfig', () => {
  it('matches the shared schema default exactly (single source of truth)', () => {
    expect(TelegramService.getDefaultConfig()).toEqual(getDefaultTelegramConnectionConfig());
  });

  it('returns a fresh array reference on every call (no shared mutation)', () => {
    const a = TelegramService.getDefaultConfig();
    const b = TelegramService.getDefaultConfig();
    expect(a.replaceRules).not.toBe(b.replaceRules);
    a.replaceRules.push({ id: 'x', search: 'a', replace: 'b' });
    expect(b.replaceRules).toHaveLength(0);
  });
});

describe('TelegramService.isWithinSchedule', () => {
  it('is always active when scheduling is disabled', () => {
    const config = getDefaultTelegramConnectionConfig();
    expect(TelegramService.isWithinSchedule(config).active).toBe(true);
  });

  it('reports inactive when current day is excluded from activeDays', () => {
    const config = {
      ...getDefaultTelegramConnectionConfig(),
      activeScheduleEnabled: true,
      activeDays: [], // will fall back to "no days" handling below
    };
    // فقط وقتی activeDays غیرخالی و روز جاری در آن نباشد رد می‌شود؛
    // آرایه‌ی خالی طبق منطق فعلی یعنی «همه‌ی روزها فعال» (fallback).
    // برای تست واقعی «روز غیرمجاز» باید یک روز که امروز نیست انتخاب کنیم.
    const today = new Date().getDay();
    const notToday = (today + 1) % 7;
    config.activeDays = [notToday];
    const result = TelegramService.isWithinSchedule(config);
    expect(result.active).toBe(false);
    expect(result.reason).toMatch(/روز جاری/);
  });
});

describe('TelegramService.processAndFilterPost', () => {
  it('rejects a post outside the allowed media types', async () => {
    const conn = buildConnection({ allowedMediaTypes: ['photo'] });
    const message = buildMessage({ mediaType: 'text' });
    const result = await TelegramService.processAndFilterPost(conn, message);
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toMatch(/نوع رسانه/);
  });

  it('rejects a post missing a required keyword', async () => {
    const conn = buildConnection({ keywordsInclude: ['خبر فوری'] });
    const message = buildMessage({ text: 'یک متن معمولی بدون آن کلمه' });
    const result = await TelegramService.processAndFilterPost(conn, message);
    expect(result.shouldSend).toBe(false);
  });

  it('rejects a post containing an excluded keyword', async () => {
    const conn = buildConnection({ keywordsExclude: ['تبلیغ'] });
    const message = buildMessage({ text: 'این یک تبلیغ است' });
    const result = await TelegramService.processAndFilterPost(conn, message);
    expect(result.shouldSend).toBe(false);
  });

  it('applies replaceRules to the final text', async () => {
    const conn = buildConnection({
      replaceRules: [{ id: 'r1', search: 'دنیا', replace: 'ایران' }],
    });
    const message = buildMessage({ text: 'سلام دنیا' });
    const result = await TelegramService.processAndFilterPost(conn, message);
    expect(result.shouldSend).toBe(true);
    expect(result.processedText).toContain('ایران');
    expect(result.processedText).not.toContain('دنیا');
  });

  it('wraps text with customHeader and customFooter', async () => {
    const conn = buildConnection({ customHeader: 'هدر', customFooter: 'فوتر' });
    const message = buildMessage({ text: 'متن اصلی' });
    const result = await TelegramService.processAndFilterPost(conn, message);
    expect(result.processedText.startsWith('هدر')).toBe(true);
    expect(result.processedText.endsWith('فوتر')).toBe(true);
  });

  it('preserves HTML formatting when no text-mutating rule is active', async () => {
    const conn = buildConnection();
    const message = buildMessage({ htmlText: 'سلام <b>دنیا</b>' });
    const result = await TelegramService.processAndFilterPost(conn, message);
    expect(result.processedHtml).toBeDefined();
  });

  it('drops HTML formatting (falls back to plain text) once removeLinks is active', async () => {
    const conn = buildConnection({ removeLinks: true });
    const message = buildMessage({ htmlText: 'سلام <b>دنیا</b> https://example.com' });
    const result = await TelegramService.processAndFilterPost(conn, message);
    expect(result.processedHtml).toBeUndefined();
  });

  /**
   * رگرسیون واقعی مشاهده‌شده در production (منتقل‌شده از تغییر دستی
   * کاربر روی سرور، مرداد ۱۴۰۴/اوت ۲۰۲۶): وقتی removeMentions فعال
   * بود، کل مسیر حفظ فرمت HTML غیرفعال می‌شد و پست کامل به متن ساده
   * تبدیل می‌شد — فقط برای حذف چند @username. رفعش کردیم تا فقط
   * منشن‌ها حذف شوند، نه بقیه‌ی فرمت.
   */
  it('removes @mentions WITHOUT dropping the rest of the HTML formatting', async () => {
    const conn = buildConnection({ removeMentions: true });
    const message = buildMessage({ htmlText: 'سلام <b>دنیا</b> @someuser چطوری؟' });
    const result = await TelegramService.processAndFilterPost(conn, message);
    expect(result.processedHtml).toBeDefined();
    expect(result.processedHtml).toContain('<b>دنیا</b>');
    expect(result.processedHtml).not.toContain('@someuser');
  });

  it('removes a Telegram auto-linked mention (<a href="https://t.me/user">@user</a>) while keeping other formatting', async () => {
    const conn = buildConnection({ removeMentions: true });
    const message = buildMessage({
      htmlText: 'با تشکر از <a href="https://t.me/someuser">@someuser</a> برای <b>کمکش</b>',
    });
    const result = await TelegramService.processAndFilterPost(conn, message);
    expect(result.processedHtml).toBeDefined();
    expect(result.processedHtml).not.toContain('t.me/someuser');
    expect(result.processedHtml).toContain('<b>کمکش</b>');
  });

  /**
   * رگرسیون واقعی مشاهده‌شده در production: بعضی کانال‌های مبدأ در HTML
   * اسکرِیپ‌شده‌شان کاراکتر & را دوبار انکود می‌کنند
   * (`&amp;amp;param=x` به‌جای `&amp;param=x`). یک پاس decode ساده یک
   * `&amp;` واقعی باقی می‌گذارد که لینک‌های query-string‌دار را می‌شکند.
   */
  it('fully decodes a double-encoded & in a link href (not just one pass)', async () => {
    const conn = buildConnection();
    const message = buildMessage({
      htmlText: '<a href="https://example.com/x?a=1&amp;amp;b=2">لینک</a>',
    });
    const result = await TelegramService.processAndFilterPost(conn, message);
    expect(result.processedHtml).toBeDefined();
    expect(result.processedHtml).toContain('href="https://example.com/x?a=1&b=2"');
    expect(result.processedHtml).not.toContain('&amp;amp;');
  });
});
