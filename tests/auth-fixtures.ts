import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { test as base, expect, type APIRequestContext } from "@playwright/test";

type Account = { username: string; password: string; state: Awaited<ReturnType<APIRequestContext["storageState"]>> };
const apiDir = resolve("services/api");
function database(script: string, data: unknown): void {
  execFileSync("uv", ["run", "--python", "3.12", "python", "-c", script], {
    cwd: apiDir, input: JSON.stringify(data), stdio: ["pipe", "pipe", "pipe"],
  });
}

// Each worker provisions an isolated account, signs in through the real API, and cleans it up.
export const test = base.extend<{}, { account: Account }>({
  account: [async ({ playwright }, use) => {
    const username = `e2e-${randomUUID()}`, password = randomUUID();
    database(`import json,sys
from industrial_api.auth import hash_password
from industrial_api.database import SessionFactory
from industrial_api.models import AuthUser
username,password=json.load(sys.stdin)
with SessionFactory.begin() as session:
    session.add(AuthUser(username=username,password_hash=hash_password(password)))`, [username, password]);
    const api = await playwright.request.newContext();
    try {
      const response = await api.post("http://127.0.0.1:8000/api/auth/login", { data: { username, password } });
      expect(response.status()).toBe(200);
      await use({ username, password, state: await api.storageState() });
    } finally {
      await api.dispose();
      database(`import json,sys
from sqlalchemy import delete
from industrial_api.database import SessionFactory
from industrial_api.models import AuthUser
with SessionFactory.begin() as session:
    session.execute(delete(AuthUser).where(AuthUser.username == json.load(sys.stdin)))`, username);
    }
  }, { scope: "worker" }],
  storageState: async ({ account }, use) => { await use(account.state); },
});
export { expect };
