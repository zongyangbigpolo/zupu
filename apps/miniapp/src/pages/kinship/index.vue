<template>
  <view>
    <view class="card">
      <view class="pick" :class="{ active: picking === 'from' }" @click="picking = 'from'">
        <text class="lbl">甲</text>
        <text v-if="from" class="who" :class="from.gender">{{ from.fullName }}</text>
        <text v-else class="muted grow">点此选择第一人</text>
        <text v-if="from" class="muted grow">{{ from.disambiguation }}</text>
      </view>
      <view class="swap" @click="swap">⇅ 交换</view>
      <view class="pick" :class="{ active: picking === 'to' }" @click="picking = 'to'">
        <text class="lbl">乙</text>
        <text v-if="to" class="who" :class="to.gender">{{ to.fullName }}</text>
        <text v-else class="muted grow">点此选择第二人</text>
        <text v-if="to" class="muted grow">{{ to.disambiguation }}</text>
      </view>
    </view>

    <view v-if="result" class="card result">
      <template v-if="result.connected">
        <view class="term">
          <text class="serif">{{ result.to.fullName }}</text> 是 <text class="serif">{{ result.from.fullName }}</text> 的
          <text class="big serif">{{ result.termAtoB || '亲属' }}</text>
        </view>
        <view class="term">
          <text class="serif">{{ result.from.fullName }}</text> 是 <text class="serif">{{ result.to.fullName }}</text> 的
          <text class="big serif">{{ result.termBtoA || '亲属' }}</text>
        </view>
        <view v-if="result.termsAtoB.length > 1" class="muted">其他可能称谓：{{ result.termsAtoB.join('、') }}</view>
        <view class="kv"><text class="k">辈分</text><text>{{ result.generationDiffText }}</text></view>
        <view v-if="result.commonAncestor" class="kv">
          <text class="k">共同祖先</text>
          <text>{{ result.commonAncestor.fullName }}<text class="muted">（甲上溯 {{ result.stepsUpFromA }} 代，乙上溯 {{ result.stepsUpFromB }} 代）</text></text>
        </view>
        <view class="kv"><text class="k">关系链</text><text>{{ result.chainText }}</text></view>
        <view class="path">
          <block v-for="(p, i) in result.path" :key="p.id">
            <text class="node" :class="p.gender" @click="goPerson(p.id)">{{ p.fullName }}</text>
            <text v-if="i < result.path.length - 1" class="arrow">{{ stepLabel(i) }}</text>
          </block>
        </view>
        <view v-if="result.note" class="muted" style="margin-top: 12rpx">{{ result.note }}</view>
      </template>
      <view v-else class="empty">谱中未找到两人之间的关系</view>
    </view>

    <view v-if="picking" class="card">
      <view class="card-title">选择{{ picking === 'from' ? '甲' : '乙' }}</view>
      <PersonSearch :clan-id="clanId" auto @select="onSelect" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { KinshipResult, PersonSearchItem } from '@zupu/shared';
import PersonSearch from '../../components/PersonSearch.vue';
import { api, run } from '../../api';

type Picked = { id: string; fullName: string; gender: string; disambiguation: string };
const clanId = ref('');
const from = ref<Picked | null>(null);
const to = ref<Picked | null>(null);
const picking = ref<'from' | 'to' | null>(null);
const result = ref<KinshipResult | null>(null);

async function preload(id: string): Promise<Picked | null> {
  const p = await api.persons.get(id).catch(() => null);
  return p ? { id: p.id, fullName: p.fullName, gender: p.gender, disambiguation: p.disambiguation } : null;
}

onLoad(async (q: any) => {
  clanId.value = q.clanId;
  if (q.from) from.value = await preload(q.from);
  if (q.to) to.value = await preload(q.to);
  if (from.value && to.value) compute();
  else picking.value = from.value ? 'to' : 'from';
});

function onSelect(p: PersonSearchItem) {
  const v = { id: p.id, fullName: p.fullName, gender: p.gender, disambiguation: p.disambiguation };
  if (picking.value === 'from') from.value = v;
  else to.value = v;
  picking.value = !from.value ? 'from' : !to.value ? 'to' : null;
  if (from.value && to.value) compute();
}

function swap() {
  [from.value, to.value] = [to.value, from.value];
  if (from.value && to.value) compute();
}

async function compute() {
  if (!from.value || !to.value) return;
  uni.showLoading({ title: '计算中' });
  result.value = (await run(api.clans.kinship(clanId.value, from.value.id, to.value.id))) ?? null;
  uni.hideLoading();
}

const STEP: Record<string, string> = { parent: '父母 ↑', child: '子女 ↓', spouse: '配偶 ⇄' };
function stepLabel(i: number) {
  const s = result.value!.steps[i];
  return s ? STEP[s.kind] : '→';
}
const goPerson = (id: string) => uni.navigateTo({ url: `/pages/person/detail?id=${id}` });
</script>

<style scoped>
.pick { display: flex; align-items: center; gap: 16rpx; padding: 20rpx; border-radius: 12rpx; background: #f7f2e8; border: 2rpx solid transparent; }
.pick.active { border-color: #8b1e1e; }
.lbl { width: 52rpx; height: 52rpx; line-height: 52rpx; text-align: center; border-radius: 50%; background: #8b1e1e; color: #fff; font-family: 'Songti SC', serif; }
.who { font-size: 32rpx; font-weight: 600; }
.swap { text-align: center; color: #8a6d3b; padding: 12rpx 0; font-size: 24rpx; }
.result { border-top: 6rpx solid #8b1e1e; }
.term { font-size: 30rpx; margin-bottom: 14rpx; line-height: 1.7; }
.big { font-size: 44rpx; color: #8b1e1e; font-weight: 700; margin-left: 6rpx; }
.kv { display: flex; padding: 8rpx 0; line-height: 1.6; }
.k { width: 140rpx; color: #999; flex-shrink: 0; }
.path { display: flex; flex-wrap: wrap; align-items: center; gap: 8rpx; margin-top: 16rpx; padding-top: 16rpx; border-top: 1px dashed #eadfca; }
.node { padding: 6rpx 14rpx; border-radius: 8rpx; background: #f7f2e8; font-size: 26rpx; }
.arrow { color: #bbb; font-size: 20rpx; }
</style>
