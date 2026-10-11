<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { login, loginTarget } from "../../data/auth";
import UiIcon from "../../components/UiIcon.vue";
const username = ref(""); const password = ref(""); const visible = ref(false);
const pending = ref(false); const error = ref(""); const expired = ref(false);
let target = "/pages/monitor/index";
onLoad(query => { target = loginTarget(query?.redirect ? decodeURIComponent(query.redirect) : undefined); expired.value = query?.expired === "1"; });
async function submit() {
  if (pending.value) return;
  if (!username.value.trim() || !password.value) { error.value = "请输入账号和密码。"; return; }
  pending.value = true; error.value = "";
  try {
    await login(username.value.trim(), password.value);
    password.value = ""; uni.reLaunch({ url: target });
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "登录失败，请重试。"; }
  finally { pending.value = false; }
}
</script>
<template>
  <view class="screen login-screen">
    <text class="eyebrow">工业监控与巡检</text><text class="login-title">进入你的\n监控现场。</text><text class="muted intro">使用平台账号查看设备与告警。</text>
    <view v-if="expired" class="notice">登录已过期，请重新登录。登录后返回刚才的页面。</view>
    <text class="input-label">账号</text><input v-model="username" placeholder="请输入平台账号" :disabled="pending" maxlength="64" @input="error = ''" />
    <text class="input-label">密码</text><view class="password-row"><input v-model="password" :password="!visible" placeholder="请输入密码" :disabled="pending" maxlength="256" confirm-type="done" @confirm="submit" @input="error = ''" /><button class="eye-button" :aria-label="visible ? '隐藏密码' : '显示密码'" :disabled="pending" @tap="visible = !visible"><UiIcon :name="visible ? 'eyeOff' : 'eye'" /></button></view>
    <text class="error-space" role="alert">{{ error }}</text><button class="primary" :disabled="pending" :loading="pending" @tap="submit">{{ pending ? '正在登录…' : '登录' }}</button>
    <text class="account-note muted">账号由管理员分配</text><text class="login-footer muted">监控画面 · 设备状态 · 告警证据</text>
  </view>
</template>
<style scoped>
.login-screen { padding-top: 58px; }.login-title { display:block; white-space:pre-line; font-size:35px; font-weight:600; line-height:1.35; margin:16px 0; letter-spacing:-1px; }.intro{display:block;margin-bottom:35px;font-size:12px;}.input-label{display:block;font-size:12px;color:#b2c8d8;margin:18px 0 9px;}.password-row{position:relative;}.password-row input{padding-right:50px;}.eye-button{position:absolute;right:4px;top:4px;width:42px;height:40px;padding:0;display:flex;align-items:center;justify-content:center;background:transparent;}.error-space{display:block;min-height:36px;font-size:12px;color:#f2a2a8;padding:9px 0;box-sizing:border-box;}.account-note{display:block;text-align:center;font-size:11px;margin-top:16px;}.login-footer{display:block;text-align:center;font-size:10px;margin-top:55px;}
</style>
