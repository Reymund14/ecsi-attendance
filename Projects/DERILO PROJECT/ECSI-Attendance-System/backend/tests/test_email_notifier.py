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
        with mock.patch.object(email_notifier.settings, "NOTIFY_EMAIL", ""), \
             mock.patch.object(email_notifier.settings, "NOTIFY_EMAIL_APP_PASSWORD", ""), \
             mock.patch.object(email_notifier, "_send") as send:
            await email_notifier.send_attendance_notice(_user(), _record())
        send.assert_not_called()

    async def test_emails_student_and_falls_back_to_notify_email(self):
        sent = []
        with mock.patch.object(email_notifier.settings, "NOTIFY_EMAIL", "school@gmail.com"), \
             mock.patch.object(email_notifier.settings, "NOTIFY_EMAIL_APP_PASSWORD", "apppassword"), \
             mock.patch.object(email_notifier, "_send", side_effect=sent.append):
            await email_notifier.send_attendance_notice(_user("student@example.com"), _record())
            await email_notifier.send_attendance_notice(_user(None), _record())

        self.assertEqual([m["To"] for m in sent], ["student@example.com", "school@gmail.com"])
        self.assertEqual(sent[0]["From"], "school@gmail.com")
        self.assertIn("Juan dela Cruz", sent[0]["Subject"])
