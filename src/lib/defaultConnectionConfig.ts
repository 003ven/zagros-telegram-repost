import { getDefaultTelegramConnectionConfig, type TelegramConnectionConfig } from '../schemas';

/**
 * دیگر پیش‌فرض جدای خودش را نگه نمی‌دارد — مستقیم از src/schemas.ts
 * (منبع واحد حقیقت، اشتراکی بین کلاینت و سرور) می‌خواند. هم
 * AddConnectionForm (پل تازه) و هم ConnectionRulesModal (ویرایش پل
 * موجود) از همین یک تابع استفاده می‌کنند.
 */
export function getDefaultConnectionConfig(): TelegramConnectionConfig {
  return getDefaultTelegramConnectionConfig();
}
