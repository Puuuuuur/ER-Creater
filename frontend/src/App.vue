<script setup>
import { onMounted, onUnmounted, ref } from "vue";

import ErWorkbench from "./components/ErWorkbench.vue";
import SupportChat from "./components/SupportChat.vue";

function resolveView(pathname) {
  if (pathname.startsWith("/er")) {
    return "er";
  }
  return "chat";
}

const currentView = ref(resolveView(window.location.pathname));

function navigateTo(view, pushState = true) {
  const targetPath = view === "er" ? "/er" : "/";
  currentView.value = view;

  if (pushState && window.location.pathname !== targetPath) {
    window.history.pushState({ view }, "", targetPath);
  }
}

function openEr() {
  navigateTo("er");
}

function backToChat() {
  navigateTo("chat");
}

function onPopstate() {
  currentView.value = resolveView(window.location.pathname);
}

onMounted(() => {
  window.addEventListener("popstate", onPopstate);
});

onUnmounted(() => {
  window.removeEventListener("popstate", onPopstate);
});
</script>

<template>
  <SupportChat v-if="currentView === 'chat'" @open-er="openEr" />

  <div v-else class="er-page-shell">
    <div class="er-page-nav">
      <button type="button" class="secondary" @click="backToChat">返回客服首页</button>
    </div>
    <ErWorkbench />
  </div>
</template>
