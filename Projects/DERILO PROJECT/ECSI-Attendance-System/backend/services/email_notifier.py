"""Attendance email notifications over HTTPS (Google Apps Script) or SMTP.

Preferred transport is the Google Apps Script relay in backend/gmail_relay.gs:
Render's free tier blocks outbound SMTP, but allows normal HTTPS. Direct SMTP
is kept for local development or a paid Render instance.

Delivery runs off the request path; a failed send is only logged — the
attendance record is already committed.
"""

import asyncio
import base64
import logging
import smtplib
from email.message import EmailMessage

import httpx

from config import settings

logger = logging.getLogger("ecsi.email")

# Same ceiling as an audit capture; larger uploads would only bloat the email.
MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
_EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}

_FOOTER = "\n\n— ECSI Attendance System"


def _attendance_message(user, record) -> tuple[str, str]:
    subject = f"Attendance recorded — {user.full_name}"
    body = (
        f"Hello {user.full_name},\n\n"
        "Your attendance has been recorded.\n\n"
        f"ID number : {user.id_number}\n"
        f"Status    : {record.status.value.replace('_', ' ')}\n"
        f"Type      : {record.check_type.value.replace('_', ' ')}\n"
        f"Terminal  : {record.terminal_id}\n"
        f"Time      : {record.timestamp.isoformat()}"
        + _FOOTER
    )
    return subject, body


def _proxy_message(user, record) -> tuple[str, str]:
    subject = f"Proxy attempt on your card — {user.full_name}"
    body = (
        f"Hello {user.full_name},\n\n"
        "Someone tapped your RFID card, but the face did not match your "
        "enrolled photo. The captured image of the person is attached.\n\n"
        f"ID number : {user.id_number}\n"
        f"Card UID  : {record.card_uid_used}\n"
        f"Status    : {record.status.value.replace('_', ' ')}\n"
        f"Terminal  : {record.terminal_id}\n"
        f"Time      : {record.timestamp.isoformat()}\n\n"
        "If this was not you, please report it to the administration."
        + _FOOTER
    )
    return subject, body


def _attachment_name(photo_mime: str) -> str:
    return "attendance" + _EXTENSIONS.get(photo_mime, ".jpg")


async def _send_webhook(to: str, subject: str, body: str,
                        photo: bytes | None, photo_mime: str) -> None:
    payload = {
        "secret": settings.MAIL_WEBHOOK_SECRET,
        "to": to,
        "subject": subject,
        "body": body,
    }
    if photo:
        payload["attachmentBase64"] = base64.b64encode(photo).decode("ascii")
        payload["attachmentName"] = _attachment_name(photo_mime)
        payload["attachmentMime"] = photo_mime
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        response = await client.post(settings.MAIL_WEBHOOK_URL, json=payload)
    # Apps Script answers "ok" after GmailApp.sendEmail succeeds.
    if response.status_code >= 400 or response.text.strip() != "ok":
        raise RuntimeError(
            f"mail relay returned {response.status_code}: {response.text[:200]}"
        )


def _send_smtp(to: str, subject: str, body: str,
               photo: bytes | None, photo_mime: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.NOTIFY_EMAIL
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if photo:
        msg.add_attachment(
            photo,
            maintype="image",
            subtype=photo_mime.split("/")[-1],
            filename=_attachment_name(photo_mime),
        )
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        smtp.login(settings.NOTIFY_EMAIL, settings.NOTIFY_EMAIL_APP_PASSWORD)
        smtp.send_message(msg)


def _recipient(user) -> str | None:
    """Owner's email, falling back to NOTIFY_EMAIL. None disables the send."""
    if not settings.MAIL_WEBHOOK_URL and not (
        settings.NOTIFY_EMAIL and settings.NOTIFY_EMAIL_APP_PASSWORD
    ):
        return None
    to = user.email or settings.NOTIFY_EMAIL
    if not to:
        logger.error("Attendance email skipped: no recipient address.")
    return to


async def _deliver(to: str, subject: str, body: str,
                   photo: bytes | None, photo_mime: str) -> None:
    if photo and len(photo) > MAX_ATTACHMENT_BYTES:
        logger.warning("Attendance photo too large to attach (%d bytes).", len(photo))
        photo = None
    try:
        if settings.MAIL_WEBHOOK_URL:
            await _send_webhook(to, subject, body, photo, photo_mime)
        else:
            await asyncio.to_thread(_send_smtp, to, subject, body, photo, photo_mime)
    except Exception:
        logger.exception("Could not email attendance notice to %s", to)


async def send_attendance_notice(user, record, photo: bytes | None = None,
                                 photo_mime: str = "image/jpeg") -> None:
    """Email a verified tap to the student, with the capture attached."""
    to = _recipient(user)
    if not to:
        return
    subject, body = _attendance_message(user, record)
    await _deliver(to, subject, body, photo, photo_mime)


async def send_proxy_alert_notice(user, record, photo: bytes | None = None,
                                  photo_mime: str = "image/jpeg") -> None:
    """Tell the card owner that someone else used their card, with the evidence."""
    to = _recipient(user)
    if not to:
        return
    subject, body = _proxy_message(user, record)
    await _deliver(to, subject, body, photo, photo_mime)
