# تغییرات فاز ۰ — زیرساخت پایه

این فایل خلاصه‌ی همه‌ی کارهایی است که در فاز ۰ نقشه‌راه انجام شد. فایل کامل پروژه در `zagros-repost-phase0.zip` است.

## ⚠️ قبل از هر چیز

این تغییرات در یک محیط بدون دسترسی اینترنت نوشته شدند — یعنی **هیچ‌کدام واقعاً اجرا/تست نشده‌اند**. اولین کاری که باید بکنید:

```bash
# فایل‌های zip را جایگزین/merge کنید با پروژه‌ی واقعی‌تان، بعد:
npm install
npm run lint    # چک تایپ TypeScript
npm test        # اجرای تست‌های Vitest
npm run build   # ساخت خروجی نهایی
```

اگر هرکدام خطا داد، همان خطا را برایم بفرستید — چون کد را بدون اجرای واقعی نوشتم، ممکن است جای کوچکی (مثلاً نسخه‌ی یک پکیج) نیاز به اصلاح داشته باشد.

## چه چیزهایی اضافه/تغییر کرد

### ۱. منبع واحد حقیقت برای تنظیمات پل
- فایل جدید `src/schemas.ts`: تعریف کامل شکل/پیش‌فرض/اعتبارسنجی `TelegramConnectionConfig` با Zod.
- `src/types.ts`, `src/server/telegram.ts`, `src/lib/defaultConnectionConfig.ts` همگی به این فایل وصل شدند — دیگر سه‌جا تکرار نیست.

### ۲. اعتبارسنجی API
- `server.ts`: route های auth و connections حالا از schema های `src/schemas.ts` با هلپر `validateBody()` استفاده می‌کنند به‌جای چک دستی.

### ۳. لاگ ساختاریافته
- فایل جدید `src/server/logger.ts` (pino). همه‌ی `console.log/error/warn` قبلی در `server.ts`, `telegram.ts`, `storage.ts`, `gemini.ts` جایگزین شدند.

### ۴. تست‌پذیری + تست‌های خودکار
- `server.ts` رفکتور شد: `createApp()` (بدون listen) + `startServer()` (واقعی).
- تست‌های Vitest جدید: `tests/unit/telegram-service.test.ts`, `tests/unit/auth-service.test.ts`, `tests/unit/schemas.test.ts`, `tests/integration/api.test.ts`.
- `vitest.config.ts` و `tests/setup.ts` (DATA_DIR تستی جدا از production).

### ۵. Docker
- `Dockerfile` (multi-stage)، `.dockerignore`، `docker-compose.yml` (app + userbot).
- `userbot/Dockerfile` + `userbot/requirements.txt` — این دومی اصلاً وجود نداشت، یک گپ واقعی پروژه بود که پر شد.

### ۶. CI
- `.github/workflows/ci.yml`: روی هر push/PR به `main`، lint + test + build خودکار.

### ۷. مستندات
- `.env.example`, `ecosystem.config.cjs`, `render.yaml`: متغیر `LOG_LEVEL` و متغیرهای userbot اضافه شدند.
- اسکیل پروژه (`/mnt/skills/user/zagros-repost-app/`) کامل به‌روز شد: قوانین جدید، نقشه‌ی فایل جدید، و `references/roadmap.md` با لاگ پیشرفت فاز ۰.

## قدم بعدی

بعد از این‌که `npm install && npm test` را روی سیستم واقعی خودتان اجرا کردید و نتیجه را تأیید کردید، آماده‌ایم بریم سراغ فاز ۱ (مهاجرت دیتابیس به PostgreSQL) یا فاز ۲ (موتور Telethon).
