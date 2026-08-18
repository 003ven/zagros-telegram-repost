"""
اسکریپت لاگین یک‌باره برای یوزربات.
این اسکریپت رو فقط یک بار اجرا کنید — بعدش یه فایل session ساخته میشه
که سرویس دائمی (userbot_service.py) همیشه ازش استفاده می‌کنه.

قبل از اجرا این‌ها رو export کنید:
    export API_ID="..."
    export API_HASH="..."

اجرا:
    python3 login.py
"""

import asyncio
import os
import sys
from telethon import TelegramClient

API_ID_STR = os.environ.get("API_ID")
API_HASH = os.environ.get("API_HASH")

if not API_ID_STR or not API_HASH:
    print("❌ متغیرهای محیطی API_ID و API_HASH تنظیم نشدن.")
    print("   قبل از اجرا این‌ها رو export کنید:")
    print('   export API_ID="..."')
    print('   export API_HASH="..."')
    sys.exit(1)

API_ID = int(API_ID_STR)
SESSION_NAME = "userbot_session"


async def main():
    client = TelegramClient(SESSION_NAME, API_ID, API_HASH)

    # client.start() خودش به‌صورت تعاملی شماره تلفن، کد تایید، و
    # (در صورت فعال بودن) رمز دو مرحله‌ای رو از شما می‌پرسه.
    await client.start()

    me = await client.get_me()
    print(f"\n✅ ورود موفق بود. اکانت: {me.first_name} (@{me.username or 'بدون یوزرنیم'})")
    print(f"✅ فایل session ساخته شد: {SESSION_NAME}.session")
    print("این فایل رو نگه دارید — سرویس دائمی ازش استفاده می‌کنه و دیگه نیازی به ورود مجدد نیست.")

    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
