<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import UiIcon from "./UiIcon.vue";
import { productHelp as help, retryHelp, sendHelp, startNewHelpSession, bindHelpPage, moreHelpHistory, queryHelpHistory } from "@/data/productHelp";
import HelpHistoryResult from "./HelpHistoryResult.vue";

const route = useRoute();
const visible = computed(() => help.open && route.name === "editor");
watch(() => [route.name, route.params.pageId], () => {
  if (route.name === "editor") bindHelpPage(String(route.params.pageId));
}, { immediate: true });
const input = ref<HTMLTextAreaElement | null>(null);
const scroll = ref<HTMLElement | null>(null);
function close(): void {
  help.open = false;
  nextTick(() => document.querySelector<HTMLButtonElement>("[data-help-entry]")?.focus());
}
function onEscape(event: KeyboardEvent): void { if (visible.value && event.key === "Escape") close(); }
function onInputKey(event: KeyboardEvent): void {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void sendHelp(help.draft);
  }
}
function startNew(): void { startNewHelpSession(); nextTick(() => input.value?.focus()); }
async function continueHistory(messageId: string): Promise<void> {
  await moreHelpHistory(messageId);
  await nextTick();
  const target = scroll.value?.querySelector<HTMLElement>(`[data-help-message-id="${messageId}"]`);
  if (target && scroll.value) scroll.value.scrollTop += target.getBoundingClientRect().bottom - scroll.value.getBoundingClientRect().bottom;
}
onMounted(() => window.addEventListener("keydown", onEscape));
onUnmounted(() => window.removeEventListener("keydown", onEscape));
watch(visible, (open) => { if (open) nextTick(() => input.value?.focus()); });
watch(() => [help.messages.length, help.pending, help.error, help.expired, visible.value], (value, previous) => {
  nextTick(() => {
    if (!scroll.value) return;
    const latest = help.messages.at(-1);
    if (value[0] !== previous[0] && latest?.history?.data && !help.pending) {
      const target = scroll.value.querySelector<HTMLElement>(".help-message:last-child");
      if (target) scroll.value.scrollTop += target.getBoundingClientRect().top - scroll.value.getBoundingClientRect().top;
    } else scroll.value.scrollTop = scroll.value.scrollHeight;
  });
});
</script>

<template>
  <aside v-if="visible" id="product-help" class="help-panel" aria-labelledby="help-title" data-screen-label="产品使用帮助" data-testid="help-panel">
    <header class="help-header">
      <div class="help-heading"><UiIcon name="info" :size="19" /><div><h2 id="help-title">使用帮助</h2><p>操作指南 · 历史告警只读查询</p></div></div>
      <button class="help-close" type="button" aria-label="关闭使用帮助" @click="close"><UiIcon name="close" :size="18" /></button>
    </header>
    <div class="help-scope"><UiIcon name="lock" :size="13" /><span>只读本页历史 · 不代为操作，不查询活动告警</span></div>
    <div class="help-page-context"><span>{{ help.pageName }} <small>({{ help.pageId }})</small></span><strong v-if="help.pageVersion !== null">{{ help.pageVersion ? `当前发布 v${help.pageVersion}` : '尚未发布' }}</strong></div>
    <div ref="scroll" class="help-conversation" role="log" aria-label="帮助对话" aria-live="polite" :aria-busy="help.pending">
      <section v-if="!help.messages.length && !help.expired" class="help-welcome">
        <div class="help-welcome-icon"><UiIcon name="info" :size="26" /></div>
        <h3>配置页面时遇到问题？</h3><p>问我如何添加组件、绑定数据或发布页面。也可以查询当前页面的已恢复历史，查看对应观测依据。</p>
        <div class="help-suggestions">
          <button type="button" @click="sendHelp('怎样发布当前页面？')">怎样发布当前页面？<span>↗</span></button>
          <button type="button" @click="sendHelp('出口温度的数据键怎么设置？')">出口温度的数据键怎么设置？<span>↗</span></button>
          <button type="button" @click="sendHelp('怎样添加文本标题？')">怎样添加文本标题？<span>↗</span></button>
          <button type="button" @click="queryHelpHistory">查询当前页面历史告警<span>↗</span></button>
        </div>
      </section>
      <article v-for="message in help.messages" :key="message.id" :data-help-message-id="message.id" class="help-message" :class="`help-message--${message.role}`">
        <span class="help-speaker">{{ message.role === 'user' ? '你' : '使用帮助' }}</span><p>{{ message.text }}</p>
        <HelpHistoryResult v-if="message.history" :history="message.history" :current-version="help.pageVersion" :pending="help.pending || help.expired" @more="continueHistory(message.id)" @refresh="queryHelpHistory" />
        <div v-if="!message.history && message.sources?.length" class="help-sources"><span class="help-source-label">操作指南依据</span>
          <details v-for="source in message.sources" :key="source.title"><summary><UiIcon name="text" :size="13" /><span>{{ source.title }}</span><span class="help-source-expand">展开原文</span></summary>
            <div class="help-source-content"><small>{{ source.source }} · {{ source.title }}</small><p>{{ source.content }}</p></div>
          </details>
        </div>
      </article>
      <div v-if="help.pending" class="help-loading" role="status"><span class="help-spinner"></span>{{ help.queryingHistory ? '正在查询历史告警…' : '正在查阅操作指南…' }}</div>
      <div v-if="help.error" class="help-error" role="alert"><strong>{{ help.queryingHistory ? '历史查询失败' : '本次问答失败' }}</strong><p>{{ help.error }}</p><button type="button" @click="retryHelp">重试这条问题</button></div>
      <div v-if="help.expired" class="help-error help-expired" role="alert"><strong>会话已过期</strong><p>闲置超过 15 分钟或服务重启，之前的上下文已失效。旧对话仅供查看，不能继续追问。</p><p>开始新会话后会清空当前对话，请重新说明问题背景。</p><button type="button" @click="startNew">开始新会话</button></div>
    </div>
    <form class="help-composer" @submit.prevent="sendHelp(help.draft)">
      <label class="help-input-label" for="help-question">你的问题</label>
      <textarea id="help-question" ref="input" v-model="help.draft" :disabled="help.expired" maxlength="1000" :placeholder="help.expired ? '请先开始新会话，再重新说明问题背景' : '例如：保存草稿后，运行态为什么还是旧内容？'" @keydown="onInputKey"></textarea>
      <div class="help-composer-actions"><span>Enter 发送 · Shift+Enter 换行</span><button type="submit" :disabled="help.expired || help.pending || !help.draft.trim()">{{ help.pending ? '查阅中' : '发送' }}</button></div>
      <p class="help-session-note">关闭后保留 · 闲置 15 分钟过期 · 刷新后清空</p>
    </form>
  </aside>
</template>

<style scoped>
.help-panel { position: fixed; z-index: 60; top: 68px; right: 0; bottom: 30px; width: 416px; max-width: 44vw; display: flex; flex-direction: column; background: var(--white); border-left: 1px solid var(--slate-200); box-shadow: -10px 0 30px rgba(10, 21, 32, .13);  }
      .help-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 22px 16px; }
      .help-heading { display: flex; align-items: center; gap: 11px; color: var(--blue); }
      .help-heading h2 { margin: 0; color: var(--ink-850); font-size: 17px; font-weight: 650; }
      .help-heading p { margin: 4px 0 0; color: var(--slate-500); font-size: 12px; }
      .help-close { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: transparent; color: var(--slate-500); border-radius: 3px; cursor: pointer; }
      .help-close:hover { background: var(--slate-100); color: var(--ink-850); }
      .help-scope { display: flex; align-items: center; gap: 7px; padding: 10px 22px; font-size: 11px; color: var(--slate-700); background: var(--slate-100); border-block: 1px solid var(--slate-150); }
      .help-conversation { flex: 1; min-height: 0; padding: 22px; overflow-y: auto; overscroll-behavior: contain; }
      .help-welcome { padding-top: 28px; }
      .help-welcome-icon { display: flex; align-items: center; justify-content: center; width: 46px; height: 46px; margin-bottom: 20px; color: var(--blue); background: var(--slate-100); border-radius: 5px; }
      .help-welcome h3 { margin: 0 0 9px; font-size: 18px; color: var(--ink-850); }
      .help-welcome p { margin: 0; font-size: 13px; line-height: 1.8; color: var(--slate-500); }
      .help-suggestions { display: flex; flex-direction: column; gap: 9px; margin-top: 25px; }
      .help-suggestions button { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 13px; text-align: left; font-size: 13px; background: var(--white); color: var(--slate-700); border: 1px solid var(--slate-200); border-radius: 4px; cursor: pointer; }
      .help-suggestions button:hover { border-color: var(--blue); color: var(--blue); background: var(--paper); }
      .help-suggestions button span { color: var(--slate-500); }
      .help-message { margin-bottom: 23px; }
      .help-speaker { display: block; margin-bottom: 9px; font-size: 11px; font-weight: 600; color: var(--slate-500); }
      .help-message p { margin: 0; color: var(--ink-850); font-size: 13px; line-height: 1.85; white-space: pre-wrap; overflow-wrap: anywhere; }
      .help-message--user { padding: 12px 14px; border-radius: 4px; background: var(--slate-100); }
      .help-message--user .help-speaker { margin-bottom: 5px; }
      .help-message--assistant .help-speaker { color: var(--blue); }
      .help-sources { display: flex; flex-direction: column; gap: 7px; margin-top: 16px; }
      .help-source-label { font-size: 11px; color: var(--slate-500); }
      .help-sources details { border: 1px solid var(--slate-200); border-radius: 3px; }
      .help-sources summary { display: flex; align-items: center; gap: 7px; padding: 10px; color: var(--slate-700); font-size: 12px; cursor: pointer; list-style: none; }
      .help-sources summary::-webkit-details-marker { display: none; }
      .help-sources summary:hover { background: var(--paper); }
      .help-source-expand { margin-left: auto; font-size: 10px; color: var(--slate-500); }
      .help-source-content { padding: 11px; border-top: 1px solid var(--slate-150); background: var(--paper); }
      .help-source-content small { display: block; margin-bottom: 9px; color: var(--slate-500); font-size: 10px; overflow-wrap: anywhere; }
      .help-source-content p { font-size: 12px; color: var(--slate-700); }
      .help-loading { display: flex; align-items: center; gap: 10px; color: var(--slate-500); font-size: 12px; padding: 8px 0 16px; }
      .help-error { padding: 14px; border: 1px solid var(--slate-200); border-radius: 4px; background: var(--paper); }
      .help-error strong { font-size: 13px; color: var(--ink-850); }
      .help-error p { margin: 7px 0 12px; font-size: 12px; line-height: 1.8; color: var(--slate-700); }
      .help-error button { padding: 0; background: transparent; color: var(--blue); font-size: 12px; font-weight: 600; cursor: pointer; }
      .help-expired { border-color: var(--slate-300); }
      .help-expired button { padding: 8px 13px; background: var(--blue); color: var(--white); border-radius: 3px; }
      .help-composer { padding: 16px 22px 10px; border-top: 1px solid var(--slate-150); }
      .help-input-label { display: block; margin-bottom: 8px; color: var(--slate-700); font-size: 12px; }
      .help-composer textarea { display: block; width: 100%; height: 78px; resize: none; padding: 10px 11px; border: 1px solid var(--slate-200); border-radius: 4px; font: inherit; font-size: 12px; line-height: 1.7; color: var(--ink-850); background: var(--white); outline: none; }
      .help-composer textarea:focus { border-color: var(--blue); box-shadow: 0 0 0 2px rgba(22, 132, 232, .09); }
      .help-composer textarea::placeholder { color: var(--slate-500); }
      .help-composer textarea:disabled { background: var(--slate-100); color: var(--slate-500); cursor: not-allowed; }
      .help-composer-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 9px; }
      .help-composer-actions span { font-size: 10px; color: var(--slate-500); }
      .help-composer-actions button { padding: 7px 18px; color: var(--white); background: var(--blue); border-radius: 3px; font-size: 12px; cursor: pointer; }
      .help-composer-actions button:disabled { background: var(--slate-150); color: var(--slate-500); cursor: not-allowed; }
      .help-session-note { margin: 10px 0 0; font-size: 10px; text-align: center; color: var(--slate-500); }
      .help-panel button:focus-visible, .help-panel summary:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.help-panel { --slate-700: #34495c; --slate-150: #e6ebef; --slate-100: #f1f4f6; --white: #fff; }
.help-spinner { width: 17px; height: 17px; border: 2px solid var(--slate-200); border-top-color: var(--blue); border-radius: 50%; animation: help-spin 800ms linear infinite; }
@keyframes help-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .help-spinner { animation: none; } }

</style>
