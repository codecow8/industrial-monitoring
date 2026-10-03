import { describe, expect, it, vi } from "vitest";
import {
  TelemetrySession,
  type TelemetryScheduler,
  type TelemetrySocket,
} from "./index";


class FakeSocket implements TelemetrySocket {
  private listeners = new Map<string, Array<(event: { data?: string }) => void>>();

  addEventListener(type: string, listener: (event: { data?: string }) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  closed = false;
  sequence = 0;
  constructor(private readonly now: () => number) {}
  close() { this.closed = true; }

  emit(type: "open" | "close") {
    this.listeners.get(type)?.forEach((listener) => listener({}));
  }

  packet(frame: Record<string, unknown>) {
    const data = JSON.stringify(frame);
    this.listeners.get("message")?.forEach((listener) => listener({ data }));
  }

  message(values: Record<string, number>, receivedAt = this.now(), id = ++this.sequence, serverTime = this.now()) {
    this.packet({ type: "telemetry.update", pageId: "demo", pageVersion: 1,
      publishedAt: new Date(0).toISOString(), serverTime: new Date(serverTime).toISOString(), values,
      observations: Object.fromEntries(Object.entries(values).map(([key, value]) => [key,
        { id, value, receivedAt: new Date(receivedAt).toISOString(), sourceTimestamp: "device-clock-is-not-evidence" }])) });
  }

}


class FakeScheduler implements TelemetryScheduler {
  time = 0;
  frames: Array<() => void> = [];
  timers: Array<{ callback: () => void; delay: number; due: number }> = [];

  now = () => this.time;
  requestFrame = (callback: () => void) => {
    this.frames.push(callback);
    return callback;
  };
  cancelFrame = (handle: unknown) => { this.frames = this.frames.filter(callback => callback !== handle); };
  setTimer = (callback: () => void, delay: number) => {
    this.timers.push({ callback, delay, due: this.time + delay });
    return callback;
  };
  clearTimer = (handle: unknown) => { this.timers = this.timers.filter(timer => timer.callback !== handle); };

  flushFrame() {
    this.frames.shift()?.();
  }

  runNextTimer() {
    this.timers.sort((a, b) => a.due - b.due);
    const timer = this.timers.shift();
    if (!timer) throw new Error("Expected a scheduled timer");
    this.time = Math.max(this.time, timer.due);
    timer.callback();
  }
}


function setup() {
  const scheduler = new FakeScheduler();
  const sockets: FakeSocket[] = [];
  const session = new TelemetrySession("ws://example.test/telemetry", {
    pageId: "demo", pageVersion: 1, publishedAt: new Date(0).toISOString(),
    scheduler,
    createSocket: () => {
      const socket = new FakeSocket(scheduler.now);
      sockets.push(socket);
      return socket;
    },
  });
  session.start();
  return { scheduler, session, sockets };
}


describe("TelemetrySession", () => {
  it("merges rapid updates once per animation frame and keeps the last value", () => {
    const { scheduler, session, sockets } = setup();
    sockets[0].emit("open");

    const notified = vi.fn();
    session.subscribe(notified);
    sockets[0].message({ "pump1.outlet_temp": 68.4 });
    sockets[0].message({ "pump1.outlet_temp": 72.0 });
    expect(notified).not.toHaveBeenCalled();

    expect(session.point("pump1.outlet_temp").freshness).toBe("waiting");
    scheduler.flushFrame();
    expect(notified).toHaveBeenCalledTimes(1);
    expect(session.point("pump1.outlet_temp")).toMatchObject({
      value: 72.0,
      freshness: "fresh",
    });
  });

  it("moves each data point from waiting to fresh to stale after five seconds", () => {
    const { scheduler, session, sockets } = setup();
    sockets[0].emit("open");
    expect(session.point("pump1.outlet_temp")).toEqual({
      value: null,
      freshness: "waiting",
      ageMs: null,
    });

    sockets[0].message({ "pump1.outlet_temp": 68.4 });
    scheduler.flushFrame();
    expect(session.point("pump1.outlet_temp").freshness).toBe("fresh");

    scheduler.runNextTimer();
    expect(session.point("pump1.outlet_temp")).toEqual({
      value: 68.4,
      freshness: "stale",
      ageMs: 5000,
    });
  });

  it("reconnects with capped exponential backoff and resets after success", () => {
    const { scheduler, session, sockets } = setup();
    sockets[0].emit("open");

    for (const [index, delay] of [1000, 2000, 4000, 8000, 10_000, 10_000].entries()) {
      sockets[index].emit("close");
      expect(session.connection).toBe("reconnecting");
      expect(scheduler.timers[0].delay).toBe(delay);
      scheduler.runNextTimer();
    }

    sockets[6].emit("open");
    sockets[6].emit("close");
    expect(scheduler.timers[0].delay).toBe(1000);
  });

  it("keeps the last telemetry value in each one-second Trend Sample", () => {
    const { scheduler, session, sockets } = setup();
    sockets[0].emit("open");

    sockets[0].message({ "pump1.outlet_temp": 68.4 });
    scheduler.flushFrame();
    scheduler.time = 400;
    sockets[0].message({ "pump1.outlet_temp": 72.0 });
    scheduler.flushFrame();
    scheduler.time = 1000;
    sockets[0].message({ "pump1.outlet_temp": 78.5 });
    scheduler.flushFrame();

    expect(session.trendSamples("pump1.outlet_temp")).toEqual([
      { sampledAt: 0, value: 72.0 },
      { sampledAt: 1000, value: 78.5 },
    ]);
  });

  it("keeps at most sixty Trend Samples for a data point", () => {
    const { scheduler, session, sockets } = setup();
    sockets[0].emit("open");

    for (let second = 0; second <= 60; second += 1) {
      scheduler.time = second * 1000;
      sockets[0].message({ "pump1.outlet_temp": second });
      scheduler.flushFrame();
    }

    const samples = session.trendSamples("pump1.outlet_temp");
    expect(samples).toHaveLength(60);
    expect(samples[0]).toEqual({ sampledAt: 1000, value: 1 });
    expect(samples.at(-1)).toEqual({ sampledAt: 60_000, value: 60 });
  });
});


describe("server observation freshness and version isolation", () => {
  it("keeps each key's own age through a delayed render and an old reconnect snapshot", () => {
    const { scheduler, session, sockets } = setup();
    scheduler.time = 10000;
    sockets[0].message({ temperature: 83 }, 0, 1);
    sockets[0].message({ state: 1 }, 9500, 2);
    scheduler.time += 200;
    scheduler.flushFrame();
    expect(session.point("temperature")).toEqual({ value: 83, freshness: "stale", ageMs: 10200 });
    expect(session.point("state").ageMs).toBe(700);
    sockets[0].emit("close");
    // Reconnect first; the other key can expire while waiting for its snapshot.
    scheduler.runNextTimer();
    scheduler.runNextTimer();
    const ageBefore = session.point("temperature").ageMs!;
    sockets[1].message({ temperature: 83 }, 0, 1, 10000);
    scheduler.flushFrame();
    expect(session.point("temperature").ageMs).toBe(ageBefore);
    expect(session.point("temperature").freshness).toBe("stale");
    expect(session.trendSamples("temperature")).toHaveLength(1);
    sockets[1].message({ state: 1 });
    scheduler.flushFrame();
    expect(session.point("state").freshness).toBe("fresh");
    expect(session.point("temperature").freshness).toBe("stale");
  });

  it("ignores the computer wall clock when aging a server observation", () => {
    const { scheduler, session, sockets } = setup();
    const wallClock = vi.spyOn(Date, "now").mockReturnValue(300000);
    try {
      sockets[0].message({ temperature: 72 });
      scheduler.flushFrame();
      wallClock.mockReturnValue(-300000);
      scheduler.time = 6000;
      expect(session.point("temperature")).toEqual({ value: 72, freshness: "stale", ageMs: 6000 });
    } finally { wallClock.mockRestore(); }
  });

  it("rejects unverifiable, pre-publication, future and out-of-order observations", () => {
    const { scheduler, session, sockets } = setup();
    sockets[0].packet({ type: "telemetry.snapshot", values: { temperature: 83 } });
    sockets[0].message({ temperature: 83 }, -1000, 1);
    sockets[0].message({ temperature: 83 }, 1000, 1);
    scheduler.flushFrame();
    expect(session.point("temperature").freshness).toBe("waiting");
    scheduler.time = 2000;
    sockets[0].message({ temperature: 83 }, 2000, 3);
    scheduler.flushFrame();
    sockets[0].message({ temperature: 72 }, 1000, 2);
    scheduler.flushFrame();
    expect(session.point("temperature").value).toBe(83);
  });

  it("freezes displayed values and cancels pending updates and reconnect after a new publication", () => {
    const { scheduler, session, sockets } = setup();
    sockets[0].message({ temperature: 83 });
    scheduler.flushFrame();
    sockets[0].message({ temperature: 72 });
    sockets[0].packet({ type: "telemetry.version_changed", pageId: "demo", pageVersion: 2 });
    scheduler.flushFrame();
    expect(session.latestVersion).toBe(2);
    expect(session.point("temperature").value).toBe(83);
    expect(sockets[0].closed).toBe(true);
    sockets[0].emit("close");
    scheduler.runNextTimer();
    expect(session.point("temperature").freshness).toBe("stale");
    expect(scheduler.timers).toHaveLength(0);
    session.start();
    expect(sockets).toHaveLength(1);
  });
});
