<template>
  <view class="card" style="text-align: center; padding: 80rpx 24rpx">
    <view class="serif" style="font-size: 44rpx; color: #8b1e1e">{{ name }}</view>
    <view class="muted" style="margin-top: 20rpx">敬请期待：该功能正在建设中，可先在网页端查看</view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
const name = ref('');
onLoad((q) => {
  name.value = decodeURIComponent((q as any).name ?? '');
  uni.setNavigationBarTitle({ title: name.value || '敬请期待' });
});
</script>
