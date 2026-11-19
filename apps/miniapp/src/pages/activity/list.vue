<template>
  <view>
    <view class="tabs">
      <text v-for="t in TABS" :key="t.v" :class="{ on: kind === t.v }" @click="setKind(t.v)">{{ t.l }}</text>
    </view>
    <view v-for="a in items" :key="a.id" class="card" @click="open(a.id)">
      <view class="row" style="gap: 10rpx">
        <text v-if="a.pinned" class="tag red">置顶</text>
        <text class="tag">{{ a.kind === 'activity' ? ACTIVITY_CATEGORY_LABELS[a.category] : '公告' }}</text>
        <text class="grow title">{{ a.title }}</text>
      </view>
      <view v-if="a.kind === 'activity'" class="muted meta">
        <view>🕘 {{ fmtTime(a.startAt) }}</view>
        <view v-if="a.location">📍 {{ a.location }}</view>
        <view v-if="a.allowSignup">已报名 {{ a.signupCount }} 户 / {{ a.headcountTotal }} 人</view>
      </view>
      <view v-else class="content">{{ a.content }}</view>
      <view class="row" style="margin-top: 10rpx">
        <text class="muted grow">{{ fmtTime(a.createdAt) }}</text>
        <text v-if="a.status === 'cancelled'" class="tag gray">已取消</text>
        <text v-else-if="a.mySignup?.checkedInAt" class="tag green">已签到</text>
        <text v-else-if="a.mySignup?.status === 'signed'" class="tag green">已报名</text>
      </view>
    </view>
    <view v-if="loaded && !items.length" class="empty">暂无活动或公告</view>
    <view class="muted" style="text-align: center; padding: 20rpx">活动由家族管理员在网页端发布</view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { ACTIVITY_CATEGORY_LABELS, type Activity, type ActivityKind } from '@zupu/shared';
import { fmtTime, m4, run } from '../../api';

const TABS = [
  { v: '', l: '全部' },
  { v: 'activity', l: '活动' },
  { v: 'announcement', l: '公告' },
] as const;
const clanId = ref('');
const kind = ref<'' | ActivityKind>('');
const items = ref<Activity[]>([]);
const loaded = ref(false);

async function load() {
  if (!clanId.value) return;
  const r = await run(m4.activities.list(clanId.value, { kind: kind.value || undefined, pageSize: 50 }));
  items.value = r?.items ?? [];
  loaded.value = true;
}
const setKind = (k: '' | ActivityKind) => ((kind.value = k), load());
const open = (id: string) => uni.navigateTo({ url: `/pages/activity/detail?id=${id}` });
onLoad((o: any) => (clanId.value = o.clanId));
onShow(load);
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
</script>

<style scoped>
.tabs { display: flex; background: #fff; border-bottom: 1px solid #f0e6d2; }
.tabs text { flex: 1; text-align: center; padding: 22rpx 0; color: #8a6d3b; }
.tabs .on { color: #8b1e1e; font-weight: 600; border-bottom: 4rpx solid #8b1e1e; }
.title { font-size: 30rpx; font-weight: 600; }
.meta { margin-top: 10rpx; line-height: 1.7; }
.content { margin-top: 10rpx; color: #555; line-height: 1.7; max-height: 3.4em; overflow: hidden; }
</style>
