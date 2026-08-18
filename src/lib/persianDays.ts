/**
 * Day ids follow JS Date.getDay() (0 = یکشنبه/Sunday ... 6 = شنبه/Saturday).
 * PERSIAN_WEEK_ORDER lists them in the order they're shown in the UI
 * (Persian week starts on شنبه/Saturday).
 */
export const PERSIAN_DAY_NAMES: Record<number, string> = {
  0: 'یکشنبه',
  1: 'دوشنبه',
  2: 'سه‌شنبه',
  3: 'چهارشنبه',
  4: 'پنج‌شنبه',
  5: 'جمعه',
  6: 'شنبه',
};

export const PERSIAN_WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];
