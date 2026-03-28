"use client";

import { useEffect, useRef, useCallback } from "react";
import { WS_URL } from "@/shared/constants";
import type { WSMessage } from "@/shared/types";

type Handler = (data: unknown) => void;

export interface UseSocketReturn {
  send: (event: string, data?: unknown) => void;
  on:   (event: string, handler: Handler) => () => void;
}

export function useSocket(): UseSocketReturn {
  const ws          = useRef<WebSocket | null>(null);
  const handlers    = useRef<Map<string, Set<Handler>>>(new Map());
  const queue       = useRef<string[]>([]);
  const reconnectTO = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dispatch = useCallback((event: string, data: unknown) => {
    handlers.current.get(event)?.forEach((h) => h(data));
  }, []);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      dispatch("__open", null);
      // Flush queued messages
      queue.current.forEach((msg) => socket.send(msg));
      queue.current = [];
    };

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WSMessage;
        dispatch(msg.event, msg.data);
      } catch (err) {
        console.error("[WS] parse error:", err);
      }
    };

    socket.onclose = () => {
      dispatch("__close", null);
      // Auto-reconnect after 2s
      reconnectTO.current = setTimeout(connect, 2000);
    };

    socket.onerror = (err) => {
      dispatch("__error", err);
      socket.close();
    };
  }, [dispatch]);

  useEffect(() => {
    connect();
    return () => {
      reconnectTO.current && clearTimeout(reconnectTO.current);
      ws.current?.close();
      ws.current = null;
    };
  }, [connect]);

  const send = useCallback((event: string, data: unknown = {}) => {
    const msg = JSON.stringify({ event, data });
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(msg);
    } else {
      queue.current.push(msg);
    }
  }, []);

  const on = useCallback((event: string, handler: Handler) => {
    if (!handlers.current.has(event)) {
      handlers.current.set(event, new Set());
    }
    handlers.current.get(event)!.add(handler);
    return () => {
      handlers.current.get(event)?.delete(handler);
    };
  }, []);

  return { send, on };
}