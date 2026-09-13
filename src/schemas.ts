/**
 * منبع واحد حقیقت برای شکل داده، مقدار پیش‌فرض، و اعتبارسنجی.
 *
 * قبل از این فایل، «تنظیمات یک پل» (TelegramConnectionConfig) در سه جای
 * جدا تعریف می‌شد: تایپ در types.ts، پیش‌فرض سمت سرور در
 * TelegramService.getDefaultConfig()، و پیش‌فرض سمت کلاینت در
 * lib/defaultConnectionConfig.ts. نگه‌داشتن این سه هماهنگ با هم دستی و
 * پرخطا بود (یک فیلد جدید که در یکی فراموش شود، یعنی مقدار undefined
 * جایی نشت می‌کند).
 *
 * از الان: این فایل تنها جایی است که شکل config تعریف می‌شود. هم تایپ
 * TypeScript (`z.infer`) و هم مقدار پیش‌فرض (`.parse({})`) و هم
 * اعتبارسنجی زمان اجرا (`.safeParse(...)`) از همینجا می‌آیند — هم سرور
 * (server.ts, src/server/telegram.ts) و هم کلاینت (src/lib) این فایل
 * را import می‌کنند، چون هر دو یک بیلد جدا از همین src/ هستند.
 */
import { z } from 'zod';

export const ReplaceRuleSchema = z.object({
  id: z.string(),
  search: z.string(),
  replace: z.string(),
});

// نوع رسانه‌ها — اگر نوع رسانه‌ی جدیدی اضافه شد (طبق
// references/extension-recipes.md بخش ۲)، اول اینجا اضافه‌اش کن.
export const MediaTypeSchema = z.enum([
  'text',
  'photo',
  'video',
  'document',
  'voice',
  'audio',
  'gif',
  'sticker',
  'media_group',
  'document_group',
]);

const ALL_MEDIA_TYPES = MediaTypeSchema.options;

export const AiTranslateSchema = z.enum(['fa', 'en', 'ar', 'none']);

// نکته‌ی مهم Zod: `.optional()` بعد از `.default()` نگذار — چون
// ZodOptional وقتی ورودی undefined باشد، بدون رسیدن به‌ی داخلی default
// همان undefined را برمی‌گرداند و مقدار پیش‌فرض هیچ‌وقت اعمال نمی‌شود.
// این فیلدها در تایپ اصلی `?:` بودند چون در جاهایی به‌صورت partial دیده
// می‌شدند (مثل ConnectionCreateInputSchema پایین که خودش `.partial()`
// می‌زند) — نه چون در یک config کامل واقعاً می‌توانند نبود.
export const TelegramConnectionConfigSchema = z.object({
  // آرایه‌ها همیشه با فکتوری (`() => []`) پیش‌فرض می‌گیرند، نه یک
  // لیترال ثابت — وگرنه Zod همان یک آرایه را بین همه‌ی parse() های
  // بعدی به اشتراک می‌گذارد و mutation روی یک config، بقیه را هم دستکاری می‌کند.
  replaceRules: z.array(ReplaceRuleSchema).default(() => []),
  removeLinks: z.boolean().default(false),
  removeMentions: z.boolean().default(false),
  // مدیریت لینک‌های داخل متن (جدا از removeLinks/replaceRules عمومی) —
  // فقط روی خودِ URLهای تشخیص‌داده‌شده در متن اعمال می‌شود.
  linkReplaceRules: z.array(ReplaceRuleSchema).default(() => []),
  // مدیریت دکمه‌های این‌لاین
  removeInlineButtons: z.boolean().default(false),
  buttonReplaceRules: z.array(ReplaceRuleSchema).default(() => []),
  // دکمه‌های سفارشی — به همه‌ی پست‌های خروجی این پل اضافه می‌شوند
  // (مستقل از حذف/جایگزینی دکمه‌های اصلی پست). newRow=true یعنی این
  // دکمه یک ردیف جدید شروع می‌کند؛ false یعنی کنار دکمه‌ی قبلی می‌آید.
  customButtons: z
    .array(z.object({ id: z.string(), text: z.string(), url: z.string(), newRow: z.boolean().default(true) }))
    .default(() => []),
  // دسته‌بندی موضوعی پل (فوتبال، گیم، اخبار، VPN و ...) — برای
  // گروه‌بندی و فیلتر در پنل. src/lib/categories.ts
  category: z.string().default('سایر'),
  // تأیید دیدن خطا — وقتی کاربر لاگ‌های یک پل خطادار را باز می‌کند،
  // این مقدار برابر consecutiveErrors فعلی می‌شود؛ تا وقتی خطای
  // جدیدتری رخ ندهد (consecutiveErrors از این عدد بیشتر نشود)، بج
  // خطا به‌جای قرمزِ چشمک‌زن، به رنگ خنثی‌تر نمایش داده می‌شود.
  errorAcknowledgedCount: z.number().nullable().optional(),
  customHeader: z.string().default(''),
  customFooter: z.string().default(''),
  keywordsInclude: z.array(z.string()).default(() => []),
  keywordsExclude: z.array(z.string()).default(() => []),
  allowedMediaTypes: z.array(z.string()).default(() => [...ALL_MEDIA_TYPES]),
  delaySeconds: z.number().min(0).default(0),
  activeScheduleEnabled: z.boolean().default(false),
  activeScheduleStart: z.string().default('08:00'),
  activeScheduleEnd: z.string().default('22:00'),
  activeDays: z.array(z.number().min(0).max(6)).default(() => [0, 1, 2, 3, 4, 5, 6]),
  aiRewrite: z.boolean().default(false),
  aiTranslate: AiTranslateSchema.default('none'),
  // فاز ۳ (references/roadmap.md): اگر فعال باشد، پستی که متنش (بعد از
  // پردازش) دقیقاً با یکی از پست‌های ارسال‌شده‌ی اخیر همین پل یکی باشد،
  // رد می‌شود — برای جلوگیری از ریپوست تکراری وقتی کانال مبدأ همان خبر
  // را دوباره منتشر می‌کند (اتفاق رایج در کانال‌های خبری).
  skipDuplicateContent: z.boolean().default(false),
  // فاز ۳ب: اگر ست شده باشد، بعد از هر ارسال موفق یک POST غیربلاک‌کننده
  // با جزئیات پست به این URL فرستاده می‌شود (برای یکپارچگی با ابزارهای
  // دیگر کاربر — Zapier/n8n/اسکریپت شخصی و مانند آن).
  webhookUrl: z.string().url('آدرس webhook نامعتبر است').or(z.literal('')).default(''),
  // فاز ۵ (ری‌اکشن‌ها): ری‌اکشن‌های مجاز این پل روی کانال مقصد. اگر خالی
  // باشد، تنظیمات فعلی چت دست‌نخورده می‌ماند — این فیلد فقط وقتی صراحتاً
  // پر شود اثر می‌گذارد.
  allowedReactions: z.array(z.string()).default(() => []),
  // فاز ۵: بذرپاشی محدود — بعد از هر ارسال موفق، یک ری‌اکشن از طرف خودِ
  // بات (نه اکانت جعلی) روی پیام می‌گذارد تا پست خالی به نظر نرسد.
  seedReaction: z
    .object({
      enabled: z.boolean().default(false),
      emojiPool: z.array(z.string()).default(() => []),
      selectionMode: z.enum(['fixed', 'random']).default('fixed'),
      isBig: z.boolean().default(false),
    })
    .default(() => ({ enabled: false, emojiPool: [], selectionMode: 'fixed' as const, isBig: false })),
  // منطق واقعیِ این بخش دیگر در contentClassifier.ts نیست - آن فایل
  // بازنشسته و حذف شده (تاریخچه‌اش در گیت محفوظ است). هر ۵ زیربخش زیر
  // مستقل از هم، با سوییچ enabled خودشان، در src/server/textSplit.ts
  // پیاده می‌شوند و روی htmlText واقعی (نه متن خام) کار می‌کنند تا
  // entityهای اصلی پیام (لینک/فرمت‌بندی) گم نشوند.
  contentClassifier: z.preprocess(
    // سازگاری با گذشته: شکل قدیمی enabled/hashtagAlwaysAdd/hashtagKeywordMap
    // مستقیم زیر contentClassifier بود (بدون hashtagInjection میانی) و
    // hashtagAlwaysAdd رشته‌ی خام بود. اگر ورودی این شکل قدیمی را داشت،
    // قبل از ولیدیشن به شکل جدید کوچ داده می‌شود.
    (val) => {
      if (val && typeof val === 'object' && !('hashtagInjection' in val)) {
        const v = val as Record<string, unknown>;
        if ('hashtagAlwaysAdd' in v || 'hashtagKeywordMap' in v || 'enabled' in v) {
          const { enabled, hashtagAlwaysAdd, hashtagKeywordMap, ...rest } = v;
          return { ...rest, hashtagInjection: { enabled, hashtagAlwaysAdd, hashtagKeywordMap } };
        }
      }
      return val;
    },
    z.object({
      // هشتگ‌هایی که همیشه/بر اساس کلمه‌کلیدی به پست اضافه می‌شوند. هرکدام
      // «عمومی» (#تگ - سرچ سراسری تلگرام) یا «داخلی» (#تگ@یوزرنیم_مقصد -
      // فقط سرچ همان کانال) است؛ اگر داخلی باشد ولی کانال مقصد یوزرنیم
      // عمومی نداشته باشد، خودکار به عمومی برمی‌گردد.
      hashtagInjection: z
        .object({
          enabled: z.boolean().default(false),
          hashtagAlwaysAdd: z
            .array(
              z.preprocess(
                (v) => (typeof v === 'string' ? { hashtag: v, type: 'global' as const } : v),
                z.object({ hashtag: z.string(), type: z.enum(['global', 'local']).default('global') })
              )
            )
            .default(() => []),
          hashtagKeywordMap: z
            .array(
              z.object({
                keyword: z.string(),
                hashtag: z.string(),
                type: z.enum(['global', 'local']).default('global'),
              })
            )
            .default(() => []),
        })
        .default(() => ({ enabled: false, hashtagAlwaysAdd: [], hashtagKeywordMap: [] })),
      // پروکسی‌های تلگرام خام/پشت‌برچسب‌ساده در متن پست، به گرید پرچم+PROXY
      // تبدیل می‌شوند. پرچم‌ها تزئینی‌اند (نه geolocation)، چرخشی انتخاب
      // می‌شوند. لینک‌های از قبل پرچم‌دار یا داخل دکمه، دست‌نخورده می‌مانند.
      proxyGrid: z
        .object({
          enabled: z.boolean().default(false),
          flagPalette: z.array(z.string()).default(() => ['🇩🇪', '🇳🇱', '🇫🇮', '🇫🇷', '🇬🇧', '🇺🇸', '🇨🇦', '🇸🇪', '🇳🇴', '🇩🇰', '🇨🇭', '🇦🇹', '🇧🇪', '🇮🇪', '🇵🇱', '🇹🇷', '🇷🇺', '🇺🇦', '🇱🇻', '🇱🇹', '🇪🇪', '🇷🇴', '🇪🇸', '🇮🇹', '🇯🇵', '🇸🇬', '🇰🇷', '🇦🇺', '⚪']),
          columnsPerRow: z.number().min(1).max(10).default(4),
        })
        .default(() => ({
          enabled: false,
          flagPalette: ['🇩🇪', '🇳🇱', '🇫🇮', '🇫🇷', '🇬🇧', '🇺🇸', '🇨🇦', '🇸🇪', '🇳🇴', '🇩🇰', '🇨🇭', '🇦🇹', '🇧🇪', '🇮🇪', '🇵🇱', '🇹🇷', '🇷🇺', '🇺🇦', '🇱🇻', '🇱🇹', '🇪🇪', '🇷🇴', '🇪🇸', '🇮🇹', '🇯🇵', '🇸🇬', '🇰🇷', '🇦🇺', '⚪'],
          columnsPerRow: 4,
        })),
      // برچسب/ریبرند کانفیگ‌های ایکس‌ری (vless/vmess/trojan/...). ریمارک
      // اصلی (fragment یا فیلد ps) با برند خودِ ادمین جایگزین می‌شود، هم
      // رو هدر هم داخل خودِ کانفیگ. خودِ کانفیگ همیشه در <pre> مستقل با
      // کپی تضمینی می‌نشیند (code/pre با blockquote قابل‌ترکیب نیست)؛
      // فقط استایل برچسب (بولد/blockquote) انتخابی است.
      xrayConfigLabel: z
        .object({
          enabled: z.boolean().default(false),
          brandName: z.string().default(''),
          labelStyle: z.enum(['bold', 'blockquote']).default('bold'),
          mergeConsecutive: z.boolean().default(false),
          fallbackLabel: z.string().default('کانفیگ'),
        })
        .default(() => ({
          enabled: false,
          brandName: '',
          labelStyle: 'bold' as const,
          mergeConsecutive: false,
          fallbackLabel: 'کانفیگ',
        })),
      // متن‌های بلند به پاراگراف (با خط خالی) شکسته می‌شوند؛ پاراگراف بالای
      // آستانه quote می‌شود، زیر آستانه (تیتر/انتقالی) بولد می‌شود. مستقل
      // از وجود کانفیگ/لینک در پست.
      paragraphFormatting: z
        .object({
          enabled: z.boolean().default(false),
          paragraphThreshold: z.number().min(1).default(150),
        })
        .default(() => ({ enabled: false, paragraphThreshold: 150 })),
      // لینک‌های «ساب» (فایل متنی حاوی چند کانفیگ) با کلیدواژه از رو URL
      // تشخیص داده می‌شوند و هرکدام در <pre> مستقل خودشان (کپی تضمینی)
      // قرار می‌گیرند. لیست کلیدواژه ذاتاً کامل نیست.
      subLinkFormatting: z
        .object({
          enabled: z.boolean().default(false),
          keywordList: z
            .array(z.string())
            .default(() => ['sub', 'subscribe', 'config', 'v2ray', 'vless', 'vmess', 'trojan', 'vpn', 'clash', 'hysteria', 'fragment']),
        })
        .default(() => ({
          enabled: false,
          keywordList: ['sub', 'subscribe', 'config', 'v2ray', 'vless', 'vmess', 'trojan', 'vpn', 'clash', 'hysteria', 'fragment'],
        })),
    })
  ),
});

export const ConnectionCreateInputSchema = z.object({
  sourceChannel: z.string().min(1, 'کانال مبدأ الزامی است'),
  targetChannel: z.string().min(1, 'کانال مقصد الزامی است'),
  botToken: z.string().min(1, 'توکن ربات الزامی است'),
  config: TelegramConnectionConfigSchema.partial().optional(),
});

export const BulkActionSchema = z.object({
  ids: z.array(z.string()).min(1, 'لیست پل‌ها نامعتبر است'),
  action: z.enum(['start', 'stop', 'delete']),
});

export const AuthSetupSchema = z.object({
  username: z.string().min(1, 'نام کاربری الزامی است'),
  password: z.string().min(4, 'رمز عبور باید حداقل ۴ کاراکتر باشد'),
});

export const AuthLoginSchema = z.object({
  username: z.string().min(1, 'نام کاربری الزامی است'),
  password: z.string().min(1, 'رمز عبور الزامی است'),
});

export const AuthResetPasswordSchema = z.object({
  recoveryKey: z.string().min(1, 'کلید بازیابی الزامی است'),
  newPassword: z.string().min(4, 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد'),
});

export const AuthChangePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'رمز عبور فعلی الزامی است'),
  newPassword: z.string().min(4, 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد'),
});

// فاز ۳ب (references/roadmap.md): کتابخانه‌ی محتوا — ساخت پست
// زمان‌بندی‌شده‌ی دستی.
export const ScheduledPostCreateSchema = z.object({
  connectionId: z.string().min(1, 'انتخاب پل الزامی است'),
  text: z.string().min(1, 'متن پست نمی‌تواند خالی باشد').max(4096, 'متن نباید بیشتر از ۴۰۹۶ کاراکتر باشد'),
  scheduledAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'زمان زمان‌بندی نامعتبر است'),
});

// فاز ۲ (references/roadmap.md): بدنه‌ی webhook داخلی که سرویس Python
// (userbot/userbot_service.py) برای هر پیام تازه‌ی کشف‌شده از طریق
// Telethon push می‌کند. این schema شکل خروجی همان سرویس را دقیقاً
// آینه می‌کند — اگر شکل payload آنجا عوض شد، اینجا هم باید عوض شود.
export const IncomingPushMessageSchema = z.object({
  sourceChannel: z.string().min(1),
  messageId: z.number(),
  groupedId: z.number().nullable().optional(),
  text: z.string().default(''),
  html: z.string().default(''),
  mediaType: MediaTypeSchema.default('text'),
  mediaToken: z.string().nullable().optional(),
  // فاز ۲ (رفع باگ آلبوم، مرداد ۱۴۰۴/اوت ۲۰۲۶): وقتی mediaType
  // 'media_group' باشد، یوزربات همه‌ی رسانه‌های آلبوم را یک‌جا اینجا
  // می‌فرستد (به‌جای اینکه هر عضو آلبوم یک پیام جدا با mediaToken تکی
  // باشد — که قبلاً باعث می‌شد آلبوم به چند پست جدا در مقصد تبدیل شود).
  mediaTokens: z.array(z.string()).optional(),
  buttons: z.array(z.array(z.object({ text: z.string(), url: z.string() }))).nullable().optional(),
  publishedAt: z.string().nullable().optional(),
});

export type ReplaceRule = z.infer<typeof ReplaceRuleSchema>;
export type MediaType = z.infer<typeof MediaTypeSchema>;
export type TelegramConnectionConfig = z.infer<typeof TelegramConnectionConfigSchema>;
export type IncomingPushMessage = z.infer<typeof IncomingPushMessageSchema>;
export type ScheduledPostCreateInput = z.infer<typeof ScheduledPostCreateSchema>;
// توجه: تایپ `ConnectionCreateInput` عمداً اینجا export نشده — types.ts
// خودش یک interface با همین نام دارد (برای کلاینت) که ساختارش با این
// schema هم‌خوان است اما یکی نیست؛ export کردن دوباره‌اش از اینجا فقط
// سردرگمی نام ایجاد می‌کرد بدون فایده‌ی واقعی (چیزی از اینجا importش نمی‌کند).

/**
 * مقدار پیش‌فرض کامل config — جایگزین دو تابع جدای
 * TelegramService.getDefaultConfig() و getDefaultConnectionConfig().
 * هر دو حالا فقط این تابع را صدا می‌زنند.
 */
export function getDefaultTelegramConnectionConfig(): TelegramConnectionConfig {
  return TelegramConnectionConfigSchema.parse({});
}
