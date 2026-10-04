<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { auth, logout } from "@/data/auth";
import { bindHelpPage, productHelp } from "@/data/productHelp";

const route = useRoute();
const router = useRouter();
const pending = ref(false);
async function signOut(): Promise<void> {
  pending.value = true;
  try {
    await logout();
    productHelp.open = false;
    bindHelpPage("");
    await router.replace({ name: "login", query: { redirect: route.fullPath } });
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "退出失败，请稍后重试。"); }
  finally { pending.value = false; }
}
</script>

<template>
  <div v-if="auth.user" class="account-actions">
    <span class="account-name">{{ auth.user.username }}</span>
    <button class="app-button app-button--secondary" type="button" :disabled="pending" @click="signOut">退出登录</button>
  </div>
</template>
