import { useCallback, useEffect, useRef, useState } from 'react';

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `ws://${window.location.hostname}:4000`;

export function useWebSocket({ onFrame, onStatus }) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const onFrameRef = useRef(onFrame);
  const onStatusRef = useRef(onStatus);

  useEffect(() => {
    onFrameRef.current = onFrame;
    onStatusRef.current = onStatus;
  }, [onFrame, onStatus]);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        onFrameRef.current?.(event.data);
        return;
      }

      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'status' || msg.type === 'error') {
          onStatusRef.current?.(msg);
        }
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  const send = useCallback((payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  return { connected, send };
}
