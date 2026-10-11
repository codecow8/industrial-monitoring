import { request, saveToken, clearToken, onExpired } from "./http";
const monitor = "/pages/monitor/index";
let returnTo = monitor;
let redirecting = false;
export function loginTarget(value?: string) {
  return value && /^\/pages\/(monitor|detail)\/index(?:\?|$)/.test(value) ? value : monitor;
}
export function requireLogin(target: string) { returnTo = loginTarget(target); }
export function expireSession() {
  clearToken();
  if (redirecting) return;
  redirecting = true;
  uni.reLaunch({ url: `/pages/login/index?expired=1&redirect=${encodeURIComponent(returnTo)}`, complete: () => { redirecting = false; } });
}
onExpired(expireSession);
export async function login(username: string, password: string) {
  let path = "/api/auth/mini/login";
  // #ifdef H5
  path = "/api/auth/login";
  // #endif
  const result = await request<{ username: string; expiresAt: string; token?: string }>(path, "POST", { username, password }, true);
  if (result.token) saveToken(result.token);
  return result;
}
export async function checkSession(): Promise<boolean> {
  try { await request("/api/auth/me"); return true; }
  catch (error) { if (error instanceof Error && "status" in error && error.status === 401) return false; throw error; }
}
export async function logout() {
  await request("/api/auth/logout", "POST");
  clearToken();
  uni.reLaunch({ url: "/pages/login/index" });
}
