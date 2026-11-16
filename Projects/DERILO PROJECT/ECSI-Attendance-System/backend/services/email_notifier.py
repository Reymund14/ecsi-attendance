"""Attendance email notifications over HTTPS (Google Apps Script) or SMTP.

Preferred transport is the Google Apps Script relay in backend/gmail_relay.gs:
Render's free tier blocks outbound SMTP, but allows normal HTTPS. Direct SMTP
is kept for local development or a paid Render instance.

Delivery runs off the request path; a failed send is only logged — the
attendance record is already committed.
"""

import asyncio
import logging
import smtplib
from email.message import EmailMessage

import httpx

from config import settings

logger = logging.getLogger("ecsi.email")


def _message(full_name: str, id_number: str, status: str,
             check_type: str, terminal_id: str, timestamp: str) -> tuple[str, str]:
    subject = f"Attendance recorded — {full_name}"
    body = (
        f"Hello {full_name},\n\n"
        "Your attendance has been recorded.\n\n"
        f"ID number : {id_number}\n"
        f"Status    : {status.replace('_', ' ')}\n"
        f"Type      : {check_type.replace('_', ' ')}\n"
        f"Terminal  : {terminal_id}\n"
        f"Time      : {timestamp}\n\n"
        "— ECSI Attendance System"
    )
    return subject, body


async def _send_webhook(to: str, subject: str, body: str) -> None:
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        response = await client.post(
            settings.MAIL_WEBHOOK_URL,
            json={
                "secret": settings.MAIL_WEBHOOK_SECRET,
                "to": to,
                "subject": subject,
                "body": body,
            },
        )
    # Apps Script answers "ok" after GmailApp.sendEmail succeeds.
    if response.status_code >= 400 or response.text.strip() != "ok":
        raise RuntimeError(
            f"mail relay returned {response.status_code}: {response.text[:200]}"
        )


def _send_smtp(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.NOTIFY_EMAIL
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        smtp.login(settings.NOTIFY_EMAIL, settings.NOTIFY_EMAIL_APP_PASSWORD)
        smtp.send_message(msg)


async def send_attendance_notice(user, record) -> None:
    """Email a verified tap to the student, falling back to NOTIFY_EMAIL."""
    webhook = settings.MAIL_WEBHOOK_URL
    smtp_ready = bool(settings.NOTIFY_EMAIL and settings.NOTIFY_EMAIL_APP_PASSWORD)
    if not webhook and not smtp_ready:
        return

    to = user.email or settings.NOTIFY_EMAIL
    if not to:
        logger.error("Attendance email skipped: no recipient address.")
        return

    subject, body = _message(
        full_name=user.full_name,
        id_number=user.id_number,
        status=record.status.value,
        check_type=record.check_type.value,
        terminal_id=record.terminal_id,
        timestamp=record.timestamp.isoformat(),
    )
    try:
        if webhook:
            await _send_webhook(to, subject, body)
        else:
            await asyncio.to_thread(_send_smtp, to, subject, body)
    except Exception:
        logger.exception("Could not email attendance notice to %s", to)
