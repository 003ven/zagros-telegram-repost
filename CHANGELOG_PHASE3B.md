# تغییرات فاز ۳ب — کتابخانه‌ی محتوا، Webhook خروجی، Uptime واقعی

با این، **تمام آیتم‌های نقشه‌راه (به‌جز چندکاربری که به‌درخواست شما برای همیشه حذف شد) تکمیل شدند.**

## ۱. کتابخانه‌ی محتوا (Content Library)

یک دکمه‌ی جدید در نوار بالا («کتابخانه‌ی محتوا») باز می‌کند: می‌توانید پست‌های متنی بنویسید و برای یک زمان مشخص در آینده زمان‌بندی کنید — مستقل از ریپوست خودکار. هر ۶۰ ثانیه سرور چک می‌کند پستی due شده یا نه و ارسالش می‌کند.

**محدودیت این نسخه:** فقط متن پشتیبانی می‌شود، نه عکس/ویدیو. افزودن رسانه یک قدم بعدی کوچک است (زیرساختش — `sendMediaDirect` — از قبل آماده است، فقط باید به این جریان وصل شود).

هر پست زمان‌بندی‌شده باید به یک «پل» موجود وصل باشد (چون از توکن ربات و کانال مقصد همان پل استفاده می‌کند) — نیازی به ساخت پل جداگانه‌ای نیست.

## ۲. Webhook خروجی

در تنظیمات هر پل (تب «تمیزسازی»)، یک فیلد جدید «Webhook خروجی» اضافه شد. اگر پر کنید، بعد از هر ارسال موفق (چه از ریپوست خودکار، چه از کتابخانه‌ی محتوا) یک درخواست POST با جزئیات پست به آن آدرس فرستاده می‌شود — می‌توانید با Zapier، n8n، یا هر اسکریپت شخصی وصلش کنید. شکل دقیق داده در `docs/outbound-webhooks.md`.

## ۳. مستندسازی API عمومی

`docs/openapi.yaml` همه‌ی endpoint های اصلی پروژه را مستند می‌کند — می‌توانید آن را در Postman/Insomnia import کنید یا برای ساخت ابزارهای شخصی خودتان استفاده کنید.

## ۴. نمودار Uptime واقعی

نمودار پایین صفحه دیگر عدد تصادفی نشان نمی‌دهد — سرور هر ۵ دقیقه یک نمونه از سلامت پل‌ها ثبت می‌کند و نمودار میانگین ساعتی واقعی ۲۴ ساعت اخیر را نشان می‌دهد.

## چه چیزهایی تغییر کرد

- `prisma/schema.prisma` + یک migration جدید: مدل‌های `UptimeSample`, `ScheduledPost`.
- `src/server/storage.ts`: متدهای uptime + scheduled posts.
- `src/server/telegram.ts`: `sendScheduledPostText`, `runDueScheduledPosts`, `notifyOutboundWebhook`.
- `server.ts`: endpoint های جدید (`/api/uptime-history`, `/api/scheduled-posts`, `/api/scheduled-posts/:id`) + دو scheduler پس‌زمینه (`startUptimeSampler`, `startScheduledPostRunner`).
- `src/schemas.ts`: `webhookUrl` در config هر پل، `ScheduledPostCreateSchema`.
- `src/components/ContentLibraryModal.tsx` (کامپوننت جدید)، `Header.tsx` (دکمه‌ی جدید)، `UptimeChart.tsx` (بازنویسی کامل)، `ConnectionRulesModal.tsx` (فیلد webhook).
- `docs/openapi.yaml`, `docs/outbound-webhooks.md` (مستندات جدید).
- تست جدید: `tests/integration/content-library.test.ts`.
- اسکیل پروژه کامل به‌روز شد — نقشه‌راه حالا نشان می‌دهد همه‌چیز (به‌جز چندکاربری حذف‌شده) تکمیل شده.

## ⚠️ یادآوری همیشگی

مثل همه‌ی فازهای قبل، این کد در sandboxی بدون اینترنت نوشته شد و **اجرا/تست واقعی نشده**. قبل از اعتماد کامل، حتماً `npm install && npm run build && npm test` را روی سیستم واقعی خودتان اجرا کنید.
