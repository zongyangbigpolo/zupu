<template>
  <div class="page" v-if="clan">
    <el-page-header @back="router.push(`/clans/${clanId}`)" :title="clan.name">
      <template #content><span class="title-serif" style="font-size: 20px">统计看板</span></template>
    </el-page-header>

    <div v-if="d" class="kpis">
      <div class="kpi"><b>{{ d.total }}</b><span>入谱总人数</span></div>
      <div class="kpi"><b>{{ d.maxGeneration ?? '—' }}</b><span>传世（世）</span></div>
      <div class="kpi"><b>{{ d.living }}</b><span>在世</span></div>
      <div class="kpi"><b>{{ d.deceased }}</b><span>已故</span></div>
      <div class="kpi"><b>{{ ratio }}</b><span>男女比（女=100）</span></div>
      <div class="kpi"><b>{{ d.avgLifespan ?? '—' }}</b><span>平均寿命（岁）<small v-if="d.lifespanSamples">· {{ d.lifespanSamples }} 人样本</small></span></div>
      <div class="kpi"><b>{{ d.mediaCounts.photo + d.mediaCounts.video + d.mediaCounts.audio }}</b><span>照片 / 影音</span></div>
      <div class="kpi"><b>{{ d.oralHistoryCount }}</b><span>口述历史</span></div>
    </div>

    <el-row v-if="d" :gutter="16">
      <el-col :md="16" :xs="24">
        <el-card shadow="never" class="mb">
          <template #header><span class="card-title">各世人数</span><span class="muted">（本族成员，按性别）</span></template>
          <EChart :option="genOption" height="340px" />
        </el-card>
      </el-col>
      <el-col :md="8" :xs="24">
        <el-card shadow="never" class="mb">
          <template #header><span class="card-title">男女比例</span></template>
          <EChart :option="genderOption" height="170px" />
          <EChart :option="livingOption" height="170px" />
        </el-card>
      </el-col>
      <el-col :md="12" :xs="24">
        <el-card shadow="never" class="mb">
          <template #header><span class="card-title">地域分布</span><span class="muted">（出生地，缺失时取祖籍）</span></template>
          <EChart :option="regionOption" height="320px" />
        </el-card>
      </el-col>
      <el-col :md="12" :xs="24">
        <el-card shadow="never" class="mb">
          <template #header><span class="card-title">寿命分布与各世平均寿命</span></template>
          <EChart :option="lifeOption" height="320px" />
        </el-card>
      </el-col>
      <el-col :span="24">
        <el-card shadow="never" class="mb">
          <template #header><span class="card-title">出生年代分布</span></template>
          <EChart :option="periodOption" height="240px" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ClanDashboard, ClanWithRole } from '@zupu/shared';
import { api, run } from '../../api';
import { heritage } from '../api';
import type { EChartsOption } from 'echarts';
import EChart from '../components/EChart.vue';

const RED = '#8b1e1e';
const GOLD = '#c9a45c';
const BLUE = '#2f6fd6';
const PINK = '#d14d72';
const route = useRoute();
const router = useRouter();
const clanId = route.params.clanId as string;
const clan = ref<ClanWithRole | null>(null);
const d = ref<ClanDashboard | null>(null);

const ratio = computed(() => (d.value && d.value.female ? Math.round((d.value.male / d.value.female) * 100) : '—'));
const genOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  legend: { top: 0, data: ['男', '女', '在世'] },
  grid: { left: 40, right: 20, bottom: 30, top: 40 },
  xAxis: { type: 'category', data: d.value!.perGeneration.map((g) => `${g.generation}世`) },
  yAxis: { type: 'value', name: '人' },
  series: [
    { name: '男', type: 'bar', stack: 'g', data: d.value!.perGeneration.map((g) => g.male), itemStyle: { color: BLUE } },
    { name: '女', type: 'bar', stack: 'g', data: d.value!.perGeneration.map((g) => g.female), itemStyle: { color: PINK } },
    { name: '在世', type: 'line', smooth: true, data: d.value!.perGeneration.map((g) => g.living), itemStyle: { color: GOLD } },
  ],
}));
const pie = (data: { name: string; value: number; itemStyle: { color: string } }[]): EChartsOption => ({
  tooltip: { trigger: 'item', formatter: '{b}：{c} 人（{d}%）' },
  series: [{ type: 'pie', radius: ['38%', '62%'], label: { formatter: '{b}\n{d}%' }, data }],
});
const genderOption = computed<EChartsOption>(() =>
  pie([
    { name: '男', value: d.value!.male, itemStyle: { color: BLUE } },
    { name: '女', value: d.value!.female, itemStyle: { color: PINK } },
    ...(d.value!.unknownGender ? [{ name: '未知', value: d.value!.unknownGender, itemStyle: { color: '#bbb' } }] : []),
  ]),
);
const livingOption = computed<EChartsOption>(() =>
  pie([
    { name: '在世', value: d.value!.living, itemStyle: { color: GOLD } },
    { name: '已故', value: d.value!.deceased, itemStyle: { color: '#777' } },
  ]),
);
const regionOption = computed<EChartsOption>(() => {
  const top = d.value!.regions.slice(0, 12).reverse();
  return {
    tooltip: {},
    grid: { left: 90, right: 30, top: 10, bottom: 20 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: top.map((r) => r.name) },
    series: [{ type: 'bar', data: top.map((r) => r.count), itemStyle: { color: RED }, label: { show: true, position: 'right' } }],
  };
});
const lifeOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  legend: { top: 0, data: ['人数', '各世平均寿命'] },
  grid: { left: 40, right: 50, bottom: 30, top: 40 },
  xAxis: [
    { type: 'category', data: d.value!.lifespanBuckets.map((b) => b.name + '岁') },
    { type: 'category', data: d.value!.perGeneration.map((g) => `${g.generation}世`), show: false },
  ],
  yAxis: [{ type: 'value', name: '人' }, { type: 'value', name: '岁', min: 0 }],
  series: [
    { name: '人数', type: 'bar', data: d.value!.lifespanBuckets.map((b) => b.count), itemStyle: { color: GOLD } },
    { name: '各世平均寿命', type: 'line', xAxisIndex: 1, yAxisIndex: 1, smooth: true, data: d.value!.perGeneration.map((g) => g.avgLifespan), itemStyle: { color: RED } },
  ],
}));
const periodOption = computed<EChartsOption>(() => ({
  tooltip: {},
  grid: { left: 40, right: 20, bottom: 30, top: 20 },
  xAxis: { type: 'category', data: d.value!.birthPeriods.map((p) => p.name) },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: d.value!.birthPeriods.map((p) => p.count), itemStyle: { color: '#6e4b2a' }, barMaxWidth: 40 }],
}));

onMounted(async () => {
  clan.value = (await run(api.clans.get(clanId))) ?? null;
  d.value = (await run(heritage.stats.dashboard(clanId))) ?? null;
});
</script>

<style scoped>
.mb { margin-bottom: 16px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; margin: 16px 0; }
.kpi { background: linear-gradient(180deg, #fff, #fff8ea); border: 1px solid #efe1c2; border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 4px; }
.kpi b { font-size: 26px; color: var(--zp-red); font-family: 'Songti SC', serif; }
.kpi span { color: #777; font-size: 13px; }
.kpi small { color: #aaa; }
</style>
