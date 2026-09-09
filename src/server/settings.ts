import { prisma } from './storage';
import { logger } from './logger';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';

/**
 * رجیستری تنظیمات سیستم قابل مدیریت از پنل. هر ورودی می‌گوید این کلید
 * چه اسم env متناظری دارد (برای fallback وقتی هنوز از پنل ذخیره نشده)،
 * آیا حساس است (باید در UI ماسک/پنهان شود) و روی کدام سرویس اثر
 * می‌گذارد — چون USERBOT_SECRET/TELEGRAM_API_ID/TELEGRAM_API_HASH را
 * سرویس پایتون یوزربات هم لازم دارد و تغییرشان باید آن سرویس را
 * ری‌استارت کند (نگاه کن به syncUserbotEnvAndRestart پایین همین فایل).
 */
export interface SettingDef {
  key: string;
  label: string;
  description: string;
  sensitive: boolean;
  appliesTo: 'node' | 'userbot' | 'both';
  envVar: string;
}

export const SETTINGS_REGISTRY: SettingDef[] = [
  {
    key: 'GEMINI_API_KEY',
    label: 'کلید API جمینای (Gemini)',
    description: 'برای فعال‌سازی بازنویسی/ترجمه‌ی هوشمند پست‌ها با هوش مصنوعی. بدون این مقدار، گزینه‌های AI در تنظیمات هر پل بی‌اثر می‌مانند.',
    sensitive: true,
    appliesTo: 'node',
    envVar: 'GEMINI_API_KEY',
  },
  {
    key: 'ADMIN_RECOVERY_KEY',
    label: 'کلید بازیابی رمز عبور ادمین',
    description: 'در صورت فراموشی رمز عبور پنل، برای بازنشانی آن از صفحه‌ی ورود استفاده می‌شود. جایی امن و خارج از این سرور یادداشتش کنید.',
    sensitive: true,
    appliesTo: 'node',
    envVar: 'ADMIN_RECOVERY_KEY',
  },
  {
    key: 'TELEGRAM_API_BASE_URL',
    label: 'آدرس Local Bot API Server',
    description: 'اختیاری. اگر یک Local Bot API Server (برای آپلود فایل تا ۲ گیگ) دارید آدرسش را بگذارید؛ خالی یعنی استفاده از api.telegram.org.',
    sensitive: false,
    appliesTo: 'node',
    envVar: 'TELEGRAM_API_BASE_URL',
  },
  {
    key: 'USERBOT_SERVICE_URL',
    label: 'آدرس سرویس یوزربات',
    description: 'آدرسی که سرویس پایتون یوزربات (برای دریافت اسناد/فایل‌های بدون لینک مستقیم) روی آن در حال اجراست.',
    sensitive: false,
    appliesTo: 'node',
    envVar: 'USERBOT_SERVICE_URL',
  },
  {
    key: 'USERBOT_RELAY_CHANNEL',
    label: 'کانال رله‌ی یوزربات',
    description: 'کانالی که یوزربات فایل‌های بدون لینک مستقیم را موقتاً برای دریافت آنجا ریلی می‌کند.',
    sensitive: false,
    appliesTo: 'node',
    envVar: 'USERBOT_RELAY_CHANNEL',
  },
  {
    key: 'NODE_WEBHOOK_URL',
    label: 'آدرس Webhook برگشتی به Node',
    description: 'آدرسی که سرویس یوزربات پیام‌های زنده‌ی رسیده را به آن پوش می‌کند — باید به همین سرور اشاره کند. تغییر این مقدار سرویس یوزربات را ری‌استارت می‌کند.',
    sensitive: false,
    appliesTo: 'userbot',
    envVar: 'NODE_WEBHOOK_URL',
  },
  {
    key: 'USERBOT_SECRET',
    label: 'کلید مشترک Node و یوزربات',
    description: 'برای احراز هویت درخواست‌های بین Node و سرویس یوزربات. باید در هر دو طرف یکسان باشد — تغییرش سرویس یوزربات را خودکار ری‌استارت می‌کند.',
    sensitive: true,
    appliesTo: 'both',
    envVar: 'USERBOT_SECRET',
  },
  {
    key: 'TELEGRAM_API_ID',
    label: 'Telegram API ID',
    description: 'از my.telegram.org — فقط برای سرویس یوزربات لازم است. تغییرش سرویس یوزربات را ری‌استارت می‌کند.',
    sensitive: false,
    appliesTo: 'userbot',
    envVar: 'TELEGRAM_API_ID',
  },
  {
    key: 'TELEGRAM_API_HASH',
    label: 'Telegram API Hash',
    description: 'از my.telegram.org — فقط برای سرویس یوزربات لازم است. تغییرش سرویس یوزربات را ری‌استارت می‌کند.',
    sensitive: true,
    appliesTo: 'userbot',
    envVar: 'TELEGRAM_API_HASH',
  },
  {
    key: 'ALERT_BOT_TOKEN',
    label: 'توکن بات هشدار خطا',
    description: 'فاز ۷: توکن باتی که پیام هشدار «فلان پل پشت‌سرهم خطا می‌دهد» را می‌فرستد. می‌تواند همان بات پل‌ها یا یک بات جدا باشد. خالی یعنی این فیچر کاملاً خاموش است.',
    sensitive: true,
    appliesTo: 'node',
    envVar: 'ALERT_BOT_TOKEN',
  },
  {
    key: 'ALERT_CHAT_ID',
    label: 'چت مقصد هشدار خطا',
    description: 'فاز ۷: شناسه یا یوزرنیم چتی که بات هشدار خطا پیام را به آن می‌فرستد (مثلاً چت خصوصی خودتان با آن بات، یا یک کانال جدا). خالی یعنی این فیچر خاموش است.',
    sensitive: false,
    appliesTo: 'node',
    envVar: 'ALERT_CHAT_ID',
  },
  {
    key: 'ALERT_ERROR_THRESHOLD',
    label: 'آستانه‌ی خطای متوالی برای هشدار',
    description: 'فاز ۷: بعد از چند خطای متوالی پشت‌سرهم روی یک پل، هشدار فرستاده شود. پیش‌فرض اگر خالی باشد: ۵.',
    sensitive: false,
    appliesTo: 'node',
    envVar: 'ALERT_ERROR_THRESHOLD',
  },
  {
    key: 'ALERT_COOLDOWN_MINUTES',
    label: 'حداقل فاصله بین دو هشدار (دقیقه)',
    description: 'فاز ۷: بعد از فرستادن یک هشدار برای یک پل، حداقل چند دقیقه صبر شود قبل از هشدار بعدی برای همان پل (تا اسپم نشود، ولی اگر پل مدت‌ها خراب ماند، دوباره یادآوری شود). پیش‌فرض اگر خالی باشد: ۶۰.',
    sensitive: false,
    appliesTo: 'node',
    envVar: 'ALERT_COOLDOWN_MINUTES',
  },
  {
    key: 'CIRCUIT_BREAKER_THRESHOLD',
    label: 'آستانه‌ی مدار باز',
    description: 'فاز ۸: بعد از چند خطای متوالی روی یک پل، تا مدتی دیگر اصلاً تلاش برای ارسال پست‌های آن پل نمی‌شود (برای جلوگیری از هدررفت منابع روی پلی که کاملاً خراب است). باید بزرگ‌تر از آستانه‌ی هشدار باشد. پیش‌فرض اگر خالی: ۱۰.',
    sensitive: false,
    appliesTo: 'node',
    envVar: 'CIRCUIT_BREAKER_THRESHOLD',
  },
  {
    key: 'CIRCUIT_BREAKER_COOLDOWN_MINUTES',
    label: 'مدت باز ماندن مدار (دقیقه)',
    description: 'فاز ۸: بعد از باز شدن مدار یک پل، چند دقیقه صبر شود قبل از تلاش بعدی. برای حالت poll، پست‌های ازدست‌رفته‌ی این بازه بعداً خودکار گرفته می‌شوند؛ برای حالت push (زنده)، از دست می‌روند. پیش‌فرض اگر خالی: ۱۵.',
    sensitive: false,
    appliesTo: 'node',
    envVar: 'CIRCUIT_BREAKER_COOLDOWN_MINUTES',
  },
];

const USERBOT_ECOSYSTEM_PATH = path.join(process.cwd(), 'userbot', 'ecosystem.userbot.config.cjs');
const PM2_BIN = '/usr/bin/pm2';

/**
 * موقع بوت سرور صدا زده می‌شود (قبل از استارت مانیتورینگ پل‌ها) تا هر
 * مقداری که قبلاً از پنل ذخیره شده، روی process.env بنشیند — همان‌طور
 * که انگار در .env.local نوشته شده بود. بقیه‌ی کدبیس (gemini.ts,
 * auth.ts, telegram.ts) دست‌نخورده می‌ماند چون هنوز فقط process.env را
 * می‌خوانند؛ این تابع همان env را «پیش از خواندن» تزریق می‌کند.
 */
export async function applyDbSettingsToProcessEnv(): Promise<void> {
  try {
    const rows = await prisma.systemSetting.findMany();
    for (const row of rows) {
      const def = SETTINGS_REGISTRY.find((s) => s.key === row.key);
      if (def) {
        process.env[def.envVar] = row.value;
      }
    }
  } catch (err) {
    logger.warn({ err }, 'خواندن تنظیمات سیستم از دیتابیس هنگام بوت شکست خورد — فقط .env استفاده می‌شود');
  }
}

/** لیست تنظیمات برای نمایش در پنل، همراه با مقدار فعلی مؤثر و منبعش. */
export async function getAllSettingsForPanel(): Promise<
  Array<SettingDef & { value: string; source: 'db' | 'env' | 'none' }>
> {
  const rows = await prisma.systemSetting.findMany();
  const dbMap = new Map(rows.map((r) => [r.key, r.value]));
  return SETTINGS_REGISTRY.map((def) => {
    if (dbMap.has(def.key)) {
      return { ...def, value: dbMap.get(def.key) as string, source: 'db' as const };
    }
    const envVal = process.env[def.envVar];
    if (envVal) {
      return { ...def, value: envVal, source: 'env' as const };
    }
    return { ...def, value: '', source: 'none' as const };
  });
}

/**
 * تنظیمات ارسالی از پنل را ذخیره می‌کند: در دیتابیس persist می‌شوند و
 * بلافاصله روی process.env همین پروسه هم اعمال می‌شوند (بدون نیاز به
 * ری‌استارت Node). اگر هرکدام از کلیدهای مربوط به یوزربات تغییر کرده
 * باشد، true برمی‌گرداند تا caller سرویس یوزربات را هم همگام‌سازی کند.
 */
export async function setSettings(values: Record<string, string>): Promise<{ userbotChanged: boolean }> {
  let userbotChanged = false;
  for (const [key, value] of Object.entries(values)) {
    const def = SETTINGS_REGISTRY.find((s) => s.key === key);
    if (!def) continue;
    await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    process.env[def.envVar] = value;
    if (def.appliesTo === 'userbot' || def.appliesTo === 'both') {
      userbotChanged = true;
    }
  }
  return { userbotChanged };
}

/**
 * چهار مقدار مربوط به سرویس یوزربات را (که pm2 آن‌ها را از
 * userbot/ecosystem.userbot.config.cjs به‌صورت رشته‌ی literal تزریق
 * می‌کند، نه از یک فایل .env) بازنویسی و سرویس را با pm2 ری‌استارت
 * می‌کند تا مقدار جدید واقعاً اعمال شود.
 */
export async function syncUserbotEnvAndRestart(): Promise<{ success: boolean; error?: string }> {
  let content: string;
  try {
    content = fs.readFileSync(USERBOT_ECOSYSTEM_PATH, 'utf-8');
  } catch {
    return { success: false, error: `فایل تنظیمات یوزربات پیدا نشد: ${USERBOT_ECOSYSTEM_PATH}` };
  }

  const fields: Array<[string, string]> = [
    ['API_ID', process.env.TELEGRAM_API_ID || ''],
    ['API_HASH', process.env.TELEGRAM_API_HASH || ''],
    ['USERBOT_SECRET', process.env.USERBOT_SECRET || ''],
    ['NODE_WEBHOOK_URL', process.env.NODE_WEBHOOK_URL || ''],
  ];

  for (const [envKeyInFile, newValue] of fields) {
    if (!newValue) continue; // مقدار خالی را جایگزین نکن — همان قبلی بماند
    const re = new RegExp(`(\\b${envKeyInFile}\\s*:\\s*)"[^"]*"`);
    if (re.test(content)) {
      content = content.replace(re, (_m, prefix) => `${prefix}"${newValue.replace(/"/g, '\\"')}"`);
    }
  }

  try {
    fs.writeFileSync(USERBOT_ECOSYSTEM_PATH, content, 'utf-8');
  } catch {
    return { success: false, error: 'نوشتن فایل تنظیمات یوزربات شکست خورد' };
  }

  return new Promise((resolve) => {
    execFile(PM2_BIN, ['restart', USERBOT_ECOSYSTEM_PATH, '--update-env'], { timeout: 20000 }, (err, _stdout, stderr) => {
      if (err) {
        logger.error({ err, stderr }, 'ری‌استارت سرویس یوزربات بعد از تغییر تنظیمات شکست خورد');
        resolve({ success: false, error: (stderr && stderr.toString()) || err.message });
        return;
      }
      execFile(PM2_BIN, ['save'], { timeout: 10000 }, (saveErr) => {
        if (saveErr) {
          logger.warn({ err: saveErr }, 'pm2 save بعد از ری‌استارت یوزربات شکست خورد (غیر بحرانی)');
        }
        resolve({ success: true });
      });
    });
  });
}
