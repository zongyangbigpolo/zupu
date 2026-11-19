<template>
  <router-link to="/notifications" class="bell" title="我的通知">
    <el-badge :value="unreadCount" :hidden="!unreadCount" :max="99">
      <el-icon :size="18"><Bell /></el-icon>
    </el-badge>
  </router-link>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { watch } from 'vue';
import { refreshUnread, unreadCount } from '../views/m4/unread';

const route = useRoute();
let timer: number | undefined;
onMounted(() => {
  refreshUnread();
  timer = window.setInterval(refreshUnread, 60_000);
});
onUnmounted(() => window.clearInterval(timer));
watch(() => route.path, refreshUnread);
</script>

<style scoped>
.bell { color: #f3e3c3; display: inline-flex; align-items: center; }
</style>
