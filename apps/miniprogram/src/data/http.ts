let origin = import.meta.env.VITE_API_ORIGIN || "http://127.0.0.1:8000";
// #ifdef H5
origin = import.meta.env.VITE_API_ORIGIN || (typeof window !== "undefined" ? window.location.origin : origin);
// #endif
export const apiOrigin = origin.replace(/\/$/, "");
const sessionKey = "industrial-mini-session";
let expiredHandler = () => {};
export function onExpired(handler: () => void) { expiredHandler = handler; }
export function savedToken(): string {
  const token = uni.getStorageSync(sessionKey);
  return typeof token === "string" && token.startsWith("mini_") ? token : "";
}
export function saveToken(token: string) { uni.setStorageSync(sessionKey, token); }
export function clearToken() { uni.removeStorageSync(sessionKey); }
export function authHeader(): Record<string, string> {
  const token = savedToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function request<T>(path: string, method: "GET" | "POST" = "GET", data?: Record<string, unknown>, login = false): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${apiOrigin}${path}`, method, data,
      header: { "Content-Type": "application/json", ...authHeader() },
      withCredentials: true, timeout: 15000,
      success(response) {
        if (response.statusCode === 401 && !login) { clearToken(); expiredHandler(); }
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.statusCode === 204 ? null as T : response.data as T);
        } else {
          const body = response.data as { detail?: unknown };
          reject(new ApiError(response.statusCode, typeof body?.detail === "string" ? body.detail : `请求失败（${response.statusCode}）`));
        }
      },
      fail() { reject(new Error("网络暂时不可用，请检查连接后重试。")); },
    });
  });
}
