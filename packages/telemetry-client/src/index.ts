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

export interface TrendSample {
  readonly sampledAt: number;
  readonly value: number;
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
  pageId: string;
  pageVersion: number;
  publishedAt: string;
  createSocket?: (url: string) => TelemetrySocket;
  scheduler?: TelemetryScheduler;
  staleAfterMs?: number;
}

interface StoredPoint {
  value: number;
  id: number;
  receivedAt: number;
  ageAtReceipt: number;
  receiptTime: number;
}

const browserScheduler: TelemetryScheduler = {
  // 单调时钟只测经过时间，不受用户修改电脑时间影响。
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle as number),
  setTimer: (callback, delay) => window.setTimeout(callback, delay),
  clearTimer: (handle) => window.clearTimeout(handle as number),
};

export class TelemetrySession {
  connection: ConnectionState = "disconnected";
  latestVersion: number | null = null;

  private readonly scheduler: TelemetryScheduler;
  private readonly createSocket: (url: string) => TelemetrySocket;
  private readonly staleAfterMs: number;
  private readonly points = new Map<string, StoredPoint>();
  private readonly samples = new Map<string, TrendSample[]>();
  private readonly pendingValues = new Map<string, StoredPoint>();
  private readonly listeners = new Set<() => void>();
  private socket: TelemetrySocket | null = null;
  private frame: unknown = null;
  private staleTimer: unknown = null;
  private reconnectTimer: unknown = null;
  private reconnectAttempt = 0;
  private started = false;

  constructor(
    private readonly url: string,
    private readonly options: TelemetrySessionOptions,
  ) {
    this.scheduler = options.scheduler ?? browserScheduler;
    this.createSocket =
      options.createSocket ??
      ((url) => new WebSocket(url) as unknown as TelemetrySocket);
    this.staleAfterMs = options.staleAfterMs ?? 5000;
  }

  start(): void {
    if (this.started || this.latestVersion !== null) return;
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
    this.pendingValues.clear();
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
    const ageMs = this.age(point);
    return {
      value: point.value,
      freshness: ageMs >= this.staleAfterMs ? "stale" : "fresh",
      ageMs,
    };
  }

  trendSamples(dataKey: string): readonly TrendSample[] {
    return [...(this.samples.get(dataKey) ?? [])];
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
      if (this.socket !== socket || !this.started || typeof event.data !== "string") return;
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
    if (typeof message !== "object" || message === null) return;
    const frame = message as Record<string, unknown>;
    if (frame.pageId !== this.options.pageId || !Number.isInteger(frame.pageVersion) ||
        !["telemetry.snapshot", "telemetry.update", "telemetry.version_changed"].includes(String(frame.type))) return;
    if ((frame.pageVersion as number) > this.options.pageVersion) {
      // 丢弃尚未渲染的旧更新，保留已展示观测；新版必须手动重新加载 Schema。
      this.latestVersion = frame.pageVersion as number;
      this.stop();
      this.scheduleStaleCheck();
      this.notify();
      return;
    }
    if (frame.pageVersion !== this.options.pageVersion ||
        (frame.type !== "telemetry.snapshot" && frame.type !== "telemetry.update")) return;
    const serverTime = typeof frame.serverTime === "string" ? Date.parse(frame.serverTime) : NaN;
    const publishedAt = Date.parse(this.options.publishedAt);
    if (!Number.isFinite(serverTime) || !Number.isFinite(publishedAt) ||
        typeof frame.publishedAt !== "string" || Date.parse(frame.publishedAt) !== publishedAt ||
        typeof frame.observations !== "object" || frame.observations === null || Array.isArray(frame.observations)) return;
    const receiptTime = this.scheduler.now();
    let repeatedObservation = false;
    for (const [dataKey, raw] of Object.entries(frame.observations)) {
      if (typeof raw !== "object" || raw === null) continue;
      const item = raw as Record<string, unknown>;
      const receivedAt = typeof item.receivedAt === "string" ? Date.parse(item.receivedAt) : NaN;
      if (!Number.isInteger(item.id) || (item.id as number) <= 0 ||
          typeof item.value !== "number" || !Number.isFinite(item.value) ||
          !Number.isFinite(receivedAt) || receivedAt < publishedAt || receivedAt > serverTime) continue;
      const previous = this.pendingValues.get(dataKey) ?? this.points.get(dataKey);
      if (previous && (receivedAt < previous.receivedAt ||
          (receivedAt === previous.receivedAt && (item.id as number) < previous.id))) continue;
      const ageAtReceipt = serverTime - receivedAt;
      if (previous && previous.id === item.id) {
        // 重连再次送来同一来源，只能让年龄继续增长，不能回拨到新鲜。
        previous.ageAtReceipt = Math.max(this.age(previous), ageAtReceipt);
        previous.receiptTime = receiptTime;
        repeatedObservation = true;
        continue;
      }
      this.pendingValues.set(dataKey, { id: item.id as number, value: item.value,
        receivedAt, ageAtReceipt, receiptTime });
    }
    if (this.frame === null && this.pendingValues.size > 0) {
      this.frame = this.scheduler.requestFrame(() => this.flushFrame());
    }
    if (repeatedObservation && this.pendingValues.size === 0) {
      this.scheduleStaleCheck();
      this.notify();
    }
  }

  private age(point: StoredPoint): number {
    return Math.max(0, point.ageAtReceipt + this.scheduler.now() - point.receiptTime);
  }

  private flushFrame(): void {
    this.frame = null;
    for (const [dataKey, point] of this.pendingValues) {
      this.points.set(dataKey, point);
      const value = point.value;
      const sampledAt = Math.floor(point.receivedAt / 1000) * 1000;
      const samples = this.samples.get(dataKey) ?? [];
      const last = samples.at(-1);
      if (last?.sampledAt === sampledAt) {
        samples[samples.length - 1] = { sampledAt, value };
      } else {
        samples.push({ sampledAt, value });
      }
      this.samples.set(dataKey, samples.slice(-60));
    }
    this.pendingValues.clear();
    this.scheduleStaleCheck();
    this.notify();
  }

  private scheduleStaleCheck(): void {
    if (this.staleTimer !== null) this.scheduler.clearTimer(this.staleTimer);
    const nextExpiry = Math.min(
      ...Array.from(this.points.values(), (point) =>
        this.age(point) < this.staleAfterMs
          ? this.staleAfterMs - this.age(point)
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
