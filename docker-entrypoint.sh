#!/bin/sh
set -e

# قبل از هر بار بالا آمدن کانتینر، migration های Prisma را اعمال کن
# (idempotent است — اگر migration ای جدید نباشد کاری انجام نمی‌دهد).
# برای دیپلوی با چند replica هم‌زمان، این باید به یک init job جدا
# منتقل شود؛ برای این پروژه (تک‌instance) همینجا کافی و ساده‌تر است.
echo "در حال اعمال migration های دیتابیس..."
npx prisma migrate deploy

echo "شروع سرور..."
exec node dist/server.cjs
