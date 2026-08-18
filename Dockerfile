# --- مرحله‌ی build: نصب همه‌ی وابستگی‌ها (dev + prod) و ساخت خروجی ---
FROM node:22-alpine AS build
WORKDIR /app

# schema.prisma باید قبل از `npm ci` حاضر باشد چون postinstall خودکار
# `prisma generate` را صدا می‌زند (نگاه کن به package.json) و بدون
# schema شکست می‌خورد.
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

# --- مرحله‌ی اجرا ---
# عمداً به‌جای یک `npm ci --omit=dev` تازه، مستقیم node_modules
# مرحله‌ی build (که شامل @prisma/client تولیدشده هم هست) کپی می‌شود؛
# چون نصب production-only دوباره به CLI پکیج `prisma` (که خودش
# devDependency است) برای generate نیاز داشت و ترتیب/مرحله را
# پیچیده می‌کرد. حجم ایمیج کمی بزرگ‌تر می‌شود ولی ساده و قابل‌اطمینان
# است — برای این مقیاس پروژه معامله‌ی درستی است.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
