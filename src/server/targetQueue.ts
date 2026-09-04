// یک صف FIFO سبک، جدا برای هر کانال مقصد: تضمین می‌کنه پست‌های یک
// targetChannel واحد - حتی اگه از چند Connection/کانال مبدأ مختلف
// بیان - دقیقاً به همون ترتیبی که رسیدن پردازش و ارسال بشن، فارغ از
// این‌که دانلود/آپلود کدومشون چقدر طول بکشه. کانال‌های مقصد مختلف از
// هم کاملاً مستقل‌اند و همدیگه رو بلاک نمی‌کنن.

const tails = new Map<string, Promise<unknown>>();

export function enqueueForTarget<T>(targetChannel: string, task: () => Promise<T>): Promise<T> {
  const prevTail = tails.get(targetChannel) ?? Promise.resolve();
  const nextTail = prevTail.then(task, task);
  tails.set(targetChannel, nextTail.catch(() => {}));
  return nextTail;
}
