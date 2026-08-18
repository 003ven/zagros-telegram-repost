// NOTE: ReplaceRule و TelegramConnectionConfig از این‌جا منتقل شدند به
// src/schemas.ts (شمای Zod) تا شکل داده، پیش‌فرض، و اعتبارسنجی همه از
// یک منبع بیایند به‌جای سه تعریف موازی. اینجا فقط re-export می‌شوند تا
// import های موجود (`from '../types'`) در بقیه‌ی کدبیس دست‌نخورده بمانند.
export type { ReplaceRule, TelegramConnectionConfig, MediaType } from './schemas';

export type ConnectionStatus = 'active' | 'inactive' | 'error';

export interface TelegramConnection {
  id: string;
  sourceChannel: string;
  targetChannel: string;
  botToken: string;
  status: ConnectionStatus;
  lastMessageId: number | null;
  lastReceivedAt: string | null;
  transferredCount: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  consecutiveErrors?: number;
  pollIntervalMs: number;
  config: TelegramConnectionConfig;
}

export interface TelegramMessage {
  id: number;
  channelUsername: string;
  text: string;
  htmlText: string;
  mediaType: MediaType;
  mediaUrls: string[];
  caption: string | null;
  publishedAt: string;
  mediaGroupId?: string;
  /** "Connect"-style buttons attached under the post (e.g. proxy links),
   * as rows of {text, url} — mirrors Telegram's own inline_keyboard shape. */
  inlineKeyboard?: { text: string; url: string }[][];
}

export interface LogEntry {
  id: string;
  connectionId: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  details?: string;
}

export interface ConnectionCreateInput {
  sourceChannel: string;
  targetChannel: string;
  botToken: string;
  config?: Partial<TelegramConnectionConfig>;
}

export interface BotValidationResult {
  valid: boolean;
  botName?: string;
  botUsername?: string;
  error?: string;
}

export interface ChannelPreviewResult {
  username: string;
  title: string;
  subscribers?: string;
  avatarUrl?: string;
  messages: TelegramMessage[];
  error?: string;
}

// فاز ۳ب (references/roadmap.md): کتابخانه‌ی محتوا — پست دستی
// زمان‌بندی‌شده، جدا از پایپ‌لاین ریپوست خودکار.
export type ScheduledPostStatus = 'pending' | 'sent' | 'failed' | 'canceled';

export interface ScheduledPost {
  id: string;
  connectionId: string;
  text: string;
  scheduledAt: string;
  status: ScheduledPostStatus;
  createdAt: string;
  sentAt: string | null;
  error: string | null;
}
