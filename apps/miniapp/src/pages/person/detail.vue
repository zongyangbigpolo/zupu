<template>
  <view v-if="p">
    <view class="head">
      <view class="row">
        <view class="avatar serif" :class="p.gender">{{ p.givenName.slice(-1) }}</view>
        <view class="grow">
          <view class="name serif">{{ p.fullName }}</view>
          <view class="dis">{{ p.disambiguation || (p.isExternal ? '外姓配偶' : '') }}</view>
          <view style="margin-top: 8rpx">
            <text class="tag" :class="p.isLiving ? 'green' : 'gray'">{{ p.isLiving ? '在世' : '已故' }}</text>
            <text v-if="p.generationChar" class="tag" style="margin-left: 8rpx">{{ p.generationChar }}字辈</text>
          </view>
        </view>
      </view>
      <view class="actions">
        <button class="btn" size="mini" @click="go(`/pages/tree/index?id=${p.id}`)">五代树</button>
        <button class="btn-plain" size="mini" @click="go(`/pages/kinship/index?clanId=${p.clanId}&to=${p.id}${myId && myId !== p.id ? `&from=${myId}` : ''}`)">
          {{ myId && myId !== p.id ? '他是我的谁' : '亲属关系' }}
        </button>
      </view>
    </view>

    <view class="card">
      <view class="card-title">基本信息</view>
      <view v-for="f in fields" :key="f[0]" class="kv">
        <text class="k">{{ f[0] }}</text><text class="v">{{ f[1] }}</text>
      </view>
      <view v-if="dates.length" class="kv">
        <text class="k">纪念日</text>
        <text class="v">{{ dates.map((d) => `${REMINDER_KIND_LABELS[d.kind]} ${d.text}`).join('；') }}</text>
      </view>
      <view v-if="p.hiddenFields?.length" class="muted" style="margin-top: 12rpx">部分在世者信息仅本族族人可见</view>
    </view>

    <view v-for="g in groups" :key="g.title" class="card">
      <view class="card-title">{{ g.title }}</view>
      <view v-for="r in g.list" :key="r.relationId" class="list-item" @click="go(`/pages/person/detail?id=${r.person.id}`)">
        <text :class="r.person.gender" style="font-weight: 600">{{ r.person.fullName }}</text>
        <text class="muted grow">{{ r.label }}</text>
        <text class="muted">›</text>
      </view>
    </view>

    <view v-if="p.biography" class="card">
      <view class="card-title">生平</view>
      <rich-text class="bio" :nodes="p.biography" />
    </view>

    <view v-if="photos.length" class="card">
      <view class="card-title">照片</view>
      <view class="photos">
        <image v-for="m in photos" :key="m.id" :src="mediaUrl(m.url)" mode="aspectFill" class="photo" @click="preview(m.url)" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  lifespanText,
  MARRIAGE_TYPE_LABELS,
  RELATION_TYPE_LABELS,
  REMINDER_KIND_LABELS,
  type PersonDetail,
  type ReminderDate,
} from '@zupu/shared';
import { api, BASE_URL, m4, run } from '../../api';
import { session } from '../../session';

const p = ref<PersonDetail | null>(null);
const dates = ref<ReminderDate[]>([]);
const myId = ref<string | null>(null);
const go = (url: string) => uni.navigateTo({ url });

const fields = computed(() => {
  const x = p.value!;
  return (
    [
      ['字 / 号', [x.courtesyName, x.artName].filter(Boolean).join(' / ')],
      ['世代', x.generation ? `第 ${x.generation} 世` : ''],
      ['生卒', lifespanText(x)],
      ['祖籍', x.ancestralHome],
      ['出生地', x.birthPlace],
      ['葬地', x.burialPlace],
      ['职业', x.occupation],
    ] as [string, string | null][]
  ).filter((f) => f[1]);
});

const groups = computed(() => {
  const x = p.value!;
  return [
    { title: '父母', list: x.parents.map((r) => ({ ...r, label: r.relationType && r.relationType !== 'biological' ? RELATION_TYPE_LABELS[r.relationType] : '' })) },
    { title: '配偶', list: x.spouses.map((r) => ({ ...r, label: r.marriageType ? MARRIAGE_TYPE_LABELS[r.marriageType] : '' })) },
    { title: '子女', list: x.children.map((r) => ({ ...r, label: r.relationType && r.relationType !== 'biological' ? RELATION_TYPE_LABELS[r.relationType] : '' })) },
  ].filter((g) => g.list.length);
});

const photos = computed(() => p.value?.media.filter((m) => m.type === 'photo') ?? []);
const mediaUrl = (u: string) => (/^https?:/.test(u) ? u : BASE_URL.replace(/\/api$/, '') + u);
const preview = (u: string) => uni.previewImage({ urls: photos.value.map((m) => mediaUrl(m.url)), current: mediaUrl(u) });

onLoad(async (q) => {
  const id = (q as any).id as string;
  p.value = (await run(api.persons.get(id))) ?? null;
  if (!p.value) return;
  uni.setNavigationBarTitle({ title: p.value.fullName });
  if (session.loggedIn) {
    const clan = await api.clans.get(p.value.clanId).catch(() => null);
    myId.value = clan?.myLinkedPersonId ?? null;
    if (clan && clan.myRole !== 'visitor') dates.value = (await m4.reminders.dates(id).catch(() => [])) ?? [];
  }
});
</script>

<style scoped>
.head { background: #fff; padding: 32rpx; border-bottom: 1px solid #f0e6d2; }
.avatar { width: 110rpx; height: 110rpx; border-radius: 50%; background: #f3e3c3; color: #8b1e1e; display: flex; align-items: center; justify-content: center; font-size: 50rpx; }
.avatar.male { background: #e3ecfa; color: #2f6fd6; }
.avatar.female { background: #fbe6ec; color: #d14d72; }
.name { font-size: 42rpx; font-weight: 600; }
.dis { color: #8a6d3b; font-size: 24rpx; margin-top: 4rpx; }
.actions { display: flex; gap: 20rpx; margin-top: 24rpx; }
.actions button { margin: 0; }
.kv { display: flex; padding: 10rpx 0; }
.k { width: 140rpx; color: #999; flex-shrink: 0; }
.v { flex: 1; }
.bio { line-height: 1.8; color: #444; }
.photos { display: flex; flex-wrap: wrap; gap: 12rpx; }
.photo { width: 200rpx; height: 200rpx; border-radius: 8rpx; }
</style>
