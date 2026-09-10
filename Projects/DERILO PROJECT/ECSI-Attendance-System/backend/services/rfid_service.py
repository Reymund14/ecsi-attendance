"""
RFID Service — Edge daemon that listens for card taps and broadcasts
the card UID to the attendance processing pipeline.

Supports three modes (set via RFID_MODE in .env):
  - USB_HID   : plug-and-play reader emulating keyboard; reads stdin lines
  - SERIAL    : UART/Serial reader (RC522 via serial adapter, PN532 etc.)
  - SPI_RC522 : Direct RPi SPI via mfrc522 library (Raspberry Pi only)

The service emits UID strings to a registered async callback so the
attendance service can act on each tap.
"""

import asyncio
import logging
import threading
from typing import Callable, Coroutine, Optional

from config import settings

logger = logging.getLogger("ecsi.rfid")

# Type alias for the UID-received callback
UIDCallback = Callable[[str], Coroutine]


class RFIDService:
    """
    Background thread that reads card UIDs and pushes them onto an
    asyncio queue for the attendance service to process.
    """

    def __init__(self):
        self._mode = settings.RFID_MODE
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._uid_callback: Optional[UIDCallback] = None

    def set_uid_callback(self, callback: UIDCallback) -> None:
        self._uid_callback = callback

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        if self._running:
            return
        self._loop = loop
        self._running = True
        self._thread = threading.Thread(target=self._reader_loop, daemon=True)
        self._thread.start()
        logger.info("RFID service started  mode=%s", self._mode)

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
        logger.info("RFID service stopped.")

    # ── Reader loop dispatcher ────────────────────────────────────────────────
    def _reader_loop(self) -> None:
        try:
            if self._mode == "USB_HID":
                self._loop_usb_hid()
            elif self._mode == "SERIAL":
                self._loop_serial()
            elif self._mode == "SPI_RC522":
                self._loop_spi_rc522()
            else:
                logger.error("Unknown RFID_MODE: %s", self._mode)
        except Exception as exc:
            logger.exception("RFID reader loop crashed: %s", exc)

    # ── USB HID mode: reader types UID as keystrokes ──────────────────────────
    def _loop_usb_hid(self) -> None:
        """
        Most plug-and-play USB readers emit the card UID as a keyboard string
        followed by Enter. We read from stdin line-by-line.
        """
        import sys
        logger.info("RFID USB-HID: listening on stdin.")
        while self._running:
            try:
                line = sys.stdin.readline()
                uid = line.strip().upper()
                if uid:
                    self._dispatch(uid)
            except Exception as exc:
                logger.warning("RFID stdin read error: %s", exc)

    # ── Serial / UART mode ────────────────────────────────────────────────────
    def _loop_serial(self) -> None:
        import serial
        port = settings.RFID_PORT
        baud = settings.RFID_BAUDRATE
        logger.info("RFID SERIAL: opening %s @ %d baud.", port, baud)
        with serial.Serial(port, baud, timeout=1) as ser:
            while self._running:
                line = ser.readline().decode("ascii", errors="ignore").strip().upper()
                if line:
                    self._dispatch(line)

    # ── SPI RC522 mode (Raspberry Pi) ─────────────────────────────────────────
    def _loop_spi_rc522(self) -> None:
        try:
            import mfrc522
        except ImportError:
            logger.error(
                "mfrc522 library not found. Install with: pip install mfrc522"
            )
            return

        reader = mfrc522.SimpleMFRC522()
        logger.info("RFID SPI RC522: polling for cards.")
        while self._running:
            try:
                uid_int, _ = reader.read_no_block()
                if uid_int:
                    uid_hex = format(uid_int, "X")
                    self._dispatch(uid_hex)
            except Exception as exc:
                logger.warning("RC522 read error: %s", exc)

    # ── Dispatch UID to async callback ────────────────────────────────────────
    def _dispatch(self, uid: str) -> None:
        logger.info("RFID tap  UID=%s", uid)
        if self._uid_callback and self._loop:
            asyncio.run_coroutine_threadsafe(self._uid_callback(uid), self._loop)


# Global singleton
rfid_service = RFIDService()
