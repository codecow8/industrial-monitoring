<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ProductHelpPanel from "./components/ProductHelpPanel.vue";
import { auth, checkSession } from "./data/auth";
import { authExpiredEvent } from "./data/authHttp";
import { bindHelpPage, productHelp } from "./data/productHelp";

const route = useRoute();
const router = useRouter();
const identityRevision = ref(0);
watch(() => auth.user, (current, previous) => {
  if (current && previous && (current.id !== previous.id || current.expiresAt !== previous.expiresAt)) {
    productHelp.open = false; bindHelpPage(""); identityRevision.value += 1;
  }
});
let poll: ReturnType<typeof setInterval>;
let expiry: ReturnType<typeof setTimeout>;
function expire(): void {
  const wasSignedIn = !!auth.user;
  auth.user = null;
  productHelp.open = false;
  bindHelpPage("");
  if (route.name !== "login") void router.replace({ name: "login", query: {
    redirect: route.fullPath, ...(wasSignedIn ? { expired: "1" } : {}),
  } });
}
watch(() => auth.user?.expiresAt, (value) => {
  clearTimeout(expiry);
  if (value) expiry = setTimeout(expire, Math.max(0, Date.parse(value) - Date.now()));
}, { immediate: true });
onMounted(() => {
  window.addEventListener(authExpiredEvent, expire);
  poll = setInterval(async () => {
    if (!auth.user) return;
    const previousUser = auth.user;
    try { if (!await checkSession()) { auth.user = previousUser; expire(); } }
    catch { /* A service outage does not prove the session expired. */ }
  }, 60_000);
});
onBeforeUnmount(() => {
  window.removeEventListener(authExpiredEvent, expire);
  clearInterval(poll); clearTimeout(expiry);
});
</script>

<template>
  <RouterView v-if="route.name === 'login' || auth.user" :key="identityRevision" />
  <ProductHelpPanel v-if="auth.user" />
</template>
