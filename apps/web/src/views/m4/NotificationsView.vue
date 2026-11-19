<template>
  <div class="page" style="max-width: 820px">
    <div class="row mb">
      <h2 class="title-serif grow" style="margin: 0">我的通知</h2>
      <el-checkbox v-model="unread" @change="load(1)">只看未读</el-checkbox>
      <el-button size="small" @click="readAll">全部标为已读</el-button>
    </div>
    <el-card shadow="never" v-loading="loading">
      <el-empty v-if="!loading && !page.items.length" description="暂无通知" />
      <div v-for="n in page.items" :key="n.id" class="n" :class="{ unread: !n.readAt }" @click="open(n)">
        <el-tag size="small" :type="TYPE[n.type].tag">{{ TYPE[n.type].label }}</el-tag>
        <div class="grow">
          <div class="title">{{ n.title }}</div>
          <div v-if="n.body" class="muted">{{ n.body }}</div>
        </div>
        <span class="muted">{{ fmtTime(n.createdAt) }}</span>
      </div>
      <el-pagination
        v-if="page.total > page.pageSize"
        layout="prev, pager, next"
        :total="page.total"
        :page-size="page.pageSize"
        :current-page="page.page"
        @current-change="load"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AppNotification, NotificationType, Paged } from '@zupu/shared';
import { run } from '../../api';
import { fmtTime, m4 } from '../../m4';
import { unreadCount } from './unread';

const TYPE: Record<NotificationType, { label: string; tag: 'success' | 'warning' | 'info' | 'danger' }> = {
  reminder: { label: '提醒', tag: 'success' },
  activity: { label: '活动', tag: 'warning' },
  'activity-reminder': { label: '活动', tag: 'danger' },
  announcement: { label: '公告', tag: 'info' },
};

const router = useRouter();
const unread = ref(false);
const loading = ref(true);
const page = ref<Paged<AppNotification>>({ items: [], total: 0, page: 1, pageSize: 20 });

async function load(p = 1) {
  loading.value = true;
  const r = await run(m4.notifications.list({ unread: unread.value || undefined, page: p }));
  if (r) page.value = r;
  loading.value = false;
}
async function readAll() {
  await run(m4.notifications.readAll());
  unreadCount.value = 0;
  load(page.value.page);
}
async function open(n: AppNotification) {
  if (!n.readAt) {
    await run(m4.notifications.read(n.id));
    n.readAt = new Date().toISOString();
    unreadCount.value = Math.max(0, unreadCount.value - 1);
  }
  if (n.link?.kind === 'activity') router.push(`/activities/${n.link.id}`);
  else if (n.link?.kind === 'person') router.push(`/persons/${n.link.id}`);
}
onMounted(() => load(1));
</script>

<style scoped>
.mb { margin-bottom: 14px; }
.n { display: flex; gap: 12px; align-items: flex-start; padding: 12px 4px; border-bottom: 1px dashed #eadfca; cursor: pointer; }
.n:last-child { border-bottom: 0; }
.n .title { color: #666; }
.n.unread .title { color: #222; font-weight: 600; }
</style>
