/**
 * لاگر ساختاریافته‌ی مرکزی سرور — جایگزین console.log/console.error
 * پراکنده. در dev با pino-pretty خروجی خوانا و رنگی می‌دهد؛ در production
 * خروجی JSON خام می‌دهد (مناسب برای جمع‌آوری توسط ابزارهایی مثل
 * Grafana Loki / Datadog / هر log aggregator دیگر در آینده).
 *
 * این جدا از سیستم لاگ کاربرنهایی پروژه است (Storage.addLog که در
 * data/logs.json ذخیره می‌شود و در UI نمایش داده می‌شود) — logger اینجا
 * برای خطاهای سطح سیستم/عملیاتی (process, HTTP, خطاهای غیرمنتظره) است،
 * نه برای رویدادهای کاربرپسند هر پل.
 */
import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
  transport:
    !isProduction && !isTest
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
