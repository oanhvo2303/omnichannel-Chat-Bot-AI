"use client";
import { useEffect, useRef } from "react";

/**
 * useSocket — Hook đăng ký Socket.IO event an toàn với retry.
 *
 * Vấn đề: window.__omnichannel_socket được tạo async sau khi component mount.
 * → Nếu component mount trước socket connect, listener không được đăng ký.
 *
 * Giải pháp: poll mỗi 200ms tối đa 5 giây cho đến khi socket available,
 * sau đó register listener và cleanup khi unmount.
 *
 * @param {string}   event    — tên event Socket.IO ('ai_error', 'new_message', ...)
 * @param {Function} handler  — callback khi nhận event
 * @param {Array}    deps     — dependency array (như useEffect)
 * @param {Object}   opts
 * @param {number}   opts.pollInterval — ms giữa mỗi lần poll (default: 200)
 * @param {number}   opts.maxWait      — ms tối đa chờ socket (default: 5000)
 */
export function useSocket(event, handler, deps = [], { pollInterval = 200, maxWait = 5000 } = {}) {
  const handlerRef = useRef(handler);

  // Luôn giữ ref mới nhất để tránh stale closure
  useEffect(() => { handlerRef.current = handler; });

  useEffect(() => {
    if (typeof window === "undefined") return;

    let mounted = true;
    let pollTimer = null;
    let registeredSocket = null;
    const started = Date.now();

    const stableHandler = (...args) => handlerRef.current(...args);

    const tryRegister = () => {
      if (!mounted) return;

      const socket = window.__omnichannel_socket;

      if (socket && socket.connected !== false) {
        // Socket ready → đăng ký listener
        socket.on(event, stableHandler);
        registeredSocket = socket;
        console.debug(`[useSocket] ✅ Registered "${event}" (waited ${Date.now() - started}ms)`);
        return;
      }

      if (Date.now() - started < maxWait) {
        // Chưa có socket → thử lại sau
        pollTimer = setTimeout(tryRegister, pollInterval);
      } else {
        console.warn(`[useSocket] ⚠️ Socket không available sau ${maxWait}ms — "${event}" listener bỏ qua`);
      }
    };

    tryRegister();

    return () => {
      mounted = false;
      if (pollTimer) clearTimeout(pollTimer);
      if (registeredSocket) {
        registeredSocket.off(event, stableHandler);
        console.debug(`[useSocket] 🔌 Unregistered "${event}"`);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
