// دسته‌بندی موضوعی پل‌ها (کانکشن‌ها) — برای گروه‌بندی و فیلتر کردن
// لیست پل‌ها در پنل. دسته‌ها هم می‌توانند از پیش‌فرض‌ها انتخاب شوند،
// هم کاربر می‌تواند دسته‌ی دلخواه جدید تعریف کند (که در localStorage
// نگه‌داری می‌شود تا حتی قبل از تخصیص به یک پل هم در لیست بماند).
import { TelegramConnection } from '../types';

export const DEFAULT_CATEGORIES: string[] = [
  'فوتبال',
  'گیم',
  'فیلم و سریال',
  'موزیک',
  'اخبار',
  'VPN و امنیت',
  'تکنولوژی',
  'سرگرمی',
  'سایر',
];

const CUSTOM_CATEGORIES_KEY = 'zagros_custom_categories';

export function getCustomCategories(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

export function addCustomCategory(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    const current = getCustomCategories();
    if (!current.includes(trimmed)) {
      localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify([...current, trimmed]));
    }
  } catch {
    // ignore
  }
}

/**
 * لیست کامل دسته‌ها: پیش‌فرض‌ها + دسته‌های سفارشی ذخیره‌شده +
 * هر دسته‌ای که همین الان روی یکی از پل‌ها تنظیم شده (حتی اگر جای
 * دیگری ثبت نشده باشد) — تا هیچ دسته‌ای از قلم نیفتد.
 */
export function getAllCategories(connections: TelegramConnection[]): string[] {
  const set = new Set<string>(DEFAULT_CATEGORIES);
  getCustomCategories().forEach((c) => set.add(c));
  connections.forEach((c) => {
    const cat = c.config?.category;
    if (cat && cat.trim()) set.add(cat.trim());
  });
  return Array.from(set);
}

export function getConnectionCategory(conn: TelegramConnection): string {
  return conn.config?.category?.trim() || 'سایر';
}
