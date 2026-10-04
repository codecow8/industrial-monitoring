export const authExpiredEvent = "industrial-auth-expired";

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, { ...init, credentials: "include" });
  if (response.status === 401) window.dispatchEvent(new Event(authExpiredEvent));
  return response;
}
