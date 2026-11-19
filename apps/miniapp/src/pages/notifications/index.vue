<template>
  <view>
    <view v-if="!session.loggedIn" class="card empty" @click="goLogin">登录后查看消息</view>
    <template v-else>
      <view class="row head">
        <text class="muted grow">共 {{ total }} 条</text>
        <text class="link" @click="readAll">全部已读</text>
      </view>
      <view v-for="n in items" :key="n.id" class="card n" :class="{ unread: !n.readAt }" @click="open(n)">
        <view class="row">
          <text class="tag" :class="TYPE[n.type].cls">{{ TYPE[n.type].label }}</text>
          <text class="grow title">{{ n.title }}</text>
          <view v-if="!n.readAt" class="dot" />
        </view>
        <view v-if="n.body" class="muted body">{{ n.body }}</view>
        <view class="muted time">{{ fmtTime(n.createdAt) }}</view>
      </view>
      <view v-if="loaded && !items.length" class="empty">暂无消息</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import type { AppNotification, NotificationType } from '@zupu/shared';
import { fmtTime, m4, run } from '../../api';
import { session } from '../../session';

const TYPE: Record<NotificationType, { label: string; cls: string }> = {
  reminder: { label: '提醒', cls: 'green' },
  activity: { label: '活动', cls: 'red' },
  'activity-reminder': { label: '活动', cls: 'red' },
  announcement: { label: '公告', cls: '' },
};
const items = ref<AppNotification[]>([]);
const total = ref(0);
const loaded = ref(false);

async function load() {
  if (!session.loggedIn) return;
  const r = await run(m4.notifications.list({ pageSize: 50 }));
  items.value = r?.items ?? [];
  total.value = r?.total ?? 0;
  loaded.value = true;
  const unread = items.value.filter((n) => !n.readAt).length;
  if (unread) uni.setTabBarBadge({ index: 1, text: String(unread) }).catch?.(() => {});
  else uni.removeTabBarBadge({ index: 1 }).catch?.(() => {});
}
onShow(load);
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
async function readAll() {
  await run(m4.notifications.readAll());
  load();
}
async function open(n: AppNotification) {
  if (!n.readAt) {
    await run(m4.notifications.read(n.id));
    n.readAt = new Date().toISOString();
  }
  if (n.link?.kind === 'activity') uni.navigateTo({ url: `/pages/activity/detail?id=${n.link.id}` });
  else if (n.link?.kind === 'person') uni.navigateTo({ url: `/pages/person/detail?id=${n.link.id}` });
}
const goLogin = () => uni.navigateTo({ url: '/pages/login/index' });
</script>

<style scoped>
.head { padding: 20rpx 32rpx 0; }
.link { color: #8b1e1e; font-size: 26rpx; }
.n .title { color: #777; }
.n.unread .title { color: #222; font-weight: 600; }
.dot { width: 14rpx; height: 14rpx; border-radius: 50%; background: #e53935; }
.body { margin-top: 8rpx; line-height: 1.6; }
.time { margin-top: 6rpx; font-size: 22rpx; }
</style>
