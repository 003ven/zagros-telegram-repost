# Webhook خروجی (فاز ۳ب)

اگر برای یک پل، فیلد `webhookUrl` را در تب «تمیزسازی» تنظیم کنید (یا مستقیم در `config.webhookUrl`)، بعد از هر رویداد زیر یک درخواست `POST` غیربلاک‌کننده به همان آدرس فرستاده می‌شود. اگر آدرس شما خطا بدهد یا timeout شود (۱۰ ثانیه)، فقط در لاگ‌های سرور ثبت می‌شود — هرگز جریان اصلی ارسال به تلگرام را نمی‌شکند.

## هدرها

```
Content-Type: application/json
```

هیچ هدر احراز هویتی فرستاده نمی‌شود (چون شما خودتان آدرس را انتخاب می‌کنید). اگر endpointتان نیاز به احراز هویت دارد، یک secret را داخل خود URL بگذارید (مثلاً `https://example.com/webhook?secret=xyz`).

## رویداد `post_forwarded`

بعد از ریپوست موفق یک پست از پایپ‌لاین خودکار:

```json
{
  "connectionId": "abc123",
  "sourceChannel": "@source",
  "targetChannel": "@target",
  "event": "post_forwarded",
  "postId": 4521,
  "mediaType": "photo",
  "textPreview": "اولین ۲۰۰ کاراکتر متن نهایی..."
}
```

## رویداد `scheduled_post_sent`

بعد از ارسال موفق یک پست از «کتابخانه‌ی محتوا»:

```json
{
  "connectionId": "abc123",
  "sourceChannel": "@source",
  "targetChannel": "@target",
  "event": "scheduled_post_sent",
  "scheduledPostId": "xyz789",
  "textPreview": "اولین ۲۰۰ کاراکتر متن..."
}
```

## نکات برای توسعه‌ی بعدی

- منبع واحد این منطق: `TelegramService.notifyOutboundWebhook` در `src/server/telegram.ts`.
- اگر رویداد جدیدی اضافه کردی، این فایل را هم آپدیت کن.
- فعلاً retry خودکار ندارد — اگر endpoint شما موقتاً پایین باشد، آن یک رویداد گم می‌شود.
