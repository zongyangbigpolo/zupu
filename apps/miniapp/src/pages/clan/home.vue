<template>
  <view v-if="clan">
    <view class="head">
      <view class="serif hall">{{ clan.hallName || clan.surname + '氏' }}</view>
      <view class="serif name">{{ clan.name }}</view>
      <view class="meta">郡望 {{ clan.origin || '—' }} · {{ VISIBILITY_LABELS[clan.visibility] }} · {{ ROLE_LABELS[clan.myRole] }}</view>
    </view>

    <view class="card search" @click="go(`/pages/person/search?clanId=${clan.id}`)">
      <text class="muted">🔍 搜索族人：姓名 / 字号 / 字辈 / 世代</text>
    </view>

    <view class="card">
      <view class="grid">
        <view v-for="t in tiles" :key="t.label" class="tile" @click="t.action()">
          <view class="icon" :style="{ background: t.color }">{{ t.icon }}</view>
          <view class="label">{{ t.label }}</view>
        </view>
      </view>
    </view>

    <view v-if="mePerson" class="card me" @click="go(`/pages/tree/index?id=${mePerson.id}`)">
      <view class="card-title">我在谱中</view>
      <view class="row">
        <text class="big" :class="mePerson.gender">{{ mePerson.fullName }}</text>
        <text class="muted grow">{{ mePerson.disambiguation }}</text>
        <text class="tag red">以我为中心看五代树 ›</text>
      </view>
    </view>

    <view v-if="poem.length" class="card">
      <view class="card-title">字辈诗</view>
      <view class="poem">
        <view v-for="(c, i) in poem" :key="i" class="pc">
          <text class="serif ch">{{ c }}</text>
          <text class="muted">{{ i + clan.poemStartGeneration }}世</text>
        </view>
      </view>
    </view>

    <view v-if="clan.description" class="card">
      <view class="card-title">家族简介</view>
      <view class="desc">{{ clan.description }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { parseGenerationPoem, ROLE_LABELS, VISIBILITY_LABELS, type ClanWithRole, type PersonDetail } from '@zupu/shared';
import { api, run } from '../../api';
import { requireLogin } from '../../session';

const clan = ref<ClanWithRole | null>(null);
const mePerson = ref<PersonDetail | null>(null);
const poem = computed(() => parseGenerationPoem(clan.value?.generationPoem));
const isMember = computed(() => !!clan.value && clan.value.myRole !== 'visitor');

const go = (url: string) => uni.navigateTo({ url });
const memberOnly = (url: string) => () => {
  if (!requireLogin()) return;
  if (!isMember.value) return uni.showToast({ title: '仅本族族人可用', icon: 'none' });
  go(url);
};
const coming = (name: string) => () => go(`/pages/clan/coming?name=${encodeURIComponent(name)}`);

const tiles = computed(() => {
  const c = clan.value!;
  const root = mePerson.value?.id ?? c.founderId;
  return [
    { icon: '树', label: '五代树', color: '#8b1e1e', action: () => (root ? go(`/pages/tree/index?id=${root}`) : uni.showToast({ title: '尚未设置始祖', icon: 'none' })) },
    { icon: '亲', label: '亲属关系', color: '#a0522d', action: () => go(`/pages/kinship/index?clanId=${c.id}${mePerson.value ? `&from=${mePerson.value.id}` : ''}`) },
    { icon: '录', label: '通讯录', color: '#2f6f5e', action: memberOnly(`/pages/contacts/index?clanId=${c.id}`) },
    { icon: '活', label: '活动公告', color: '#b8860b', action: memberOnly(`/pages/activity/list?clanId=${c.id}`) },
    { icon: '寿', label: '生日忌日', color: '#6a4c93', action: memberOnly(`/pages/reminders/index?clanId=${c.id}`) },
    { icon: '馆', label: '纪念馆', color: '#7a7a7a', action: coming('人物纪念馆') },
    { icon: '图', label: '迁徙地图', color: '#7a7a7a', action: coming('迁徙地图') },
    { icon: '统', label: '统计', color: '#7a7a7a', action: coming('统计看板') },
  ];
});

onLoad(async (q) => {
  const id = (q as any).id as string;
  clan.value = (await run(api.clans.get(id))) ?? null;
  if (clan.value) uni.setNavigationBarTitle({ title: clan.value.name });
  if (clan.value?.myLinkedPersonId) mePerson.value = (await run(api.persons.get(clan.value.myLinkedPersonId))) ?? null;
});
</script>

<style scoped>
.head { background: linear-gradient(135deg, #6e1414, #8b1e1e); color: #f3e3c3; padding: 40rpx 32rpx 60rpx; }
.hall { font-size: 52rpx; color: #f6d99b; letter-spacing: 8rpx; }
.name { font-size: 34rpx; margin-top: 8rpx; }
.meta { font-size: 24rpx; opacity: 0.8; margin-top: 8rpx; }
.search { margin-top: -36rpx; padding: 22rpx 24rpx; }
.grid { display: flex; flex-wrap: wrap; }
.tile { width: 25%; text-align: center; padding: 14rpx 0; }
.icon { width: 84rpx; height: 84rpx; line-height: 84rpx; border-radius: 50%; color: #fff; margin: 0 auto; font-size: 34rpx; font-family: 'Songti SC', serif; }
.label { font-size: 24rpx; margin-top: 10rpx; color: #555; }
.big { font-size: 36rpx; font-weight: 600; }
.poem { display: flex; flex-wrap: wrap; }
.pc { display: flex; flex-direction: column; align-items: center; width: 14.28%; margin-bottom: 12rpx; }
.ch { font-size: 40rpx; color: #8b1e1e; }
.desc { line-height: 1.8; color: #555; }
</style>
