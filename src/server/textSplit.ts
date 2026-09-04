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
