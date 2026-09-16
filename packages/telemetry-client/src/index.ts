export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export type DataFreshness = "waiting" | "fresh" | "stale";

export interface TelemetryPoint {
  value: number | null;
  freshness: DataFreshness;
  ageMs: number | null;
}

export interface TelemetrySocket {
  addEventListener(
    type: string,
    listener: (event: { data?: string }) => void,
  ): void;
  close(): void;
}

export interface TelemetryScheduler {
  now(): number;
  requestFrame(callback: () => void): unknown;
  cancelFrame(handle: unknown): void;
  setTimer(callback: () => void, delay: number): unknown;
  clearTimer(handle: unknown): void;
}

interface TelemetrySessionOptions {
  createSocket?: (url: string) => TelemetrySocket;
  scheduler?: TelemetryScheduler;
  staleAfterMs?: number;
}

interface StoredPoint {
  value: number;
  updatedAt: number;
}

const browserScheduler: TelemetryScheduler = {
  now: () => Date.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle as number),
  setTimer: (callback, delay) => window.setTimeout(callback, delay),
  clearTimer: (handle) => window.clearTimeout(handle as number),
};

export class TelemetrySession {
  connection: ConnectionState = "disconnected";

  private readonly scheduler: TelemetryScheduler;
  private readonly createSocket: (url: string) => TelemetrySocket;
  private readonly staleAfterMs: number;
  private readonly points = new Map<string, StoredPoint>();
  private readonly pendingValues = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private socket: TelemetrySocket | null = null;
  private frame: unknown = null;
  private staleTimer: unknown = null;
  private reconnectTimer: unknown = null;
  private reconnectAttempt = 0;
  private started = false;

  constructor(
    private readonly url: string,
    options: TelemetrySessionOptions = {},
  ) {
    this.scheduler = options.scheduler ?? browserScheduler;
    this.createSocket =
      options.createSocket ??
      ((url) => new WebSocket(url) as unknown as TelemetrySocket);
    this.staleAfterMs = options.staleAfterMs ?? 5000;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.connect(false);
  }

  stop(): void {
    this.started = false;
    this.socket?.close();
    this.socket = null;
    if (this.frame !== null) this.scheduler.cancelFrame(this.frame);
    if (this.staleTimer !== null) this.scheduler.clearTimer(this.staleTimer);
    if (this.reconnectTimer !== null) this.scheduler.clearTimer(this.reconnectTimer);
    this.frame = null;
    this.staleTimer = null;
    this.reconnectTimer = null;
    this.setConnection("disconnected");
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  point(dataKey: string): TelemetryPoint {
    const point = this.points.get(dataKey);
    if (!point) {
      return { value: null, freshness: "waiting", ageMs: null };
    }
    const ageMs = Math.max(0, this.scheduler.now() - point.updatedAt);
    return {
      value: point.value,
      freshness: ageMs >= this.staleAfterMs ? "stale" : "fresh",
      ageMs,
    };
  }

  private connect(isReconnect: boolean): void {
    this.setConnection(isReconnect ? "reconnecting" : "connecting");
    const socket = this.createSocket(this.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket || !this.started) return;
      this.reconnectAttempt = 0;
      this.setConnection("connected");
    });
    socket.addEventListener("message", (event) => {
      if (this.socket !== socket || typeof event.data !== "string") return;
      this.queueMessage(event.data);
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket || !this.started) return;
      this.socket = null;
      this.scheduleReconnect();
    });
  }

  private queueMessage(rawMessage: string): void {
    let message: unknown;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      return;
    }
    if (!isTelemetryMessage(message)) return;

    for (const [dataKey, value] of Object.entries(message.values)) {
      if (typeof value === "number") this.pendingValues.set(dataKey, value);
    }
    if (this.frame === null && this.pendingValues.size > 0) {
      this.frame = this.scheduler.requestFrame(() => this.flushFrame());
    }
  }

  private flushFrame(): void {
    this.frame = null;
    const updatedAt = this.scheduler.now();
    for (const [dataKey, value] of this.pendingValues) {
      this.points.set(dataKey, { value, updatedAt });
    }
    this.pendingValues.clear();
    this.scheduleStaleCheck();
    this.notify();
  }

  private scheduleStaleCheck(): void {
    if (this.staleTimer !== null) this.scheduler.clearTimer(this.staleTimer);
    const now = this.scheduler.now();
    const nextExpiry = Math.min(
      ...Array.from(this.points.values(), (point) =>
        point.updatedAt + this.staleAfterMs > now
          ? point.updatedAt + this.staleAfterMs - now
          : Number.POSITIVE_INFINITY,
      ),
    );
    if (!Number.isFinite(nextExpiry)) {
      this.staleTimer = null;
      return;
    }
    this.staleTimer = this.scheduler.setTimer(() => {
      this.staleTimer = null;
      this.notify();
      this.scheduleStaleCheck();
    }, nextExpiry);
  }

  private scheduleReconnect(): void {
    this.setConnection("reconnecting");
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 10_000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = this.scheduler.setTimer(() => {
      this.reconnectTimer = null;
      if (this.started) this.connect(true);
    }, delay);
  }

  private setConnection(connection: ConnectionState): void {
    if (this.connection === connection) return;
    this.connection = connection;
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

function isTelemetryMessage(
  message: unknown,
): message is { values: Record<string, unknown> } {
  if (typeof message !== "object" || message === null) return false;
  const values = (message as { values?: unknown }).values;
  return typeof values === "object" && values !== null && !Array.isArray(values);
}
