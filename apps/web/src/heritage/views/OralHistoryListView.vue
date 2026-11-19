<template>
  <div class="page" v-if="clan">
    <el-page-header @back="router.push(`/clans/${clanId}`)" :title="clan.name">
      <template #content><span class="title-serif" style="font-size: 20px">口述历史</span></template>
    </el-page-header>
    <div class="row" style="margin: 16px 0">
      <el-input v-model="q" placeholder="搜索标题 / 讲述人 / 整理稿 / 人物" clearable style="width: 300px" @keyup.enter="load(1)" @clear="load(1)" />
      <el-button type="danger" :icon="'Search'" @click="load(1)">搜索</el-button>
      <span class="muted">共 {{ data.total }} 条 · 在人物档案页录制或上传（仅家族管理员）</span>
    </div>
    <el-card v-for="o in data.items" :key="o.id" shadow="never" class="oh">
      <div class="row">
        <b class="title-serif t">{{ o.title }}</b>
        <span class="muted">{{ [o.narrator && `讲述：${o.narrator}`, o.recordedText].filter(Boolean).join(' · ') }}</span>
        <div class="grow" />
        <span>关于 <router-link :to="`/persons/${o.person.id}`" :class="o.person.gender" style="font-weight: 600">{{ o.person.fullName }}</router-link>
          <span v-if="o.person.generation" class="muted">（第{{ o.person.generation }}世）</span></span>
      </div>
      <audio v-if="o.audio?.type === 'audio'" :src="o.audio.url" controls preload="none" style="width: 100%; margin-top: 8px" />
      <video v-else-if="o.audio?.type === 'video'" :src="o.audio.url" controls preload="none" style="width: 100%; max-height: 300px; margin-top: 8px" />
      <div v-if="o.transcript" class="transcript">{{ o.transcript }}</div>
    </el-card>
    <el-empty v-if="!data.items.length" description="暂无口述历史" />
    <el-pagination v-if="data.total > data.pageSize" layout="prev, pager, next, total" :total="data.total" :page-size="data.pageSize" :current-page="data.page" @current-change="load" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ClanOralHistory, ClanWithRole, Paged } from '@zupu/shared';
import { api, run } from '../../api';
import { heritage } from '../api';

const route = useRoute();
const router = useRouter();
const clanId = route.params.clanId as string;
const clan = ref<ClanWithRole | null>(null);
const q = ref('');
const data = ref<Paged<ClanOralHistory>>({ items: [], total: 0, page: 1, pageSize: 20 });
async function load(page = 1) {
  data.value = (await run(heritage.oralHistory.ofClan(clanId, { page, pageSize: 20, q: q.value || undefined }))) ?? data.value;
}
onMounted(async () => {
  clan.value = (await run(api.clans.get(clanId))) ?? null;
  load(1);
});
</script>

<style scoped>
.oh { margin-bottom: 12px; }
.t { font-size: 17px; color: var(--zp-red); }
.transcript { white-space: pre-wrap; color: #444; font-family: 'Songti SC', serif; line-height: 1.9; margin-top: 8px; max-height: 240px; overflow: auto; background: #fffaf0; padding: 10px 14px; border-radius: 6px; }
</style>
