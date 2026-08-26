"""
سرویس دائمی یوزربات — دو مسئولیت جدا:

۱) (قدیمی، فاز ۰ به قبل) `/forward` — یه API محلی که برنامه‌ی اصلی
   (Node.js) صداش می‌زنه تا پست‌های فایل/آلبومی که لینک دانلود مستقیم
   در اسکرِیپ HTML ندارن رو از کانال مبدأ به یه کانال واسط منتقل کنه.

۲) (جدید، فاز ۲ نقشه‌راه) موتور push-based کشف پیام — به‌جای این‌که
   Node هر ۱۵ ثانیه صفحه‌ی t.me/s/ رو اسکرِیپ کنه، این سرویس مستقیم با
   MTProto (همون اکانت یوزربات) روی کانال‌های مبدأ عضو می‌شه و با
   client.on(events.NewMessage) هر پست تازه رو همون لحظه می‌گیره و به
   یه webhook داخلی روی Node پوش می‌کنه. رسانه (عکس/ویدیو/فایل) دانلود
   می‌شه و از طریق GET /media/<token> همین سرویس در دسترس Node قرار
   می‌گیره (Node آن را می‌گیرد و به تلگرام آپلود می‌کند، دقیقاً مثل
   الگوی استریم موجود در src/server/telegram.ts).

   این موتور کاملاً اختیاری و opt-in است: اگر NODE_WEBHOOK_URL تنظیم
   نشده باشد، فقط همان endpoint قدیمی /forward فعال است و Node به
   همان روش اسکرِیپ قدیمی برمی‌گردد (نگاه کن به
   TelegramService.startMonitoring در src/server/telegram.ts).

به‌جای «فوروارد» (که برچسب Forwarded from می‌ذاره)، فایل واقعی رو
دانلود می‌کنه و به‌عنوان یه پیام تازه دوباره آپلود می‌کنه.

فقط روی 127.0.0.1 گوش می‌ده - از بیرون سرور اصلاً قابل دسترسی نیست.

نیازمند این متغیرهای محیطی (قبل از اجرا export کنید یا در systemd/pm2 ست کنید):
  API_ID, API_HASH     - از my.telegram.org
  USERBOT_SECRET       - رمز مشترک بین این سرویس و برنامه‌ی Node
  NODE_WEBHOOK_URL     - (اختیاری، فاز ۲) آدرس Node، مثلاً
                         http://127.0.0.1:3000 — اگر ست شود، موتور
                         push-based فعال می‌شود.
"""

import asyncio
import os
import sys
import time
import uuid
import mimetypes
from PIL import Image
from aiohttp import web, ClientSession
from telethon import TelegramClient, events
from telethon.errors import FloodWaitError, ChannelPrivateError, UsernameNotOccupiedError
from telethon.extensions import html as telethon_html
from telethon.tl.functions.channels import JoinChannelRequest

API_ID_STR = os.environ.get("API_ID")
API_HASH = os.environ.get("API_HASH")

if not API_ID_STR or not API_HASH:
    print("❌ متغیرهای محیطی API_ID و API_HASH تنظیم نشدن.")
    print("   قبل از اجرا این‌ها رو export کنید (یا در pm2 ست کنید):")
    print('   export API_ID="..."')
    print('   export API_HASH="..."')
    sys.exit(1)

API_ID = int(API_ID_STR)
SESSION_NAME = "userbot_session"

SHARED_SECRET = os.environ.get("USERBOT_SECRET", "change-me-please")
PORT = int(os.environ.get("USERBOT_PORT", "8081"))
DOWNLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloads")
NODE_WEBHOOK_URL = os.environ.get("NODE_WEBHOOK_URL", "").rstrip("/")

MEDIA_CAPTION_LIMIT = 1024
TEXT_MESSAGE_LIMIT = 4096
# فایل‌های دانلودشده برای media serving بعد از این مدت (ثانیه) پاک
# می‌شوند اگر Node آن‌ها را نگرفته باشد — جلوگیری از پر شدن دیسک وقتی
# Node موقتاً پایین است.
MEDIA_TOKEN_TTL_SECONDS = 600

client = TelegramClient(
    SESSION_NAME,
    API_ID,
    API_HASH,
    connection_retries=5,
    retry_delay=2,
    timeout=15,
)

# --- وضعیت موتور push-based (فقط در حافظه؛ اگر سرویس ری‌استارت شود،
# Node باید دوباره watch را برای پل‌های فعال صدا بزند — همان‌طور که
# TelegramService.startAllActiveConnections در استارت Node این کار را
# برای هر پل انجام می‌دهد) ---
watch_refcount: dict[str, int] = {}          # '@channel' -> تعداد پل‌هایی که به آن نیاز دارند
media_tokens: dict[str, dict] = {}           # token -> {"path": ..., "expires_at": ...}

# ⚠️ رفع باگ واقعی production (مرداد ۱۴۰۴/اوت ۲۰۲۶): آلبوم‌ها (چند
# عکس/فایل با یک grouped_id مشترک) قبلاً هر عضو را جدا و بلافاصله پوش
# می‌کردند — یعنی یک آلبوم ۳ عکسی می‌شد ۳ پیام جدا در مقصد (یکی با
# کپشن، بقیه بدون کپشن، که در پنل شبیه «ریپوست تکراری» و «پست خالی»
# دیده می‌شد). حالا اعضای یک آلبوم را با یک تأخیر کوتاه (debounce) جمع
# می‌کنیم و یک‌جا به‌عنوان media_group واحد پوش می‌کنیم.
album_buffers: dict[int, dict] = {}          # grouped_id -> {"messages": [...], "channel_key": str}
album_timers: dict[int, asyncio.Task] = {}   # grouped_id -> تایمر debounce فعلی
ALBUM_COLLECT_DELAY_SECONDS = 1.5


def cleanup_expired_media_tokens():
    now = time.time()
    expired = [t for t, info in media_tokens.items() if info["expires_at"] < now]
    for t in expired:
        info = media_tokens.pop(t, None)
        if info:
            try:
                os.remove(info["path"])
            except OSError:
                pass


async def push_to_node(payload: dict):
    """پیام تازه‌ی کشف‌شده را به webhook داخلی Node اطلاع می‌دهد. اگر
    Node موقتاً در دسترس نباشد، فقط لاگ می‌کند و از بین نمی‌رود چیزی —
    Node در دور بعدی پولینگ خودش (اگر روی حالت fallback باشد) یا با
    trigger دستی می‌تواند جبران کند؛ برای این نسخه‌ی اول retry خودکار
    پیاده نشده (نگاه کن به references/roadmap.md فاز ۲ برای کارهای آینده)."""
    if not NODE_WEBHOOK_URL:
        return
    url = f"{NODE_WEBHOOK_URL}/api/internal/incoming-message"
    try:
        async with ClientSession() as session:
            async with session.post(
                url,
                json=payload,
                headers={"X-Userbot-Secret": SHARED_SECRET},
                timeout=15,
            ) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    print(f"⚠️ Node پیام را رد کرد ({resp.status}): {text[:200]}")
    except Exception as e:
        print(f"⚠️ ارسال پیام به Node شکست خورد: {e}")


def detect_media_type(msg) -> str:
    if msg.photo:
        return "photo"
    if msg.video:
        return "video"
    if msg.voice:
        return "voice"
    if msg.audio:
        return "audio"
    if msg.gif:
        return "gif"
    if msg.document:
        return "document"
    return "text"


async def download_message_media(msg) -> str | None:
    """رسانه‌ی یک پیام را دانلود و یک media_token برایش می‌سازد. اگر
    پیام رسانه نداشت یا دانلود شکست خورد، None برمی‌گرداند."""
    if not msg.media:
        return None
    cleanup_expired_media_tokens()
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    try:
        path = await client.download_media(msg, file=DOWNLOAD_DIR + "/")
    except Exception as e:
        print(f"⚠️ دانلود رسانه‌ی پیام {msg.id} شکست خورد: {e}")
        return None
    if not path:
        return None
    # اگر فایل عکس بود، آن را به baseline JPEG تبدیل می‌کنیم — چون
    # Bot API تلگرام گاهی روی JPEGهای progressive با خطای
    # IMAGE_PROCESS_FAILED رد می‌شود، به‌خصوص در sendMediaGroup.
    if path.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        try:
            img = Image.open(path)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            fixed_path = path.rsplit(".", 1)[0] + "_fixed.jpg"
            img.save(fixed_path, "JPEG", quality=92, progressive=False)
            path = fixed_path
        except Exception as e:
            print(f"⚠️ تبدیل عکس {msg.id} به baseline JPEG شکست خورد (فایل اصلی استفاده می‌شود): {e}")
    token = uuid.uuid4().hex
    media_tokens[token] = {"path": path, "expires_at": time.time() + MEDIA_TOKEN_TTL_SECONDS}
    return token


def extract_inline_buttons(msg):
    """دکمه‌های این‌لاین (فقط نوع URL — دکمه‌های callback به بات مبدأ
    وابسته‌اند و در ریپست معنی ندارند) را به شکل [[{text,url}]] برمی‌گرداند،
    یا اگر پیام دکمه نداشت None."""
    if not getattr(msg, "buttons", None):
        return None
    rows = []
    for row in msg.buttons:
        row_out = []
        for btn in row:
            url = getattr(btn, "url", None)
            if url:
                row_out.append({"text": btn.text, "url": url})
        if row_out:
            rows.append(row_out)
    return rows if rows else None
async def push_single_message(channel_key: str, msg):
    """یک پیام تکی (بدون grouped_id) را همان لحظه پردازش و پوش می‌کند."""
    text = msg.message or ""
    try:
        html_text = telethon_html.unparse(msg.message or "", msg.entities or [])
    except Exception:
        html_text = text

    media_token = await download_message_media(msg)

    await push_to_node(
        {
            "sourceChannel": channel_key,
            "messageId": msg.id,
            "groupedId": None,
            "text": text,
            "html": html_text,
            "mediaType": detect_media_type(msg),
            "mediaToken": media_token,
            "buttons": extract_inline_buttons(msg),
            "publishedAt": msg.date.isoformat() if msg.date else None,
        }
    )


async def flush_album(grouped_id: int):
    """بعد از پایان تأخیر debounce، همه‌ی اعضای جمع‌شده‌ی این آلبوم را
    پوش می‌کند — عکس‌ها یک‌جا به‌عنوان آلبوم عکس، سندها (apk/exe/...)
    یک‌جا به‌عنوان آلبوم سند، و بقیه (ویدیو/صدا/...) جدا و مستقل."""
    buffer = album_buffers.pop(grouped_id, None)
    album_timers.pop(grouped_id, None)
    if not buffer:
        return
    messages = sorted(buffer["messages"], key=lambda m: m.id)
    channel_key = buffer["channel_key"]
    caption_msg = next((m for m in messages if m.message), None)
    text = caption_msg.message if caption_msg else ""
    try:
        html_text = (
            telethon_html.unparse(caption_msg.message, caption_msg.entities or [])
            if caption_msg
            else ""
        )
    except Exception:
        html_text = text
    photo_messages = [m for m in messages if m.photo]
    document_messages = [m for m in messages if not m.photo and detect_media_type(m) == "document"]
    remaining_messages = [
        m for m in messages if not m.photo and detect_media_type(m) != "document"
    ]

    # --- آلبوم عکس ---
    photo_tokens = []
    for m in photo_messages:
        token = await download_message_media(m)
        if token:
            photo_tokens.append(token)
    if len(photo_tokens) >= 2:
        await push_to_node(
            {
                "sourceChannel": channel_key,
                "messageId": messages[-1].id,
                "groupedId": grouped_id,
                "text": text,
                "html": html_text,
                "mediaType": "media_group",
                "mediaTokens": photo_tokens,
                "publishedAt": messages[0].date.isoformat() if messages[0].date else None,
            }
        )
    elif len(photo_tokens) == 1:
        only_photo_msg = photo_messages[0]
        await push_to_node(
            {
                "sourceChannel": channel_key,
                "messageId": messages[-1].id,
                "groupedId": None,
                "text": text,
                "html": html_text,
                "mediaType": "photo",
                "mediaToken": photo_tokens[0],
                "publishedAt": only_photo_msg.date.isoformat() if only_photo_msg.date else None,
            }
        )

    # --- آلبوم سند (apk/exe/conf/...) ---
    # کپشن آلبوم فقط روی یک نوع (معمولاً عکس) گذاشته می‌شود تا در
    # کانال مقصد تکراری نشود؛ اگر عکسی در کار نبود، کپشن روی سندها می‌رود.
    doc_caption_text = text if not photo_tokens else ""
    doc_caption_html = html_text if not photo_tokens else ""
    doc_tokens = []
    for m in document_messages:
        token = await download_message_media(m)
        if token:
            doc_tokens.append(token)
    if len(doc_tokens) >= 2:
        await push_to_node(
            {
                "sourceChannel": channel_key,
                "messageId": messages[-1].id,
                "groupedId": grouped_id,
                "text": doc_caption_text,
                "html": doc_caption_html,
                "mediaType": "document_group",
                "mediaTokens": doc_tokens,
                "publishedAt": messages[0].date.isoformat() if messages[0].date else None,
            }
        )
    elif len(doc_tokens) == 1:
        only_doc_msg = document_messages[0]
        await push_to_node(
            {
                "sourceChannel": channel_key,
                "messageId": messages[-1].id,
                "groupedId": None,
                "text": doc_caption_text,
                "html": doc_caption_html,
                "mediaType": "document",
                "mediaToken": doc_tokens[0],
                "publishedAt": only_doc_msg.date.isoformat() if only_doc_msg.date else None,
            }
        )

    # --- بقیه (ویدیو/صدا/voice/gif) — جدا و مستقل ---
    for m in remaining_messages:
        await push_single_message(channel_key, m)
async def schedule_album_flush(grouped_id: int):
    """اگر تایمر قبلی برای همین آلبوم در جریان بود، لغوش می‌کند و یک
    تایمر تازه می‌سازد — یعنی «فقط وقتی ALBUM_COLLECT_DELAY_SECONDS از
    آخرین عضو دریافتی گذشت» آلبوم واقعاً flush می‌شود (debounce)."""
    old_task = album_timers.get(grouped_id)
    if old_task and not old_task.done():
        old_task.cancel()

    async def waiter():
        try:
            await asyncio.sleep(ALBUM_COLLECT_DELAY_SECONDS)
            await flush_album(grouped_id)
        except asyncio.CancelledError:
            pass

    album_timers[grouped_id] = asyncio.create_task(waiter())


@client.on(events.NewMessage())
async def on_new_message(event):
    """هندلر سراسری — چون Telethon امکان register پویا per-channel ندارد
    بدون بستن/باز کردن دوباره‌ی اتصال، همه‌ی پیام‌های همه‌ی چت‌هایی که
    این اکانت عضوشان است اینجا می‌رسند و خودمان فیلتر می‌کنیم که آیا
    کانال جزو watch_refcount هست یا نه (فقط کانال‌های واقعاً watch‌شده
    را به Node پوش می‌کنیم، نه هر چیزی که این اکانت شخصاً عضوش است)."""
    if not NODE_WEBHOOK_URL:
        return

    chat = await event.get_chat()
    username = getattr(chat, "username", None)
    if not username:
        return
    channel_key = f"@{username}"
    if watch_refcount.get(channel_key, 0) <= 0:
        return

    msg = event.message

    if msg.grouped_id:
        # عضو یک آلبوم — به بافر اضافه کن و تایمر debounce را ریست کن.
        buffer = album_buffers.setdefault(msg.grouped_id, {"messages": [], "channel_key": channel_key})
        buffer["messages"].append(msg)
        await schedule_album_flush(msg.grouped_id)
    else:
        await push_single_message(channel_key, msg)


async def ensure_watching(channel: str) -> dict:
    """اگر این کانال قبلاً watch نشده، اکانت یوزربات را عضوش می‌کند
    (لازم است — Telethon فقط برای چت‌هایی که عضو هستیم update زنده
    می‌فرستد). ref-counted: چند پل می‌توانند هم‌زمان یک کانال مبدأ
    مشترک را watch کنند؛ فقط وقتی شمارنده به صفر برسد واقعاً unwatch
    می‌شویم (ولی از کانال خارج نمی‌شویم — عضویت مجانی و بی‌خطر است و
    خروج/ورود مکرر ریسک محدودیت تلگرام دارد)."""
    channel = channel if channel.startswith("@") else f"@{channel}"
    was_new = watch_refcount.get(channel, 0) == 0
    watch_refcount[channel] = watch_refcount.get(channel, 0) + 1

    if was_new:
        try:
            await client(JoinChannelRequest(channel))
        except ChannelPrivateError:
            watch_refcount[channel] -= 1
            return {"success": False, "error": "کانال خصوصی است یا این اکانت به آن دسترسی ندارد"}
        except UsernameNotOccupiedError:
            watch_refcount[channel] -= 1
            return {"success": False, "error": "چنین کانالی وجود ندارد"}
        except Exception as e:
            # ممکن است از قبل عضو باشیم (خطای بی‌ضرر) یا خطای واقعی —
            # هر دو را لاگ می‌کنیم ولی watch را نگه می‌داریم چون اگر از
            # قبل عضو بودیم، دریافت پیام‌های زنده بدون مشکل کار می‌کند.
            print(f"ℹ️ JoinChannelRequest برای {channel}: {e} (ادامه می‌دهیم)")

    return {"success": True, "refcount": watch_refcount[channel]}


async def ensure_unwatching(channel: str) -> dict:
    channel = channel if channel.startswith("@") else f"@{channel}"
    if channel in watch_refcount:
        watch_refcount[channel] = max(0, watch_refcount[channel] - 1)
        if watch_refcount[channel] == 0:
            del watch_refcount[channel]
    return {"success": True}


async def send_text_chunks(relay_channel: str, text: str) -> list:
    """متن رو در صورت لزوم به تکه‌های زیر 4096 کاراکتر می‌شکنه و پشت سر هم
    می‌فرسته، بدون این‌که هیچ بخشی از متن گم بشه."""
    ids = []
    if not text:
        return ids
    for i in range(0, len(text), TEXT_MESSAGE_LIMIT):
        chunk = text[i : i + TEXT_MESSAGE_LIMIT]
        msg = await client.send_message(relay_channel, chunk)
        ids.append(msg.id)
    return ids


async def send_media_with_full_text(relay_channel: str, file_or_files, caption: str) -> list:
    """رسانه (تکی یا لیست برای آلبوم) رو با کپشن کامل می‌فرسته. اگه تلگرام
    به‌خاطر طولانی بودن کپشن رد کرد، دقیقاً مثل رفتار فعلی برنامه: فقط
    متن کامل رو (بدون رسانه) به‌صورت یک پیام واحد می‌فرسته."""
    try:
        result = await client.send_file(relay_channel, file_or_files, caption=caption)
        first = result[0] if isinstance(result, list) else result
        return [first.id]
    except Exception:
        return await send_text_chunks(relay_channel, caption)


async def repost_single(source_channel: str, message_id: int, relay_channel: str):
    """دانلود پست تکی (متن/عکس/ویدیو/فایل) و آپلود دوباره‌اش به‌عنوان پیام(های) تازه."""
    msg = await client.get_messages(source_channel, ids=message_id)
    if msg is None:
        return {"success": False, "error": "پیام پیدا نشد"}

    caption = msg.text or ""

    if msg.media:
        os.makedirs(DOWNLOAD_DIR, exist_ok=True)
        path = await client.download_media(msg, file=DOWNLOAD_DIR + "/")
        try:
            ids = await send_media_with_full_text(relay_channel, path, caption)
        finally:
            try:
                os.remove(path)
            except OSError:
                pass
    else:
        ids = await send_text_chunks(relay_channel, caption)

    if not ids:
        return {"success": False, "error": "پیام خالی بود، چیزی برای ارسال نبود"}

    return {"success": True, "new_message_ids": ids}


async def repost_album(source_channel: str, message_id: int, grouped_id: int, relay_channel: str):
    """دانلود همه‌ی عکس‌های یک آلبوم و آپلود دوباره‌شون به‌صورت یک آلبوم تازه."""
    candidates = await client.get_messages(
        source_channel, min_id=message_id - 12, max_id=message_id + 12, limit=25
    )
    group_msgs = sorted(
        [m for m in candidates if m.grouped_id == grouped_id], key=lambda m: m.id
    )
    if not group_msgs:
        return {"success": False, "error": "اعضای آلبوم پیدا نشدن"}

    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    paths = []
    caption = ""
    for m in group_msgs:
        if m.text and not caption:
            caption = m.text
        if m.media:
            p = await client.download_media(m, file=DOWNLOAD_DIR + "/")
            paths.append(p)

    try:
        ids = await send_media_with_full_text(relay_channel, paths, caption)
        return {"success": True, "new_message_ids": ids}
    finally:
        for p in paths:
            try:
                os.remove(p)
            except OSError:
                pass


async def handle_forward(request: web.Request) -> web.Response:
    if request.headers.get("X-Userbot-Secret") != SHARED_SECRET:
        return web.json_response({"success": False, "error": "unauthorized"}, status=401)

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"success": False, "error": "invalid json"}, status=400)

    source_channel = body.get("source_channel")
    message_id = body.get("message_id")
    relay_channel = body.get("relay_channel")
    grouped_id = body.get("grouped_id")

    if not source_channel or not message_id or not relay_channel:
        return web.json_response({"success": False, "error": "missing fields"}, status=400)

    # سقف زمانی سخت (کمتر از تایم‌اوت سمت Node که ۱۸۰ ثانیه‌ست). اگه شبکه
    # ناپایدار باشه و Telethon داشته باشه چندین بار برای اتصال مجدد تلاش
    # کنه، این کار رو به‌جای این‌که در پس‌زمینه ادامه بده و بعداً (بعد از
    # این‌که Node قطع امید کرده) خودسرانه کامل بشه - واقعاً لغو می‌کنه.
    # این از پیام‌های تکراری (فایل جدا + متن جدا) جلوگیری می‌کنه — رفع
    # یک باگ واقعی مشاهده‌شده در production (نگاه کن به
    # references/roadmap.md در اسکیل پروژه).
    OPERATION_TIMEOUT_SECONDS = 150

    try:
        if grouped_id:
            coro = repost_album(source_channel, int(message_id), int(grouped_id), relay_channel)
        else:
            coro = repost_single(source_channel, int(message_id), relay_channel)
        result = await asyncio.wait_for(coro, timeout=OPERATION_TIMEOUT_SECONDS)
        return web.json_response(result)
    except asyncio.TimeoutError:
        return web.json_response(
            {"success": False, "error": "زمان دانلود/آپلود بیش از حد طول کشید (احتمالاً به‌خاطر ناپایداری شبکه)"},
            status=504,
        )
    except FloodWaitError as e:
        return web.json_response({"success": False, "error": f"flood_wait:{e.seconds}"}, status=429)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


async def handle_health(request: web.Request) -> web.Response:
    return web.json_response({"ok": True, "push_engine_enabled": bool(NODE_WEBHOOK_URL), "watching": list(watch_refcount.keys())})


async def handle_watch(request: web.Request) -> web.Response:
    if request.headers.get("X-Userbot-Secret") != SHARED_SECRET:
        return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"success": False, "error": "invalid json"}, status=400)
    channel = body.get("channel")
    if not channel:
        return web.json_response({"success": False, "error": "missing channel"}, status=400)
    result = await ensure_watching(channel)
    status = 200 if result.get("success") else 400
    return web.json_response(result, status=status)


async def handle_unwatch(request: web.Request) -> web.Response:
    if request.headers.get("X-Userbot-Secret") != SHARED_SECRET:
        return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"success": False, "error": "invalid json"}, status=400)
    channel = body.get("channel")
    if not channel:
        return web.json_response({"success": False, "error": "missing channel"}, status=400)
    result = await ensure_unwatching(channel)
    return web.json_response(result)


async def handle_media(request: web.Request) -> web.Response:
    # این endpoint عمداً بدون چک X-Userbot-Secret است چون Node آن را با
    # یک GET ساده (بدون هدر سفارشی، مثل fetch مستقیم URL) صدا می‌زند —
    # امنیتش از طریق token تصادفی‌بودن (uuid4، غیرقابل حدس) و این‌که کل
    # سرویس فقط روی 127.0.0.1 گوش می‌دهد تأمین می‌شود، نه هدر.
    token = request.match_info.get("token", "")
    info = media_tokens.get(token)
    if not info or info["expires_at"] < time.time():
        return web.json_response({"success": False, "error": "token نامعتبر یا منقضی‌شده"}, status=404)
    real_filename = os.path.basename(info["path"])
    guessed_type, _ = mimetypes.guess_type(real_filename)
    resp = web.FileResponse(info["path"])
    resp.headers["Content-Disposition"] = f'attachment; filename="{real_filename}"'
    if guessed_type:
        resp.content_type = guessed_type
    return resp


async def main():
    await client.start()
    me = await client.get_me()
    print(f"✅ یوزربات متصل شد: {me.first_name} (@{me.username})")
    if NODE_WEBHOOK_URL:
        print(f"✅ موتور push-based فعال است — پیام‌های زنده به {NODE_WEBHOOK_URL} پوش می‌شوند")
    else:
        print("ℹ️ NODE_WEBHOOK_URL تنظیم نشده — موتور push-based غیرفعال است (فقط /forward قدیمی کار می‌کند)")

    app = web.Application()
    app.router.add_post("/forward", handle_forward)
    app.router.add_post("/watch", handle_watch)
    app.router.add_post("/unwatch", handle_unwatch)
    app.router.add_get("/media/{token}", handle_media)
    app.router.add_get("/health", handle_health)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", PORT)
    await site.start()
    print(f"✅ سرویس یوزربات روی http://127.0.0.1:{PORT} در حال گوش دادنه")

    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
