"""
Telegram Bot для системы мониторинга (Ситуационный центр).
Полностью автоматизированный: запускается вместе с бэкендом или как отдельный процесс.

Автоматические функции:
  - Health Check сайтов каждые HEALTH_CHECK_INTERVAL сек. (по умолч. 60)
  - Мониторинг серверов (ping) каждые SERVER_CHECK_INTERVAL сек. (по умолч. 120)
  - Отслеживание новых алертов из БД каждые ALERT_WATCH_INTERVAL сек. (по умолч. 15)
  - Периодическая сводка каждые DIGEST_INTERVAL сек. (по умолч. 21600 = 6 ч.)

Управление пользователями (регистрация, настройки уведомлений, mute/unmute)
осуществляется только через веб-интерфейс администратором.
Бот только проверяет, зарегистрирован ли пользователь в БД.

Использование (standalone):
  python -m backend.app.telegram_bot
  python backend/app/telegram_bot.py

Или автозапуск из бэкенда (main.py startup_event).
"""

import os
import sys
import asyncio
import datetime
import logging
import platform
import signal
import ssl
import socket
import time

import httpx
import psutil
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, desc, func, or_, and_

# ─── Paths ───────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

try:
    from backend.app.models import (
        Base,
        TelegramBot as TelegramBotModel,
        TelegramBotUser as TelegramBotUserModel,
        Organization as OrganizationModel,
        Server as ServerModel,
        Website as WebsiteModel,
        Alert as AlertModel,
    )
except ImportError:
    from app.models import (
        Base,
        TelegramBot as TelegramBotModel,
        TelegramBotUser as TelegramBotUserModel,
        Organization as OrganizationModel,
        Server as ServerModel,
        Website as WebsiteModel,
        Alert as AlertModel,
    )

# ─── Logging ─────────────────────────────────────────────────
import sys as _sys
import io as _io
# Force UTF-8 on Windows console to avoid UnicodeEncodeError with emoji
if hasattr(_sys.stdout, 'reconfigure'):
    try:
        _sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        _sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    stream=_sys.stdout,
)
logger = logging.getLogger('telegram_bot')

# ─── Database ────────────────────────────────────────────────
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite+aiosqlite:///./data/monitoring.db')

if DATABASE_URL.startswith('sqlite'):
    try:
        path = DATABASE_URL.split('///', 1)[1]
    except Exception:
        path = None
    if path:
        folder = os.path.dirname(path)
        if folder and not os.path.exists(folder):
            os.makedirs(folder, exist_ok=True)

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def get_session():
    return async_session()


# ─── Constants ───────────────────────────────────────────────
SEV_EMOJI = {'critical': '🔴', 'warning': '🟡', 'info': '🔵'}
SEV_LABELS = {'critical': 'Critical', 'warning': 'Warning', 'info': 'Info'}

HEALTH_CHECK_INTERVAL = int(os.getenv('HEALTH_CHECK_INTERVAL', '60'))  # секунд
SERVER_CHECK_INTERVAL = int(os.getenv('SERVER_CHECK_INTERVAL', '120'))  # секунд
ALERT_WATCH_INTERVAL = int(os.getenv('ALERT_WATCH_INTERVAL', '15'))  # секунд
DIGEST_INTERVAL = int(os.getenv('DIGEST_INTERVAL', '21600'))  # секунд (6 часов по умолчанию)

CATEGORY_LABELS = {
    'system': '💻 Система',
    'website': '🌐 Веб-сайты',
    'service': '⚙️ Сервисы',
    'docker': '🐳 Docker',
    'security': '🔒 Безопасность',
}

API_BASE = 'https://api.telegram.org/bot{token}'


class TelegramConflictError(Exception):
    """409 Conflict — другой экземпляр бота уже работает"""
    pass


# ─── Telegram API helpers ────────────────────────────────────
class TelegramAPI:
    """Обёртка для Telegram Bot API через httpx"""

    def __init__(self, token: str):
        self.token = token
        self.base = API_BASE.format(token=token)
        self.client = httpx.AsyncClient(timeout=35)

    async def close(self):
        await self.client.aclose()

    async def call(self, method: str, **kwargs) -> dict:
        r = await self.client.post(f'{self.base}/{method}', json=kwargs)
        data = r.json()
        if not data.get('ok'):
            desc = data.get('description', 'unknown')
            logger.warning(f"API error [{method}]: {desc}")
            if r.status_code == 409:
                raise TelegramConflictError(desc)
        return data

    async def send_message(self, chat_id, text: str, parse_mode='HTML', reply_markup=None) -> dict:
        params = {'chat_id': chat_id, 'text': text, 'parse_mode': parse_mode}
        if reply_markup:
            params['reply_markup'] = reply_markup
        return await self.call('sendMessage', **params)

    async def answer_callback_query(self, callback_query_id: str, text: str = None) -> dict:
        params = {'callback_query_id': callback_query_id}
        if text:
            params['text'] = text
        return await self.call('answerCallbackQuery', **params)

    async def edit_message_reply_markup(self, chat_id, message_id: int, reply_markup) -> dict:
        return await self.call('editMessageReplyMarkup',
                               chat_id=chat_id, message_id=message_id, reply_markup=reply_markup)

    async def delete_message(self, chat_id, message_id: int) -> dict:
        return await self.call('deleteMessage', chat_id=chat_id, message_id=message_id)

    async def get_updates(self, offset: int = None, timeout: int = 30) -> list:
        params = {'timeout': timeout, 'allowed_updates': ['message', 'callback_query']}
        if offset:
            params['offset'] = offset
        data = await self.call('getUpdates', **params)
        return data.get('result', [])

    async def delete_webhook(self) -> dict:
        return await self.call('deleteWebhook', drop_pending_updates=True)

    async def set_my_commands(self, commands: list) -> dict:
        return await self.call('setMyCommands', commands=commands)

    async def get_me(self) -> dict:
        return await self.call('getMe')


# ─── Keyboards ───────────────────────────────────────────────
def reply_keyboard() -> dict:
    keyboard = [
        [{'text': '📊 Статус'}, {'text': '🔔 Последние алерты'}],
        [{'text': '🏢 Организация'}, {'text': 'ℹ️ Помощь'}],
        [{'text': '🖥 Серверы'}, {'text': '🌐 Сайты'}],
        [{'text': '🏥 Health Check'}],
    ]
    return {'keyboard': keyboard, 'resize_keyboard': True}


def alerts_keyboard(alerts, page: int, total: int, per_page: int = 5) -> dict:
    rows = []
    nav = []
    if page > 0:
        nav.append({'text': '⬅️ Назад', 'callback_data': f'alerts_{page - 1}'})
    if (page + 1) * per_page < total:
        nav.append({'text': 'Вперёд ➡️', 'callback_data': f'alerts_{page + 1}'})
    if nav:
        rows.append(nav)
    detail = []
    for a in alerts[:3]:
        detail.append({'text': f"{SEV_EMOJI.get(a.severity, '⚪')} #{a.id}", 'callback_data': f'alertd_{a.id}'})
    if detail:
        rows.append(detail)
    rows.append([{'text': '✖️ Закрыть', 'callback_data': 'close'}])
    return {'inline_keyboard': rows}


def close_keyboard() -> dict:
    return {'inline_keyboard': [[{'text': '✖️ Закрыть', 'callback_data': 'close'}]]}


# ─── Bot ─────────────────────────────────────────────────────
class MonitoringBot:
    """Telegram-бот системы мониторинга (long polling, httpx)"""

    def __init__(self, token: str, bot_id: int, bot_name: str):
        self.token = token
        self.bot_id = bot_id
        self.bot_name = bot_name
        self.api = TelegramAPI(token)
        self._running = True
        self._offset = None

    # ── DB helpers ────────────────────────────────────────────
    async def _get_user(self, session: AsyncSession, from_user: dict):
        """Найти зарегистрированного пользователя. Возвращает None если не найден."""
        tg_id = str(from_user.get('id', ''))
        res = await session.execute(
            select(TelegramBotUserModel).where(
                TelegramBotUserModel.bot_id == self.bot_id,
                TelegramBotUserModel.telegram_id == tg_id,
            )
        )
        user = res.scalars().first()
        if user:
            # Обновляем имя/username если изменились
            changed = False
            uname = from_user.get('username')
            fname = from_user.get('first_name')
            lname = from_user.get('last_name')
            if uname and user.username != uname:
                user.username = uname; changed = True
            if fname and user.first_name != fname:
                user.first_name = fname; changed = True
            if lname and user.last_name != lname:
                user.last_name = lname; changed = True
            if changed:
                await session.commit()
        return user

    async def _require_user(self, session: AsyncSession, from_user: dict, chat_id: int):
        """Найти пользователя или отправить сообщение об отказе. Возвращает user или None."""
        user = await self._get_user(session, from_user)
        if not user:
            await self.api.send_message(
                chat_id,
                "🚫 <b>Доступ запрещён</b>\n\n"
                "Вы не зарегистрированы в системе.\n"
                "Обратитесь к администратору для добавления\n"
                "через веб-интерфейс мониторинга.",
            )
            return None
        if not user.is_active:
            await self.api.send_message(
                chat_id,
                "⏸ <b>Ваш аккаунт отключён</b>\n\n"
                "Обратитесь к администратору.",
            )
            return None
        return user

    async def _get_org_name(self, session: AsyncSession, org_id) -> str:
        if not org_id:
            return '—'
        res = await session.execute(select(OrganizationModel).where(OrganizationModel.id == org_id))
        org = res.scalars().first()
        return org.name if org else '—'

    def _full_name(self, from_user: dict) -> str:
        parts = [from_user.get('first_name', ''), from_user.get('last_name', '')]
        name = ' '.join(p for p in parts if p).strip()
        return name or from_user.get('username', 'User')

    # ── Health check helpers ───────────────────────────────────
    async def _probe_url(self, url: str) -> dict:
        """HTTP проверка сайта + SSL info (аналог probe_url из main.py)"""
        result = {'status': 'down', 'status_code': 0, 'response_time': None, 'ssl': None}
        # SSL check
        if url.startswith('https://'):
            try:
                hostname = url.split('//')[1].split('/')[0].split(':')[0]
                ctx = ssl.create_default_context()
                loop = asyncio.get_event_loop()
                def _check_ssl():
                    conn = ctx.wrap_socket(socket.socket(socket.AF_INET), server_hostname=hostname)
                    conn.settimeout(5)
                    conn.connect((hostname, 443))
                    cert = conn.getpeercert()
                    conn.close()
                    return cert
                cert = await loop.run_in_executor(None, _check_ssl)
                not_after = datetime.datetime.strptime(cert['notAfter'], '%b %d %H:%M:%S %Y %Z')
                days_left = (not_after - datetime.datetime.utcnow()).days
                issuer_dict = dict(x[0] for x in cert.get('issuer', []))
                result['ssl'] = {
                    'valid': days_left > 0,
                    'issuer': issuer_dict.get('organizationName', issuer_dict.get('commonName', 'Unknown')),
                    'expires': not_after.isoformat(),
                    'days_left': days_left,
                    'subject': dict(x[0] for x in cert.get('subject', [])).get('commonName', ''),
                }
            except Exception:
                pass
        # HTTP check
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=True, verify=False) as client:
                start = time.time()
                resp = await client.get(url)
                elapsed = round((time.time() - start) * 1000, 2)
                result['status'] = 'up' if resp.status_code < 400 else 'degraded'
                result['status_code'] = resp.status_code
                result['response_time'] = elapsed
        except Exception:
            result['status'] = 'down'
        return result

    async def _health_check_loop(self):
        """Фоновая задача: периодическая проверка сайтов, уведомление при смене статуса"""
        await asyncio.sleep(5)  # дать боту стартовать
        # Хранилище предыдущих статусов: {website_id: 'up'|'down'|'degraded'}
        prev_status = {}
        logger.info(f"🏥 Health check запущен (интервал: {HEALTH_CHECK_INTERVAL}с)")

        while self._running:
            try:
                async with get_session() as session:
                    # Получаем все сайты
                    websites = (await session.execute(select(WebsiteModel))).scalars().all()
                    # Получаем всех активных пользователей бота
                    users = (await session.execute(
                        select(TelegramBotUserModel).where(
                            TelegramBotUserModel.bot_id == self.bot_id,
                            TelegramBotUserModel.is_active == True,
                        )
                    )).scalars().all()

                for w in websites:
                    url = w.url
                    if not url:
                        continue
                    result = await self._probe_url(url)
                    new_status = result['status']
                    old_status = prev_status.get(w.id)
                    prev_status[w.id] = new_status

                    # Пропуск первой проверки (нет предыдущего статуса)
                    if old_status is None:
                        continue

                    # Статус изменился — уведомить пользователей
                    if new_status != old_status:
                        if new_status == 'down':
                            emoji = '🔴'
                            label = 'НЕДОСТУПЕН'
                        elif new_status == 'up':
                            emoji = '🟢'
                            label = 'ДОСТУПЕН'
                        else:
                            emoji = '🟡'
                            label = 'ДЕГРАДАЦИЯ'

                        rt = f"{result['response_time']:.0f}ms" if result.get('response_time') else '—'
                        ssl_info = ''
                        if result.get('ssl'):
                            s = result['ssl']
                            ssl_icon = '✅' if s['valid'] else '❌'
                            ssl_info = f"\n🔒 SSL: {ssl_icon} (осталось {s['days_left']} дн.)"

                        text = (
                            f"{emoji} <b>Health Check: {w.name}</b>\n\n"
                            f"📍 URL: {url}\n"
                            f"📊 Статус: <b>{label}</b> (было: {old_status})\n"
                            f"🔢 HTTP код: <b>{result.get('status_code', '—')}</b>\n"
                            f"⏱ Время ответа: <b>{rt}</b>"
                            f"{ssl_info}\n\n"
                            f"🕐 {datetime.datetime.now().strftime('%d.%m.%Y %H:%M:%S')}"
                        )

                        # Отправляем пользователям, у которых org_id совпадает с org сайта
                        for u in users:
                            try:
                                # Если у сайта нет org_id — шлём всем; иначе только пользователям этой org
                                if w.org_id and u.org_id and u.org_id != w.org_id:
                                    continue
                                # Проверяем severity-фильтр: down=critical, degraded=warning, up=info
                                if new_status == 'down' and not u.notify_critical:
                                    continue
                                if new_status == 'degraded' and not u.notify_warning:
                                    continue
                                if new_status == 'up' and old_status == 'down' and not u.notify_info:
                                    continue
                                # Проверяем категорию
                                cats = u.notify_categories or []
                                if cats and 'website' not in cats:
                                    continue
                                await self.api.send_message(u.telegram_id, text)
                            except Exception as e:
                                logger.warning(f"Health check notify error [{u.telegram_id}]: {e}")

                        logger.info(f"🏥 {w.name} ({url}): {old_status} → {new_status}")

            except Exception as e:
                logger.error(f"Health check error: {e}", exc_info=True)

            await asyncio.sleep(HEALTH_CHECK_INTERVAL)

    # ── Server health check ───────────────────────────────────
    async def _ping_host(self, host: str) -> dict:
        """Ping сервера (ICMP, fallback на TCP)"""
        if not host:
            return {'status': 'down', 'response_time': None}
        # ICMP ping
        try:
            is_win = platform.system().lower() == 'windows'
            # Windows: -n 1 -w 3000 (ms); Linux: -c 1 -W 3 (sec)
            ping_args = ['ping', '-n', '1', '-w', '3000', host] if is_win else ['ping', '-c', '1', '-W', '3', host]
            start = time.time()
            proc = await asyncio.create_subprocess_exec(
                *ping_args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
            elapsed = round((time.time() - start) * 1000, 2)
            if proc.returncode == 0:
                return {'status': 'ok', 'response_time': elapsed}
        except Exception:
            pass
        # TCP fallback
        for port in [22, 80, 443, 3389, 445]:
            try:
                start = time.time()
                _, writer = await asyncio.wait_for(
                    asyncio.open_connection(host, port), timeout=3,
                )
                elapsed = round((time.time() - start) * 1000, 2)
                writer.close()
                try:
                    await writer.wait_closed()
                except Exception:
                    pass
                return {'status': 'ok', 'response_time': elapsed}
            except Exception:
                continue
        return {'status': 'down', 'response_time': None}

    async def _server_health_check_loop(self):
        """Фоновая задача: периодическая проверка серверов (ping), уведомление при смене статуса"""
        await asyncio.sleep(8)
        prev_status: dict[str, str] = {}
        logger.info(f"🖥 Мониторинг серверов запущен (интервал: {SERVER_CHECK_INTERVAL}с)")

        while self._running:
            try:
                async with get_session() as session:
                    servers = (await session.execute(select(ServerModel))).scalars().all()
                    users = (await session.execute(
                        select(TelegramBotUserModel).where(
                            TelegramBotUserModel.bot_id == self.bot_id,
                            TelegramBotUserModel.is_active == True,
                        )
                    )).scalars().all()

                for s in servers:
                    if not s.host:
                        continue
                    result = await self._ping_host(s.host)
                    new_status = result['status']
                    old_status = prev_status.get(s.id)
                    prev_status[s.id] = new_status

                    if old_status is None:
                        continue

                    if new_status != old_status:
                        if new_status == 'down':
                            emoji, label = '🔴', 'НЕДОСТУПЕН'
                        else:
                            emoji, label = '🟢', 'ДОСТУПЕН'

                        rt = f"{result['response_time']:.0f}ms" if result.get('response_time') else '—'
                        text = (
                            f"{emoji} <b>Сервер: {s.name}</b>\n\n"
                            f"🖥 Хост: {s.host}\n"
                            f"📊 Статус: <b>{label}</b> (было: {old_status})\n"
                            f"⏱ Пинг: <b>{rt}</b>\n\n"
                            f"🕐 {datetime.datetime.now().strftime('%d.%m.%Y %H:%M:%S')}"
                        )

                        for u in users:
                            try:
                                if s.org_id and u.org_id and u.org_id != s.org_id:
                                    continue
                                if new_status == 'down' and not u.notify_critical:
                                    continue
                                if new_status == 'ok' and not u.notify_info:
                                    continue
                                cats = u.notify_categories or []
                                if cats and 'system' not in cats:
                                    continue
                                await self.api.send_message(u.telegram_id, text)
                            except Exception as e:
                                logger.warning(f"Server notify error [{u.telegram_id}]: {e}")

                        logger.info(f"🖥 {s.name} ({s.host}): {old_status} → {new_status}")

            except Exception as e:
                logger.error(f"Server health check error: {e}", exc_info=True)

            await asyncio.sleep(SERVER_CHECK_INTERVAL)

    # ── Alert watcher ─────────────────────────────────────────
    async def _alert_watcher_loop(self):
        """Фоновая задача: отслеживание новых алертов из БД и автоматическая рассылка"""
        await asyncio.sleep(10)
        last_alert_id = 0
        try:
            async with get_session() as session:
                max_id = (await session.execute(select(func.max(AlertModel.id)))).scalar()
                if max_id:
                    last_alert_id = max_id
        except Exception:
            pass

        logger.info(f"🔔 Alert watcher запущен (интервал: {ALERT_WATCH_INTERVAL}с, от ID: {last_alert_id})")

        while self._running:
            try:
                async with get_session() as session:
                    new_alerts = (await session.execute(
                        select(AlertModel)
                        .where(AlertModel.id > last_alert_id)
                        .order_by(AlertModel.id)
                        .limit(20)
                    )).scalars().all()

                    if new_alerts:
                        users = (await session.execute(
                            select(TelegramBotUserModel).where(
                                TelegramBotUserModel.bot_id == self.bot_id,
                                TelegramBotUserModel.is_active == True,
                            )
                        )).scalars().all()

                        for alert in new_alerts:
                            last_alert_id = alert.id
                            sev = SEV_EMOJI.get(alert.severity, '⚪')
                            ts = alert.created_at.strftime('%d.%m %H:%M') if alert.created_at else ''

                            text = (
                                f"{sev} <b>Новый алерт #{alert.id}</b>\n\n"
                                f"📝 {alert.title}\n"
                                f"📄 {alert.message or '—'}\n\n"
                                f"📊 {SEV_LABELS.get(alert.severity, alert.severity)}\n"
                                f"📍 {alert.target_name or alert.target_type or '—'}\n"
                                f"📂 {CATEGORY_LABELS.get(alert.category, alert.category or '—')}\n"
                                f"🕐 {ts}"
                            )

                            # Определить org_id алерта
                            alert_org_id = None
                            if alert.target_type == 'server' and alert.target_id:
                                srv = (await session.execute(
                                    select(ServerModel).where(ServerModel.id == alert.target_id)
                                )).scalars().first()
                                if srv:
                                    alert_org_id = srv.org_id
                            elif alert.target_type == 'website' and alert.target_id:
                                ws = (await session.execute(
                                    select(WebsiteModel).where(WebsiteModel.id == alert.target_id)
                                )).scalars().first()
                                if ws:
                                    alert_org_id = ws.org_id

                            for u in users:
                                try:
                                    if u.org_id and alert_org_id and u.org_id != alert_org_id:
                                        continue
                                    if alert.severity == 'critical' and not u.notify_critical:
                                        continue
                                    if alert.severity == 'warning' and not u.notify_warning:
                                        continue
                                    if alert.severity == 'info' and not u.notify_info:
                                        continue
                                    cats = u.notify_categories or []
                                    if cats and alert.category not in cats:
                                        continue
                                    await self.api.send_message(u.telegram_id, text)
                                except Exception as e:
                                    logger.warning(f"Alert notify error [{u.telegram_id}]: {e}")

                            logger.info(f"🔔 Алерт #{alert.id}: {alert.title}")

            except Exception as e:
                logger.error(f"Alert watcher error: {e}", exc_info=True)

            await asyncio.sleep(ALERT_WATCH_INTERVAL)

    # ── Periodic digest ───────────────────────────────────────
    async def _periodic_digest_loop(self):
        """Фоновая задача: периодическая отправка сводки по системе"""
        await asyncio.sleep(30)
        logger.info(f"📊 Auto-digest запущен (интервал: {DIGEST_INTERVAL}с)")

        while self._running:
            try:
                async with get_session() as session:
                    srv_total = (await session.execute(select(func.count(ServerModel.id)))).scalar() or 0
                    ws_total = (await session.execute(select(func.count(WebsiteModel.id)))).scalar() or 0
                    active_alerts = (await session.execute(
                        select(func.count(AlertModel.id)).where(AlertModel.is_active == True)
                    )).scalar() or 0
                    crit_alerts = (await session.execute(
                        select(func.count(AlertModel.id)).where(
                            AlertModel.is_active == True, AlertModel.severity == 'critical'
                        )
                    )).scalar() or 0
                    websites = (await session.execute(select(WebsiteModel))).scalars().all()
                    servers = (await session.execute(select(ServerModel))).scalars().all()

                # Проверяем сайты
                ws_down_list = []
                ws_up = 0
                for w in websites:
                    r = await self._probe_url(w.url)
                    if r['status'] == 'up':
                        ws_up += 1
                    else:
                        ws_down_list.append(w)

                # Проверяем серверы
                srv_down_list = []
                srv_up = 0
                for s in servers:
                    if not s.host:
                        continue
                    r = await self._ping_host(s.host)
                    if r['status'] == 'ok':
                        srv_up += 1
                    else:
                        srv_down_list.append(s)

                ws_down = len(ws_down_list)
                srv_down = len(srv_down_list)
                status_icon = '🟢' if (crit_alerts == 0 and ws_down == 0 and srv_down == 0) else '🔴'

                text = (
                    f"{status_icon} <b>📊 Автоматическая сводка</b>\n"
                    f"<i>{datetime.datetime.now().strftime('%d.%m.%Y %H:%M')}</i>\n\n"
                    f"🖥 Серверы: {srv_up}✅ / {srv_down}❌ (всего {srv_total})\n"
                    f"🌐 Сайты: {ws_up}✅ / {ws_down}❌ (всего {ws_total})\n"
                    f"⚠️ Активных алертов: <b>{active_alerts}</b>\n"
                    f"🔴 Критических: <b>{crit_alerts}</b>\n"
                )

                if ws_down > 0:
                    text += "\n❌ <b>Недоступные сайты:</b>\n"
                    for w in ws_down_list:
                        text += f"  🔴 {w.name} ({w.url})\n"

                if srv_down > 0:
                    text += "\n❌ <b>Недоступные серверы:</b>\n"
                    for s in srv_down_list:
                        text += f"  🔴 {s.name} ({s.host})\n"

                hours = DIGEST_INTERVAL // 3600
                if hours > 0:
                    text += f"\n🔄 Следующая сводка через {hours}ч."
                else:
                    text += f"\n🔄 Следующая сводка через {DIGEST_INTERVAL // 60}мин."

                # Отправляем всем активным пользователям
                async with get_session() as session:
                    users = (await session.execute(
                        select(TelegramBotUserModel).where(
                            TelegramBotUserModel.bot_id == self.bot_id,
                            TelegramBotUserModel.is_active == True,
                        )
                    )).scalars().all()

                for u in users:
                    try:
                        await self.api.send_message(u.telegram_id, text)
                    except Exception as e:
                        logger.warning(f"Digest notify error [{u.telegram_id}]: {e}")

                logger.info(f"📊 Digest отправлен {len(users)} пользователям")

            except Exception as e:
                logger.error(f"Digest error: {e}", exc_info=True)

            await asyncio.sleep(DIGEST_INTERVAL)

    # ── Commands ──────────────────────────────────────────────
    async def cmd_start(self, msg: dict, from_user: dict):
        chat_id = msg['chat']['id']
        async with get_session() as session:
            user = await self._require_user(session, from_user, chat_id)
            if not user:
                return
            org_name = await self._get_org_name(session, user.org_id)

        text = (
            f"👋 <b>Добро пожаловать в систему мониторинга!</b>\n\n"
            f"👤 <b>{self._full_name(from_user)}</b>\n"
            f"🏢 Организация: <b>{org_name}</b>\n\n"
            f"Используйте кнопки ниже или команды:\n"
            f"/status — общий статус системы\n"
            f"/alerts — последние алерты\n"
            f"/org — информация об организации\n"
            f"/help — все команды"
        )
        kb = reply_keyboard()
        await self.api.send_message(chat_id, text, reply_markup=kb)

    async def cmd_help(self, msg: dict, from_user: dict):
        chat_id = msg['chat']['id']
        async with get_session() as session:
            user = await self._require_user(session, from_user, chat_id)
            if not user:
                return
        text = (
            "📖 <b>Команды бота</b>\n\n"
            "/start — Приветствие\n"
            "/status — Общий статус системы\n"
            "/alerts — Последние алерты\n"
            "/org — Информация об организации\n"
            "/servers — Список серверов\n"
            "/websites — Список сайтов\n"
            "/health — Health Check всех сайтов\n"
            "/help — Справка\n\n"
            "🤖 <b>Автоматический мониторинг:</b>\n"
            f"🌐 Сайты — каждые {HEALTH_CHECK_INTERVAL} сек.\n"
            f"🖥 Серверы — каждые {SERVER_CHECK_INTERVAL} сек.\n"
            f"🔔 Алерты — каждые {ALERT_WATCH_INTERVAL} сек.\n"
            f"📊 Сводка — каждые {DIGEST_INTERVAL // 3600} ч.\n\n"
            "При изменении статуса сервера или сайта\n"
            "бот автоматически отправляет уведомление.\n\n"
            "⚙️ Настройки уведомлений управляются\n"
            "администратором через веб-интерфейс."
        )
        await self.api.send_message(chat_id, text)

    async def cmd_status(self, msg: dict, from_user: dict):
        chat_id = msg['chat']['id']
        async with get_session() as session:
            user = await self._require_user(session, from_user, chat_id)
            if not user:
                return
            org_name = await self._get_org_name(session, user.org_id)

            srv_q = select(func.count(ServerModel.id))
            ws_q = select(func.count(WebsiteModel.id))
            if user.org_id:
                srv_q = srv_q.where(ServerModel.org_id == user.org_id)
                ws_q = ws_q.where(WebsiteModel.org_id == user.org_id)

            srv_count = (await session.execute(srv_q)).scalar() or 0
            ws_count = (await session.execute(ws_q)).scalar() or 0

            alert_q = select(func.count(AlertModel.id)).where(AlertModel.is_active == True)
            active_alerts = (await session.execute(alert_q)).scalar() or 0

            crit_q = select(func.count(AlertModel.id)).where(
                AlertModel.is_active == True,
                AlertModel.severity == 'critical',
            )
            crit_alerts = (await session.execute(crit_q)).scalar() or 0

        sevs = []
        if user.notify_critical: sevs.append('🔴 Critical')
        if user.notify_warning: sevs.append('🟡 Warning')
        if user.notify_info: sevs.append('🔵 Info')

        cats = user.notify_categories or []
        cat_str = ', '.join(CATEGORY_LABELS.get(c, c) for c in cats) if cats else '📂 Все категории'

        status_icon = '🟢' if crit_alerts == 0 else '🔴'
        text = (
            f"{status_icon} <b>Статус системы мониторинга</b>\n\n"
            f"🖥 Серверов: <b>{srv_count}</b>\n"
            f"🌐 Сайтов: <b>{ws_count}</b>\n"
            f"⚠️ Активных алертов: <b>{active_alerts}</b>\n"
            f"🔴 Критических: <b>{crit_alerts}</b>\n\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"👤 <b>{self._full_name(from_user)}</b>\n"
            f"🏢 Организация: <b>{org_name}</b>\n"
            f"🔔 Уведомления: <b>{'Включены' if user.is_active else '🔇 Отключены'}</b>\n"
            f"📊 Серьезность: {', '.join(sevs) if sevs else '❌ Выкл'}\n"
            f"📂 Категории: {cat_str}"
        )
        await self.api.send_message(chat_id, text)

    async def cmd_alerts(self, msg: dict, from_user: dict, page: int = 0):
        chat_id = msg['chat']['id']
        per_page = 5
        async with get_session() as session:
            user = await self._require_user(session, from_user, chat_id)
            if not user:
                return

            q = select(AlertModel).order_by(desc(AlertModel.created_at))
            if user.org_id:
                srv_ids = (await session.execute(
                    select(ServerModel.id).where(ServerModel.org_id == user.org_id)
                )).scalars().all()
                ws_ids = (await session.execute(
                    select(WebsiteModel.id).where(WebsiteModel.org_id == user.org_id)
                )).scalars().all()
                conditions = []
                if srv_ids:
                    conditions.append(and_(AlertModel.target_type == 'server', AlertModel.target_id.in_([str(i) for i in srv_ids])))
                if ws_ids:
                    conditions.append(and_(AlertModel.target_type == 'website', AlertModel.target_id.in_([str(i) for i in ws_ids])))
                if conditions:
                    q = q.where(or_(*conditions))
                else:
                    await self.api.send_message(chat_id, "📭 Нет алертов для вашей организации.")
                    return

            total_q = select(func.count()).select_from(q.subquery())
            total = (await session.execute(total_q)).scalar() or 0
            alerts = (await session.execute(q.offset(page * per_page).limit(per_page))).scalars().all()

        if not alerts:
            await self.api.send_message(chat_id, "✅ <b>Нет алертов!</b>\n\nВсё работает штатно.")
            return

        lines = [f"🔔 <b>Алерты</b> (стр. {page + 1}, всего {total})\n"]
        for a in alerts:
            sev = SEV_EMOJI.get(a.severity, '⚪')
            resolved = '✅' if not a.is_active else '❗'
            ts = a.created_at.strftime('%d.%m %H:%M') if a.created_at else ''
            lines.append(f"{sev}{resolved} <b>{a.title}</b>\n   📍 {a.target_name or a.target_type or '—'} · {ts}\n")

        kb = alerts_keyboard(alerts, page, total, per_page)
        await self.api.send_message(chat_id, '\n'.join(lines), reply_markup=kb)

    async def cmd_org(self, msg: dict, from_user: dict):
        chat_id = msg['chat']['id']
        async with get_session() as session:
            user = await self._require_user(session, from_user, chat_id)
            if not user:
                return
            if not user.org_id:
                await self.api.send_message(
                    chat_id,
                    "🏢 <b>Организация не назначена</b>\n\nОбратитесь к администратору для привязки через веб-панель."
                )
                return
            org_name = await self._get_org_name(session, user.org_id)
            srv_count = (await session.execute(
                select(func.count(ServerModel.id)).where(ServerModel.org_id == user.org_id)
            )).scalar() or 0
            ws_count = (await session.execute(
                select(func.count(WebsiteModel.id)).where(WebsiteModel.org_id == user.org_id)
            )).scalar() or 0
            # Count only alerts related to this org's resources
            alert_q = select(func.count(AlertModel.id)).where(AlertModel.is_active == True)
            if user.org_id:
                srv_ids_for_org = (await session.execute(
                    select(ServerModel.id).where(ServerModel.org_id == user.org_id)
                )).scalars().all()
                ws_ids_for_org = (await session.execute(
                    select(WebsiteModel.id).where(WebsiteModel.org_id == user.org_id)
                )).scalars().all()
                conditions = []
                if srv_ids_for_org:
                    conditions.append(and_(AlertModel.target_type == 'server', AlertModel.target_id.in_([str(i) for i in srv_ids_for_org])))
                if ws_ids_for_org:
                    conditions.append(and_(AlertModel.target_type == 'website', AlertModel.target_id.in_([str(i) for i in ws_ids_for_org])))
                if conditions:
                    alert_q = alert_q.where(or_(*conditions))
                else:
                    alert_q = alert_q.where(False)
            active_alerts = (await session.execute(alert_q)).scalar() or 0

        await self.api.send_message(
            chat_id,
            f"🏢 <b>Организация: {org_name}</b>\n\n"
            f"🖥 Серверов: <b>{srv_count}</b>\n"
            f"🌐 Сайтов: <b>{ws_count}</b>\n"
            f"⚠️ Активных алертов: <b>{active_alerts}</b>"
        )

    async def cmd_servers(self, msg: dict, from_user: dict):
        chat_id = msg['chat']['id']
        async with get_session() as session:
            user = await self._require_user(session, from_user, chat_id)
            if not user:
                return
            q = select(ServerModel)
            if user.org_id:
                q = q.where(ServerModel.org_id == user.org_id)
            servers = (await session.execute(q.limit(20))).scalars().all()

        if not servers:
            await self.api.send_message(chat_id, "🖥 <b>Нет серверов</b>\n\nСервера не найдены.")
            return

        lines = ['🖥 <b>Серверы</b>\n']
        for s in servers:
            host_str = s.host or '—'
            monitor_icon = {'ssh': '🔐', 'winrm': '🪟', 'agent': '📡'}.get(s.monitor_type or 'agent', '⚙️')
            lines.append(f"{monitor_icon} <b>{s.name}</b> ({host_str})")
        await self.api.send_message(chat_id, '\n'.join(lines))

    async def cmd_websites(self, msg: dict, from_user: dict):
        chat_id = msg['chat']['id']
        async with get_session() as session:
            user = await self._require_user(session, from_user, chat_id)
            if not user:
                return
            q = select(WebsiteModel)
            if user.org_id:
                q = q.where(WebsiteModel.org_id == user.org_id)
            websites = (await session.execute(q.limit(20))).scalars().all()

        if not websites:
            await self.api.send_message(chat_id, "🌐 <b>Нет сайтов</b>\n\nСайты не найдены.")
            return

        lines = ['🌐 <b>Сайты</b>\n']
        for w in websites:
            lines.append(f"🔗 <b>{w.name}</b>\n   {w.url}")
        lines.append(f"\n💡 Используйте /health для проверки статуса")
        await self.api.send_message(chat_id, '\n'.join(lines))

    async def cmd_health(self, msg: dict, from_user: dict):
        """Ручная проверка всех веб-сайтов организации пользователя"""
        chat_id = msg['chat']['id']
        async with get_session() as session:
            user = await self._require_user(session, from_user, chat_id)
            if not user:
                return
            q = select(WebsiteModel)
            if user.org_id:
                q = q.where(WebsiteModel.org_id == user.org_id)
            websites = (await session.execute(q.limit(20))).scalars().all()

        if not websites:
            await self.api.send_message(chat_id, "🌐 <b>Нет сайтов для проверки</b>")
            return

        await self.api.send_message(chat_id, f"🏥 <b>Health Check</b>\n\nПроверяю {len(websites)} сайт(ов)...")

        lines = ['🏥 <b>Результаты Health Check</b>\n']
        for w in websites:
            result = await self._probe_url(w.url)
            st = result['status']
            si = '🟢' if st == 'up' else '🔴' if st == 'down' else '🟡'
            rt = f"{result['response_time']:.0f}ms" if result.get('response_time') else '—'
            code = result.get('status_code', '—')
            ssl_str = ''
            if result.get('ssl'):
                s = result['ssl']
                ssl_str = f" · 🔒{'✅' if s['valid'] else '❌'} {s['days_left']}дн."
            lines.append(f"{si} <b>{w.name}</b>\n   {w.url}\n   HTTP {code} · {rt}{ssl_str}\n")

        lines.append(f"\n🕐 {datetime.datetime.now().strftime('%d.%m.%Y %H:%M:%S')}")
        await self.api.send_message(chat_id, '\n'.join(lines))

    # ── Callback handlers ─────────────────────────────────────
    async def handle_callback(self, callback: dict):
        cb_id = callback.get('id')
        data = callback.get('data', '')
        from_user = callback.get('from', {})
        message = callback.get('message', {})
        chat_id = message.get('chat', {}).get('id')
        message_id = message.get('message_id')

        if data == 'close':
            await self.api.delete_message(chat_id, message_id)
            await self.api.answer_callback_query(cb_id)
            return

        if data.startswith('alerts_'):
            page = int(data[7:])
            await self.api.delete_message(chat_id, message_id)
            await self.cmd_alerts({'chat': {'id': chat_id}}, from_user, page=page)
            await self.api.answer_callback_query(cb_id)
        elif data.startswith('alertd_'):
            alert_id = int(data[7:])
            await self._show_alert_detail(cb_id, alert_id, chat_id)

    async def _show_alert_detail(self, cb_id, alert_id, chat_id):
        async with get_session() as session:
            res = await session.execute(select(AlertModel).where(AlertModel.id == alert_id))
            alert = res.scalars().first()

        if not alert:
            await self.api.answer_callback_query(cb_id, 'Алерт не найден')
            return

        sev = SEV_EMOJI.get(alert.severity, '⚪')
        resolved = '✅ Решён' if not alert.is_active else '❗ Активный'
        ts = alert.created_at.strftime('%d.%m.%Y %H:%M:%S') if alert.created_at else '—'
        resolved_at = '—'
        if hasattr(alert, 'resolved_at') and alert.resolved_at:
            resolved_at = alert.resolved_at.strftime('%d.%m.%Y %H:%M:%S')

        text = (
            f"{sev} <b>Алерт #{alert.id}</b>\n\n"
            f"📝 <b>{alert.title}</b>\n"
            f"📄 {alert.message or '—'}\n\n"
            f"📊 Серьезность: <b>{alert.severity.upper()}</b>\n"
            f"📍 Цель: <b>{alert.target_name or alert.target_type or '—'}</b>\n"
            f"📂 Категория: <b>{alert.category or '—'}</b>\n\n"
            f"🕐 Создан: {ts}\n"
            f"📋 Статус: {resolved}\n"
            f"🕐 Решён: {resolved_at}"
        )
        await self.api.send_message(chat_id, text, reply_markup=close_keyboard())
        await self.api.answer_callback_query(cb_id)

    # ── Message router ────────────────────────────────────────
    async def handle_message(self, msg: dict):
        text = (msg.get('text') or '').strip()
        from_user = msg.get('from', {})
        if not from_user.get('id'):
            return

        cmd = text.split()[0].lower() if text else ''
        # Handle /start@mybot format
        if '@' in cmd:
            cmd = cmd.split('@')[0]

        COMMANDS = {
            '/start': self.cmd_start,
            '/help': self.cmd_help,
            '/status': self.cmd_status,
            '/alerts': self.cmd_alerts,
            '/org': self.cmd_org,
            '/servers': self.cmd_servers,
            '/websites': self.cmd_websites,
            '/health': self.cmd_health,
        }

        TEXT_COMMANDS = {
            '📊 Статус': self.cmd_status,
            '🔔 Последние алерты': self.cmd_alerts,
            '🏢 Организация': self.cmd_org,
            '🖥 Серверы': self.cmd_servers,
            '🌐 Сайты': self.cmd_websites,
            'ℹ️ Помощь': self.cmd_help,
            '🏥 Health Check': self.cmd_health,
        }

        handler = COMMANDS.get(cmd) or TEXT_COMMANDS.get(text)
        if handler:
            try:
                await handler(msg, from_user)
            except Exception as e:
                logger.error(f"Handler error [{cmd or text}]: {e}", exc_info=True)

    # ── Polling loop ──────────────────────────────────────────
    async def run(self):
        logger.info(f"🤖 Запуск бота '{self.bot_name}' (id={self.bot_id})...")

        # Удаляем webhook чтобы использовать polling
        await self.api.delete_webhook()

        # Проверяем бота
        me = await self.api.get_me()
        if me.get('ok'):
            bot_info = me.get('result', {})
            logger.info(f"✅ Бот: @{bot_info.get('username')} ({bot_info.get('first_name')})")
        else:
            logger.error(f"❌ Токен невалидный: {me.get('description')}")
            return

        # Устанавливаем команды
        await self.api.set_my_commands([
            {'command': 'start', 'description': 'Приветствие'},
            {'command': 'status', 'description': 'Статус системы мониторинга'},
            {'command': 'alerts', 'description': 'Последние алерты'},
            {'command': 'org', 'description': 'Информация об организации'},
            {'command': 'servers', 'description': 'Список серверов'},
            {'command': 'websites', 'description': 'Список сайтов'},
            {'command': 'health', 'description': 'Health Check — проверить все сайты'},
            {'command': 'help', 'description': 'Справка по командам'},
        ])

        # Запускаем фоновые задачи автоматического мониторинга
        self._health_task = asyncio.create_task(self._health_check_loop())
        self._server_task = asyncio.create_task(self._server_health_check_loop())
        self._alert_task = asyncio.create_task(self._alert_watcher_loop())
        self._digest_task = asyncio.create_task(self._periodic_digest_loop())

        logger.info(f"🔄 Бот '{self.bot_name}' запущен! Polling + автомониторинг активны...")

        conflict_retries = 0
        while self._running:
            try:
                updates = await self.api.get_updates(offset=self._offset, timeout=30)
                conflict_retries = 0  # сброс при успехе
                for update in updates:
                    self._offset = update['update_id'] + 1

                    if 'message' in update:
                        await self.handle_message(update['message'])
                    elif 'callback_query' in update:
                        await self.handle_callback(update['callback_query'])

            except TelegramConflictError:
                conflict_retries += 1
                wait = min(30, 5 * conflict_retries)
                logger.error(
                    f"⚠️ Конфликт: другой экземпляр бота уже запущен! "
                    f"Повтор через {wait}с... (попытка {conflict_retries})"
                )
                if conflict_retries >= 6:
                    logger.error("❌ Слишком много конфликтов. Остановка бота.")
                    break
                await asyncio.sleep(wait)
            except httpx.ReadTimeout:
                continue
            except httpx.ConnectError:
                logger.warning("Нет подключения к Telegram API, повтор через 5с...")
                await asyncio.sleep(5)
            except Exception as e:
                logger.error(f"Polling error: {e}", exc_info=True)
                await asyncio.sleep(2)

        # Отменяем все фоновые задачи
        for task_name in ('_health_task', '_server_task', '_alert_task', '_digest_task'):
            task = getattr(self, task_name, None)
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        await self.api.close()
        logger.info("Бот остановлен.")

    def stop(self):
        self._running = False


# ─── Background start (for FastAPI integration) ─────────────
_background_bot_instance = None
_background_bot_lock_fd = None


def _acquire_background_bot_lock() -> bool:
    """Ensure only one process runs telegram polling in reload/multi-process mode."""
    global _background_bot_lock_fd
    if _background_bot_lock_fd is not None:
        return True

    lock_dir = os.path.join(PROJECT_ROOT, 'data')
    os.makedirs(lock_dir, exist_ok=True)
    lock_path = os.path.join(lock_dir, '.telegram_bot.lock')

    def _try_create_lock():
        fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_RDWR)
        os.write(fd, str(os.getpid()).encode('utf-8'))
        return fd

    try:
        _background_bot_lock_fd = _try_create_lock()
        return True
    except FileExistsError:
        # Recover stale lock if previous owner PID is gone.
        try:
            with open(lock_path, 'r', encoding='utf-8') as f:
                pid_text = (f.read() or '').strip()
            stale_pid = int(pid_text) if pid_text else None
            if stale_pid and not psutil.pid_exists(stale_pid):
                os.remove(lock_path)
                _background_bot_lock_fd = _try_create_lock()
                return True
        except Exception:
            pass
        return False
    except Exception:
        return False


def _release_background_bot_lock() -> None:
    global _background_bot_lock_fd
    if _background_bot_lock_fd is None:
        return
    try:
        os.close(_background_bot_lock_fd)
    except Exception:
        pass
    _background_bot_lock_fd = None
    lock_path = os.path.join(PROJECT_ROOT, 'data', '.telegram_bot.lock')
    try:
        if os.path.exists(lock_path):
            os.remove(lock_path)
    except Exception:
        pass


async def start_bot_background():
    """Запуск бота как фоновой задачи (вызывается из main.py startup_event)"""
    global _background_bot_instance
    if not _acquire_background_bot_lock():
        logger.info("ℹ️ Telegram bot: polling уже запущен в другом процессе — пропуск")
        return None

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    bot_record = None
    try:
        async with get_session() as session:
            res = await session.execute(
                select(TelegramBotModel).where(TelegramBotModel.is_active == True).limit(1)
            )
            bot_record = res.scalars().first()
    except Exception as e:
        logger.warning(f"Не удалось прочитать бота из БД: {e}")

    if not bot_record:
        token = os.getenv('TELEGRAM_BOT_TOKEN', '').strip()
        if not token:
            logger.info("ℹ️ Telegram bot: нет активных ботов и не задан TELEGRAM_BOT_TOKEN — пропуск")
            return None
        bot = MonitoringBot(token=token, bot_id=0, bot_name='EnvBot')
    else:
        logger.info(f"🤖 Автозапуск бота '{bot_record.name}' (id={bot_record.id}) из бэкенда")
        bot = MonitoringBot(token=bot_record.token, bot_id=bot_record.id, bot_name=bot_record.name)

    _background_bot_instance = bot

    async def _run_with_lock_cleanup():
        try:
            await bot.run()
        finally:
            _release_background_bot_lock()

    asyncio.create_task(_run_with_lock_cleanup())
    return bot


# ─── Main ────────────────────────────────────────────────────
async def main():
    """Запуск: берём первого активного бота из БД или токен из ENV"""
    # Создаём таблицы если нет
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    bot_record = None
    try:
        async with get_session() as session:
            res = await session.execute(
                select(TelegramBotModel).where(TelegramBotModel.is_active == True).limit(1)
            )
            bot_record = res.scalars().first()
    except Exception as e:
        logger.warning(f"Не удалось прочитать бота из БД: {e}")

    if not bot_record:
        token = os.getenv('TELEGRAM_BOT_TOKEN', '').strip()
        if not token:
            logger.error(
                "❌ Нет активных ботов в БД и не задан TELEGRAM_BOT_TOKEN.\n"
                "   Добавьте бота через веб-интерфейс или задайте переменную окружения:\n"
                "   $env:TELEGRAM_BOT_TOKEN = '123456789:ABCdef...'"
            )
            return
        logger.info("Используется токен из переменной TELEGRAM_BOT_TOKEN")
        bot = MonitoringBot(token=token, bot_id=0, bot_name='EnvBot')
    else:
        logger.info(f"Бот из БД: '{bot_record.name}' (id={bot_record.id})")
        bot = MonitoringBot(
            token=bot_record.token,
            bot_id=bot_record.id,
            bot_name=bot_record.name,
        )

    # Graceful shutdown
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, bot.stop)
        except NotImplementedError:
            pass  # Windows не поддерживает signal handlers

    await bot.run()


if __name__ == '__main__':
    asyncio.run(main())
