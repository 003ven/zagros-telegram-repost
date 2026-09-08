// تشخیص انواع محتوا (کانفیگ/پروکسی، هشتگ، لینک داخلی/خارجی، متن معمولی)
// داخل متن خام یک پست، تبدیلش به HTML مرتب، و اضافه‌کردن هشتگ‌های
// مرتبط با موضوع طبق تنظیمات هر پل. این ماژول فقط منطق «تشخیص +
// قالب‌بندی» رو داره - جدا از خودِ ارسال.

export interface HashtagRule {
  keyword: string;
  hashtag: string;
}
export interface HashtagConfig {
  alwaysAdd?: string[];
  keywordMap?: HashtagRule[];
}

type RawSegmentKind = 'text' | 'config' | 'tgproxy' | 'tmelink' | 'url' | 'hashtag';
interface RawSegment {
  kind: RawSegmentKind;
  content: string;
}
type Segment =
  | { kind: 'text'; content: string }
  | { kind: 'config_group'; items: string[] }
  | { kind: 'hashtag'; content: string }
  | { kind: 'link'; url: string; standalone: boolean; internal: boolean };

// نکته: فلگ u اضافه شد تا بشه تو کلاس کاراکتر هشتگ از \p{L}/\p{N} یونیکد-آگاه
// استفاده کرد - نه بلوک خام \u0600-\u06FF که چند نشونه‌ی نگارشی عربی/فارسی
// (، ؛ ؟) رو هم به‌اشتباه «حرف» حساب می‌کرد و باعث چسبیدنشون به هشتگ می‌شد،
// و شامل نیم‌فاصله (ZWNJ) هم نمی‌شد که هشتگ‌های ترکیبی فارسی رو وسط می‌شکافت.
const MASTER_PATTERN = new RegExp(
  [
    `(?<config>\\b(?:vless|vmess|trojan|ssr?|socks5?|hysteria2?):\\/\\/[^\\s<]+)`,
    `(?<tgproxy>(?:https?:\\/\\/t\\.me\\/proxy\\?|tg:\\/\\/proxy\\?)[^\\s<]+)`,
    `(?<tmelink>https?:\\/\\/t\\.me\\/[^\\s<]+)`,
    `(?<url>https?:\\/\\/[^\\s<]+)`,
    `(?<hashtag>#[\\p{L}\\p{N}\\p{Pc}\\u200c\\u200d]+)`,
  ].join('|'),
  'giu'
);

// آستانه بالا نگه داشته شده تا فقط متن‌های واقعاً قابل‌توجه (نه یه بلوک
// فیلد کوتاه چندخطی) وارد blockquote بشن.
const BLOCKQUOTE_THRESHOLD = 200;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// برای مقادیری که داخل یه attribute با کوتیشن دوبل رندر می‌شن (مثل href)؛
// escapeHtml معمولی کوتیشن رو escape نمی‌کنه و می‌تونه attribute رو بشکنه.
function escapeHtmlAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function normalizeHashtag(h: string): string {
  const trimmed = h.trim();
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}
// علامت نگارشیِ چسبیده به آخر یه لینک/کانفیگ (نقطه، ویرگول فارسی، پرانتز
// بسته‌ی بدون‌جفت و...) جزو خودِ متن نیست - این باگ واقعی موقع تست با محتوای
// فارسی واقعی پیدا شد (پرانتز بسته‌ی دور یه کانفیگ داشت جزو کانفیگ کپی می‌شد).
function trimTrailingPunctuation(s: string): string {
  let result = s;
  while (result.endsWith(')')) {
    const opens = (result.match(/\(/g) || []).length;
    const closes = (result.match(/\)/g) || []).length;
    if (closes > opens) result = result.slice(0, -1);
    else break;
  }
  return result.replace(/[.,;:!?\]}»"'،؛؟]+$/, '');
}

function tokenize(raw: string): RawSegment[] {
  const rawSegments: RawSegment[] = [];
  let lastIndex = 0;
  for (const match of raw.matchAll(MASTER_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) rawSegments.push({ kind: 'text', content: raw.slice(lastIndex, index) });
    const groups = match.groups || {};
    const type = (Object.keys(groups) as RawSegmentKind[]).find((k) => groups[k] !== undefined);
    let content = match[0];
    if (type && type !== 'hashtag') content = trimTrailingPunctuation(content);
    rawSegments.push({ kind: type || 'text', content });
    lastIndex = index + content.length;
  }
  if (lastIndex < raw.length) rawSegments.push({ kind: 'text', content: raw.slice(lastIndex) });
  return rawSegments;
}

function segmentText(raw: string): Segment[] {
  const rawSegments = tokenize(raw);
  const standaloneUrls = new Set<string>();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (/^https?:\/\/[^\s<]+$/i.test(trimmed)) standaloneUrls.add(trimTrailingPunctuation(trimmed));
  }

  // ادغام config/tgproxyهای پشت‌سرهم با lookahead (فقط وقتی فاصله رو
  // می‌بلعیم که مطمئن باشیم بعدش هم یه کانفیگ دیگه میاد - وگرنه فاصله‌ی
  // بعد از آخرین کانفیگ گروه، برای جداکننده‌ی بصری بعدی حفظ می‌شه).
  const isConfigKind = (k: RawSegmentKind) => k === 'config' || k === 'tgproxy';
  const merged: (RawSegment | { kind: 'config_group'; items: string[] })[] = [];
  let i = 0;
  while (i < rawSegments.length) {
    const seg = rawSegments[i];
    if (isConfigKind(seg.kind)) {
      const group = [seg.content];
      let j = i + 1;
      while (
        j + 1 < rawSegments.length &&
        rawSegments[j].kind === 'text' &&
        rawSegments[j].content.trim() === '' &&
        isConfigKind(rawSegments[j + 1].kind)
      ) {
        group.push(rawSegments[j + 1].content);
        j += 2;
      }
      merged.push({ kind: 'config_group', items: group });
      i = j;
      continue;
    }
    merged.push(seg);
    i++;
  }

  const segments: Segment[] = [];
  for (const seg of merged) {
    if (seg.kind === 'config_group') segments.push(seg);
    else if (seg.kind === 'hashtag') segments.push({ kind: 'hashtag', content: seg.content });
    else if (seg.kind === 'tmelink' || seg.kind === 'url') {
      segments.push({
        kind: 'link',
        url: seg.content,
        standalone: standaloneUrls.has(seg.content.trim()),
        internal: seg.kind === 'tmelink',
      });
    } else segments.push({ kind: 'text', content: (seg as RawSegment).content });
  }
  return segments;
}

export function classifyAndFormat(raw: string, hashtagConfig?: HashtagConfig): string {
  const segments = segmentText(raw);

  // blockquote فقط وقتی معنی داره که یه چیز «داده‌ای» (کانفیگ یا لینک)
  // هم تو پست باشه که این متن ازش جدا بشه - وگرنه یه پست خبری خالص
  // بدون هیچ کانفیگی، کل متنش (که خودش تمام محتوای پسته) بی‌دلیل تو یه
  // جعبه‌ی نقل‌قول می‌افته. این محدودیت با تست روی محتوای واقعی کانال
  // پیدا شد (یه پست نرخ ارز بدون هیچ کانفیگی).
  const hasDataElement = segments.some((s) => s.kind === 'config_group' || s.kind === 'link');

  // طول رو رو‌ی مجموع کل تکه‌های «متن» پست حساب می‌کنیم، نه هر تکه به‌تنهایی -
  // وگرنه یه هشتگ/لینک/کانفیگ وسط یه پاراگراف طولانی، پاراگراف رو به تکه‌های
  // زیرِ آستانه می‌شکافت و کل متن از blockquote در می‌رفت (باگ واقعی، با
  // تست پیدا شد).
  const totalTextLength = segments
    .filter((s) => s.kind === 'text')
    .reduce((sum, s) => sum + s.content.trim().length, 0);
  const shouldBlockquote = hasDataElement && totalTextLength > BLOCKQUOTE_THRESHOLD;

  // --- تشخیص هشتگ‌های موجود + محاسبه‌ی هشتگ‌های جدیدی که طبق تنظیمات
  // این پل باید اضافه بشن ---
  const existingHashtags = new Set(segments.filter((s) => s.kind === 'hashtag').map((s) => s.content.toLowerCase()));
  const plainTextForKeywordMatch = segments.filter((s) => s.kind === 'text').map((s) => s.content).join(' ');

  const toAdd: string[] = [];
  const tryAdd = (hashtag: string) => {
    const normalized = normalizeHashtag(hashtag);
    if (!existingHashtags.has(normalized.toLowerCase())) {
      existingHashtags.add(normalized.toLowerCase());
      toAdd.push(normalized);
    }
  };
  for (const h of hashtagConfig?.alwaysAdd ?? []) {
    if (h && h.trim()) tryAdd(h);
  }
  for (const { keyword, hashtag } of hashtagConfig?.keywordMap ?? []) {
    if (!keyword || !keyword.trim() || !hashtag || !hashtag.trim()) continue;
    // توجه: \b جاوااسکریپت فقط حروف انگلیسی رو «حرف» حساب می‌کنه؛ برای
    // فارسی/عربی کار نمی‌کنه. به‌جاش با \p{L}/\p{N} یونیکد-آگاه مرز
    // کلمه رو دستی می‌سازیم (این باگ واقعی موقع تست پیدا شد).
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(keyword)}(?![\\p{L}\\p{N}])`, 'iu');
    if (re.test(plainTextForKeywordMatch)) tryAdd(hashtag);
  }

  // هشتگ‌های جدید: اگه پست از قبل هشتگ داشت، کنار *آخرین* هشتگ موجود
  // تزریق می‌شن (نه ته پست)؛ وگرنه یه خط جدید ته پست اضافه می‌شن.
  const finalSegments = segments.slice();
  if (toAdd.length > 0) {
    const lastHashtagIndex = finalSegments.map((s) => s.kind).lastIndexOf('hashtag');
    const newHashtagSegments: Segment[] = toAdd.map((h) => ({ kind: 'hashtag', content: h }));
    if (lastHashtagIndex !== -1) {
      const withSeparators = newHashtagSegments.flatMap((s, i): Segment[] =>
        i === 0 ? [s] : [{ kind: 'text', content: ' ' }, s]
      );
      finalSegments.splice(lastHashtagIndex + 1, 0, { kind: 'text', content: ' ' }, ...withSeparators);
    } else {
      finalSegments.push({ kind: 'text', content: '\n\n' });
      newHashtagSegments.forEach((s, i) => {
        if (i > 0) finalSegments.push({ kind: 'text', content: ' ' });
        finalSegments.push(s);
      });
    }
  }

  const htmlParts: string[] = [];
  for (const seg of finalSegments) {
    if (seg.kind === 'config_group') {
      htmlParts.push(`<code>${escapeHtml(seg.items.join('\n'))}</code>`);
    } else if (seg.kind === 'hashtag') {
      htmlParts.push(escapeHtml(seg.content));
    } else if (seg.kind === 'link') {
      if (seg.standalone) {
        const label = seg.internal ? '🔗 مشاهده در کانال' : '🔍 مشاهده لینک';
        htmlParts.push(`<a href="${escapeHtmlAttr(seg.url)}">${label}</a>`);
      } else {
        htmlParts.push(escapeHtml(seg.url));
      }
    } else {
      const leading = (seg.content.match(/^\s*/) || [''])[0];
      const trailing = (seg.content.match(/\s*$/) || [''])[0];
      const core = seg.content.slice(leading.length, seg.content.length - trailing.length);
      if (!core) htmlParts.push(seg.content);
      else if (shouldBlockquote)
        htmlParts.push(`${leading}<blockquote>${escapeHtml(core)}</blockquote>${trailing}`);
      else htmlParts.push(escapeHtml(seg.content));
    }
  }
  return htmlParts.join('').trim();
}
