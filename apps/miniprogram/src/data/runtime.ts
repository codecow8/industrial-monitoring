import { computed, shallowRef, ref } from "vue";
import { TelemetrySession, type ConnectionState, type TelemetryPoint } from "@industrial/telemetry-client";
import { resolveActiveAlarms } from "@industrial/renderer-core/active-alarms";
import { checkSession, expireSession, requireLogin } from "./auth";
import { loadPublished, type PublishedPage } from "./api";
import { apiOrigin } from "./http";
import { createSocket, miniScheduler } from "./socket";

export const page = shallowRef<PublishedPage | null>(null);
export const loading = ref(false);
export const error = ref("");
export const connection = ref<ConnectionState>("disconnected");
export const latestVersion = ref<number | null>(null);
const revision = ref(0);
let telemetry: TelemetrySession | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let epoch = 0;
export function point(key: string): TelemetryPoint {
  void revision.value;
  return telemetry?.point(key) ?? { value: null, freshness: "waiting", ageMs: null };
}
export const summary = computed(() => {
  const schema = page.value?.schema;
  if (!schema) return null;
  const points: Record<string, TelemetryPoint> = {};
  for (const node of schema.components) {
    if ("dataKey" in node.props) points[node.props.dataKey] = point(node.props.dataKey);
  }
  return resolveActiveAlarms(schema, points);
});
export function stopRuntime() {
  epoch++; loading.value = false;
  telemetry?.stop(); connection.value = "disconnected";
  if (timer !== null) clearInterval(timer);
  timer = null;
}
export async function openRuntime(pageId: string, target: string) {
  stopRuntime();
  const current = epoch;
  requireLogin(target); loading.value = true; error.value = "";
  try {
    if (!await checkSession() || current !== epoch) return;
    const published = await loadPublished(pageId);
    if (current !== epoch) return;
    page.value = published; latestVersion.value = null;
    if (!published) { telemetry = null; error.value = "此画面尚未发布，请在电脑端发布后重试。"; return; }
    telemetry = new TelemetrySession(`${apiOrigin.replace(/^http/, "ws")}/ws/telemetry/pages/${encodeURIComponent(pageId)}?version=${published.version}`, {
      pageId, pageVersion: published.version, publishedAt: published.publishedAt,
      createSocket, scheduler: miniScheduler,
      checkAuthentication: checkSession, onAuthenticationExpired: expireSession,
    });
    telemetry.subscribe(() => {
      if (current !== epoch || !telemetry) return;
      connection.value = telemetry.connection; latestVersion.value = telemetry.latestVersion;
      revision.value++;
    });
    telemetry.start();
    timer = setInterval(() => { revision.value++; }, 1000);
    revision.value++;
  } catch (cause) {
    if (current === epoch) error.value = cause instanceof Error ? cause.message : "加载失败，请重试。";
  } finally { if (current === epoch) loading.value = false; }
}
