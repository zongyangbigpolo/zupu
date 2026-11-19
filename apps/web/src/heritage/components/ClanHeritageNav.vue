<template>
  <el-card shadow="never" class="nav-card">
    <template #header><span class="card-title">文化传承</span></template>
    <div class="grid">
      <router-link v-for="l in links" :key="l.to" :to="l.to" class="cell">
        <el-icon :size="24"><component :is="l.icon" /></el-icon>
        <span>{{ l.label }}</span>
      </router-link>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ clanId: string; founderId?: string | null }>();
const links = computed(() => [
  { to: `/clans/${props.clanId}/documents`, label: '家训谱序', icon: 'Reading' },
  { to: `/clans/${props.clanId}/stats`, label: '统计看板', icon: 'DataAnalysis' },
  { to: `/clans/${props.clanId}/search`, label: '高级搜索', icon: 'Search' },
  { to: `/clans/${props.clanId}/gallery`, label: '家族相册', icon: 'Picture' },
  { to: `/clans/${props.clanId}/oral-histories`, label: '口述历史', icon: 'Microphone' },
  ...(props.founderId ? [{ to: `/persons/${props.founderId}/memorial`, label: '始祖纪念馆', icon: 'Sunny' }] : []),
]);
</script>

<style scoped>
.nav-card { margin-bottom: 16px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.cell { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 4px; border-radius: 8px; color: var(--zp-red); background: #fffaf0; border: 1px solid #f0e4c8; font-size: 13px; transition: all 0.15s; }
.cell:hover { background: var(--zp-red); color: #fff; }
</style>
