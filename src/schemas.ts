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
