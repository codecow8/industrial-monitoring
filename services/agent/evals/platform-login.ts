import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { request } from "node:http";
import { fileURLToPath } from "node:url";

const apiDir = fileURLToPath(new URL("../../api/", import.meta.url));
function database(script: string, data: unknown): void {
  execFileSync("uv", ["run", "--python", "3.12", "python", "-c", script], {
    cwd: apiDir, input: JSON.stringify(data), stdio: ["pipe", "pipe", "pipe"],
  });
}

/** 只在显式评测入口调用；生成独立账号，凭据仅留内存，不写命令参数或报告。 */
export async function createEvalLogin(): Promise<{ cookie: string; dispose(): void }> {
  const username = `agent-eval-${randomUUID()}`, password = randomUUID();
  const dispose = () => {
    try {
      database(`import json,sys
from sqlalchemy import delete
from industrial_api.database import SessionFactory
from industrial_api.models import AuthUser
with SessionFactory.begin() as session:
    session.execute(delete(AuthUser).where(AuthUser.username == json.load(sys.stdin)))`, username);
    } catch { throw new Error("独立验收账号清理失败，请检查本机测试数据库。"); }
  };
  try {
    database(`import json,sys
from industrial_api.auth import hash_password
from industrial_api.database import SessionFactory
from industrial_api.models import AuthUser
username,password=json.load(sys.stdin)
with SessionFactory.begin() as session:
    session.add(AuthUser(username=username,password_hash=hash_password(password)))`, [username, password]);
    const cookie = await new Promise<string>((resolve, reject) => {
      const call = request({ hostname: "127.0.0.1", port: 8000, path: "/api/auth/login", method: "POST",
        headers: { "Content-Type": "application/json" } }, response => {
        response.resume();
        const header = response.headers["set-cookie"]?.find(value => value.startsWith("industrial_session="));
        if (response.statusCode !== 200 || !header) reject(new Error("独立验收账号登录失败。"));
        else resolve(header.split(";")[0]);
      });
      call.setTimeout(10_000, () => call.destroy(new Error("独立验收登录超时。")));
      call.on("error", () => reject(new Error("独立验收登录请求失败。")));
      call.end(JSON.stringify({ username, password }));
    });
    return { cookie, dispose };
  } catch {
    dispose();
    throw new Error("独立验收账号准备失败，请检查本机业务 API 与数据库。");
  }
}
