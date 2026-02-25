<script setup>
import { computed, nextTick, ref, watch } from "vue";

const emit = defineEmits(["openEr"]);

const messages = ref([
  {
    id: "welcome",
    role: "assistant",
    content: "你好，我是对话客服助手。你可以直接提问产品、流程或使用问题。",
  },
]);
const userInput = ref("");
const sending = ref(false);
const statusText = ref("");
const chatBodyRef = ref(null);

const canSend = computed(() => Boolean(userInput.value.trim()) && !sending.value);

function buildApiMessages() {
  return messages.value
    .filter((item) => item.role === "user" || item.role === "assistant")
    .map((item) => ({ role: item.role, content: item.content }));
}

function scrollToBottom() {
  const el = chatBodyRef.value;
  if (!el) {
    return;
  }
  el.scrollTop = el.scrollHeight;
}

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || sending.value) {
    return;
  }

  const userMessage = {
    id: `u-${Date.now()}`,
    role: "user",
    content: text,
  };

  messages.value.push(userMessage);
  userInput.value = "";
  statusText.value = "客服正在回复...";
  sending.value = true;
  await nextTick();
  scrollToBottom();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: buildApiMessages(),
        model: "deepseek-v3.2",
        enableThinking: true,
      }),
    });

    const raw = await response.text();
    let result = null;
    if (raw) {
      try {
        result = JSON.parse(raw);
      } catch {
        result = null;
      }
    }

    if (!response.ok) {
      const fallback = `客服服务异常（HTTP ${response.status}）`;
      throw new Error((result && result.error) || fallback);
    }
    if (!result || typeof result !== "object") {
      throw new Error("客服返回了非 JSON 响应，请检查后端服务是否正常。");
    }

    const reply = String(result.reply || "").trim() || "我收到了你的消息，但暂时没有生成内容。";
    messages.value.push({
      id: `a-${Date.now()}`,
      role: "assistant",
      content: reply,
    });

    statusText.value = "";
  } catch (error) {
    messages.value.push({
      id: `e-${Date.now()}`,
      role: "assistant",
      content: `请求失败：${error.message || "请稍后再试"}`,
    });
    statusText.value = "";
  } finally {
    sending.value = false;
    await nextTick();
    scrollToBottom();
  }
}

function onInputKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

watch(
  () => messages.value.length,
  async () => {
    await nextTick();
    scrollToBottom();
  },
);
</script>

<template>
  <main class="chat-shell">
    <section class="panel chat-panel">
      <header class="chat-header">
        <div class="chat-title-wrap">
          <h1>在线客服</h1>
          <p>这里是默认入口。你可以先咨询，再按需进入 ER 图工具。</p>
        </div>
        <button type="button" class="chat-entry-btn" @click="emit('openEr')">进入 ER 图工具</button>
      </header>

      <div ref="chatBodyRef" class="chat-body" aria-live="polite">
        <article
          v-for="item in messages"
          :key="item.id"
          :class="['chat-message', item.role === 'user' ? 'from-user' : 'from-assistant']"
        >
          <p class="chat-role">{{ item.role === "user" ? "你" : "客服" }}</p>
          <p class="chat-content">{{ item.content }}</p>
        </article>
      </div>

      <form class="chat-input-row" @submit.prevent="sendMessage">
        <label class="sr-only" for="chatInput">输入消息</label>
        <textarea
          id="chatInput"
          v-model="userInput"
          class="chat-input"
          rows="3"
          placeholder="请输入你要咨询的问题，按 Enter 发送，Shift+Enter 换行"
          :disabled="sending"
          @keydown="onInputKeydown"
        />
        <div class="chat-actions">
          <button type="submit" class="primary" :disabled="!canSend">{{ sending ? "发送中..." : "发送" }}</button>
        </div>
      </form>

      <p class="chat-status" :class="{ active: statusText }">{{ statusText }}</p>
    </section>
  </main>
</template>
