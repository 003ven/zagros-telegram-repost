# تغییرات فاز ۱ — مهاجرت دیتابیس (JSON → PostgreSQL)

## ⚠️ مهم‌تر از همه: این فاز نیاز به یک اقدام دستی از شما دارد

بر خلاف فاز ۰، فاز ۱ فقط «کد جدید» نیست — واقعاً **شکل ذخیره‌سازی داده عوض شده**. قبل از دیپلوی روی سرور واقعی:

1. یک Postgres تهیه کنید (ساده‌ترین راه: همان `docker compose up -d postgres` که در این پروژه هست؛ یا یک سرویس ابری مثل Neon/Supabase/Render Postgres).
2. `DATABASE_URL` را در `.env.local` (یا env سرور) بگذارید.
3. `npx prisma migrate deploy` را اجرا کنید (جدول‌ها را می‌سازد).
4. **اگر روی سرور واقعی از قبل پل/لاگ دارید:** `npm run db:migrate-from-json` را اجرا کنید تا `data/connections.json` و `data/logs.json` فعلی به Postgres منتقل شوند. این اسکریپت idempotent است (اجرای دوباره‌اش مشکلی ایجاد نمی‌کند).
5. بعد از اطمینان از صحت داده در Postgres (مثلاً با `npx prisma studio`)، فایل‌های JSON قدیمی را فقط برای اطمینان یک‌جا بکاپ بگیرید — اسکریپت آن‌ها را پاک نمی‌کند، خودتان دستی نگه دارید.

## ⚠️ ریسک شناخته‌شده در این تحویل

فایل migration اولیه (`prisma/migrations/20260814000000_init/migration.sql`) را **دستی نوشتم**، نه با اجرای واقعی `prisma migrate dev` روی یک Postgres واقعی — چون sandbox توسعه‌ی من دسترسی اینترنت/دیتابیس نداشت. با دقت و بر اساس `prisma/schema.prisma` نوشته شده و باید درست باشد، ولی **حتماً قبل از استفاده‌ی واقعی، یک بار روی یک Postgres تستی `npx prisma migrate deploy` را اجرا کنید** و مطمئن شوید بدون خطا اجرا می‌شود.

## چه چیزی منتقل شد، چه چیزی نه (تصمیم آگاهانه)

- **منتقل شد:** پل‌ها (`Connection`) و لاگ‌ها (`LogEntry`) — این دو جایی بودند که فایل JSON واقعاً مشکل داشت (بدون تراکنش، race condition روی نوشتن هم‌زمان).
- **منتقل نشد:** حساب ادمین و session ورود (`src/server/auth.ts`) — عمداً دست‌نخورده ماند تا این مهاجرت یک قدم کوچک و قابل‌بررسی بماند. اگر می‌خواهید این بخش هم به دیتابیس منتقل شود (که مشکل شناخته‌شده‌ی «logout با هر ری‌استارت سرور» را هم حل می‌کند)، این یک قدم بعدی جداست.

## چه چیزهایی تغییر کرد

- `prisma/schema.prisma` (جدید): تعریف مدل‌های `Connection` و `LogEntry`.
- `prisma/migrations/` (جدید): فایل SQL اولیه (نگاه کن به هشدار بالا).
- `prisma/migrate-from-json.ts` (جدید): اسکریپت مهاجرت داده‌ی موجود.
- `src/server/storage.ts`: بازنویسی کامل — از فایل JSON به Prisma/Postgres، همه‌ی متدها async شدند.
- `server.ts` و `src/server/telegram.ts`: همه‌ی محل‌هایی که `Storage.*` را صدا می‌زدند (حدود ۵۵ مورد جمعاً) به `async`/`await` تبدیل شدند.
- `docker-compose.yml`: سرویس Postgres اضافه شد.
- `Dockerfile` + `docker-entrypoint.sh`: ترتیب صحیح `prisma generate` (در build) و `prisma migrate deploy` (در استارت واقعی) تنظیم شد.
- `.env.example`: متغیر `DATABASE_URL` مستند شد.
- `.github/workflows/ci.yml`: یک Postgres موقت برای CI اضافه شد.
- `package.json`: `@prisma/client`, `prisma` و اسکریپت‌های `db:migrate`, `db:studio`, `db:migrate-from-json` اضافه شدند.
- `tests/integration/api.test.ts`: حالا اگر `DATABASE_URL` نباشد به‌جای شکست گیج‌کننده، خودکار skip می‌شود؛ اگر باشد، هر اجرا دیتابیس تست را قبل و بعد پاک می‌کند.
- اسکیل پروژه (`/mnt/skills/user/zagros-repost-app/`) کامل به‌روز شد.

## قدم بعدی

بعد از این‌که مهاجرت را روی سیستم/سرور واقعی خودتان تأیید کردید (خصوصاً migration دستی‌نوشته‌شده)، آماده‌ایم فاز ۲ (موتور Telethon به‌جای اسکرِیپر) یا تکمیل مهاجرت auth به دیتابیس را شروع کنیم.
