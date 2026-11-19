<template>
  <view>
    <view class="bar">
      <input class="kw" v-model="q" :placeholder="placeholder || '输入姓名 / 字号搜索'" confirm-type="search" @confirm="search(1)" />
      <input class="gen" v-model="generation" type="number" placeholder="世代" @confirm="search(1)" />
      <button class="btn go" size="mini" @click="search(1)">搜索</button>
    </view>
    <view v-for="p in items" :key="p.id" class="list-item" @click="emit('select', p)">
      <view class="grow">
        <view class="row" style="gap: 10rpx">
          <text :class="p.gender" style="font-weight: 600; font-size: 30rpx">{{ p.fullName }}</text>
          <text v-if="p.sameNameCount > 1" class="tag red">重名</text>
          <text v-if="p.isLiving" class="tag green">在世</text>
        </view>
        <view class="muted">{{ p.disambiguation || (p.isExternal ? '外姓配偶' : '') }}</view>
      </view>
      <text class="muted">{{ lifespanText(p) }}</text>
    </view>
    <view v-if="searched && !items.length" class="empty">没有找到匹配的族人</view>
    <view v-if="total > items.length" class="more muted" @click="search(page + 1)">加载更多（共 {{ total }} 人）</view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { lifespanText, type PersonSearchItem } from '@zupu/shared';
import { api, run } from '../api';

const props = defineProps<{ clanId: string; placeholder?: string; auto?: boolean }>();
const emit = defineEmits<{ (e: 'select', p: PersonSearchItem): void }>();
const q = ref('');
const generation = ref('');
const items = ref<PersonSearchItem[]>([]);
const total = ref(0);
const page = ref(1);
const searched = ref(false);

async function search(p: number) {
  const r = await run(
    api.clans.searchPersons(props.clanId, { q: q.value.trim() || undefined, generation: Number(generation.value) || undefined, page: p, pageSize: 20 }),
  );
  if (!r) return;
  items.value = p === 1 ? r.items : [...items.value, ...r.items];
  total.value = r.total;
  page.value = p;
  searched.value = true;
}
if (props.auto) search(1);
defineExpose({ search });
</script>

<style scoped>
.bar { display: flex; gap: 12rpx; align-items: center; margin-bottom: 12rpx; }
.kw { flex: 1; background: #f7f2e8; border-radius: 12rpx; padding: 14rpx 18rpx; }
.gen { width: 110rpx; background: #f7f2e8; border-radius: 12rpx; padding: 14rpx 12rpx; }
.go { margin: 0; line-height: 64rpx; height: 64rpx; padding: 0 22rpx; }
.more { text-align: center; padding: 20rpx 0; }
</style>
