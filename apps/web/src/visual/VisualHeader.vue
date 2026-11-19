<template>
  <div class="vhead">
    <el-button text :icon="'Back'" @click="router.push(`/clans/${clanId}`)">{{ clanName || '家族首页' }}</el-button>
    <el-divider direction="vertical" />
    <span class="title-serif vtitle">{{ title }}</span>
    <slot />
    <div class="grow" />
    <el-radio-group :model-value="current" size="small" @update:model-value="(v: any) => router.push(`/clans/${clanId}/${v}`)">
      <el-radio-button value="migrations">迁徙地图</el-radio-button>
      <el-radio-button value="sites">祠堂祖坟</el-radio-button>
      <el-radio-button value="timeline">时间轴</el-radio-button>
      <el-radio-button value="pedigree">吊线谱</el-radio-button>
    </el-radio-group>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

defineProps<{ clanId: string; clanName?: string | null; title: string; current: string }>();
const router = useRouter();
</script>

<style scoped>
.vhead { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 16px; background: #fff; border-bottom: 1px solid #eee2cc; }
.vtitle { font-size: 18px; color: var(--zp-red); }
</style>
