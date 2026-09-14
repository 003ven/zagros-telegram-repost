// ابزارهای کمکی برای دو مورد:
// ۱) شکستن متن/کپشن‌های طولانی‌تر از سقف تلگرام به چند پیام، بدون اینکه
//    وسط یک تگ HTML باز (مثل <b> بدون بسته‌ی متناظرش) قطع بشه — هر جا
//    لازم شد ببره، تگ‌های باز اون لحظه رو ته همون تکه می‌بنده و اول
//    تکه‌ی بعدی دوباره بازشون می‌کنه.
// ۲) شناسایی خودکار لینک‌های کانفیگ/پروکسی خام و پیچیدنشون داخل <code>
//    تا مونواسپیس نمایش داده بشن، لینک‌پریویو نگیرن، و با یه تپ کپی بشن.

const TEXT_LIMIT = 4096;
const CAPTION_LIMIT = 1024;

type HtmlToken = { type: 'tag' | 'text'; value: string };

function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  const regex = /<[^>]+>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    if (match.index > lastIndex) tokens.push({ type: 'text', value: html.slice(lastIndex, match.index) });
    tokens.push({ type: 'tag', value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < html.length) tokens.push({ type: 'text', value: html.slice(lastIndex) });
  return tokens;
}

const OPEN_TAG = /^<([a-zA-Z0-9-]+)(\s[^>]*)?>$/;
const CLOSE_TAG = /^<\/([a-zA-Z0-9-]+)>$/;

function splitHtmlPreservingTags(html: string, limit: number): string[] {
  const tokens = tokenizeHtml(html);
  const chunks: string[] = [];
  let current = '';
  let openStack: string[] = [];

  const closersLength = () => openStack.reduce((sum, t) => sum + t.length + 3, 0);

  const flush = () => {
    if (!current.trim()) { current = openStack.map((t) => `<${t}>`).join(''); return; }
    const closers = openStack.slice().reverse().map((t) => `</${t}>`).join('');
    chunks.push(current + closers);
    current = openStack.map((t) => `<${t}>`).join('');
  };

  const pushPiece = (piece: string) => {
    if (current.length + piece.length + closersLength() > limit && current.trim()) flush();
    current += piece;
  };

  for (const token of tokens) {
    if (token.type === 'tag') {
      pushPiece(token.value);
      const openMatch = token.value.match(OPEN_TAG);
      const closeMatch = token.value.match(CLOSE_TAG);
      if (openMatch) openStack.push(openMatch[1]);
      else if (closeMatch) openStack.pop();
    } else {
      for (const word of token.value.split(/(?<=\s)/)) {
        if (word) pushPiece(word);
      }
    }
  }
  flush();
  return chunks.filter((c) => c.trim().length > 0);
}

function splitPlainText(text: string, limit: number): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const word of text.split(/(?<=\s)/)) {
    if (current.length + word.length > limit && current.trim()) {
      chunks.push(current.trim());
      current = '';
    }
    current += word;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function splitForTelegram(
  text: string,
  html: string | undefined,
  hasMedia: boolean
): { main: { text: string; html?: string }; overflow: { text: string; html?: string }[] } {
  const limit = hasMedia ? CAPTION_LIMIT : TEXT_LIMIT;
  if (html) {
    if (html.length <= limit) return { main: { text, html }, overflow: [] };
    const [main, ...rest] = splitHtmlPreservingTags(html, limit);
    return { main: { text, html: main }, overflow: rest.map((h) => ({ html: h, text: '' })) };
  }
  if (text.length <= limit) return { main: { text }, overflow: [] };
  const [main, ...rest] = splitPlainText(text, limit);
  return { main: { text: main }, overflow: rest.map((t) => ({ text: t })) };
}

const CONFIG_LINK_PATTERN = /\b(vless|vmess|trojan|ssr?|socks5?|hysteria2?):\/\/[^\s<]+/gi;

export function wrapConfigLinks(html: string): string {
  const tokens = tokenizeHtml(html);
  let depth = 0;
  return tokens
    .map((token) => {
      if (token.type === 'tag') {
        const openMatch = token.value.match(OPEN_TAG);
        const closeMatch = token.value.match(CLOSE_TAG);
        if (openMatch && ['a', 'code', 'pre'].includes(openMatch[1])) depth++;
        if (closeMatch && ['a', 'code', 'pre'].includes(closeMatch[1])) depth = Math.max(0, depth - 1);
        return token.value;
      }
      if (depth > 0) return token.value;
      return token.value.replace(CONFIG_LINK_PATTERN, (m) => `<code>${m}</code>`);
    })
    .join('');
}

// ==================== جدید: گرید پرچم پروکسی ====================

const TGPROXY_HREF_PATTERN = /^(https?:\/\/t\.me\/proxy\?|tg:\/\/proxy\?)/i;
const SEPARATOR_ONLY = /^[\s•\-–—*·.]*$/;

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function extractHref(tagStr: string): string | null {
  const m = tagStr.match(/href\s*=\s*"([^"]*)"/i);
  return m ? decodeEntities(m[1]) : null;
}

interface ProxyLinkUnit {
  tokenStart: number;
  tokenEnd: number;
  href: string;
}

export interface ProxyGridOptions {
  flagPalette: string[];
  columnsPerRow: number;
}

export function wrapProxyLinks(html: string, options: ProxyGridOptions): string {
  const { flagPalette, columnsPerRow } = options;
  if (!flagPalette.length || columnsPerRow < 1) return html;

  const tokens = tokenizeHtml(html);

  // پاس اول: پیدا کردن هر <a href=tgproxy>متن</a> که از قبل پرچم‌دار نیست
  const units: ProxyLinkUnit[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'tag') continue;
    const openMatch = t.value.match(OPEN_TAG);
    if (!openMatch || openMatch[1].toLowerCase() !== 'a') continue;
    const href = extractHref(t.value);
    if (!href || !TGPROXY_HREF_PATTERN.test(href)) continue;

    const textTok = tokens[i + 1];
    const closeTok = tokens[i + 2];
    if (!textTok || textTok.type !== 'text') continue;
    if (!closeTok || closeTok.type !== 'tag') continue;
    const closeMatch = closeTok.value.match(CLOSE_TAG);
    if (!closeMatch || closeMatch[1].toLowerCase() !== 'a') continue;

    const alreadyFlagged = flagPalette.some((f) => textTok.value.trimStart().startsWith(f));
    if (alreadyFlagged) continue;

    units.push({ tokenStart: i, tokenEnd: i + 2, href });
    i += 2;
  }

  if (units.length === 0) return html;

  // پاس دوم: گروه‌بندی واحدهای پشت‌سرهم (فقط جداکننده‌ی ساده بینشون)
  const groups: ProxyLinkUnit[][] = [];
  let current: ProxyLinkUnit[] = [units[0]];
  for (let k = 1; k < units.length; k++) {
    const prev = units[k - 1];
    const cur = units[k];
    const between = tokens
      .slice(prev.tokenEnd + 1, cur.tokenStart)
      .map((tk) => tk.value)
      .join('');
    if (SEPARATOR_ONLY.test(between)) {
      current.push(cur);
    } else {
      groups.push(current);
      current = [cur];
    }
  }
  groups.push(current);

  // پاس سوم: رندر هر گروه و علامت‌گذاری تکن‌های جایگزین‌شونده/حذف‌شونده.
  // شمارنده‌ی پرچم رو کل پست پیوسته‌ست (نه هر گروه از صفر) تا دو پروکسیِ
  // جدا (که کنار هم نیستن، پس گروه نشدن) تصادفاً هم‌پرچم درنیان.
  const replacement = new Map<number, string>();
  const consumed = new Set<number>();
  let flagCounter = 0;

  for (const group of groups) {
    const rows: string[] = [];
    for (let r = 0; r < group.length; r += columnsPerRow) {
      const rowItems = group.slice(r, r + columnsPerRow).map((unit) => {
        const flag = flagPalette[flagCounter % flagPalette.length];
        flagCounter++;
        return `${flag} <a href="${escapeAttr(unit.href)}">PROXY</a>`;
      });
      rows.push(rowItems.join('    '));
    }
    const gridHtml = rows.join('\n');

    const first = group[0];
    const last = group[group.length - 1];
    replacement.set(first.tokenStart, gridHtml);
    for (let idx = first.tokenStart + 1; idx <= last.tokenEnd; idx++) {
      consumed.add(idx);
    }
    // جداکننده‌ی خالص بلافاصله قبل از شروع گروه (مثلاً یه بولت تنها) رو هم
    // حذف کن - وگرنه یه بولت یتیم قبل از گرید باقی می‌مونه.
    const beforeIdx = first.tokenStart - 1;
    const beforeTok = tokens[beforeIdx];
    if (beforeTok && beforeTok.type === 'text' && SEPARATOR_ONLY.test(beforeTok.value) && beforeTok.value !== '') {
      consumed.add(beforeIdx);
    }
  }

  return tokens
    .map((t, idx) => {
      if (replacement.has(idx)) return replacement.get(idx)!;
      if (consumed.has(idx)) return '';
      return t.value;
    })
    .join('');
}

// ==================== جدید: پاراگراف‌بندی متن بلند ====================

// شکستن به پاراگراف با خط‌خالی، با حفظ صحیح تگ‌های باز (اگه یه تگ وسط یه
// پاراگراف باز بشه و تو همون پاراگراف هم بسته بشه مشکلی نیست؛ اگه به‌ندرت
// از مرز پاراگراف رد بشه، مثل splitHtmlPreservingTags تگ‌های باز رو می‌بنده
// و پاراگراف بعدی دوباره بازشون می‌کنه).
function splitIntoParagraphs(html: string): string[] {
  const tokens = tokenizeHtml(html);
  const paragraphs: string[] = [];
  let current = '';
  const openStack: string[] = [];

  const closers = () => openStack.slice().reverse().map((t) => `</${t}>`).join('');
  const openers = () => openStack.map((t) => `<${t}>`).join('');

  const flush = () => {
    if (current.trim()) paragraphs.push(current + closers());
    current = openers();
  };

  for (const token of tokens) {
    if (token.type === 'tag') {
      current += token.value;
      const openMatch = token.value.match(OPEN_TAG);
      const closeMatch = token.value.match(CLOSE_TAG);
      if (openMatch) openStack.push(openMatch[1]);
      else if (closeMatch) openStack.pop();
    } else {
      const parts = token.value.split(/\n{2,}/);
      parts.forEach((part, idx) => {
        if (idx > 0) flush();
        current += part;
      });
    }
  }
  flush();
  return paragraphs;
}

function plainTextLength(paragraphHtml: string): number {
  return paragraphHtml.replace(/<[^>]+>/g, '').length;
}

const UNSAFE_TO_WRAP = /<(blockquote|code|pre)\b/i;
const HAS_BOLD = /<b\b/i;

export interface ParagraphFormattingOptions {
  paragraphThreshold: number;
}

export function formatParagraphs(html: string, options: ParagraphFormattingOptions): string {
  const { paragraphThreshold } = options;
  const paragraphs = splitIntoParagraphs(html);
  if (paragraphs.length === 0) return html;

  return paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return p;
      // امنیت: اگه از قبل quote/code/pre تو دلشه، دست نزن - وگرنه nesting
      // ممنوعِ Bot API (blockquote/bold نمی‌تونن code/pre/blockquote رو
      // دربر بگیرن) می‌سازیم.
      if (UNSAFE_TO_WRAP.test(trimmed)) return p;
      const len = plainTextLength(trimmed);
      if (len === 0) return p;
      if (len > paragraphThreshold) return `<blockquote>${trimmed}</blockquote>`;
      // اگه از قبل بولد داره (مثلاً یه <b> که از مرز پاراگراف رد شده و
      // دوباره باز شده)، دوباره نپیچش - وگرنه <b><b>...</b>...</b> تودرتو
      // می‌سازه.
      if (HAS_BOLD.test(trimmed)) return p;
      return `<b>${trimmed}</b>`;
    })
    .join('\n\n');
}

// ==================== جدید: تشخیص و بسته‌بندی لینک‌های ساب ====================

export interface SubLinkOptions {
  keywordList: string[];
}

export function wrapSubLinks(html: string, options: SubLinkOptions): string {
  const { keywordList } = options;
  if (!keywordList.length) return html;
  const lowerKeywords = keywordList.map((k) => k.toLowerCase());

  const tokens = tokenizeHtml(html);
  const replacement = new Map<number, string>();
  const consumed = new Set<number>();

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'tag') continue;
    const openMatch = t.value.match(OPEN_TAG);
    if (!openMatch || openMatch[1].toLowerCase() !== 'a') continue;
    const href = extractHref(t.value);
    if (!href) continue;
    // پروکسی تلگرام مال فیچر جداست، اینجا کاری باهاش نداریم
    if (TGPROXY_HREF_PATTERN.test(href)) continue;

    const textTok = tokens[i + 1];
    const closeTok = tokens[i + 2];
    if (!textTok || textTok.type !== 'text') continue;
    if (!closeTok || closeTok.type !== 'tag') continue;
    const closeMatch = closeTok.value.match(CLOSE_TAG);
    if (!closeMatch || closeMatch[1].toLowerCase() !== 'a') continue;

    const hrefLower = href.toLowerCase();
    if (!lowerKeywords.some((kw) => hrefLower.includes(kw))) continue;

    replacement.set(i, `<pre>${escapeHtml(href)}</pre>`);
    consumed.add(i + 1);
    consumed.add(i + 2);
    i += 2;
  }

  if (replacement.size === 0) return html;

  return tokens
    .map((t, idx) => {
      if (replacement.has(idx)) return replacement.get(idx)!;
      if (consumed.has(idx)) return '';
      return t.value;
    })
    .join('');
}
