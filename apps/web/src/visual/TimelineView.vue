<template>
  <div class="vpage">
    <VisualHeader :clan-id="clanId" :clan-name="clan?.name" title="家族时间轴" current="timeline" />
    <div class="toolbar">
      <el-radio-group v-model="scopeMode" size="small">
        <el-radio-button value="all">全族</el-radio-button>
        <el-radio-button value="branch">按支系</el-radio-button>
        <el-radio-button value="person">按人物</el-radio-button>
      </el-radio-group>
      <div v-if="scopeMode !== 'all'" style="width: 220px">
        <PersonPicker :clan-id="clanId" v-model="scopePerson" :placeholder="scopeMode === 'branch' ? '选择支系始祖' : '选择人物'" />
      </div>
      <el-checkbox v-model="showHistory">历史大事</el-checkbox>
      <el-checkbox v-if="scopeMode === 'all'" v-model="lifeSpans">全族生卒</el-checkbox>
      <div class="grow" />
      <el-button v-if="isAdmin" type="danger" :icon="'Plus'" @click="openEdit()">新增大事记</el-button>
    </div>
    <div class="chart" ref="chartEl" v-loading="loading" />
    <div class="list" ref="listEl">
      <el-empty v-if="!rows.length && !loading" description="暂无时间轴数据" :image-size="60" />
      <template v-for="(g, gi) in groups" :key="gi">
        <div class="dyn" :style="{ borderColor: g.color, color: g.color }">
          <span class="title-serif">{{ g.name }}</span>
          <small class="muted">{{ g.range }}</small>
        </div>
        <div v-for="r in g.rows" :key="r.key" :id="r.key" class="item" :class="[r.kind, { hl: highlight === r.key }]">
          <div class="when">
            <div class="y">{{ yearText(r.year) }}</div>
            <div class="muted era">{{ reignOf(r.year) || ganzhiOf(r.year) + '年' }}</div>
          </div>
          <div class="what">
            <el-tag size="small" :color="KIND_COLORS[r.kind]" effect="dark" style="border: none">{{ r.kindLabel }}</el-tag>
            <b class="t">{{ r.title }}</b>
            <span v-if="r.dateText" class="muted">（{{ r.dateText }}）</span>
            <router-link v-if="r.personId && r.personName && !r.title.includes(r.personName)" :to="`/persons/${r.personId}`" class="plink">{{ r.personName }}</router-link>
            <span v-if="r.place" class="muted"> · {{ r.place }}</span>
            <div v-if="r.description" class="desc">{{ r.description }}</div>
          </div>
          <div v-if="isAdmin && r.kind === 'chronicle'" class="ops">
            <el-button link size="small" @click="openEdit(r.id)">编辑</el-button>
            <el-popconfirm title="删除这条大事记？" @confirm="remove(r.id)">
              <template #reference><el-button link size="small" type="danger">删除</el-button></template>
            </el-popconfirm>
          </div>
        </div>
      </template>
      <el-alert v-if="truncated" type="warning" :closable="false" title="条目过多，仅显示部分" />
    </div>

    <el-dialog v-model="editing" :title="form.id ? '编辑大事记' : '新增大事记'" width="640px" destroy-on-close>
      <el-form label-width="70px">
        <el-form-item label="标题" required><el-input v-model="form.title" maxlength="100" placeholder="如 三修族谱" /></el-form-item>
        <el-form-item label="时间">
          <div class="row">
            <el-input-number v-model="form.year" :min="-3000" :max="2200" placeholder="公历年" controls-position="right" style="width: 130px" />
            <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" placeholder="精确日期" style="width: 150px" />
            <el-input v-model="form.dateText" placeholder="原文，如 乾隆五十五年" style="width: 200px">
              <template #append><el-button @click="autoText">推算</el-button></template>
            </el-input>
          </div>
        </el-form-item>
        <el-form-item label="地点"><el-input v-model="form.place" maxlength="100" /></el-form-item>
        <el-form-item label="人物"><PersonPicker :clan-id="clanId" v-model="form.personId" :initial="form.personInitial" placeholder="可空（全族大事）" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" type="textarea" :rows="3" maxlength="5000" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editing = false">取消</el-button>
        <el-button type="danger" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  DYNASTIES,
  dynastyOf,
  eraLabel,
  ganzhiOf,
  HISTORICAL_EVENTS,
  reignOf,
  TIMELINE_KIND_LABELS,
  type TimelineItem,
  type TimelineKind,
} from '@zupu/shared';
import PersonPicker from '../components/PersonPicker.vue';
import { run } from '../api';
import { visualApi } from './api';
import { echarts } from './echarts';
import VisualHeader from './VisualHeader.vue';
import { useClan } from './useClan';

type RowKind = TimelineKind | 'history';
interface Row {
  key: string;
  id: string;
  kind: RowKind;
  kindLabel: string;
  year: number;
  title: string;
  dateText: string | null;
  description: string | null;
  place: string | null;
  personId: string | null;
  personName: string | null;
}

const KIND_COLORS: Record<RowKind, string> = {
  history: '#7f8c8d',
  chronicle: '#8b1e1e',
  migration: '#d68910',
  event: '#2e86ab',
  birth: '#1e8449',
  death: '#5d6d7e',
};
const LANES: RowKind[] = ['history', 'chronicle', 'migration', 'event', 'birth', 'death'];
const LANE_LABELS = ['历史大事', '家族大事', '迁徙', '人物事迹', '出生', '逝世'];

const route = useRoute();
const clanId = route.params.clanId as string;
const { clan, isAdmin, load: loadClan } = useClan(clanId);
const items = ref<TimelineItem[]>([]);
const truncated = ref(false);
const loading = ref(false);
const scopeMode = ref<'all' | 'branch' | 'person'>(route.query.person ? 'person' : 'all');
const scopePerson = ref<string | null>((route.query.person as string) || null);
const showHistory = ref(true);
const lifeSpans = ref(false);
const highlight = ref<string | null>(null);
const chartEl = ref<HTMLDivElement>();
const listEl = ref<HTMLDivElement>();
let chart: echarts.ECharts | null = null;

const yearText = (y: number) => (y < 0 ? `前${-y}` : String(y));

const familyRange = computed(() => {
  const ys = items.value.map((i) => i.year);
  if (!ys.length) return [1600, new Date().getFullYear()];
  return [Math.min(...ys), Math.max(...ys)];
});

const rows = computed<Row[]>(() => {
  const fam: Row[] = items.value.map((i, n) => ({
    key: `r${n}`,
    id: i.id,
    kind: i.kind,
    kindLabel: i.kind === 'event' && i.type ? `事迹·${i.type}` : TIMELINE_KIND_LABELS[i.kind],
    year: i.year,
    title: i.title,
    dateText: i.dateText,
    description: i.description,
    place: i.place,
    personId: i.personId,
    personName: i.personName,
  }));
  if (!showHistory.value) return fam;
  // 历史大事只取家族年代前后，避免列表过长
  const [a, b] = familyRange.value;
  const hist: Row[] = HISTORICAL_EVENTS.filter((h) => h.year >= a - 100 && h.year <= b + 10).map((h, n) => ({
    key: `h${n}`,
    id: `h${n}`,
    kind: 'history',
    kindLabel: '历史大事',
    year: h.year,
    title: h.title,
    dateText: null,
    description: null,
    place: null,
    personId: null,
    personName: null,
  }));
  return [...fam, ...hist].sort((x, y) => x.year - y.year || (x.kind === 'history' ? -1 : y.kind === 'history' ? 1 : 0));
});

const groups = computed(() => {
  const out: { name: string; color: string; range: string; rows: Row[] }[] = [];
  for (const r of rows.value) {
    const d = dynastyOf(r.year);
    const name = d?.name ?? '其他';
    let g = out[out.length - 1];
    if (!g || g.name !== name) {
      g = { name, color: d?.color ?? '#888', range: d ? `${yearText(d.start)} – ${d.end == null ? '今' : yearText(d.end)}` : '', rows: [] };
      out.push(g);
    }
    g.rows.push(r);
  }
  return out;
});

function renderChart() {
  if (!chartEl.value) return;
  chart ??= echarts.init(chartEl.value);
  const [a, b] = familyRange.value;
  const pad = Math.max(20, Math.round((b - a) * 0.08));
  const lanes = showHistory.value ? LANES : LANES.slice(1);
  const laneNames = ['朝代', ...lanes.map((k) => LANE_LABELS[LANES.indexOf(k)])];
  const byLane = (k: RowKind) => rows.value.filter((r) => r.kind === k).map((r) => ({ value: [r.year, laneNames.indexOf(LANE_LABELS[LANES.indexOf(k)])], key: r.key, title: r.title }));
  chart.setOption(
    {
      grid: { left: 80, right: 30, top: 10, bottom: 50 },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => (p.seriesName === '朝代' ? `${p.data.name}<br/>${yearText(p.data.value[1])} – ${p.data.value[2] == null ? '今' : yearText(p.data.value[2])}` : `${p.data.title}<br/><span style="color:#888">${eraLabel(p.data.value[0])}</span>`),
      },
      xAxis: { type: 'value', min: -2100, max: new Date().getFullYear() + 10, axisLabel: { formatter: (v: number) => yearText(Math.round(v)) }, splitLine: { lineStyle: { color: '#f0e6d2' } } },
      yAxis: { type: 'category', data: laneNames, inverse: true, axisTick: { show: false }, axisLine: { show: false } },
      dataZoom: [
        { type: 'slider', xAxisIndex: 0, filterMode: 'weakFilter', startValue: a - pad, endValue: Math.min(b + pad, new Date().getFullYear() + 10), height: 18, bottom: 12, labelFormatter: (v: number) => yearText(Math.round(v)) },
        { type: 'inside', xAxisIndex: 0, filterMode: 'weakFilter' },
      ],
      series: [
        {
          name: '朝代',
          type: 'custom',
          renderItem: (params: any, api: any) => {
            const s = api.coord([api.value(1), 0]);
            const e = api.coord([api.value(2) ?? new Date().getFullYear(), 0]);
            const h = api.size([0, 1])[1] * 0.7;
            const rect = echarts.graphic.clipRectByRect({ x: s[0], y: s[1] - h / 2, width: Math.max(1, e[0] - s[0]), height: h }, {
              x: params.coordSys.x,
              y: params.coordSys.y,
              width: params.coordSys.width,
              height: params.coordSys.height,
            });
            if (!rect) return;
            return {
              type: 'group',
              children: [
                { type: 'rect', shape: rect, style: { fill: api.visual('color'), opacity: 0.85 } },
                {
                  type: 'text',
                  style: { text: rect.width > 26 ? DYNASTIES[params.dataIndex].name : '', x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, fill: '#fff', align: 'center', verticalAlign: 'middle', font: '12px serif' },
                },
              ],
            };
          },
          encode: { x: [1, 2], y: 0 },
          data: DYNASTIES.map((d) => ({ name: d.name, value: [0, d.start, d.end], itemStyle: { color: d.color } })),
        },
        ...lanes.map((k) => ({
          name: LANE_LABELS[LANES.indexOf(k)],
          type: 'scatter',
          symbol: k === 'history' ? 'diamond' : k === 'migration' ? 'triangle' : 'circle',
          symbolSize: k === 'chronicle' ? 13 : 10,
          itemStyle: { color: KIND_COLORS[k], opacity: 0.85 },
          data: byLane(k),
        })),
      ],
    },
    { notMerge: true },
  );
  chart.off('click');
  chart.on('click', (p: any) => {
    if (!p.data?.key) return;
    highlight.value = p.data.key;
    nextTick(() => document.getElementById(p.data.key)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  });
}

async function load() {
  loading.value = true;
  const params: Record<string, unknown> = {};
  if (scopeMode.value === 'branch' && scopePerson.value) params.branchRootId = scopePerson.value;
  if (scopeMode.value === 'person' && scopePerson.value) params.personId = scopePerson.value;
  if (scopeMode.value === 'all' && lifeSpans.value) params.lifeSpans = true;
  const r = await run(visualApi.timeline(clanId, params));
  loading.value = false;
  items.value = r?.items ?? [];
  truncated.value = r?.truncated ?? false;
  await nextTick();
  renderChart();
}
watch([scopePerson, lifeSpans], load);
watch(scopeMode, (m) => {
  if (m === 'all') scopePerson.value = null;
  else if (scopePerson.value) load();
});
watch(showHistory, () => nextTick(renderChart));

const onResize = () => chart?.resize();
onMounted(async () => {
  window.addEventListener('resize', onResize);
  await loadClan();
  if (clan.value) load();
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  chart?.dispose();
});

// ---------- 大事记录入 ----------
const editing = ref(false);
const saving = ref(false);
const empty = () => ({
  id: '',
  title: '',
  year: undefined as number | undefined,
  date: null as string | null,
  dateText: '',
  place: '',
  description: '',
  personId: null as string | null,
  personInitial: null as { id: string; fullName: string } | null,
});
const form = reactive(empty());
async function openEdit(id?: string) {
  Object.assign(form, empty());
  if (id) {
    const c = (await run(visualApi.chronicles.list(clanId)))?.find((x) => x.id === id);
    if (!c) return;
    Object.assign(form, {
      id: c.id,
      title: c.title,
      year: c.year ?? undefined,
      date: c.date,
      dateText: c.dateText ?? '',
      place: c.place ?? '',
      description: c.description ?? '',
      personId: c.personId,
      personInitial: c.personId ? { id: c.personId, fullName: c.personName ?? '' } : null,
    });
  }
  editing.value = true;
}
function autoText() {
  const y = form.year ?? (form.date ? Number(form.date.slice(0, 4)) : undefined);
  if (y == null) return ElMessage.warning('请先填写年份');
  form.dateText = reignOf(y) ?? (y < 0 ? `公元前${-y}年` : `${y}年`);
}
async function save() {
  if (!form.title.trim()) return ElMessage.warning('请填写标题');
  if (form.year == null && !form.date) return ElMessage.warning('请填写年份或日期');
  const data = {
    title: form.title.trim(),
    year: form.year ?? null,
    date: form.date || null,
    datePrecision: form.date ? ('day' as const) : ('year' as const),
    dateText: form.dateText || null,
    place: form.place || null,
    description: form.description || null,
    personId: form.personId,
  };
  saving.value = true;
  const r = await run(form.id ? visualApi.chronicles.update(form.id, data) : visualApi.chronicles.create(clanId, data), '已保存');
  saving.value = false;
  if (r) {
    editing.value = false;
    load();
  }
}
async function remove(id: string) {
  if ((await run(visualApi.chronicles.remove(id), '已删除')) !== undefined) load();
}
</script>

<style scoped>
.vpage { display: flex; flex-direction: column; height: calc(100vh - 54px); }
.toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 8px 16px; background: #fffaf0; border-bottom: 1px solid #eee2cc; }
.chart { height: 270px; background: #fff; border-bottom: 1px solid #eee2cc; }
.list { flex: 1; overflow: auto; padding: 8px 20px 30px; max-width: 1100px; width: 100%; margin: 0 auto; box-sizing: border-box; }
.dyn { border-left: 4px solid; padding: 4px 10px; margin: 16px 0 6px; font-size: 17px; display: flex; gap: 10px; align-items: baseline; background: #fff; }
.item { display: flex; gap: 14px; padding: 7px 10px; border-bottom: 1px dashed #eadfca; align-items: flex-start; }
.item.history { color: #666; background: #f7f7f5; }
.item.hl { background: #fff1e0; }
.when { width: 120px; flex-shrink: 0; text-align: right; }
.y { font-weight: 600; font-size: 15px; }
.era { font-size: 12px; }
.what { flex: 1; line-height: 1.8; }
.t { margin: 0 6px; }
.plink { color: #2f6fd6; margin-left: 4px; }
.desc { color: #666; font-size: 13px; }
.ops { flex-shrink: 0; }
</style>
