<template>
  <view>
    <view class="card row">
      <input class="kw grow" v-model="q" placeholder="搜索姓名 / 城市 / 单位" />
      <button class="btn" size="mini" @click="edit">我的名片</button>
    </view>
    <view class="tip muted">仅本族已登录族人可见 · 每人自行设置字段可见范围</view>
    <view class="card">
      <view v-for="c in filtered" :key="c.userId" class="list-item contact">
        <view class="av serif" :class="c.linkedPerson?.gender">{{ (c.displayName || '族')[0] }}</view>
        <view class="grow">
          <view class="row" style="gap: 10rpx">
            <text style="font-weight: 600; font-size: 30rpx">{{ c.displayName || '未命名' }}</text>
            <text v-if="c.isMe" class="tag green">我</text>
            <text v-if="c.role === 'admin'" class="tag red">管理员</text>
          </view>
          <view v-if="c.linkedPerson" class="muted" @click="goPerson(c.linkedPerson.id)">
            谱名 {{ c.linkedPerson.fullName }}{{ c.linkedPerson.generation ? ` · 第${c.linkedPerson.generation}世` : '' }}
          </view>
          <view v-for="k in CONTACT_FIELDS.filter((k) => c.fields[k])" :key="k" class="f">
            <text class="muted">{{ CONTACT_FIELD_LABELS[k] }}：</text>
            <text :class="{ link: k === 'phone' }" @click="k === 'phone' && call(c.fields[k]!)">{{ c.fields[k] }}</text>
          </view>
          <view v-if="!Object.keys(c.fields).length" class="muted">未公开联系方式</view>
        </view>
      </view>
      <view v-if="loaded && !filtered.length" class="empty">暂无族人</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { CONTACT_FIELD_LABELS, CONTACT_FIELDS, type ContactEntry } from '@zupu/shared';
import { m4, run } from '../../api';

const clanId = ref('');
const list = ref<ContactEntry[]>([]);
const loaded = ref(false);
const q = ref('');
const filtered = computed(() => {
  const k = q.value.trim();
  return k ? list.value.filter((c) => [c.displayName, c.linkedPerson?.fullName, c.fields.city, c.fields.work].some((s) => s?.includes(k))) : list.value;
});
onLoad((o: any) => (clanId.value = o.clanId));
onShow(async () => {
  if (!clanId.value) return;
  list.value = (await run(m4.contacts.list(clanId.value))) ?? [];
  loaded.value = true;
});
const edit = () => uni.navigateTo({ url: `/pages/contacts/edit?clanId=${clanId.value}` });
const goPerson = (id: string) => uni.navigateTo({ url: `/pages/person/detail?id=${id}` });
const call = (n: string) => uni.makePhoneCall({ phoneNumber: n });
</script>

<style scoped>
.kw { background: #f7f2e8; border-radius: 12rpx; padding: 14rpx 18rpx; }
.row button { margin: 0; }
.tip { padding: 0 32rpx; }
.contact { align-items: flex-start; }
.av { width: 80rpx; height: 80rpx; border-radius: 50%; background: #f3e3c3; color: #8b1e1e; display: flex; align-items: center; justify-content: center; font-size: 34rpx; flex-shrink: 0; }
.av.male { background: #e3ecfa; color: #2f6fd6; }
.av.female { background: #fbe6ec; color: #d14d72; }
.f { font-size: 26rpx; margin-top: 4rpx; }
.link { color: #2f6fd6; }
</style>
