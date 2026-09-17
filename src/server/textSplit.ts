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

// ==================== جدید: برچسب/ریبرند کانفیگ ایکس‌ری ====================

const FLAG_PREFIX = /^([\u{1F1E6}-\u{1F1FF}]{2})/u;

// ریمارک خام رو به پرچم/تمایزدهنده می‌شکنه. برند قدیمی همیشه دور ریخته
// می‌شه؛ فقط پرچم (اگه بود) و هرچی از اولین خط‌تیره به بعد حفظ می‌شن.
function parseRawLabel(raw: string | null): { flag: string; differentiator: string } {
  if (!raw || !raw.trim()) return { flag: '', differentiator: '' };
  let rest = raw.trim();
  let flag = '';
  const flagMatch = rest.match(FLAG_PREFIX);
  if (flagMatch) {
    flag = flagMatch[1];
    rest = rest.slice(flag.length);
  }
  const dashIdx = rest.indexOf('-');
  const differentiator = dashIdx !== -1 ? rest.slice(dashIdx) : '';
  return { flag, differentiator };
}

function computeFinalLabel(raw: string | null, brandName: string, fallbackLabel: string, autoNumber: number): string {
  const { flag, differentiator } = parseRawLabel(raw);
  const brand = brandName.trim() || fallbackLabel.trim() || 'کانفیگ';
  const suffix = differentiator || `-${autoNumber}`;
  return `${flag}${brand}${suffix}`;
}

// vless/trojan/ss/ssr/socks5/hysteria2: ریمارک همون #fragment انکودشده‌ست.
function splitConfigFragment(configText: string): { withoutFragment: string; rawLabel: string | null } {
  const hashIdx = configText.indexOf('#');
  if (hashIdx === -1) return { withoutFragment: configText, rawLabel: null };
  const withoutFragment = configText.slice(0, hashIdx);
  const rawFragment = configText.slice(hashIdx + 1);
  let decoded: string | null = null;
  try {
    decoded = decodeURIComponent(rawFragment);
  } catch {
    decoded = null;
  }
  return { withoutFragment, rawLabel: decoded && decoded.trim() ? decoded : null };
}
function buildConfigWithFragment(withoutFragment: string, newLabel: string): string {
  return `${withoutFragment}#${encodeURIComponent(newLabel)}`;
}

// vmess: ریمارک تو فیلد ps داخل JSON بیس۶۴شده‌ست. هر خطای decode/parse یعنی
// ok:false - تنها سیگنال برای اینکه این کانفیگ خاص کاملاً دست‌نخورده/بدون
// برچسب رها بشه، نه نصفه‌خراب بشه.
type VmessExtractResult = { ok: true; label: string | null; decoded: Record<string, unknown> } | { ok: false };
function extractVmessLabel(configText: string): VmessExtractResult {
  const b64 = configText.slice('vmess://'.length);
  try {
    const jsonStr = Buffer.from(b64, 'base64').toString('utf-8');
    const decoded = JSON.parse(jsonStr);
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return { ok: false };
    const ps = (decoded as Record<string, unknown>).ps;
    const label = typeof ps === 'string' && ps.trim() ? ps : null;
    return { ok: true, label, decoded: decoded as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
}
function buildVmessWithLabel(decoded: Record<string, unknown>, newLabel: string): string {
  const updated = { ...decoded, ps: newLabel };
  return 'vmess://' + Buffer.from(JSON.stringify(updated), 'utf-8').toString('base64');
}

interface ConfigMatch {
  start: number;
  end: number;
  text: string;
  protocol: string;
}

// همون منطق عمق‌ردیابیِ wrapConfigLinks (بیرون از a/code/pre)، ولی به‌جای
// جایگزینی فوری، موقعیت مطلق هر match رو برمی‌گردونه - چون برای گروه‌بندی
// و ساخت هدر/pre جدا لازمه چند match رو با هم ببینیم.
// مشترک: بازه‌های امن (عمق صفر، بیرون از a/code/pre) - قبلاً اینجا inline
// بود، حالا جدا شده تا injectHashtags هم بتونه ازش استفاده کنه، بدون
// تکرار سوم همین منطق.
function findSafeRanges(html: string): [number, number][] {
  const tokens = tokenizeHtml(html);
  let depth = 0;
  let offset = 0;
  const ranges: [number, number][] = [];
  for (const token of tokens) {
    const start = offset;
    const end = offset + token.value.length;
    if (token.type === 'tag') {
      const openMatch = token.value.match(OPEN_TAG);
      const closeMatch = token.value.match(CLOSE_TAG);
      if (openMatch && ['a', 'code', 'pre'].includes(openMatch[1])) depth++;
      if (closeMatch && ['a', 'code', 'pre'].includes(closeMatch[1])) depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      ranges.push([start, end]);
    }
    offset = end;
  }
  return ranges;
}

function findSafeConfigMatches(html: string): ConfigMatch[] {
  const safeRanges = findSafeRanges(html);
  const matches: ConfigMatch[] = [];
  for (const [rangeStart, rangeEnd] of safeRanges) {
    const segment = html.slice(rangeStart, rangeEnd);
    const re = new RegExp(CONFIG_LINK_PATTERN.source, CONFIG_LINK_PATTERN.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(segment))) {
      matches.push({ start: rangeStart + m.index, end: rangeStart + m.index + m[0].length, text: m[0], protocol: m[1].toLowerCase() });
    }
  }
  return matches;
}

function groupAdjacentMatches(html: string, matches: ConfigMatch[]): ConfigMatch[][] {
  if (matches.length === 0) return [];
  const groups: ConfigMatch[][] = [];
  let current: ConfigMatch[] = [matches[0]];
  for (let i = 1; i < matches.length; i++) {
    const between = html.slice(matches[i - 1].end, matches[i].start);
    if (/^\s*$/.test(between)) current.push(matches[i]);
    else {
      groups.push(current);
      current = [matches[i]];
    }
  }
  groups.push(current);
  return groups;
}

interface ProcessedConfig {
  ok: boolean;
  rebuilt: string;
  label: string | null;
}

export interface XrayConfigLabelOptions {
  brandName: string;
  labelStyle: 'bold' | 'blockquote';
  mergeConsecutive: boolean;
  fallbackLabel: string;
}

export function labelAndWrapConfigs(html: string, options: XrayConfigLabelOptions): string {
  const { brandName, labelStyle, mergeConsecutive, fallbackLabel } = options;
  const matches = findSafeConfigMatches(html);
  if (matches.length === 0) return html;

  let autoNumber = 0;
  const processed: ProcessedConfig[] = matches.map((m) => {
    if (m.protocol === 'vmess') {
      const extracted = extractVmessLabel(m.text);
      if (!extracted.ok) return { ok: false, rebuilt: m.text, label: null };
      autoNumber++;
      const finalLabel = computeFinalLabel(extracted.label, brandName, fallbackLabel, autoNumber);
      return { ok: true, rebuilt: buildVmessWithLabel(extracted.decoded, finalLabel), label: finalLabel };
    }
    const { withoutFragment, rawLabel } = splitConfigFragment(m.text);
    autoNumber++;
    const finalLabel = computeFinalLabel(rawLabel, brandName, fallbackLabel, autoNumber);
    return { ok: true, rebuilt: buildConfigWithFragment(withoutFragment, finalLabel), label: finalLabel };
  });

  const groups = groupAdjacentMatches(html, matches);

  let result = '';
  let cursor = 0;
  let matchCursor = 0;
  for (const group of groups) {
    const groupStart = group[0].start;
    const groupEnd = group[group.length - 1].end;
    result += html.slice(cursor, groupStart);

    const groupProcessed = processed.slice(matchCursor, matchCursor + group.length);
    matchCursor += group.length;

    // ادغام فقط وقتی معنی داره که واقعاً بیش از یکی تو گروه باشه - یه
    // کانفیگ تنها (چه واقعاً تنها، چه چون همسایه‌ش با متن دیگه جدا شده)
    // همیشه هدر کامل می‌گیره.
    if (mergeConsecutive && groupProcessed.length > 1) {
      const combined = groupProcessed.map((p) => p.rebuilt).join('\n');
      result += `<pre>${combined}</pre>`;
    } else {
      result += groupProcessed
        .map((p) => {
          if (!p.ok) return `<code>${p.rebuilt}</code>`;
          const header = labelStyle === 'blockquote' ? `<blockquote>${p.label}</blockquote>` : `<b>${p.label}</b>`;
          return `${header}\n<pre>${p.rebuilt}</pre>`;
        })
        .join('\n\n');
    }
    cursor = groupEnd;
  }
  result += html.slice(cursor);
  return result;
}

// ==================== جدید: تزریق هشتگ (عمومی/داخلی) ====================

const HASHTAG_PATTERN = /#[\p{L}\p{N}\p{Pc}\u200c\u200d]+/gu;

interface HashtagMatch {
  start: number;
  end: number;
  text: string;
}

function findSafeHashtags(html: string): HashtagMatch[] {
  const ranges = findSafeRanges(html);
  const matches: HashtagMatch[] = [];
  for (const [rangeStart, rangeEnd] of ranges) {
    const segment = html.slice(rangeStart, rangeEnd);
    const re = new RegExp(HASHTAG_PATTERN.source, HASHTAG_PATTERN.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(segment))) {
      matches.push({ start: rangeStart + m.index, end: rangeStart + m.index + m[0].length, text: m[0] });
    }
  }
  return matches;
}

// متن خالص برای تطبیق کلمه‌کلیدی: بازه‌های امن، منهای خودِ متن هشتگ‌های
// موجود (نباید جزو «متن معمولی پست» برای keyword-match حساب بشن).
function plainTextExcludingHashtags(html: string, hashtags: HashtagMatch[]): string {
  const ranges = findSafeRanges(html);
  let text = '';
  for (const [rangeStart, rangeEnd] of ranges) {
    let cursor = rangeStart;
    const inRange = hashtags.filter((h) => h.start >= rangeStart && h.end <= rangeEnd);
    for (const h of inRange) {
      text += html.slice(cursor, h.start) + ' ';
      cursor = h.end;
    }
    text += html.slice(cursor, rangeEnd) + ' ';
  }
  return text;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
}

export interface HashtagEntry {
  hashtag: string;
  type: 'global' | 'local';
}
export interface HashtagKeywordEntry {
  keyword: string;
  hashtag: string;
  type: 'global' | 'local';
}
export interface HashtagInjectionOptions {
  hashtagAlwaysAdd: HashtagEntry[];
  hashtagKeywordMap: HashtagKeywordEntry[];
  targetChannel: string;
}

// نوع «داخلی» فقط با یوزرنیم عمومی معنی داره (#تگ@یوزرنیم)؛ کانال‌های
// پرایوت با targetChannel عددی (بدون @) خودکار به عمومی برمی‌گردن.
function normalizeHashtagText(rawTag: string, type: 'global' | 'local', targetChannel: string): string {
  const trimmed = rawTag.trim().replace(/^#/, '');
  if (!trimmed) return '';
  if (type === 'local' && targetChannel.startsWith('@')) {
    return `#${trimmed}@${targetChannel.slice(1)}`;
  }
  return `#${trimmed}`;
}

export function injectHashtags(html: string, options: HashtagInjectionOptions): string {
  const { hashtagAlwaysAdd, hashtagKeywordMap, targetChannel } = options;
  const existingHashtags = findSafeHashtags(html);
  const existingWords = new Set(existingHashtags.map((h) => h.text.toLowerCase()));
  const plainText = plainTextExcludingHashtags(html, existingHashtags);

  const toAdd: string[] = [];
  const tryAdd = (rawTag: string, type: 'global' | 'local') => {
    const trimmed = rawTag.trim().replace(/^#/, '');
    if (!trimmed) return;
    const baseWordLower = `#${trimmed}`.toLowerCase();
    if (existingWords.has(baseWordLower)) return;
    const finalText = normalizeHashtagText(rawTag, type, targetChannel);
    if (!finalText) return;
    existingWords.add(baseWordLower);
    toAdd.push(finalText);
  };

  for (const entry of hashtagAlwaysAdd) {
    if (entry.hashtag && entry.hashtag.trim()) tryAdd(entry.hashtag, entry.type);
  }
  for (const entry of hashtagKeywordMap) {
    if (!entry.keyword || !entry.keyword.trim() || !entry.hashtag || !entry.hashtag.trim()) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(entry.keyword)}(?![\\p{L}\\p{N}])`, 'iu');
    if (re.test(plainText)) tryAdd(entry.hashtag, entry.type);
  }

  if (toAdd.length === 0) return html;

  if (existingHashtags.length > 0) {
    const lastEnd = existingHashtags[existingHashtags.length - 1].end;
    return html.slice(0, lastEnd) + ' ' + toAdd.join(' ') + html.slice(lastEnd);
  }
  return `${html}\n\n${toAdd.join(' ')}`;
}
