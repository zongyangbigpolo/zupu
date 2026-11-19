<template>
  <view class="card">
    <PersonSearch :clan-id="clanId" auto @select="(p) => go(p.id)" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import PersonSearch from '../../components/PersonSearch.vue';

const clanId = ref('');
onLoad((q) => (clanId.value = (q as any).clanId));
const go = (id: string) => uni.navigateTo({ url: `/pages/person/detail?id=${id}` });
</script>
