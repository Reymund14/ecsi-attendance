"""
WebSocket Connection Manager — broadcasts real-time attendance events
to all connected admin/faculty dashboard clients.
"""

import asyncio
import json
import logging
from typing import Dict, List, Set

from fastapi import WebSocket

logger = logging.getLogger("ecsi.ws")


class ConnectionManager:
    """
    Tracks active WebSocket connections grouped by client role.
    Supports targeted broadcasts (admin-only, faculty, global).
    """

    def __init__(self) -> None:
        # role_tag → list of active WebSocket connections
        self._connections: Dict[str, List[WebSocket]] = {
            "super_admin": [],
            "faculty": [],
            "student": [],
        }
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, role: str) -> None:
        await websocket.accept()
        async with self._lock:
            bucket = self._connections.setdefault(role, [])
            bucket.append(websocket)
        logger.info("WS connected  role=%s  total=%s", role, self._total())

    async def disconnect(self, websocket: WebSocket, role: str) -> None:
        async with self._lock:
            bucket = self._connections.get(role, [])
            if websocket in bucket:
                bucket.remove(websocket)
        logger.info("WS disconnected  role=%s  total=%s", role, self._total())

    def _total(self) -> int:
        return sum(len(v) for v in self._connections.values())

    # ── Broadcast helpers ──────────────────────────────────────────────────
    async def broadcast_to_roles(self, payload: dict, *roles: str) -> None:
        """Send JSON payload to all connections matching any of the given roles."""
        message = json.dumps(payload)
        dead: List[tuple] = []

        for role in roles:
            for ws in list(self._connections.get(role, [])):
                try:
                    await ws.send_text(message)
                except Exception:
                    dead.append((ws, role))

        # Cleanup dead sockets
        async with self._lock:
            for ws, role in dead:
                bucket = self._connections.get(role, [])
                if ws in bucket:
                    bucket.remove(ws)

    async def broadcast_all(self, payload: dict) -> None:
        await self.broadcast_to_roles(payload, "super_admin", "faculty", "student")

    async def broadcast_admin_faculty(self, payload: dict) -> None:
        await self.broadcast_to_roles(payload, "super_admin", "faculty")

    async def broadcast_admin_only(self, payload: dict) -> None:
        await self.broadcast_to_roles(payload, "super_admin")

    # ── Heartbeat ──────────────────────────────────────────────────────────
    async def heartbeat_loop(self, interval: int = 30) -> None:
        """Periodically ping all connected clients to keep connections alive."""
        while True:
            await asyncio.sleep(interval)
            await self.broadcast_all({"event": "heartbeat"})


# Global singleton — imported and used by routers / services
ws_manager = ConnectionManager()
