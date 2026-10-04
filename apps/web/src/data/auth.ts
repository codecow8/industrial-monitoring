import { reactive } from "vue";

export type AuthUser = { id: number; username: string; expiresAt: string };
export const auth = reactive({ user: null as AuthUser | null });
const apiBase = import.meta.env.VITE_API_BASE_URL ?? "/api";

export async function checkSession(): Promise<AuthUser | null> {
  const response = await fetch(`${apiBase}/auth/me`, { credentials: "include", cache: "no-store" });
  if (response.status === 401) { auth.user = null; return null; }
  if (!response.ok) throw new Error("登录服务暂时不可用，请稍后重试。");
  auth.user = await response.json() as AuthUser;
  return auth.user;
}

export async function login(username: string, password: string): Promise<void> {
  const response = await fetch(`${apiBase}/auth/login`, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username.trim(), password }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null;
    throw new Error(typeof body?.detail === "string" ? body.detail : "登录服务暂时不可用，请稍后重试。");
  }
  auth.user = await response.json() as AuthUser;
}

export async function logout(): Promise<void> {
  const response = await fetch(`${apiBase}/auth/logout`, { method: "POST", credentials: "include" });
  if (!response.ok) throw new Error("退出失败，请稍后重试。");
  auth.user = null;
}

export function loginTarget(value: unknown): string {
  return typeof value === "string" && /^\/(editor|runtime)\/[^/?#]+(?:\?[^#]*)?$/.test(value)
    ? value : "/editor/demo";
}
