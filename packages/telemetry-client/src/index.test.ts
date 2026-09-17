import { describe, expect, it } from "vitest";
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

  close() {}

  emit(type: "open" | "close") {
    this.listeners.get(type)?.forEach((listener) => listener({}));
  }

  message(values: Record<string, number>) {
    const data = JSON.stringify({
      type: "telemetry.update",
      timestamp: "2026-09-15T10:00:00Z",
      values,
    });
    this.listeners.get("message")?.forEach((listener) => listener({ data }));
  }
}


class FakeScheduler implements TelemetryScheduler {
  time = 0;
  frames: Array<() => void> = [];
  timers: Array<{ callback: () => void; delay: number }> = [];

  now = () => this.time;
  requestFrame = (callback: () => void) => {
    this.frames.push(callback);
    return callback;
  };
  cancelFrame = () => {};
  setTimer = (callback: () => void, delay: number) => {
    this.timers.push({ callback, delay });
    return callback;
  };
  clearTimer = () => {};

  flushFrame() {
    this.frames.shift()?.();
  }

  runNextTimer() {
    const timer = this.timers.shift();
    if (!timer) throw new Error("Expected a scheduled timer");
    this.time += timer.delay;
    timer.callback();
  }
}


function setup() {
  const scheduler = new FakeScheduler();
  const sockets: FakeSocket[] = [];
  const session = new TelemetrySession("ws://example.test/telemetry", {
    scheduler,
    createSocket: () => {
      const socket = new FakeSocket();
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

    sockets[0].message({ "pump1.outlet_temp": 68.4 });
    sockets[0].message({ "pump1.outlet_temp": 72.0 });

    expect(session.point("pump1.outlet_temp").freshness).toBe("waiting");
    scheduler.flushFrame();
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
