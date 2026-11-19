<template>
  <view>
    <view class="head">
      <view class="av serif">{{ (session.user?.displayName || '族')[0] }}</view>
      <view v-if="session.loggedIn" class="grow">
        <view class="name">{{ session.user?.displayName || '族人' }}</view>
        <view class="phone">{{ maskPhone(session.user?.phone) }}</view>
      </view>
      <view v-else class="grow" @click="goLogin"><view class="name">点击登录</view></view>
    </view>

    <view v-if="session.loggedIn" class="card">
      <view class="card-title">我在谱中</view>
      <view v-for="c in clans" :key="c.id" class="list-item" @click="openMe(c)">
        <text class="grow">{{ c.name }}</text>
        <text class="muted">{{ c.myLinkedPersonId ? '以我为中心看五代树 ›' : '未关联（请联系管理员）' }}</text>
      </view>
      <view v-if="!clans.length" class="muted">尚未加入任何家族</view>
    </view>

    <view v-if="session.loggedIn" class="card">
      <view class="list-item">
        <text class="grow">微信绑定</text>
        <!-- #ifdef MP-WEIXIN -->
        <text class="link" @click="bindWechat">绑定当前微信</text>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <text class="muted">请在微信小程序中绑定</text>
        <!-- #endif -->
      </view>
      <view class="list-item" @click="subscribe">
        <text class="grow">订阅生日 / 忌日 / 活动提醒</text>
        <text class="muted">›</text>
      </view>
      <view class="list-item" @click="aiTip">
        <text class="grow">AI 人物小传</text>
        <text class="muted">敬请期待</text>
      </view>
    </view>

    <view class="card about muted">
      <view>族谱 · 多家族族谱平台</view>
      <view>仅家族管理员可录入和修改，族人只读</view>
    </view>
    <button v-if="session.loggedIn" class="btn-plain logout" @click="logout">退出登录</button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import type { ClanWithRole } from '@zupu/shared';
import { api, m4, run } from '../../api';
import { session } from '../../session';
import { requestSubscribe } from '../../subscribe';

const clans = ref<ClanWithRole[]>([]);
onShow(async () => {
  if (!session.loggedIn) return;
  clans.value = ((await run(api.clans.list())) ?? []).filter((c) => c.myRole !== 'visitor');
  const me = await api.auth.me().catch(() => null);
  if (me && session.user) session.user = me;
});
const maskPhone = (p?: string | null) => (p ? p.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '');
const goLogin = () => uni.navigateTo({ url: '/pages/login/index' });
function openMe(c: ClanWithRole) {
  if (c.myLinkedPersonId) uni.navigateTo({ url: `/pages/tree/index?id=${c.myLinkedPersonId}` });
  else uni.navigateTo({ url: `/pages/clan/home?id=${c.id}` });
}
function bindWechat() {
  uni.login({
    provider: 'weixin',
    success: async (r) => {
      await run(m4.wechat.bindCurrent(r.code), '绑定成功');
    },
  });
}
async function subscribe() {
  await requestSubscribe(['reminder', 'activity']);
  uni.showToast({ title: '已提交订阅', icon: 'none' });
}
const aiTip = () => uni.showToast({ title: 'AI 功能敬请期待', icon: 'none' });
function logout() {
  session.logout();
  clans.value = [];
  uni.switchTab({ url: '/pages/index/index' });
}
</script>

<style scoped>
.head { display: flex; align-items: center; gap: 24rpx; background: linear-gradient(135deg, #6e1414, #8b1e1e); padding: 48rpx 32rpx; color: #f3e3c3; }
.av { width: 110rpx; height: 110rpx; border-radius: 50%; background: #f6d99b; color: #8b1e1e; font-size: 50rpx; display: flex; align-items: center; justify-content: center; }
.name { font-size: 36rpx; font-weight: 600; }
.phone { opacity: 0.8; margin-top: 6rpx; }
.link { color: #8b1e1e; }
.about { text-align: center; line-height: 1.8; }
.logout { margin: 30rpx 24rpx; }
</style>
