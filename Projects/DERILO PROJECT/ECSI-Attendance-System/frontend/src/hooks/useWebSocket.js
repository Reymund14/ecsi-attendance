import { useEffect, useRef, useCallback, useState } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/dashboard";

/**
 * useWebSocket — Authenticated WebSocket hook for real-time dashboard events.
 *
 * @param {string|null} token  JWT access token (null = don't connect)
 * @param {function}    onEvent  Callback called with each parsed JSON event
 */
export function useWebSocket(token, onEvent) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (!token) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send auth handshake
      ws.send(JSON.stringify({ token }));
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.event === "connected") {
          setConnected(true);
          return;
        }
        if (data.event === "heartbeat") return;
        if (data.event === "auth_error") {
          console.error("WS auth error:", data.detail);
          ws.close();
          return;
        }
        onEvent?.(data);
      } catch {
        // ignore non-JSON frames
      }
    };

    ws.onerror = (e) => {
      console.warn("WebSocket error", e);
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 3s
      reconnectTimer.current = setTimeout(connect, 3000);
    };
  }, [token, onEvent]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
