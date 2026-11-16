"""Attendance email notifications over Gmail SMTP.

Disabled unless NOTIFY_EMAIL and NOTIFY_EMAIL_APP_PASSWORD are set. Delivery
runs in a worker thread so a slow SMTP server cannot stall a card tap, and a
failed send is only logged — the attendance record is already committed.
"""

import asyncio
import logging
import smtplib
from email.message import EmailMessage

from config import settings

logger = logging.getLogger("ecsi.email")


def _compose(to: str, full_name: str, id_number: str, status: str,
             check_type: str, terminal_id: str, timestamp: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = settings.NOTIFY_EMAIL
    msg["To"] = to
    msg["Subject"] = f"Attendance recorded — {full_name}"
    msg.set_content(
        f"Hello {full_name},\n\n"
        "Your attendance has been recorded.\n\n"
        f"ID number : {id_number}\n"
        f"Status    : {status.replace('_', ' ')}\n"
        f"Type      : {check_type.replace('_', ' ')}\n"
        f"Terminal  : {terminal_id}\n"
        f"Time      : {timestamp}\n\n"
        "— ECSI Attendance System"
    )
    return msg


def _send(msg: EmailMessage) -> None:
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        smtp.login(settings.NOTIFY_EMAIL, settings.NOTIFY_EMAIL_APP_PASSWORD)
        smtp.send_message(msg)


async def send_attendance_notice(user, record) -> None:
    """Email a verified tap to the student, falling back to NOTIFY_EMAIL."""
    if not settings.NOTIFY_EMAIL or not settings.NOTIFY_EMAIL_APP_PASSWORD:
        return
    to = user.email or settings.NOTIFY_EMAIL
    try:
        msg = _compose(
            to=to,
            full_name=user.full_name,
            id_number=user.id_number,
            status=record.status.value,
            check_type=record.check_type.value,
            terminal_id=record.terminal_id,
            timestamp=record.timestamp.isoformat(),
        )
        await asyncio.to_thread(_send, msg)
    except Exception:
        logger.exception("Could not email attendance notice to %s", to)
