import { createHash } from "node:crypto";
import { get, type IncomingMessage } from "node:http";

export interface HelpIdentity { owner: string; cookie: string }

export class LoginRequiredError extends Error {
  constructor() { super("当前平台登录已失效，请重新登录。"); }
}

/** Validate the current browser session against the fixed local API, never a client URL. */
export function authenticateHelp(request: IncomingMessage): Promise<HelpIdentity | null> {
  const token = request.headers.cookie?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith("industrial_session="))?.slice("industrial_session=".length);
  if (!token) return Promise.resolve(null);
  const cookie = `industrial_session=${token}`;
  return new Promise((resolve, reject) => {
    const call = get("http://127.0.0.1:8000/api/auth/me", { headers: { Cookie: cookie }, timeout: 5000 }, (response) => {
      if (response.statusCode === 401) { response.resume(); resolve(null); return; }
      if (response.statusCode !== 200) { response.resume(); reject(new Error("Authentication unavailable")); return; }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        body += chunk;
        if (body.length > 8192) call.destroy(new Error("Invalid authentication response"));
      });
      response.on("end", () => {
        try {
          const user = JSON.parse(body) as { id?: number };
          if (!Number.isInteger(user.id)) throw new Error("Invalid authentication response");
          // Bind conversations to this login, so another login cannot reuse their IDs.
          resolve({ owner: `${user.id}:${createHash("sha256").update(token).digest("hex")}`, cookie });
        } catch (error) { reject(error); }
      });
      response.on("error", reject);
    });
    call.on("timeout", () => call.destroy(new Error("Authentication timed out")));
    call.on("error", reject);
  });
}
