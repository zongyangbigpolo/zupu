<template>
  <view>
    <view v-if="!session.loggedIn" class="card login-tip" @click="goLogin">
      <view class="grow">
        <view class="card-title" style="margin: 0">登录查看本族族谱</view>
        <view class="muted">微信一键登录，或使用手机号登录</view>
      </view>
      <text class="arrow">›</text>
    </view>
    <view class="section muted">{{ session.loggedIn ? '我的族谱' : '公开族谱' }}</view>
    <view v-for="c in clans" :key="c.id" class="card clan" @click="open(c.id)">
      <view class="hall serif">{{ (c.hallName || c.surname + '氏').slice(0, 3) }}</view>
      <view class="grow">
        <view class="name serif">{{ c.name }}</view>
        <view class="muted">郡望 {{ c.origin || '—' }} · {{ c.personCount ?? 0 }} 人</view>
        <view style="margin-top: 8rpx">
          <text class="tag" :class="{ red: c.myRole === 'admin' || c.myRole === 'super' }">{{ ROLE_LABELS[c.myRole] }}</text>
        </view>
      </view>
      <text class="arrow">›</text>
    </view>
    <view v-if="loaded && !clans.length" class="empty">暂无可查看的族谱</view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { ROLE_LABELS, type ClanWithRole } from '@zupu/shared';
import { api, run } from '../../api';
import { session } from '../../session';

const clans = ref<ClanWithRole[]>([]);
const loaded = ref(false);

async function load() {
  clans.value = (await run(api.clans.list())) ?? [];
  loaded.value = true;
}
onShow(load);
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
const goLogin = () => uni.navigateTo({ url: '/pages/login/index' });
const open = (id: string) => uni.navigateTo({ url: `/pages/clan/home?id=${id}` });
</script>

<style scoped>
.section { padding: 24rpx 32rpx 0; }
.login-tip { display: flex; align-items: center; background: #fff6e5; }
.clan { display: flex; align-items: center; gap: 24rpx; }
.hall { width: 110rpx; height: 110rpx; border-radius: 12rpx; background: #8b1e1e; color: #f6d99b; display: flex; align-items: center; justify-content: center; font-size: 30rpx; writing-mode: vertical-rl; letter-spacing: 4rpx; }
.name { font-size: 34rpx; font-weight: 600; color: #2c2c2c; margin-bottom: 6rpx; }
.arrow { color: #ccc; font-size: 40rpx; }
</style>
