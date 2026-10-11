import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TelemetrySession } from "@industrial/telemetry-client";

const storage = new Map<string, string>();
const handlers: Record<string, (event: any) => void> = {};
const task = { onOpen: vi.fn(fn => { handlers.open = fn; }), onMessage: vi.fn(fn => { handlers.message = fn; }), onClose: vi.fn(fn => { handlers.close = fn; }), onError: vi.fn(fn => { handlers.error = fn; }), close: vi.fn() };
const platform = {
  getStorageSync: vi.fn(key => storage.get(key)), setStorageSync: vi.fn((key, value) => storage.set(key, value)), removeStorageSync: vi.fn(key => storage.delete(key)),
  request: vi.fn(), connectSocket: vi.fn(() => task),
};
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); storage.clear(); vi.stubGlobal("uni", platform); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("mini transport public seam", () => {
  it("attaches a saved mini token and expires only on an authenticated 401", async () => {
    const http = await import("./http");
    http.saveToken("mini_test-session"); const expired = vi.fn(); http.onExpired(expired);
    platform.request.mockImplementation(options => options.success({statusCode: 401, data: {detail: "会话失效"}}));
    await expect(http.request("/api/auth/me")).rejects.toMatchObject({status: 401});
    expect(platform.request.mock.calls[0][0].header.Authorization).toBe("Bearer mini_test-session");
    expect(expired).toHaveBeenCalledOnce(); expect(http.savedToken()).toBe("");
    await expect(http.request("/api/auth/mini/login", "POST", {}, true)).rejects.toMatchObject({status: 401});
    expect(expired).toHaveBeenCalledOnce();
  });
  it("keeps authentication when the network fails and sends no token in URLs", async () => {
    const http = await import("./http"); http.saveToken("mini_test-session");
    const expired = vi.fn(); http.onExpired(expired);
    platform.request.mockImplementation(options => options.fail({errMsg: "offline"}));
    await expect(http.request("/api/pages/demo/published")).rejects.toThrow("网络");
    expect(http.savedToken()).toBe("mini_test-session"); expect(expired).not.toHaveBeenCalled();
    const {createSocket} = await import("./socket"); const socket = createSocket("ws://localhost/ws/telemetry/pages/demo");
    const options = platform.connectSocket.mock.calls[0][0];
    expect(options.header.Authorization).toBe("Bearer mini_test-session"); expect(options.url).not.toContain("mini_test-session");
    const closed = vi.fn(); socket.addEventListener("close", closed);
    handlers.error({}); handlers.close({code: 1006}); expect(closed).toHaveBeenCalledOnce();
  });
  it("reconnects without treating the old server snapshot as fresh", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-11T00:00:10Z"));
    const {createSocket, miniScheduler} = await import("./socket");
    const session = new TelemetrySession("ws://localhost/ws/demo", {pageId:"demo", pageVersion:1, publishedAt:"2026-10-11T00:00:00Z", createSocket, scheduler:miniScheduler});
    const message = (serverTime: string) => JSON.stringify({type:"telemetry.snapshot", pageId:"demo", pageVersion:1, publishedAt:"2026-10-11T00:00:00Z", serverTime, observations:{temperature:{id:1,value:83,receivedAt:"2026-10-11T00:00:10Z"}}});
    session.start(); handlers.open({}); handlers.message({data:message("2026-10-11T00:00:10Z")}); vi.advanceTimersByTime(16);
    expect(session.point("temperature").freshness).toBe("fresh");
    handlers.close({code:1006}); vi.advanceTimersByTime(6000); handlers.open({}); handlers.message({data:message("2026-10-11T00:00:16Z")});
    expect(session.point("temperature")).toMatchObject({value:83,freshness:"stale"}); session.stop();
  });
  it("does not reverse observation age after a device clock correction", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-11T00:00:10Z"));
    const {miniScheduler} = await import("./socket"); const initial = miniScheduler.now();
    vi.advanceTimersByTime(6000); const before = miniScheduler.now();
    vi.setSystemTime(new Date("2026-10-10T00:00:00Z")); expect(miniScheduler.now()).toBe(before);
    vi.advanceTimersByTime(1000); expect(miniScheduler.now() - initial).toBe(7000);
  });
});
