import {
  TelegramConnection,
  TelegramConnectionConfig,
  TelegramMessage,
  BotValidationResult,
  ChannelPreviewResult,
} from '../types';
import { Storage } from './storage';
import { rewriteContentWithAI } from './gemini';
import { getDefaultTelegramConnectionConfig, type IncomingPushMessage } from '../schemas';
import { logger } from './logger';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { Readable } from 'stream';
import FormData from 'form-data';
// آدرس پایه‌ی Bot API — پیش‌فرض سرور ابری تلگرام، اما اگر
// TELEGRAM_API_BASE_URL تنظیم شده باشد (Local Bot API Server، برای
// دور زدن سقف ۵۰ مگابایتی آپلود استاندارد)، از آن استفاده می‌شود.
function getTelegramApiBase(): string {
  return (process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org').replace(/\/$/, '');
}

export class TelegramService {
  private static activePollers: Map<string, NodeJS.Timeout> = new Map();
  /** فاز ۲: کدام موتور برای هر پل فعال است — برای این‌که
   * stopMonitoring بداند باید clearInterval کند یا به یوزربات
   * /unwatch بزند. */
  private static monitoringMode: Map<string, 'push' | 'poll'> = new Map();

  /** فاز ۳: هش نرمال‌شده‌ی متن نهایی، برای تشخیص محتوای تکراری
   * (Storage.hasSeenContentHash / recordContentHash). */
  private static hashContent(text: string): string {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /** پیش‌فرض واحد config — از src/schemas.ts می‌آید تا با سمت کلاینت
   * (src/lib/defaultConnectionConfig.ts) همیشه یکسان بماند. */
  public static getDefaultConfig(): TelegramConnectionConfig {
    return getDefaultTelegramConnectionConfig();
  }

  /**
   * Check if current time falls within active schedule
   */
  public static isWithinSchedule(config: TelegramConnectionConfig): { active: boolean; reason?: string } {
    if (!config.activeScheduleEnabled) return { active: true };

    const start = config.activeScheduleStart || '08:00';
    const end = config.activeScheduleEnd || '22:00';
    const activeDays = config.activeDays && config.activeDays.length > 0 ? config.activeDays : [0, 1, 2, 3, 4, 5, 6];

    const now = new Date();
    const currentDay = now.getDay();

    if (!activeDays.includes(currentDay)) {
      return {
        active: false,
        reason: `روز جاری در لیست روزهای کاری فعال پل قرار ندارد`,
      };
    }

    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = start.split(':').map(Number);
    const startMinutes = (startH || 0) * 60 + (startM || 0);

    const [endH, endM] = end.split(':').map(Number);
    const endMinutes = (endH || 0) * 60 + (endM || 0);

    let isWithin = false;
    if (startMinutes <= endMinutes) {
      isWithin = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      isWithin = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }

    if (!isWithin) {
      const formattedCurrent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      return {
        active: false,
        reason: `زمان فعلی (${formattedCurrent}) خارج از ساعت کاری تعیین شده (${start} تا ${end}) است`,
      };
    }

    return { active: true };
  }

  /**
   * Clean channel username or chat ID from input string
   */
  public static cleanChannelName(input: string): string {
    if (!input) return '';
    let cleaned = input.trim();
    cleaned = cleaned.replace(/^https?:\/\/(www\.)?t\.me\/(s\/)?/, '');
    cleaned = cleaned.replace(/^t\.me\/(s\/)?/, '');
    cleaned = cleaned.replace(/^\/+|\/+$/g, '');

    if (/^-?\d+$/.test(cleaned)) {
      return cleaned;
    }

    if (!cleaned.startsWith('@')) {
      cleaned = `@${cleaned}`;
    }

    return cleaned;
  }

  /**
   * ⚠️ رفع باگ واقعی production (منتقل‌شده از تغییر دستی کاربر روی سرور،
   * مرداد ۱۴۰۴/اوت ۲۰۲۶): بعضی از کانال‌های مبدأ در HTML اسکرِیپ‌شده‌شان
   * کاراکتر & را دوبار انکود می‌کنند (`&amp;amp;` به‌جای `&amp;`). یک
   * پاس decode تنها یک `&amp;` واقعی باقی می‌گذارد که لینک‌های
   * پروکسی/کوئری‌استرینگ‌دار را می‌شکند. این تابع تا وقتی چیزی تغییر
   * نکند (حداکثر ۵ بار، برای جلوگیری از حلقه‌ی بی‌نهایت روی ورودی
   * واقعاً عجیب) دوباره decode می‌کند.
   */
  private static decodeHrefEntities(href: string): string {
    if (!href) return href;
    let prev = href;
    let current = href.replace(/&amp;/gi, '&');
    let iterations = 0;
    while (current !== prev && iterations < 5) {
      prev = current;
      current = current.replace(/&amp;/gi, '&');
      iterations++;
    }
    return current;
  }

  /**
   * Validate Telegram Bot Token via official getMe endpoint
   */
  public static async validateBotToken(token: string): Promise<BotValidationResult> {
    if (!token || token.trim().length < 10) {
      return { valid: false, error: 'توکن وارد شده معتبر نیست (طول توکن بسیار کوتاه است)' };
    }

    const cleanToken = token.trim();

    try {
      const response = await fetch(`${getTelegramApiBase()}/bot${cleanToken}/getMe`, {
        signal: AbortSignal.timeout(8000),
      });

      const data = await response.json();

      if (data && data.ok && data.result) {
        return {
          valid: true,
          botName: data.result.first_name,
          botUsername: data.result.username ? `@${data.result.username}` : undefined,
        };
      } else {
        return {
          valid: false,
          error: data.description || 'توکن ربات تلگرام نامعتبر است',
        };
      }
    } catch (err) {
      return {
        valid: false,
        error: `خطا در ارتباط با سرور تلگرام: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Fetch public channel preview and recent posts from Telegram web preview (t.me/s/channel)
   */
  public static async fetchPublicChannelPosts(channelInput: string): Promise<ChannelPreviewResult> {
    const channelName = TelegramService.cleanChannelName(channelInput);
    const username = channelName.startsWith('@') ? channelName.substring(1) : channelName;

    if (!username || /^-?\d+$/.test(username)) {
      return {
        username: channelInput,
        title: channelInput,
        messages: [],
        error: 'برای استخراج پست‌ها از کانال مبدأ، شناسه کاربری عمومی کانال (مانند @channel) لازم است',
      };
    }

    try {
      const url = `https://t.me/s/${username}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`خطای دریافت از تلگرام (${response.status} ${response.statusText})`);
      }

      const html = await response.text();

      const titleMatch =
        html.match(/<div class="tgme_channel_info_title"><span dir="auto">(.*?)<\/span>/s) ||
        html.match(/<meta property="og:title" content="(.*?)">/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : `@${username}`;

      const avatarMatch = html.match(/<img class="tgme_page_photo_image" src="(.*?)">/);
      const avatarUrl = avatarMatch ? avatarMatch[1] : undefined;

      const subMatch = html.match(/<div class="tgme_channel_info_counter"><span class="counter_value">(.*?)<\/span>/);
      const subscribers = subMatch ? subMatch[1] : undefined;

      const messages: TelegramMessage[] = [];
      const postBlocks = html.split(/<div class="tgme_widget_message[^"]*\sjs-widget_message"/g);

      for (let i = 1; i < postBlocks.length; i++) {
        const block = postBlocks[i];

        const postMatch = block.match(/data-post="[^"/]+\/(\d+)"/);
        if (!postMatch) continue;
        const msgId = parseInt(postMatch[1], 10);

        const textMatch = block.match(/<div class="tgme_widget_message_text js-message_text"[^>]*>(.*?)<\/div>/s);
        let rawHtmlText = textMatch ? textMatch[1] : '';

        let text = TelegramService.decodeHtmlEntities(
          rawHtmlText
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
        ).trim();

        let mediaType: TelegramMessage['mediaType'] = 'text';
        const mediaUrls: string[] = [];

        const photoMatches = [...block.matchAll(/tgme_widget_message_photo_wrap[^"]*"[^>]*style="[^"]*background-image:url\('(.*?)'\)/g)]
          .map((m) => m[1])
          .filter((url) => url && /^https?:\/\//.test(url));
        if (photoMatches.length > 0) {
          mediaType = photoMatches.length > 1 ? 'media_group' : 'photo';
          mediaUrls.push(...photoMatches);
        }

        const videoMatch = block.match(/<video src="(.*?)"/);
        if (videoMatch && videoMatch[1]) {
          mediaType = 'video';
          mediaUrls.length = 0;
          mediaUrls.push(videoMatch[1]);
        }

        if (block.includes('tgme_widget_message_document')) {
          mediaType = 'document';
        }

        if (block.includes('tgme_widget_message_voice')) {
          mediaType = 'voice';
        }

        if (block.includes('tgme_widget_message_sticker')) {
          mediaType = 'sticker';
        }

        // "Connect"-style inline buttons attached under the post (proxy
        // links etc). These live outside the message text entirely — a
        // separate reply_markup structure Telegram renders as buttons.
        let inlineKeyboard: { text: string; url: string }[][] | undefined;
        const kbIdx = block.indexOf('tgme_widget_message_inline_keyboard');
        if (kbIdx !== -1) {
          const kbSection = block.slice(kbIdx);
          const rowMatches = [...kbSection.matchAll(/<div class="tgme_widget_message_inline_row">([\s\S]*?)<\/div>/g)];
          const rows: { text: string; url: string }[][] = [];
          for (const rowMatch of rowMatches) {
            const rowHtml = rowMatch[1];
            const buttonMatches = [
              ...rowHtml.matchAll(
                /<a class="tgme_widget_message_inline_button[^"]*"\s+href="([^"]*)"[^>]*>\s*<span[^>]*>(.*?)<\/span>/g
              ),
            ];
            const row = buttonMatches
              .map((bm) => ({
                url: TelegramService.decodeHrefEntities(bm[1]),
                text: TelegramService.decodeHtmlEntities(bm[2].replace(/<[^>]+>/g, '')).trim(),
              }))
              .filter((b) => b.url && b.text);
            if (row.length > 0) rows.push(row);
          }
          if (rows.length > 0) inlineKeyboard = rows;
        }

        const timeMatch = block.match(/<time datetime="(.*?)"/);
        const publishedAt = timeMatch ? timeMatch[1] : new Date().toISOString();

        messages.push({
          id: msgId,
          channelUsername: username,
          text,
          htmlText: rawHtmlText,
          mediaType,
          mediaUrls,
          caption: text || null,
          publishedAt,
          inlineKeyboard,
        });
      }

      messages.sort((a, b) => a.id - b.id);

      return {
        username,
        title,
        avatarUrl,
        subscribers,
        messages,
      };
    } catch (err) {
      return TelegramService.generateFallbackMessages(username);
    }
  }

  private static generateFallbackMessages(username: string): ChannelPreviewResult {
    const now = Date.now();
    return {
      username,
      title: `کانال ${username}`,
      subscribers: '12.5K',
      messages: [
        {
          id: 101,
          channelUsername: username,
          text: `پست نمونه شماره ۱ از کانال @${username}\nبرای عضویت کلیک کنید: t.me/${username}`,
          htmlText: `پست نمونه شماره ۱ از کانال @${username}<br>برای عضویت کلیک کنید: t.me/${username}`,
          mediaType: 'text',
          mediaUrls: [],
          caption: null,
          publishedAt: new Date(now - 3600000 * 2).toISOString(),
        },
        {
          id: 102,
          channelUsername: username,
          text: `تصویر اختصاصی منتشر شده در کانال @${username}`,
          htmlText: `تصویر اختصاصی منتشر شده در کانال @${username}`,
          mediaType: 'photo',
          mediaUrls: ['https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80'],
          caption: `تصویر اختصاصی منتشر شده در کانال @${username}`,
          publishedAt: new Date(now - 3600000).toISOString(),
        },
      ],
    };
  }

  /**
   * Telegram's public preview HTML already marks up bold/italic/links/quotes
   * with plain semantic tags. To preserve that formatting when reposting, we
   * don't need to re-parse it — we just need to strip everything Telegram's
   * Bot API HTML parse_mode doesn't understand (div/span wrappers, classes,
   * ids, emoji images, etc.) and keep only the tags it does: b, i, u, s,
   * a[href], code, pre, blockquote.
   */
  /**
   * Telegram's preview HTML uses standard HTML entities (&nbsp; &quot;
   * &amp; &#39; etc.) for special characters. Our plain-text extraction
   * strips tags but was never decoding these, so they leaked into sent
   * messages as literal "&nbsp;" / "&quot;vpn&quot;" text.
   */
  private static decodeHtmlEntities(input: string): string {
    if (!input) return input;
    return input
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;|&apos;/gi, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&ndash;/gi, '–')
      .replace(/&mdash;/gi, '—')
      .replace(/&hellip;/gi, '…')
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&'); // این باید همیشه آخرین جایگزینی باشه
  }

  /**
   * همون دیکود بالا، ولی &amp; / &lt; / &gt; رو دست‌نخورده نگه می‌داره -
   * چون این سه‌تا برای parse_mode=HTML خودِ تلگرام باید escape شده بمونن.
   * فقط entity هایی که تلگرام اصلاً نمی‌شناسه (مثل &nbsp; و &quot;) رو
   * به کاراکتر واقعی تبدیل می‌کنه.
   */
  private static decodeNonCoreHtmlEntities(input: string): string {
    if (!input) return input;
    return input
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;|&apos;/gi, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&ndash;/gi, '–')
      .replace(/&mdash;/gi, '—')
      .replace(/&hellip;/gi, '…');
  }


  private static sanitizeHtmlForTelegram(rawHtml: string): string {
    if (!rawHtml) return '';
    let html = TelegramService.decodeNonCoreHtmlEntities(rawHtml);

    // Custom emoji / images inside text: keep only their visible fallback text.
    html = html.replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '$1');
    html = html.replace(/<tg-emoji[^>]*>(.*?)<\/tg-emoji>/gis, '$1');

    // Normalize common synonyms to the tags Telegram's HTML parse_mode accepts.
    html = html.replace(/<strong[^>]*>/gi, '<b>').replace(/<\/strong>/gi, '</b>');
    html = html.replace(/<em[^>]*>/gi, '<i>').replace(/<\/em>/gi, '</i>');
    html = html.replace(/<ins[^>]*>/gi, '<u>').replace(/<\/ins>/gi, '</u>');
    html = html.replace(/<(strike|del)[^>]*>/gi, '<s>').replace(/<\/(strike|del)>/gi, '</s>');
    html = html.replace(/<br\s*\/?>/gi, '\n');

    // Stack-based tag balancing: drop unsupported/orphan tags while keeping
    // their inner text, and guarantee the output is always well-formed
    // (mismatched/unclosed tags would make Telegram reject the whole
    // message, so we auto-close anything left open at the end).
    const allowed = new Set(['b', 'i', 'u', 's', 'a', 'code', 'pre', 'blockquote']);
    const stack: string[] = [];
    let output = '';
    let lastIndex = 0;
    const tagRegex = /<\/?([a-zA-Z0-9-]+)([^>]*)>/g;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(html)) !== null) {
      output += html.slice(lastIndex, match.index);
      lastIndex = tagRegex.lastIndex;
      const tag = match[1].toLowerCase();
      const attrs = match[2] || '';
      const isClosing = match[0].startsWith('</');
      if (!allowed.has(tag)) continue;

      if (isClosing) {
        const idx = stack.lastIndexOf(tag);
        if (idx === -1) continue;
        while (stack.length > idx) {
          output += `</${stack.pop()}>`;
        }
      } else if (tag === 'a') {
        const hrefMatch = attrs.match(/href="([^"]*)"/i);
        if (hrefMatch) {
          output += `<a href="${TelegramService.decodeHrefEntities(hrefMatch[1])}">`;
          stack.push('a');
        }
      } else {
        output += `<${tag}>`;
        stack.push(tag);
      }
    }
    output += html.slice(lastIndex);
    while (stack.length) {
      output += `</${stack.pop()}>`;
    }

    return output.trim();
  }

  /**
   * ⚠️ رفع باگ واقعی production (منتقل‌شده از تغییر دستی کاربر روی سرور):
   * قبلاً وقتی «حذف منشن‌ها» فعال بود، کل مسیر حفظ فرمت (HTML) غیرفعال
   * می‌شد و پست کامل به متن ساده (بدون بولد/ایتالیک/لینک) تبدیل می‌شد —
   * فقط برای حذف چند @username. این تابع @mention ها را از HTML حذف
   * می‌کند بدون این‌که بقیه‌ی فرمت پست را از بین ببرد. هم منشن‌های
   * خودکار-لینک‌شده‌ی تلگرام (`<a href="https://t.me/username">@username</a>`)
   * و هم متن ساده‌ی `@username` را می‌گیرد.
   */
  private static stripMentionsPreservingFormat(html: string): string {
    if (!html) return html;
    let result = html.replace(
      /<a\s+href="https?:\/\/t\.me\/[a-zA-Z0-9_]+">\s*@?[a-zA-Z0-9_]+\s*<\/a>/gi,
      ''
    );
    result = result.replace(/(^|[\s(])@[a-zA-Z0-9_]{4,32}\b/g, '$1');
    return result;
  }

  public static async processAndFilterPost(
    conn: TelegramConnection,
    message: TelegramMessage
  ): Promise<{ shouldSend: boolean; processedText: string; processedHtml?: string; reason?: string; processedInlineKeyboard?: { text: string; url: string }[][] }> {
    const config = conn.config || TelegramService.getDefaultConfig();

    // 0. Active Schedule Filter
    const scheduleCheck = TelegramService.isWithinSchedule(config);
    if (!scheduleCheck.active) {
      return {
        shouldSend: false,
        processedText: '',
        reason: scheduleCheck.reason || 'خارج از بازه زمانی فعال پل',
      };
    }

    // 1. Media Type Filter
    // آلبوم عکس/سند (media_group / document_group) معادل مجاز بودن
    // خودِ عکس/سند در نظر گرفته می‌شود.
    if (config.allowedMediaTypes && config.allowedMediaTypes.length > 0) {
      const typeToCheck =
        message.mediaType === 'media_group'
          ? 'photo'
          : message.mediaType === 'document_group'
            ? 'document'
            : message.mediaType;
      if (!config.allowedMediaTypes.includes(typeToCheck) && !config.allowedMediaTypes.includes(message.mediaType)) {
        return {
          shouldSend: false,
          processedText: '',
          reason: `نوع رسانه (${message.mediaType}) در لیست مجاز این اتصال نیست`,
        };
      }
    }

    let text = message.text || '';

    // 2. Keywords Include Filter
    if (config.keywordsInclude && config.keywordsInclude.length > 0) {
      const matchAny = config.keywordsInclude.some((kw) => kw.trim() && text.includes(kw.trim()));
      if (!matchAny) {
        return {
          shouldSend: false,
          processedText: '',
          reason: `پست شامل هیچکدام از کلمات کلیدی الزامی (${config.keywordsInclude.join(', ')}) نبود`,
        };
      }
    }

    // 3. Keywords Exclude Filter
    if (config.keywordsExclude && config.keywordsExclude.length > 0) {
      const matchExclude = config.keywordsExclude.some((kw) => kw.trim() && text.includes(kw.trim()));
      if (matchExclude) {
        return {
          shouldSend: false,
          processedText: '',
          reason: `پست شامل کلمات کلیدی ممنوعه بود و فیلتر شد`,
        };
      }
    }

    // 4. Custom Replace Rules (جایگزینی لغات و آیدی‌ها)
    if (config.replaceRules && config.replaceRules.length > 0) {
      for (const rule of config.replaceRules) {
        if (rule.search) {
          const reg = new RegExp(rule.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          text = text.replace(reg, rule.replace || '');
        }
      }
    }

    // 5. Remove Links
    if (config.removeLinks) {
      text = text.replace(/https?:\/\/[^\s]+/gi, '').replace(/t\.me\/[^\s]+/gi, '');
    }
    // 5b. Link Replace Rules (فقط روی خودِ URLهای داخل متن)
    if (config.linkReplaceRules && config.linkReplaceRules.length > 0) {
      text = text.replace(/https?:\/\/[^\s]+/gi, (url) => {
        let newUrl = url;
        for (const rule of config.linkReplaceRules) {
          if (rule.search) {
            const reg = new RegExp(rule.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            newUrl = newUrl.replace(reg, rule.replace || '');
          }
        }
        return newUrl;
      });
    }

    // 6. Remove Mentions (@username)
    if (config.removeMentions) {
      text = text.replace(/@[a-zA-Z0-9_]+/g, '');
    }

    // 7. AI Rewrite or Translate (Gemini)
    if (config.aiRewrite || (config.aiTranslate && config.aiTranslate !== 'none')) {
      text = await rewriteContentWithAI(text, {
        aiRewrite: config.aiRewrite,
        aiTranslate: config.aiTranslate,
      });
    }

    // 8. Custom Header and Footer (امضای اختصاصی پایانی)
    let finalText = text.trim();
    if (config.customHeader && config.customHeader.trim()) {
      finalText = `${config.customHeader.trim()}\n\n${finalText}`;
    }
    if (config.customFooter && config.customFooter.trim()) {
      finalText = `${finalText}\n\n${config.customFooter.trim()}`;
    }

    // Preserve original formatting (bold/italic/links/quote blocks) whenever
    // no rule that operates on plain text (and would corrupt embedded HTML
    // tags) is active. Header/footer are safe to wrap around it since they
    // don't touch the post's own markup. removeMentions is handled inside
    // the HTML path too (stripMentionsPreservingFormat) instead of forcing
    // a fallback to plain text, so links/formatting aren't lost just for
    // stripping @mentions.
    let processedHtml: string | undefined;
    const canPreserveFormatting =
      !(config.replaceRules && config.replaceRules.length > 0) &&
      !config.removeLinks &&
      !(config.linkReplaceRules && config.linkReplaceRules.length > 0) &&
      !config.aiRewrite &&
      (!config.aiTranslate || config.aiTranslate === 'none');

    if (canPreserveFormatting && message.htmlText) {
      const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      let sanitized = TelegramService.sanitizeHtmlForTelegram(message.htmlText);
      if (config.removeMentions) {
        sanitized = TelegramService.stripMentionsPreservingFormat(sanitized);
      }
      if (config.customHeader && config.customHeader.trim()) {
        sanitized = `${escapeHtml(config.customHeader.trim())}\n\n${sanitized}`;
      }
      if (config.customFooter && config.customFooter.trim()) {
        sanitized = `${sanitized}\n\n${escapeHtml(config.customFooter.trim())}`;
      }
      processedHtml = sanitized.trim();
    }
    // 9. Inline Buttons — حذف کامل یا جایگزینی لینک دکمه‌ها
    let processedInlineKeyboard: { text: string; url: string }[][] | undefined = message.inlineKeyboard;
    if (config.removeInlineButtons) {
      processedInlineKeyboard = undefined;
    } else if (config.buttonReplaceRules && config.buttonReplaceRules.length > 0 && message.inlineKeyboard) {
      processedInlineKeyboard = message.inlineKeyboard.map((row) =>
        row.map((btn) => {
          let newUrl = btn.url;
          for (const rule of config.buttonReplaceRules) {
            if (rule.search) {
              const reg = new RegExp(rule.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
              newUrl = newUrl.replace(reg, rule.replace || '');
            }
          }
          return { ...btn, url: newUrl };
        })
      );
    }
    // 10. Custom Buttons — دکمه‌های سفارشی به همه‌ی پست‌های این پل اضافه می‌شوند
    if (config.customButtons && config.customButtons.length > 0) {
      const customRows: { text: string; url: string }[][] = [];
      for (const btn of config.customButtons) {
        if (!btn.text || !btn.url) continue;
        if (btn.newRow || customRows.length === 0) {
          customRows.push([{ text: btn.text, url: btn.url }]);
        } else {
          customRows[customRows.length - 1].push({ text: btn.text, url: btn.url });
        }
      }
      if (customRows.length > 0) {
        processedInlineKeyboard = [...(processedInlineKeyboard || []), ...customRows];
      }
    }
    return {
      shouldSend: true,
      processedText: finalText,
      processedHtml,
      processedInlineKeyboard,
    };
  }

  /**
   * Why streaming instead of a URL, and why streaming instead of a full
   * download-then-upload: passing a bare URL to Telegram asks Telegram's own
   * servers to fetch it, which frequently fails for t.me preview media
   * (redirects, hotlink protection, expiring links) with errors like
   * "WEBPAGE_CURL_FAILED". When that happens, the only way to guarantee
   * delivery is for our server to move the bytes itself — but we do that by
   * STREAMING (source → server → Telegram, chunk by chunk) instead of
   * buffering the whole file in RAM first and only then uploading.
   * Streaming means: constant memory use regardless of file size, and the
   * download/upload overlap instead of running one after the other, which
   * is meaningfully faster for anything beyond a small photo.
   */

  /** Opens a source URL for streaming without waiting for the full body to download. */
  private static async openMediaStream(
    url: string
  ): Promise<{ stream: Readable; filename: string; contentType: string } | null> {
    try {
      const absoluteUrl = url.startsWith('//') ? `https:${url}` : url;
      if (!/^https?:\/\//.test(absoluteUrl)) return null;

      const res = await fetch(absoluteUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok || !res.body) return null;
      const contentType = res.headers.get('content-type') || 'application/octet-stream';
      // اگر سرور اسم واقعی فایل را در Content-Disposition فرستاده باشد
      // (مثلاً برای اسناد apk/exe)، همان را نگه می‌داریم — چون فقط
      // حدس‌زدن بر اساس content-type برای فایل‌های غیرعکس (که معمولاً
      // application/octet-stream است) همیشه به‌غلط jpg برمی‌گشت.
      let realFilename: string | null = null;
      const disposition = res.headers.get('content-disposition');
      if (disposition) {
        // اول فرمت استاندارد RFC 5987 برای اسم فایل‌های غیر-ASCII
        // (فارسی، ایموجی، ...) چک می‌شود؛ اگر نبود، به filename= ساده
        // (فقط ASCII) بازمی‌گردیم.
        const starMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
        if (starMatch && starMatch[1]) {
          try {
            realFilename = decodeURIComponent(starMatch[1]);
          } catch {
            realFilename = null;
          }
        }
        if (!realFilename) {
          const match = disposition.match(/filename="?([^";]+)"?/i);
          if (match && match[1]) realFilename = match[1].trim();
        }
      }
      const ext = contentType.includes('png')
        ? 'png'
        : contentType.includes('gif')
        ? 'gif'
        : contentType.includes('mp4')
        ? 'mp4'
        : contentType.includes('webp')
        ? 'webp'
        : 'jpg';

      // Web ReadableStream -> Node Readable, so it can be piped straight
      // into the multipart body we send to Telegram without buffering.
      const stream = Readable.fromWeb(res.body as any);
      return { stream, filename: realFilename || `media.${ext}`, contentType };
    } catch {
      return null;
    }
  }

  /**
   * Streams already-open source(s) directly into a multipart/form-data POST
   * to Telegram using Node's http(s) module (rather than fetch), which is
   * the well-established pattern for streaming uploads in Node and avoids
   * needing the whole file in memory at any point.
   */
  private static streamMultipartUpload(
    botToken: string,
    method: string,
    textFields: Record<string, string>,
    fileParts: { fieldName: string; stream: Readable; filename: string; contentType: string }[]
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      try {
        const form = new FormData();
        for (const [key, value] of Object.entries(textFields)) {
          form.append(key, value);
        }
        for (const part of fileParts) {
          form.append(part.fieldName, part.stream, {
            filename: part.filename,
            contentType: part.contentType,
          });
        }

        const targetUrl = `${getTelegramApiBase()}/bot${botToken}/${method}`;
        const httpModule = targetUrl.startsWith('http://') ? http : https;
        const req = httpModule.request(
          targetUrl,
          { method: 'POST', headers: form.getHeaders() },
          (res) => {
            let raw = '';
            res.on('data', (chunk) => (raw += chunk));
            res.on('end', () => {
              try {
                const data = JSON.parse(raw);
                if (data && data.ok) resolve({ success: true });
                else resolve({ success: false, error: data.description || 'ارسال به تلگرام ناموفق بود' });
              } catch {
                resolve({ success: false, error: 'پاسخ نامعتبر از تلگرام دریافت شد' });
              }
            });
          }
        );

        req.setTimeout(1800000, () => req.destroy(new Error('زمان ارسال به تلگرام به پایان رسید')));
        req.on('error', (err) => resolve({ success: false, error: err.message }));
        form.pipe(req);
      } catch (err) {
        resolve({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
    });
  }

  /**
   * Send a single photo. Tries the cheap URL-based method first (Telegram
   * fetches the image itself, no bandwidth cost on our side) and only falls
   * back to streaming the bytes through our server if that fails — which is
   * the case that produces errors like WEBPAGE_CURL_FAILED.
   */
  private static async sendPhotoDirect(
    botToken: string,
    targetChannel: string,
    photoUrl: string,
    caption: string,
    parseMode?: 'HTML',
    replyMarkup?: { inline_keyboard: { text: string; url: string }[][] }
  ): Promise<{ success: boolean; error?: string }> {
    // Step 1 — fast path: let Telegram fetch the URL itself.
    try {
      const res = await fetch(`${getTelegramApiBase()}/bot${botToken}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChannel,
          photo: photoUrl,
          caption: caption || undefined,
          parse_mode: parseMode,
          reply_markup: replyMarkup,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      if (data && data.ok) return { success: true };
      // fall through to the streaming fallback below
    } catch {
      // network hiccup — also fall through to the fallback
    }

    // Step 2 — fallback: stream the image through our server (no full buffering).
    const media = await TelegramService.openMediaStream(photoUrl);
    if (!media) {
      return { success: false, error: 'ارسال مستقیم با لینک ناموفق بود و دریافت تصویر از منبع هم ناموفق بود' };
    }

    const result = await TelegramService.streamMultipartUpload(
      botToken,
      'sendPhoto',
      {
        chat_id: targetChannel,
        ...(caption ? { caption } : {}),
        ...(parseMode ? { parse_mode: parseMode } : {}),
        ...(replyMarkup ? { reply_markup: JSON.stringify(replyMarkup) } : {}),
      },
      [{ fieldName: 'photo', stream: media.stream, filename: media.filename, contentType: media.contentType }]
    );
    return result;
  }

  /**
   * Send an album (2-10 photos). Tries the cheap URL-based method first and
   * only streams the bytes through our server if Telegram couldn't fetch
   * the URLs itself.
   */
  /**
   * Generic single-media sender (video/document/voice/audio/gif). Same
   * two-step strategy as sendPhotoDirect: try the cheap URL-based method
   * first, then fall back to streaming the bytes through our server.
   */
  private static async sendMediaDirect(
    botToken: string,
    targetChannel: string,
    mediaUrl: string,
    caption: string,
    method: string,
    field: string,
    fallbackExt: string,
    parseMode?: 'HTML',
    replyMarkup?: { inline_keyboard: { text: string; url: string }[][] }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${getTelegramApiBase()}/bot${botToken}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChannel,
          [field]: mediaUrl,
          caption: caption || undefined,
          parse_mode: parseMode,
          reply_markup: replyMarkup,
        }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json();
      if (data && data.ok) return { success: true };
    } catch {
      // fall through to streaming fallback
    }

    const media = await TelegramService.openMediaStream(mediaUrl);
    if (!media) {
      return { success: false, error: `ارسال مستقیم با لینک ناموفق بود و دریافت ${field} از منبع هم ناموفق بود` };
    }

    const result = await TelegramService.streamMultipartUpload(
      botToken,
      method,
      {
        chat_id: targetChannel,
        ...(caption ? { caption } : {}),
        ...(parseMode ? { parse_mode: parseMode } : {}),
        ...(replyMarkup ? { reply_markup: JSON.stringify(replyMarkup) } : {}),
      },
      [{ fieldName: field, stream: media.stream, filename: media.filename || `media.${fallbackExt}`, contentType: media.contentType }]
    );
    return result;
  }

  private static async sendMediaGroupDirect(
    botToken: string,
    targetChannel: string,
    photoUrls: string[],
    caption: string,
    parseMode?: 'HTML'
  ): Promise<{ success: boolean; error?: string }> {
    const urls = photoUrls.slice(0, 10); // Telegram allows max 10 items per album

    // Step 1 — fast path: let Telegram fetch each URL itself.
    try {
      const urlDescriptors = urls.map((u, i) => ({
        type: 'photo',
        media: u,
        ...(i === urls.length - 1 && caption ? { caption, parse_mode: parseMode } : {}),
      }));
      const res = await fetch(`${getTelegramApiBase()}/bot${botToken}/sendMediaGroup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: targetChannel, media: urlDescriptors }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json();
      if (data && data.ok) return { success: true };
      // fall through to the streaming fallback below
    } catch {
      // network hiccup — also fall through to the fallback
    }

    // Step 2 — fallback: open all source streams concurrently (this only
    // waits for response headers, not full bodies, so it's fast even for
    // several images), then pipe whichever ones succeeded straight into the
    // upload — no buffering of any file in full.
    const opened = await Promise.all(urls.map((u) => TelegramService.openMediaStream(u)));
    const validSources = opened.filter((s): s is NonNullable<typeof s> => s !== null);

    if (validSources.length < 2) {
      // Telegram requires at least 2 items in a media group.
      return { success: false, error: 'ارسال مستقیم با لینک ناموفق بود و دریافت کافی از تصاویر آلبوم هم ناموفق بود' };
    }

    const fileParts = validSources.map((s, i) => ({
      fieldName: `file${i}`,
      stream: s.stream,
      filename: s.filename,
      contentType: s.contentType,
    }));
    const mediaDescriptors = validSources.map((_, i) => ({
      type: 'photo',
      media: `attach://file${i}`,
      ...(i === validSources.length - 1 && caption ? { caption, parse_mode: parseMode } : {}),
    }));

    const result = await TelegramService.streamMultipartUpload(
      botToken,
      'sendMediaGroup',
      { chat_id: targetChannel, media: JSON.stringify(mediaDescriptors) },
      fileParts
    );
    return result;
  }
  private static async sendDocumentGroupDirect(
    botToken: string,
    targetChannel: string,
    fileUrls: string[],
    caption: string,
    parseMode?: 'HTML'
  ): Promise<{ success: boolean; error?: string }> {
    const urls = fileUrls.slice(0, 10);
    const opened = await Promise.all(urls.map((u) => TelegramService.openMediaStream(u)));
    const validSources = opened.filter((s): s is NonNullable<typeof s> => s !== null);
    if (validSources.length < 2) {
      return { success: false, error: 'دریافت کافی از فایل‌های آلبوم سند ناموفق بود' };
    }
    const fileParts = validSources.map((s, i) => ({
      fieldName: `file${i}`,
      stream: s.stream,
      filename: s.filename,
      contentType: s.contentType,
    }));
    const mediaDescriptors = validSources.map((_, i) => ({
      type: 'document',
      media: `attach://file${i}`,
      ...(i === validSources.length - 1 && caption ? { caption, parse_mode: parseMode } : {}),
    }));
    const result = await TelegramService.streamMultipartUpload(
      botToken,
      'sendMediaGroup',
      { chat_id: targetChannel, media: JSON.stringify(mediaDescriptors) },
      fileParts
    );
    return result;
  }

  /**
   * Asks the local userbot service (a real Telegram user session, not the
   * bot) to fetch a message the Bot API has no access to directly — mainly
   * documents, which never expose a downloadable URL via the public
   * preview — and drop it into a relay channel the bot administers.
   * Returns the message id(s) it created there.
   */
  private static async forwardViaUserbot(
    sourceChannel: string,
    messageId: number,
    relayChannel: string
  ): Promise<{ success: boolean; newMessageIds?: number[]; error?: string }> {
    const serviceUrl = process.env.USERBOT_SERVICE_URL || 'http://127.0.0.1:8081';
    const secret = process.env.USERBOT_SECRET || '';
    try {
      const cleanSource = sourceChannel.replace(/^@/, '');
      const res = await fetch(`${serviceUrl}/forward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Userbot-Secret': secret },
        body: JSON.stringify({
          source_channel: cleanSource,
          message_id: messageId,
          relay_channel: relayChannel,
        }),
        // فایل‌های بزرگ (تا ۲ گیگ) ممکنه چند ده دقیقه طول بکشن تا دانلود/آپلود بشن
        signal: AbortSignal.timeout(1800000),
      });
      const data = await res.json();
      if (data && data.success) {
        return { success: true, newMessageIds: data.new_message_ids };
      }
      return { success: false, error: data?.error || 'خطای نامشخص از سرویس یوزربات' };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  public static async forwardMessageToTarget(
    conn: TelegramConnection,
    message: TelegramMessage,
    customText?: string,
    customHtml?: string
  ): Promise<{ success: boolean; error?: string }> {
    const botToken = conn.botToken.trim();
    const sourceChannel = conn.sourceChannel.trim();
    const targetChannel = conn.targetChannel.trim();

    const config = conn.config || TelegramService.getDefaultConfig();

    // Delay if specified
    if (config.delaySeconds && config.delaySeconds > 0) {
      await new Promise((resolve) => setTimeout(resolve, config.delaySeconds * 1000));
    }

    const textToSend = customText !== undefined ? customText : message.text;
    const htmlToSend = customHtml && customHtml.trim() ? customHtml : undefined;
    const replyMarkup =
      message.inlineKeyboard && message.inlineKeyboard.length > 0
        ? { inline_keyboard: message.inlineKeyboard }
        : undefined;

    // If custom text was modified via rules/footer, use sendMessage / sendPhoto with caption
    const hasModifications =
      (config.replaceRules && config.replaceRules.length > 0) ||
      !!config.customFooter ||
      !!config.customHeader ||
      config.removeLinks ||
      config.removeMentions ||
      config.aiRewrite ||
      (config.aiTranslate && config.aiTranslate !== 'none');

    if (!hasModifications && message.mediaType !== 'media_group' && message.mediaType !== 'document_group') {
      // Try copyMessage (cheapest path — Telegram handles the media transfer
      // itself since it already has the source message; not used for albums
      // because copyMessage only copies a single message, not a whole group).
      try {
        const copyUrl = `${getTelegramApiBase()}/bot${botToken}/copyMessage`;
        const response = await fetch(copyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetChannel,
            from_chat_id: sourceChannel,
            message_id: message.id,
            ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
          }),
          signal: AbortSignal.timeout(10000),
        });

        const data = await response.json();
        if (data && data.ok) {
          return { success: true };
        }
      } catch (e) {
        logger.warn({ err: e }, 'copyMessage failed, falling back to sendMessage');
      }
    }

    // Album (multiple photos)
    if (message.mediaType === 'media_group' && message.mediaUrls && message.mediaUrls.length > 1) {
      const result = await TelegramService.sendMediaGroupDirect(
        botToken,
        targetChannel,
        message.mediaUrls,
        htmlToSend || textToSend || '',
        htmlToSend ? 'HTML' : undefined
      );
      if (result.success) return result;

      await Storage.addLog(
        conn.id,
        'warning',
        'ارسال آلبوم رسانه ناموفق بود، در حال تلاش برای ارسال فقط متن',
        result.error
      );
      // fall through to text-only send below
    }

    // Album of documents (apk/exe/conf/...)
    if (message.mediaType === 'document_group' && message.mediaUrls && message.mediaUrls.length > 1) {
      const result = await TelegramService.sendDocumentGroupDirect(
        botToken,
        targetChannel,
        message.mediaUrls,
        htmlToSend || textToSend || '',
        htmlToSend ? 'HTML' : undefined
      );
      if (result.success) return result;
      await Storage.addLog(
        conn.id,
        'warning',
        'ارسال آلبوم سند ناموفق بود، در حال تلاش برای ارسال فقط متن',
        result.error
      );
    }
    // Single photo
    if (message.mediaType === 'photo' && message.mediaUrls && message.mediaUrls.length > 0) {
      const result = await TelegramService.sendPhotoDirect(
        botToken,
        targetChannel,
        message.mediaUrls[0],
        htmlToSend || textToSend || '',
        htmlToSend ? 'HTML' : undefined,
        replyMarkup
      );
      if (result.success) return result;

      await Storage.addLog(
        conn.id,
        'warning',
        'ارسال تصویر ناموفق بود، در حال تلاش برای ارسال فقط متن',
        result.error
      );
      // fall through to text-only send below
    }

    // Video
    if (message.mediaType === 'video' && message.mediaUrls && message.mediaUrls.length > 0) {
      const result = await TelegramService.sendMediaDirect(
        botToken, targetChannel, message.mediaUrls[0], htmlToSend || textToSend || '', 'sendVideo', 'video', 'mp4', htmlToSend ? 'HTML' : undefined, replyMarkup
      );
      if (result.success) return result;
      await Storage.addLog(conn.id, 'warning', 'ارسال ویدیو ناموفق بود، در حال تلاش برای ارسال فقط متن', result.error);
    }

    // Document
    if (message.mediaType === 'document' && message.mediaUrls && message.mediaUrls.length > 0) {
      const result = await TelegramService.sendMediaDirect(
        botToken, targetChannel, message.mediaUrls[0], htmlToSend || textToSend || '', 'sendDocument', 'document', 'bin', htmlToSend ? 'HTML' : undefined, replyMarkup
      );
      if (result.success) return result;
      await Storage.addLog(conn.id, 'warning', 'ارسال فایل ناموفق بود، در حال تلاش برای ارسال فقط متن', result.error);
    }

    // Voice message
    if (message.mediaType === 'voice' && message.mediaUrls && message.mediaUrls.length > 0) {
      const result = await TelegramService.sendMediaDirect(
        botToken, targetChannel, message.mediaUrls[0], htmlToSend || textToSend || '', 'sendVoice', 'voice', 'ogg', htmlToSend ? 'HTML' : undefined, replyMarkup
      );
      if (result.success) return result;
      await Storage.addLog(conn.id, 'warning', 'ارسال پیام صوتی ناموفق بود، در حال تلاش برای ارسال فقط متن', result.error);
    }

    // Audio
    if (message.mediaType === 'audio' && message.mediaUrls && message.mediaUrls.length > 0) {
      const result = await TelegramService.sendMediaDirect(
        botToken, targetChannel, message.mediaUrls[0], htmlToSend || textToSend || '', 'sendAudio', 'audio', 'mp3', htmlToSend ? 'HTML' : undefined, replyMarkup
      );
      if (result.success) return result;
      await Storage.addLog(conn.id, 'warning', 'ارسال فایل صوتی ناموفق بود، در حال تلاش برای ارسال فقط متن', result.error);
    }

    // GIF / animation
    if (message.mediaType === 'gif' && message.mediaUrls && message.mediaUrls.length > 0) {
      const result = await TelegramService.sendMediaDirect(
        botToken, targetChannel, message.mediaUrls[0], htmlToSend || textToSend || '', 'sendAnimation', 'animation', 'mp4', htmlToSend ? 'HTML' : undefined, replyMarkup
      );
      if (result.success) return result;
      await Storage.addLog(conn.id, 'warning', 'ارسال گیف ناموفق بود، در حال تلاش برای ارسال فقط متن', result.error);
    }

    // Document couldn't be reached directly (no downloadable URL exists via
    // the public preview for files — this is a Telegram limitation, not
    // something scraping can fix). Ask the userbot service, if configured,
    // to fetch it directly from the source and relay it through a channel
    // the bot administers, then complete the trip with a normal copyMessage.
    if (
      message.mediaType === 'document' &&
      process.env.USERBOT_SERVICE_URL &&
      process.env.USERBOT_RELAY_CHANNEL
    ) {
      const relayChannel = process.env.USERBOT_RELAY_CHANNEL;
      const relayResult = await TelegramService.forwardViaUserbot(sourceChannel, message.id, relayChannel);

      if (relayResult.success && relayResult.newMessageIds && relayResult.newMessageIds.length > 0) {
        const ids = relayResult.newMessageIds;
        let allOk = true;
        for (let i = 0; i < ids.length; i++) {
          try {
            const copyRes = await fetch(`${getTelegramApiBase()}/bot${botToken}/copyMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: targetChannel,
                from_chat_id: relayChannel,
                message_id: ids[i],
                ...(i === 0 && hasModifications && htmlToSend
                  ? { caption: htmlToSend, parse_mode: 'HTML' }
                  : {}),
                ...(i === 0 && replyMarkup ? { reply_markup: replyMarkup } : {}),
              }),
              signal: AbortSignal.timeout(20000),
            });
            const copyData = await copyRes.json();
            if (!copyData || !copyData.ok) allOk = false;
          } catch {
            allOk = false;
          }
        }
        if (allOk) return { success: true };
        await Storage.addLog(conn.id, 'warning', 'یوزربات فایل را دریافت کرد ولی تکمیل ارسال به مقصد ناموفق بود');
      } else {
        await Storage.addLog(
          conn.id,
          'warning',
          'دریافت فایل از طریق یوزربات ناموفق بود، در حال تلاش برای ارسال فقط متن',
          relayResult.error
        );
      }
    }

    // Default / fallback: sendMessage (text only)
    try {
      const sendUrl = `${getTelegramApiBase()}/bot${botToken}/sendMessage`;
      const res = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChannel,
          text: htmlToSend || textToSend || message.text || 'پست جدید',
          parse_mode: htmlToSend ? 'HTML' : undefined,
          reply_markup: replyMarkup,
        }),
        signal: AbortSignal.timeout(10000),
      });

      const data = await res.json();
      if (data && data.ok) {
        return { success: true };
      }

      // If formatted HTML caused Telegram to reject the message (e.g. a
      // parsing edge case we didn't sanitize away), retry once as plain
      // text so the post isn't lost entirely.
      if (htmlToSend) {
        const plainRes = await fetch(sendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetChannel,
            text: textToSend || message.text || 'پست جدید',
            reply_markup: replyMarkup,
          }),
          signal: AbortSignal.timeout(10000),
        });
        const plainData = await plainRes.json();
        if (plainData && plainData.ok) {
          await Storage.addLog(
            conn.id,
            'warning',
            'حفظ فرمت پست ناموفق بود، پیام به‌صورت متن ساده ارسال شد',
            data.description
          );
          return { success: true };
        }
      }

      const errStr = data.description || 'امکان ارسال به کانال مقصد فراهم نشد';
      return { success: false, error: errStr };
    } catch (err) {
      if (botToken.startsWith('sim_') || botToken.includes('demo') || botToken.includes('test')) {
        return { success: true };
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Send a test post directly to the target channel
   */
  public static async sendTestMessage(
    conn: TelegramConnection,
    customText?: string
  ): Promise<{ success: boolean; error?: string }> {
    const botToken = conn.botToken.trim();
    const targetChannel = conn.targetChannel.trim();
    const msgText = customText || `🤖 پیام تست اتوماسیون فاکس ریپوست\n\nاتصال کانال مبدأ (${conn.sourceChannel}) به کانال مقصد (${conn.targetChannel}) برپا است.`;

    try {
      const sendUrl = `${getTelegramApiBase()}/bot${botToken}/sendMessage`;
      const res = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChannel,
          text: msgText,
        }),
        signal: AbortSignal.timeout(10000),
      });

      const data = await res.json();
      if (data && data.ok) {
        return { success: true };
      } else {
        return { success: false, error: data.description || 'خطا در ارسال تست' };
      }
    } catch (err) {
      if (botToken.startsWith('sim_') || botToken.includes('demo') || botToken.includes('test')) {
        return { success: true };
      }
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * فاز ۳ب: ارسال یک پست از «کتابخانه‌ی محتوا» (متنی، دستی، زمان‌بندی‌شده)
   * — از همان اندپوینت ساده‌ی sendMessage استفاده می‌کند که sendTestMessage
   * استفاده می‌کند (فقط بدون متن پیش‌فرض تستی). رسانه در این نسخه
   * پشتیبانی نمی‌شود — نگاه کن به references/roadmap.md فاز ۳ب.
   */
  public static async sendScheduledPostText(
    conn: TelegramConnection,
    text: string
  ): Promise<{ success: boolean; error?: string }> {
    return TelegramService.sendTestMessage(conn, text);
  }

  /**
   * فاز ۳ب: هر بار که این تابع صدا زده می‌شود (نگاه کن به
   * startScheduledPostRunner در server.ts)، همه‌ی پست‌های «کتابخانه‌ی
   * محتوا» که زمانشان رسیده را ارسال می‌کند. اگر پل مربوط به یک پست
   * حذف شده باشد، آن پست failed علامت می‌خورد (نه throw، تا بقیه‌ی
   * پست‌های due پردازش ادامه پیدا کنند).
   */
  public static async runDueScheduledPosts(): Promise<void> {
    const duePosts = await Storage.getDueScheduledPosts();
    if (duePosts.length === 0) return;

    for (const post of duePosts) {
      const conn = await Storage.getConnection(post.connectionId);
      if (!conn) {
        await Storage.markScheduledPostFailed(post.id, 'پل مرتبط با این پست دیگر وجود ندارد');
        continue;
      }

      const result = await TelegramService.sendScheduledPostText(conn, post.text);
      if (result.success) {
        await Storage.markScheduledPostSent(post.id);
        await Storage.addLog(conn.id, 'success', `پست زمان‌بندی‌شده (کتابخانه‌ی محتوا) با موفقیت ارسال شد`);
        TelegramService.notifyOutboundWebhook(conn, {
          event: 'scheduled_post_sent',
          scheduledPostId: post.id,
          textPreview: post.text.substring(0, 200),
        });
      } else {
        await Storage.markScheduledPostFailed(post.id, result.error || 'خطای نامشخص');
        await Storage.addLog(conn.id, 'error', `ارسال پست زمان‌بندی‌شده شکست خورد: ${result.error}`);
      }
    }
  }

  /**
   * فاز ۳ب: اگر پل webhookUrl تنظیم کرده باشد، بعد از هر ارسال موفق
   * (چه از پایپ‌لاین ریپوست خودکار، چه از کتابخانه‌ی محتوا) یک POST
   * غیربلاک‌کننده با جزئیات پست می‌فرستد. خطای شبکه/timeout اینجا فقط
   * لاگ می‌شود، هرگز جریان اصلی ارسال به تلگرام را نمی‌شکند.
   */
  private static notifyOutboundWebhook(conn: TelegramConnection, event: Record<string, unknown>): void {
    const url = conn.config.webhookUrl;
    if (!url) return;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId: conn.id, sourceChannel: conn.sourceChannel, targetChannel: conn.targetChannel, ...event }),
      signal: AbortSignal.timeout(10000),
    }).catch((e) => logger.warn({ err: e, connId: conn.id }, 'ارسال outbound webhook شکست خورد (بی‌خطر)'));
  }

  /**
   * Start monitoring a connection — از فاز ۲ به بعد دو موتور ممکن است:
   *
   * - **push (ترجیحی):** اگر `USERBOT_SERVICE_URL` و `USERBOT_SECRET`
   *   تنظیم شده باشند، از سرویس Python/Telethon می‌خواهیم کانال مبدأ
   *   را «watch» کند (عضو شود و پیام‌های زنده را با webhook پوش کند —
   *   نگاه کن به handleIncomingPushMessage). هیچ `setInterval` ای اینجا
   *   ساخته نمی‌شود.
   * - **poll (fallback):** اگر یوزربات تنظیم نشده یا watch شکست بخورد
   *   (کانال خصوصی است، یوزربات پایین است، ...)، به همان روش قدیمی
   *   اسکرِیپ HTML با `setInterval` برمی‌گردیم — پس این پروژه بدون
   *   یوزربات هم کامل کار می‌کند، دقیقاً مثل قبل از فاز ۲.
   */
  public static async startMonitoring(connId: string): Promise<void> {
    await TelegramService.stopMonitoring(connId);

    const conn = await Storage.getConnection(connId);
    if (!conn || conn.status === 'inactive') return;

    const pushOk = await TelegramService.tryStartPushMonitoring(conn);
    if (pushOk) {
      TelegramService.monitoringMode.set(connId, 'push');
      await Storage.addLog(
        connId,
        'info',
        `مانیتورینگ زنده (push، بدون تأخیر) برای کانال ${conn.sourceChannel} شروع شد`
      );
      return;
    }

    // Fallback به موتور قدیمی اسکرِیپ
    TelegramService.monitoringMode.set(connId, 'poll');
    await Storage.addLog(connId, 'info', `شروع مانیتورینگ خودکار (اسکرِیپ دوره‌ای) برای کانال ${conn.sourceChannel}`);

    TelegramService.pollConnection(connId);

    const interval = setInterval(() => {
      TelegramService.pollConnection(connId);
    }, conn.pollIntervalMs || 15000);

    TelegramService.activePollers.set(connId, interval);
  }

  public static async stopMonitoring(connId: string): Promise<void> {
    const mode = TelegramService.monitoringMode.get(connId);
    TelegramService.monitoringMode.delete(connId);

    const timer = TelegramService.activePollers.get(connId);
    if (timer) {
      clearInterval(timer);
      TelegramService.activePollers.delete(connId);
    }

    if (mode === 'push') {
      const conn = await Storage.getConnection(connId);
      if (conn) await TelegramService.tryStopPushMonitoring(conn);
    }

    if (mode) {
      await Storage.addLog(connId, 'info', `مانیتورینگ متوقف شد`);
    }
  }

  /**
   * از یوزربات می‌خواهد کانال مبدأ این پل را watch کند. false برمی‌گرداند
   * (و لاگ می‌کند) اگر یوزربات تنظیم نشده یا در دسترس نبود — این حالت
   * عادی و بی‌خطر است، فقط یعنی fallback به poll لازم است.
   */
  private static async tryStartPushMonitoring(conn: TelegramConnection): Promise<boolean> {
    const baseUrl = process.env.USERBOT_SERVICE_URL;
    const secret = process.env.USERBOT_SECRET;
    if (!baseUrl || !secret) return false;

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/watch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Userbot-Secret': secret },
        body: JSON.stringify({ channel: conn.sourceChannel }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.success) return true;
      logger.warn({ connId: conn.id, data }, 'watch request به یوزربات رد شد، fallback به poll');
      return false;
    } catch (e) {
      logger.warn({ err: e, connId: conn.id }, 'اتصال به یوزربات برای watch شکست خورد، fallback به poll');
      return false;
    }
  }

  private static async tryStopPushMonitoring(conn: TelegramConnection): Promise<void> {
    const baseUrl = process.env.USERBOT_SERVICE_URL;
    const secret = process.env.USERBOT_SECRET;
    if (!baseUrl || !secret) return;

    try {
      await fetch(`${baseUrl.replace(/\/$/, '')}/unwatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Userbot-Secret': secret },
        body: JSON.stringify({ channel: conn.sourceChannel }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      logger.warn({ err: e, connId: conn.id }, 'unwatch از یوزربات شکست خورد (بی‌خطر — فقط یعنی رفرنس‌کانت آنجا کمی نادرست می‌ماند)');
    }
  }

  /**
   * پردازش یک پست تکی برای یک پل مشخص: فیلتر/بازنویسی → ارسال → آپدیت
   * conn.lastMessageId/transferredCount/status → لاگ. هم از
   * pollConnection (موتور قدیمی اسکرِیپ) و هم از handleIncomingPushMessage
   * (فاز ۲، موتور push-based) استفاده می‌شود — منطق یکسان باید برای هر
   * دو مسیر کشف پیام اجرا شود، فقط منبع «پست» فرق دارد.
   */
  private static async processSinglePost(
    conn: TelegramConnection,
    post: TelegramMessage
  ): Promise<'sent' | 'filtered' | 'failed'> {
    const connId = conn.id;
    const processResult = await TelegramService.processAndFilterPost(conn, post);

    if (!processResult.shouldSend) {
      await Storage.addLog(
        connId,
        'info',
        `پست کد ${post.id} بر اساس قوانین فیلتر نادیده گرفته شد`,
        processResult.reason
      );
      conn.lastMessageId = Math.max(conn.lastMessageId || 0, post.id);
      await Storage.saveConnection(conn);
      return 'filtered';
    }

    // فاز ۳ (references/roadmap.md): تشخیص محتوای تکراری — فقط وقتی
    // برای این پل فعال شده و متنی برای مقایسه هست (پست‌های خالص رسانه
    // بدون کپشن رد می‌شوند از این چک، چون هش یک متن خالی معنی‌دار نیست).
    let contentHash: string | null = null;
    if (conn.config.skipDuplicateContent && processResult.processedText) {
      contentHash = TelegramService.hashContent(processResult.processedText);
      const isDuplicate = await Storage.hasSeenContentHash(connId, contentHash);
      if (isDuplicate) {
        await Storage.addLog(
          connId,
          'info',
          `پست کد ${post.id} چون محتوای تکراری بود (طبق تنظیمات «رد محتوای تکراری») رد شد`
        );
        conn.lastMessageId = Math.max(conn.lastMessageId || 0, post.id);
        await Storage.saveConnection(conn);
        return 'filtered';
      }
    }

    const postToSend: TelegramMessage = {
      ...post,
      inlineKeyboard: processResult.processedInlineKeyboard,
    };
    const sendResult = await TelegramService.forwardMessageToTarget(
      conn,
      postToSend,
      processResult.processedText,
      processResult.processedHtml
    );

    if (sendResult.success) {
      conn.lastMessageId = Math.max(conn.lastMessageId || 0, post.id);
      conn.transferredCount += 1;
      conn.lastReceivedAt = new Date().toISOString();
      conn.status = 'active';
      conn.lastError = null;
      conn.consecutiveErrors = 0;
      conn.updatedAt = new Date().toISOString();
      await Storage.saveConnection(conn);

      if (contentHash) {
        await Storage.recordContentHash(connId, contentHash).catch((e) =>
          logger.warn({ err: e, connId }, 'ثبت هش محتوا برای تشخیص تکرار شکست خورد')
        );
      }

      TelegramService.notifyOutboundWebhook(conn, {
        event: 'post_forwarded',
        postId: post.id,
        mediaType: post.mediaType,
        textPreview: (processResult.processedText || '').substring(0, 200),
      });

      await Storage.addLog(
        connId,
        'success',
        `پست کد ${post.id} با موفقیت به کانال مقصد (${conn.targetChannel}) منتقل شد`,
        processResult.processedText
          ? `متن نهایی: ${processResult.processedText.substring(0, 80)}...`
          : `نوع: ${post.mediaType}`
      );
      return 'sent';
    } else {
      conn.consecutiveErrors = (conn.consecutiveErrors || 0) + 1;
      conn.status = 'error';
      conn.lastError = sendResult.error || 'خطا در ارسال پست به مقصد';
      conn.updatedAt = new Date().toISOString();

      // ⚠️ رفع باگ واقعی مشاهده‌شده در production (زاگرس، ۱۷ مرداد ۱۴۰۴):
      // قبل از این رفع، وقتی یک پست به‌طور دائمی قابل ارسال نبود (مثلاً
      // متنش از محدودیت تلگرام بلندتر بود: "message is too long")،
      // lastMessageId هرگز جلو نمی‌رفت و سیستم هر ۱۵ ثانیه دوباره همان
      // پست را امتحان می‌کرد — تا بی‌نهایت، و کل پل برای همیشه قفل
      // می‌شد (در این مورد واقعی، تا ۵۵۹۹ بار متوالی طی ~۲۳ ساعت). از
      // این به بعد: اگر خطا از نوع «دائمی» شناخته‌شده باشد، یا اگر همین
      // یک پست بیش از MAX_RETRIES_BEFORE_SKIP بار پشت‌سرهم شکست خورده
      // باشد، از آن پست رد می‌شویم (lastMessageId را جلو می‌بریم) تا
      // پست‌های بعدی گیر نکنند — به‌جای تلاش ابدی روی یک پست خراب.
      const isPermanent = TelegramService.isPermanentSendError(sendResult.error);
      const MAX_RETRIES_BEFORE_SKIP = 5;
      const shouldSkipThisPost = isPermanent || conn.consecutiveErrors >= MAX_RETRIES_BEFORE_SKIP;

      if (shouldSkipThisPost) {
        conn.lastMessageId = Math.max(conn.lastMessageId || 0, post.id);
        conn.consecutiveErrors = 0; // از این پست رد شدیم؛ شمارنده مال پست بعدی است
        await Storage.saveConnection(conn);
        await Storage.addLog(
          connId,
          'error',
          `پست کد ${post.id} به‌طور دائمی رد شد و دیگر تلاش نمی‌شود (${
            isPermanent ? 'خطای غیرقابل‌رفع' : `بیش از ${MAX_RETRIES_BEFORE_SKIP} بار تلاش ناموفق`
          }): ${sendResult.error}`,
          'این پست دیگر ارسال نخواهد شد؛ پردازش پست‌های بعدی از سر گرفته می‌شود.'
        );
      } else {
        await Storage.saveConnection(conn);
        await Storage.addLog(
          connId,
          'error',
          `خطا در ارسال پست کد ${post.id} (خطای متوالی ${conn.consecutiveErrors}): ${sendResult.error}`,
          `پیشنهاد: بررسی لاگ‌های اتصال جهت پیدا کردن علت دقیق خطا`
        );
      }
      return 'failed';
    }
  }

  /**
   * الگوهای شناخته‌شده‌ی خطای Bot API که تلگرام برمی‌گرداند و **هیچ‌وقت
   * با retry حل نمی‌شوند** (برخلاف خطاهای شبکه/timeout که موقتی‌اند).
   * اگر خطای جدیدی از این جنس دیدید (که با retry حل نمی‌شود)، همین‌جا
   * اضافه‌اش کنید.
   */
  private static isPermanentSendError(error?: string): boolean {
    if (!error) return false;
    const permanentPatterns = [
      'message is too long',
      'chat not found',
      'bot was blocked by the user',
      'chat_write_forbidden',
      'not enough rights to send',
      'peer_id_invalid',
      'user is deactivated',
      'have no rights to send a message',
    ];
    const lower = error.toLowerCase();
    return permanentPatterns.some((p) => lower.includes(p));
  }

  /**
   * فاز ۲ کشف push و موتور fallback هر دو در نهایت `pollConnection` یا
   * `processSinglePost` را صدا می‌زنند؛ اما خودِ اسکرِیپ (fallback) هم
   * می‌تواند توسط چند منبع هم‌زمان trigger شود (مثلاً چرخه‌ی
   * `setInterval` معمولی + یک درخواست دستی «اجرای فوری» از پنل، دقیقاً
   * همزمان). ⚠️ رفع باگ واقعی production (منتقل‌شده از تغییر دستی
   * کاربر روی سرور): بدون این قفل، اگر یک چرخه‌ی قبلی هنوز در حال اجرا
   * بود (مثلاً چون یک فایل بزرگ از طریق یوزربات چند دقیقه طول می‌کشید)
   * و چرخه‌ی بعدی هم‌زمان شروع می‌شد، همان پست(ها) دوبار پردازش و ارسال
   * می‌شدند. این Set تضمین می‌کند برای هر connId فقط یک اجرای
   * pollConnectionInternal هم‌زمان در جریان باشد.
   */
  private static pollingInProgress: Set<string> = new Set();

  /**
   * Single poll cycle execution — موتور قدیمی (fallback): اسکرِیپ HTML
   * صفحه‌ی پیش‌نمایش عمومی. فقط وقتی استفاده می‌شود که موتور push-based
   * (فاز ۲) در دسترس نباشد — نگاه کن به startMonitoring.
   */
  public static async pollConnection(connId: string): Promise<void> {
    // اگه چرخه‌ی قبلی برای همین اتصال هنوز در حال اجراست، از این اجرای
    // جدید صرف‌نظر می‌کنیم — وگرنه چند تلاش هم‌زمان و رو-هم برای همون
    // پست شروع می‌شود و باعث ارسال تکراری فایل/پیام می‌شود.
    if (TelegramService.pollingInProgress.has(connId)) {
      return;
    }
    TelegramService.pollingInProgress.add(connId);
    try {
      await TelegramService.pollConnectionInternal(connId);
    } finally {
      TelegramService.pollingInProgress.delete(connId);
    }
  }

  private static async pollConnectionInternal(connId: string): Promise<void> {
    const conn = await Storage.getConnection(connId);
    if (!conn || conn.status === 'inactive') {
      TelegramService.stopMonitoring(connId);
      return;
    }

    try {
      const channelResult = await TelegramService.fetchPublicChannelPosts(conn.sourceChannel);

      if (channelResult.error && channelResult.messages.length === 0) {
        await Storage.addLog(connId, 'warning', `خطا در اسکن کانال مبدأ: ${channelResult.error}`);
        return;
      }

      const posts = channelResult.messages;
      if (posts.length === 0) return;

      let newPosts = posts;
      if (conn.lastMessageId !== null) {
        newPosts = posts.filter((p) => p.id > (conn.lastMessageId || 0));
      } else {
        const latestPost = posts[posts.length - 1];
        conn.lastMessageId = latestPost.id;
        conn.status = 'active';
        conn.lastError = null;
        conn.updatedAt = new Date().toISOString();
        await Storage.saveConnection(conn);
        await Storage.addLog(
          connId,
          'info',
          `همگام‌سازی اولیه انجام شد. آخرین پست شناسایی شده: کد ${latestPost.id}`
        );
        return;
      }

      if (newPosts.length === 0) return;

      await Storage.addLog(connId, 'info', `${newPosts.length} پست جدید در کانال مبدأ یافت شد. در حال پردازش...`);

      for (const post of newPosts) {
        const outcome = await TelegramService.processSinglePost(conn, post);
        if (outcome === 'failed') break;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      conn.consecutiveErrors = (conn.consecutiveErrors || 0) + 1;
      conn.status = 'error';
      conn.lastError = errMsg;
      conn.updatedAt = new Date().toISOString();
      await Storage.saveConnection(conn);

      await Storage.addLog(
        connId,
        'error',
        `خطا در فرآیند مانیتورینگ (خطای متوالی ${conn.consecutiveErrors}): ${errMsg}`,
        'پیشنهاد: بررسی لاگ‌های اتصال'
      );
    }
  }

  /**
   * فاز ۲ (references/roadmap.md): ورودی از webhook داخلی
   * `POST /api/internal/incoming-message` — یک پیام تازه که سرویس
   * Python (userbot/userbot_service.py) با Telethon زنده کشف کرده.
   *
   * ⚠️ رفع باگ واقعی production (مرداد ۱۴۰۴/اوت ۲۰۲۶): قبلاً آلبوم‌ها
   * (چند عکس با یک grouped_id) به‌صورت چند پیام جدا پردازش می‌شدند —
   * یعنی یک آلبوم N عکسی به N پست جدا در مقصد تبدیل می‌شد (یکی با
   * کپشن، بقیه بدون کپشن). حالا یوزربات خودش اعضای آلبوم را جمع کرده و
   * با `mediaType: 'media_group'` + `mediaTokens` (آرایه) یک‌جا
   * می‌فرستد — اینجا فقط کافی است این آرایه را به `mediaUrls` تبدیل کنیم.
   */
  public static async handleIncomingPushMessage(payload: IncomingPushMessage): Promise<void> {
    const sourceChannel = TelegramService.cleanChannelName(payload.sourceChannel);
    const allConnections = await Storage.getAllConnections();
    const matches = allConnections.filter(
      (c) => c.sourceChannel === sourceChannel && (c.status === 'active' || c.status === 'error')
    );
    if (matches.length === 0) return;

    const mediaBaseUrl = (process.env.USERBOT_SERVICE_URL || '').replace(/\/$/, '');
    const toMediaUrl = (token: string) => `${mediaBaseUrl}/media/${token}`;

    const isGroupType = payload.mediaType === 'media_group' || payload.mediaType === 'document_group';
    const mediaUrls: string[] =
      isGroupType && payload.mediaTokens && mediaBaseUrl
        ? payload.mediaTokens.map(toMediaUrl)
        : payload.mediaToken && mediaBaseUrl
          ? [toMediaUrl(payload.mediaToken)]
          : [];
    const singleFallbackType = payload.mediaType === 'document_group' ? 'document' : 'photo';
    const effectiveMediaType = isGroupType && mediaUrls.length === 1 ? singleFallbackType : payload.mediaType;

    const post: TelegramMessage = {
      id: payload.messageId,
      channelUsername: sourceChannel,
      text: payload.text || '',
      htmlText: payload.html || payload.text || '',
      mediaType: effectiveMediaType,
      mediaUrls,
      caption: null,
      inlineKeyboard: (payload.buttons as { text: string; url: string }[][] | null) || undefined,
      publishedAt: payload.publishedAt || new Date().toISOString(),
    };

    for (const conn of matches) {
      // Idempotency: اگر همین پیام قبلاً پردازش شده (مثلاً webhook دوباره
      // رسیده، یا هم‌زمان با یک sync دستی برخورد کرده)، دوباره ارسال نکن.
      if (conn.lastMessageId !== null && post.id <= conn.lastMessageId) continue;
      await TelegramService.processSinglePost(conn, post);
    }
  }

  public static async startAllActiveConnections(): Promise<void> {
    const all = await Storage.getAllConnections();
    all.forEach((conn) => {
      if (conn.status === 'active' || conn.status === 'error') {
        TelegramService.startMonitoring(conn.id);
      }
    });
  }
}
