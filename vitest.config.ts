import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // فایل‌های تست فقط داخل tests/ — کد اصلی src/ و server.ts هیچ فایل
    // *.test.ts ندارند، پس نیازی به include گسترده نیست.
    include: ['tests/**/*.test.ts'],
  },
});
