import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http from "node:http";
import { syncBuiltinESMExports } from "node:module";
import { test, type TestContext } from "node:test";
import { Value } from "typebox/value";
import { authenticateHelp, LoginRequiredError } from "./authentication.ts";
import { readActiveAlarms } from "./active-alarms.ts";
import { readAlarmHistory } from "./alarm-history.ts";
import { createActiveAlarmTool } from "./active-alarm-tool.ts";
import { createAlarmHistoryTool } from "./alarm-history-tool.ts";
import { buildActiveReply, buildHistoryReply } from "./conversation.ts";

// 固定传输边界替身，不启动网络或模型；检查真正给 Node HTTP 的凭据。
function mockGet(t: TestContext, statusCode: number, body: unknown) {
  const headers: unknown[] = [];
  t.mock.method(http, "get", (...args: any[]) => {
    const options = typeof args[0] === "string" ? args[1] : args[0];
    headers.push(options.headers);
    const callback = args.at(-1);
    const request = Object.assign(new EventEmitter(), { setTimeout() {}, destroy() {} });
    queueMicrotask(() => {
      const response = Object.assign(new EventEmitter(), { statusCode, setEncoding() {}, resume() {}, destroy() {} });
      callback(response);
      response.emit("data", Buffer.from(JSON.stringify(body)));
      response.emit("end");
    });
    return request;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  return headers;
}

test("帮助验证只保留经验证的平台Cookie，owner不暴露原始凭据", async t => {
  const headers = mockGet(t, 200, { id: 7 });
  const identity = await authenticateHelp({ headers: { cookie: "analytics=do-not-forward; industrial_session=credential" } } as http.IncomingMessage);
  assert.equal(identity?.cookie, "industrial_session=credential");
  assert.ok(!identity?.owner.includes("credential"));
  assert.deepEqual(headers, [{ Cookie: "industrial_session=credential" }]);
});

test("活动/历史固定业务读取带内部凭据，401保留独立鉴权错误", async t => {
  const headers = mockGet(t, 401, { detail: "登录已失效" });
  const cookie = "industrial_session=credential";
  await assert.rejects(readActiveAlarms("demo", undefined, cookie), LoginRequiredError);
  await assert.rejects(readAlarmHistory("demo", 0, undefined, undefined, cookie), LoginRequiredError);
  assert.deepEqual(headers, [{ Cookie: cookie }, { Cookie: cookie }]);
});

test("模型工具不接受Cookie参数，鉴权失败不成为零告警或空历史", async () => {
  const active = createActiveAlarmTool("demo", async () => { throw new LoginRequiredError(); });
  const history = createAlarmHistoryTool("demo", async () => { throw new LoginRequiredError(); });
  assert.equal(Value.Check(active.parameters, { cookie: "credential" }), false);
  assert.equal(Value.Check(history.parameters, { action: "start", cookie: "credential" }), false);
  const activeResult = (await active.execute("a", {})).details;
  const historyResult = (await history.execute("h", { action: "start" })).details;
  assert.equal(activeResult.status, "error");
  assert.equal(historyResult.status, "error");
  assert.equal(activeResult.data, undefined);
  assert.equal(historyResult.data, undefined);
  assert.ok(!JSON.stringify([activeResult, historyResult]).includes("credential"));
  assert.throws(() => buildActiveReply(activeResult));
  assert.throws(() => buildHistoryReply(historyResult));
});
