<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { login, loginTarget } from "@/data/auth";
import UiIcon from "@/components/UiIcon.vue";

const route = useRoute();
const router = useRouter();
const runtimeTarget = computed(() => loginTarget(route.query.redirect).startsWith("/runtime/"));
const username = ref("");
const password = ref("");
const visible = ref(false);
const pending = ref(false);
const error = ref(route.query.unavailable ? "登录服务暂时不可用，请稍后重试。" : "");

async function submit(): Promise<void> {
  if (pending.value) return;
  if (!username.value.trim() || !password.value) { error.value = "请输入账号和密码。"; return; }
  error.value = "";
  pending.value = true;
  try {
    await login(username.value, password.value);
    password.value = "";
    await router.replace(loginTarget(route.query.redirect));
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "登录服务暂时不可用，请稍后重试。";
  } finally { pending.value = false; }
}
</script>

<template>
  <main class="login-screen" data-screen-label="账号密码登录">
    <section class="login-brand-panel">
      <div class="brand"><span class="brand__mark"></span><strong>工业智控平台</strong></div>
      <div class="login-intro">
        <span class="login-eyebrow">工业监控与巡检</span>
        <h1>每一项观测，<br />都有据可查。</h1>
        <p>配置监控画面，查看设备状态，<br />从实时告警追溯观测证据。</p>
        <div class="login-rule"></div>
        <span class="login-caption">监控画面 · 设备状态 · 告警证据</span>
      </div>
      <span></span>
    </section>
    <section class="login-form-panel">
      <form class="login-form" novalidate :aria-busy="pending" @submit.prevent="submit">
        <div class="login-heading"><span class="login-eyebrow">工作台</span><h2>登录平台</h2><p>使用你的账号进入工业监控工作台。</p></div>
        <div v-if="runtimeTarget" class="login-notice" role="status">运行态需要登录。登录成功后，将进入原运行页面。</div>
        <div v-if="route.query.expired" class="login-notice" role="status">登录已过期，请重新登录后继续。</div>
        <label for="login-username">账号</label>
        <input id="login-username" v-model="username" autocomplete="username" autofocus maxlength="64" :disabled="pending" placeholder="请输入账号" :aria-invalid="!!error" :aria-describedby="error ? 'login-error' : undefined" @input="error = ''" />
        <label for="login-password">密码</label>
        <div class="login-password">
          <input id="login-password" v-model="password" :type="visible ? 'text' : 'password'" autocomplete="current-password" maxlength="256" :disabled="pending" placeholder="请输入密码" :aria-invalid="!!error" :aria-describedby="error ? 'login-error' : undefined" @input="error = ''" />
          <button type="button" :disabled="pending" :aria-label="visible ? '隐藏密码' : '显示密码'" :aria-pressed="visible" @click="visible = !visible"><UiIcon :name="visible ? 'eyeOff' : 'eye'" :size="18" /></button>
        </div>
        <div class="login-error-space"><p v-if="error" id="login-error" class="login-error" role="alert">{{ error }}</p></div>
        <button class="app-button app-button--primary login-submit" type="submit" :disabled="pending">{{ pending ? "正在登录…" : "登录" }}</button>
        <p class="login-account-note">账号由管理员分配。如需帮助，请联系管理员。</p>
      </form>
    </section>
  </main>
</template>
