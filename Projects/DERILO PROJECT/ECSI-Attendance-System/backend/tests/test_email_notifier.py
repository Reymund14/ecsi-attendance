"""Checks for services/email_notifier.py (run: python -m unittest discover tests)."""

import unittest
from types import SimpleNamespace
from unittest import mock

from services import email_notifier


def _user(email="student@example.com"):
    return SimpleNamespace(email=email, full_name="Juan dela Cruz", id_number="STU1")


def _record():
    return SimpleNamespace(
        status=SimpleNamespace(value="verified"),
        check_type=SimpleNamespace(value="time_in"),
        terminal_id="TERMINAL-01",
        timestamp=SimpleNamespace(isoformat=lambda: "2026-11-16T08:00:00+00:00"),
    )


class AttendanceNoticeTests(unittest.IsolatedAsyncioTestCase):
    async def test_skips_send_when_not_configured(self):
        with mock.patch.object(email_notifier.settings, "MAIL_WEBHOOK_URL", ""), \
             mock.patch.object(email_notifier.settings, "NOTIFY_EMAIL", ""), \
             mock.patch.object(email_notifier.settings, "NOTIFY_EMAIL_APP_PASSWORD", ""), \
             mock.patch.object(email_notifier, "_send_webhook") as webhook, \
             mock.patch.object(email_notifier, "_send_smtp") as smtp:
            await email_notifier.send_attendance_notice(_user(), _record())
        webhook.assert_not_called()
        smtp.assert_not_called()

    async def test_webhook_is_preferred_and_falls_back_to_notify_email(self):
        calls = []

        async def fake_webhook(to, subject, body):
            calls.append((to, subject))

        with mock.patch.object(email_notifier.settings, "MAIL_WEBHOOK_URL", "https://script/exec"), \
             mock.patch.object(email_notifier.settings, "NOTIFY_EMAIL", "school@gmail.com"), \
             mock.patch.object(email_notifier.settings, "NOTIFY_EMAIL_APP_PASSWORD", ""), \
             mock.patch.object(email_notifier, "_send_webhook", fake_webhook):
            await email_notifier.send_attendance_notice(_user("student@example.com"), _record())
            await email_notifier.send_attendance_notice(_user(None), _record())

        self.assertEqual(
            [to for to, _ in calls], ["student@example.com", "school@gmail.com"]
        )
        self.assertIn("Juan dela Cruz", calls[0][1])

    async def test_smtp_used_when_webhook_is_blank(self):
        with mock.patch.object(email_notifier.settings, "MAIL_WEBHOOK_URL", ""), \
             mock.patch.object(email_notifier.settings, "NOTIFY_EMAIL", "school@gmail.com"), \
             mock.patch.object(email_notifier.settings, "NOTIFY_EMAIL_APP_PASSWORD", "apppassword"), \
             mock.patch.object(email_notifier, "_send_smtp") as smtp:
            await email_notifier.send_attendance_notice(_user("student@example.com"), _record())
        self.assertEqual(smtp.call_args.args[0], "student@example.com")
