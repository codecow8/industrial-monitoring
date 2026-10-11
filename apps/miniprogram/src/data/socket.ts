import type { TelemetryScheduler, TelemetrySocket } from "@industrial/telemetry-client";
import { authHeader } from "./http";

export function createSocket(url: string): TelemetrySocket {
  const listeners: Record<string, ((event: { data?: string; code?: number }) => void)[]> = {};
  const emit = (type: string, event: { data?: string; code?: number }) => listeners[type]?.forEach(listener => listener(event));
  let closed = false;
  const close = (code?: number) => { if (!closed) { closed = true; emit("close", { code }); } };
  const task = uni.connectSocket({ url, header: authHeader(), complete: () => {} });
  task.onOpen(() => emit("open", {}));
  task.onMessage(event => { if (typeof event.data === "string") emit("message", { data: event.data }); });
  task.onClose(event => close(event.code));
  // Some handshake failures only emit onError; let the session check identity before retrying.
  task.onError(() => close());
  return {
    addEventListener(type, listener) { (listeners[type] ??= []).push(listener); },
    close() { closed = true; task.close({ code: 1000 }); },
  };
}

let previousTime = Date.now();
let elapsed = 0;
export const miniScheduler: TelemetryScheduler = {
  // A clock correction must not make a previous observation younger.
  now: () => {
    const time = Date.now();
    elapsed += Math.max(0, time - previousTime);
    previousTime = time;
    return elapsed;
  },
  requestFrame: callback => setTimeout(callback, 16),
  cancelFrame: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
