import { describe, it, expect } from 'vitest';
import {
  TelegramConnectionConfigSchema,
  getDefaultTelegramConnectionConfig,
  ConnectionCreateInputSchema,
  AuthLoginSchema,
} from '../../src/schemas';

describe('TelegramConnectionConfigSchema', () => {
  it('produces a complete config from an empty object', () => {
    const result = TelegramConnectionConfigSchema.parse({});
    expect(result.allowedMediaTypes.length).toBeGreaterThan(0);
    expect(result.activeDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(result.aiTranslate).toBe('none');
    expect(result.skipDuplicateContent).toBe(false); // فاز ۳
  });

  it('getDefaultTelegramConnectionConfig() matches schema default exactly', () => {
    expect(getDefaultTelegramConnectionConfig()).toEqual(TelegramConnectionConfigSchema.parse({}));
  });

  it('does not share array references between two default calls', () => {
    const a = getDefaultTelegramConnectionConfig();
    const b = getDefaultTelegramConnectionConfig();
    expect(a.activeDays).not.toBe(b.activeDays);
    expect(a.keywordsInclude).not.toBe(b.keywordsInclude);
  });

  it('accepts a partial override and fills the rest with defaults', () => {
    const result = TelegramConnectionConfigSchema.parse({ removeLinks: true });
    expect(result.removeLinks).toBe(true);
    expect(result.removeMentions).toBe(false); // default preserved
  });

  it('rejects an invalid aiTranslate value', () => {
    const result = TelegramConnectionConfigSchema.safeParse({ aiTranslate: 'de' });
    expect(result.success).toBe(false);
  });
});

describe('ConnectionCreateInputSchema', () => {
  it('rejects a payload missing sourceChannel', () => {
    const result = ConnectionCreateInputSchema.safeParse({
      targetChannel: '@target',
      botToken: '123:ABC',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a minimal valid payload without config', () => {
    const result = ConnectionCreateInputSchema.safeParse({
      sourceChannel: '@source',
      targetChannel: '@target',
      botToken: '123:ABC',
    });
    expect(result.success).toBe(true);
  });
});

describe('AuthLoginSchema', () => {
  it('rejects an empty password', () => {
    const result = AuthLoginSchema.safeParse({ username: 'admin', password: '' });
    expect(result.success).toBe(false);
  });
});
