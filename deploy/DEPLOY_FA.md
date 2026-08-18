# راهنمای اجرا روی VPS شخصی

این فایل خلاصه‌ی دستورات لازم برای بالا آوردن «زاگرس ریپوست» روی یک سرور اوبونتو/دبیان است.
جزئیات کامل هر مرحله در پیام چت آمده؛ این فقط برای کپی سریع دستورات است.

## 1) نصب Node.js روی سرور
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v && npm -v
```

## 2) آپلود پروژه
از روی سیستم خودتان (نه روی سرور):
```bash
scp -r zagros-repost user@YOUR_SERVER_IP:/home/user/
```
یا با git clone روی خود سرور اگر پروژه را در گیت‌هاب گذاشته‌اید.

## 3) نصب پکیج‌ها و تنظیم env
```bash
cd /home/user/zagros-repost
npm install
cp .env.example .env.local
nano .env.local   # مقادیر GEMINI_API_KEY / ADMIN_RECOVERY_KEY / DATA_DIR / DATABASE_URL را پر کنید
```

## 3.5) دیتابیس Postgres (فاز ۱ — الزامی)
از فاز ۱ به بعد، پل‌ها و لاگ‌ها روی PostgreSQL هستند، نه فایل. یا یک Postgres محلی نصب کنید (`sudo apt-get install postgresql`) یا از یک سرویس ابری (Neon/Supabase/...) استفاده کنید، رشته‌ی اتصال را در `DATABASE_URL` (داخل `.env.local`) بگذارید، بعد:
```bash
npx prisma migrate deploy
```
اگر از نسخه‌ی قبل از فاز ۱ ارتقا می‌دهید و داده‌ی قدیمی (`data/connections.json`) دارید:
```bash
npm run db:migrate-from-json
```

## 4) تست سریع (حالت dev)
```bash
npm run dev
```
از سیستم خودتان: `curl http://YOUR_SERVER_IP:3000` یا باز کردن آدرس در مرورگر
(اگر فایروال پورت 3000 را بسته، فقط برای تست موقت بازش کنید).
با Ctrl+C متوقفش کنید.

## 5) بیلد نسخه‌ی production و اجرا با pm2
```bash
npm run build
sudo npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # دستوری که چاپ می‌کند را اجرا کنید تا با ری‌بوت سرور بالا بیاید
```

## 6) Nginx + دامنه (اختیاری ولی توصیه‌شده)
```bash
sudo apt-get install -y nginx
sudo cp deploy/nginx-zagros-repost.conf /etc/nginx/sites-available/zagros-repost
sudo nano /etc/nginx/sites-available/zagros-repost   # دامنه را جایگزین کنید
sudo ln -s /etc/nginx/sites-available/zagros-repost /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

SSL رایگان با Let's Encrypt:
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 7) فایروال
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 8) تست نهایی
- آدرس دامنه (یا IP:3000 اگر بدون Nginx) را باز کنید
- چون اولین بار است، فرم ساخت حساب ادمین (نام کاربری + رمز) نمایش داده می‌شود
- بعد از ساخت حساب، از داخل پنل یک اتصال تلگرام بسازید و با دکمه‌ی
  «ارسال تست» (`/api/connections/:id/test-send`) درستی توکن ربات و کانال مقصد را بررسی کنید

## نکات مهم
- بدون دیسک پایدار، هر ری‌استارت سرور یا pm2، اگر DATA_DIR روی یک مسیر معمولی
  دیسک سرور باشد مشکلی نیست (برخلاف Render رایگان که فایل‌سیستمش موقتی است).
  فقط مطمئن شوید مسیر DATA_DIR روی یک پارتیشن دائمی سرور است، نه /tmp.
- لاگ‌های pm2: `pm2 logs zagros-repost`
- ری‌استارت بعد از تغییر کد: `npm run build && pm2 restart zagros-repost`
- [فاز ۲] اگر سرویس یوزربات (`userbot/`) را با `NODE_WEBHOOK_URL` تنظیم کنید،
  موتور push-based زنده جایگزین اسکرِیپ دوره‌ای می‌شود — نیازی به تغییر
  چیز دیگری نیست، `TelegramService.startMonitoring` خودش تشخیص می‌دهد.
  اگر یوزربات را اجرا نمی‌کنید یا NODE_WEBHOOK_URL را ست نکنید، همه‌چیز
  دقیقاً مثل قبل با اسکرِیپ دوره‌ای کار می‌کند.
