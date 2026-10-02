import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createHelpSession } from "./session.ts";

test("真实 Pi 会话只启用指南工具，不加载编程上下文，不保存聊天文件", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "industrial-help-session-"));
  try {
    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath: null,
      modelsStorePath: join(agentDir, "models-cache.json"),
      refreshOnCreate: false,
    });
    const model = modelRuntime.getModels()[0];
    assert.ok(model, "SDK 的本地模型目录应可用于离线会话测试");
    const first = await createHelpSession({ agentDir, modelRuntime, model });
    const second = await createHelpSession({ agentDir, modelRuntime, model });
    try {
      assert.deepEqual(first.getActiveToolNames(), ["search_product_guide"]);
      assert.equal(first.sessionFile, undefined);
      assert.equal(second.sessionFile, undefined);
      assert.deepEqual(first.messages, []);
      assert.deepEqual(second.messages, []);
      assert.notEqual(first.sessionId, second.sessionId);
      assert.ok(first.systemPrompt.includes("来源：docs/product-guide.md"));
      assert.ok(first.systemPrompt.includes("不能修改页面"));
      assert.ok(!first.systemPrompt.includes("Issue tracker"));
    } finally {
      first.dispose();
      second.dispose();
    }
  } finally {
    await rm(agentDir, { recursive: true });
  }
});
