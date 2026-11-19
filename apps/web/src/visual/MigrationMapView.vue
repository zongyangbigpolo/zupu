<template>
  <div class="vpage">
    <VisualHeader :clan-id="clanId" :clan-name="clan?.name" title="迁徙地图" current="migrations" />
    <div class="toolbar">
      <span class="muted">支系</span>
      <div style="width: 220px"><PersonPicker :clan-id="clanId" v-model="branchRootId" placeholder="全族（可选支系始祖）" /></div>
      <el-select v-model="branchNames" multiple collapse-tags clearable placeholder="全部房支" style="width: 200px">
        <el-option v-for="b in allBranches" :key="b" :value="b" :label="b">
          <span class="dot" :style="{ background: colorOf(b) }" />{{ b }}
        </el-option>
      </el-select>
      <el-divider direction="vertical" />
      <el-button :type="playing ? 'warning' : 'danger'" :icon="playing ? 'VideoPause' : 'VideoPlay'" @click="togglePlay">{{ playing ? '暂停' : '播放迁徙' }}</el-button>
      <div class="slider" v-if="years.length">
        <el-slider v-model="yearIdx" :min="0" :max="years.length - 1" :format-tooltip="(i: number) => yearLabel(years[i])" :marks="marks" />
      </div>
      <span class="year title-serif" v-if="years.length">{{ yearLabel(years[yearIdx]) }}</span>
      <div class="grow" />
      <el-button v-if="isAdmin" type="danger" :icon="'Plus'" @click="openEdit()">新增迁徙</el-button>
    </div>
    <div class="body">
      <div class="map" v-loading="loading">
        <MapCanvas :markers="markers" :routes="routes" :fit-key="fitKey" @marker-click="onMarker" />
        <div class="legend">
          <div v-for="b in shownBranches" :key="b" class="row" style="gap: 6px"><span class="dot" :style="{ background: colorOf(b) }" />{{ b }}</div>
        </div>
      </div>
      <div class="side">
        <div class="card-title" style="margin-bottom: 8px">迁徙记录 <span class="muted">（{{ filtered.length }} 条）</span></div>
        <el-empty v-if="!filtered.length && !loading" description="暂无迁徙记录" :image-size="60" />
        <el-timeline>
          <el-timeline-item
            v-for="(m, i) in filtered"
            :key="m.id"
            :color="colorOf(m.branchName)"
            :hollow="m.year != null && years.length > 0 && m.year > years[yearIdx]"
            :timestamp="timeText(m)"
            placement="top"
          >
            <div class="rec" :class="{ cur: currentIds.has(m.id) }" @click="jump(i)">
              <div>
                <b>{{ m.from.name }}</b> → <b>{{ m.to.name }}</b>
                <el-tag v-if="m.branchName" size="small" effect="plain" style="margin-left: 4px">{{ m.branchName }}</el-tag>
              </div>
              <div class="muted">
                <router-link v-if="m.personId" :to="`/persons/${m.personId}`" class="link" @click.stop>{{ m.personName }}</router-link>
                <span v-if="m.personGeneration">（第{{ m.personGeneration }}世）</span>
                <span v-if="m.reason">· {{ m.reason }}</span>
                <span v-if="m.from.lng == null || m.to.lng == null" class="warn"> · 缺坐标，未上图</span>
              </div>
              <div v-if="isAdmin" class="ops">
                <el-button link size="small" @click.stop="openEdit(m)">编辑</el-button>
                <el-popconfirm title="删除这条迁徙记录？" @confirm="remove(m)">
                  <template #reference><el-button link size="small" type="danger" @click.stop>删除</el-button></template>
                </el-popconfirm>
              </div>
            </div>
          </el-timeline-item>
        </el-timeline>
      </div>
    </div>

    <el-dialog v-model="editing" :title="form.id ? '编辑迁徙记录' : '新增迁徙记录'" width="720px" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="人物"><PersonPicker :clan-id="clanId" v-model="form.personId" :initial="form.personInitial" placeholder="迁徙者（可空，如远祖）" /></el-form-item>
        <el-form-item label="支系"><el-input v-model="form.branchName" placeholder="如 长房、湘乡支" maxlength="40" /></el-form-item>
        <el-form-item label="迁出地" required><PlaceInput v-model:name="form.fromPlace" v-model:lng="form.fromLng" v-model:lat="form.fromLat" /></el-form-item>
        <el-form-item label="迁入地" required><PlaceInput v-model:name="form.toPlace" v-model:lng="form.toLng" v-model:lat="form.toLat" /></el-form-item>
        <el-form-item label="时间">
          <div class="row" style="width: 100%">
            <el-input-number v-model="form.year" :min="-3000" :max="2200" placeholder="公历年" controls-position="right" style="width: 130px" />
            <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" placeholder="精确日期（可选）" style="width: 160px" />
            <el-select v-model="form.datePrecision" placeholder="精度" clearable style="width: 110px">
              <el-option v-for="(l, k) in DATE_PRECISION_LABELS" :key="k" :value="k" :label="l" />
            </el-select>
            <el-input v-model="form.dateText" placeholder="原文，如 康熙二十三年" style="width: 180px">
              <template #append><el-button @click="autoText">推算</el-button></template>
            </el-input>
          </div>
        </el-form-item>
        <el-form-item label="缘由"><el-input v-model="form.reason" type="textarea" :rows="2" maxlength="2000" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editing = false">取消</el-button>
        <el-button type="danger" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { DATE_PRECISION_LABELS, eraLabel, fuzzyDateText, reignOf, type DatePrecision, type MigrationInput, type MigrationRecord } from '@zupu/shared';
import PersonPicker from '../components/PersonPicker.vue';
import { run } from '../api';
import { visualApi } from './api';
import MapCanvas from './MapCanvas.vue';
import PlaceInput from './PlaceInput.vue';
import VisualHeader from './VisualHeader.vue';
import { PALETTE, useClan } from './useClan';
import type { MapMarker, MapRoute } from './map-types';

const route = useRoute();
const clanId = route.params.clanId as string;
const { clan, isAdmin, load: loadClan } = useClan(clanId);
const list = ref<MigrationRecord[]>([]);
const loading = ref(false);
const branchRootId = ref<string | null>((route.query.branch as string) || null);
const branchNames = ref<string[]>([]);
const fitKey = ref(0);

const allBranches = computed(() => [...new Set(list.value.map((m) => m.branchName ?? '未分支'))]);
const colorOf = (b: string | null) => PALETTE[Math.max(0, allBranches.value.indexOf(b ?? '未分支')) % PALETTE.length];
const filtered = computed(() => list.value.filter((m) => !branchNames.value.length || branchNames.value.includes(m.branchName ?? '未分支')));
const shownBranches = computed(() => [...new Set(filtered.value.map((m) => m.branchName ?? '未分支'))]);
const years = computed(() => [...new Set(filtered.value.map((m) => m.year).filter((y): y is number => y != null))].sort((a, b) => a - b));
const yearIdx = ref(0);
const marks = computed(() => {
  const ys = years.value;
  if (ys.length < 2) return {};
  return { 0: yearShort(ys[0]), [ys.length - 1]: yearShort(ys[ys.length - 1]) };
});
const yearShort = (y: number) => (y < 0 ? `前${-y}` : String(y));
const yearLabel = (y: number | undefined) => (y == null ? '' : eraLabel(y));
const timeText = (m: MigrationRecord) => `${fuzzyDateText(m)}${m.year != null && m.dateText && !m.dateText.includes(String(Math.abs(m.year))) ? `（${yearShort(m.year)}）` : ''}`;

const visible = computed(() => {
  const cur = years.value[yearIdx.value];
  return filtered.value.filter((m) => m.year == null || cur == null || m.year <= cur);
});
const currentIds = computed(() => new Set(filtered.value.filter((m) => m.year === years.value[yearIdx.value]).map((m) => m.id)));
const hasCoords = (m: MigrationRecord) => m.from.lng != null && m.from.lat != null && m.to.lng != null && m.to.lat != null;
const routes = computed<MapRoute[]>(() =>
  visible.value.filter(hasCoords).map((m) => ({
    id: m.id,
    from: [m.from.lng!, m.from.lat!],
    to: [m.to.lng!, m.to.lat!],
    color: colorOf(m.branchName),
    highlight: currentIds.value.has(m.id),
    label: `${fuzzyDateText(m)}　${m.personName ?? m.branchName ?? ''}：${m.from.name} → ${m.to.name}`,
  })),
);
const markers = computed<MapMarker[]>(() => {
  const map = new Map<string, MapMarker>();
  for (const m of visible.value.filter(hasCoords)) {
    for (const p of [m.from, m.to]) {
      const k = `${p.lng},${p.lat}`;
      if (!map.has(k)) map.set(k, { id: m.id, name: p.name, lng: p.lng!, lat: p.lat!, color: colorOf(m.branchName), size: 8 });
    }
  }
  return [...map.values()];
});

let timer: ReturnType<typeof setInterval> | null = null;
const playing = ref(false);
function togglePlay() {
  if (playing.value) return stop();
  if (yearIdx.value >= years.value.length - 1) yearIdx.value = 0;
  playing.value = true;
  timer = setInterval(() => {
    if (yearIdx.value >= years.value.length - 1) return stop();
    yearIdx.value++;
  }, 1800);
}
function stop() {
  playing.value = false;
  if (timer) clearInterval(timer);
  timer = null;
}
onBeforeUnmount(stop);
function jump(i: number) {
  const y = filtered.value[i].year;
  if (y != null) yearIdx.value = years.value.indexOf(y);
}
function onMarker(id: string) {
  const i = filtered.value.findIndex((m) => m.id === id);
  if (i >= 0) jump(i);
}

async function load() {
  loading.value = true;
  list.value = (await run(visualApi.migrations.list(clanId, branchRootId.value ? { branchRootId: branchRootId.value } : {}))) ?? [];
  loading.value = false;
  yearIdx.value = Math.max(0, years.value.length - 1);
  fitKey.value++;
}
watch(branchRootId, load);
watch(branchNames, () => {
  yearIdx.value = Math.max(0, years.value.length - 1);
  fitKey.value++;
});

// ---------- 录入 ----------
const editing = ref(false);
const saving = ref(false);
const empty = () => ({
  id: '' as string,
  personId: null as string | null,
  personInitial: null as { id: string; fullName: string } | null,
  branchName: '',
  fromPlace: '',
  fromLng: null as number | null,
  fromLat: null as number | null,
  toPlace: '',
  toLng: null as number | null,
  toLat: null as number | null,
  year: undefined as number | undefined,
  date: null as string | null,
  datePrecision: null as DatePrecision | null,
  dateText: '',
  reason: '',
});
const form = reactive(empty());
function openEdit(m?: MigrationRecord) {
  Object.assign(form, empty());
  if (m)
    Object.assign(form, {
      id: m.id,
      personId: m.personId,
      personInitial: m.personId ? { id: m.personId, fullName: m.personName ?? '' } : null,
      branchName: m.branchName ?? '',
      fromPlace: m.from.name,
      fromLng: m.from.lng,
      fromLat: m.from.lat,
      toPlace: m.to.name,
      toLng: m.to.lng,
      toLat: m.to.lat,
      year: m.year ?? undefined,
      date: m.date,
      datePrecision: m.datePrecision,
      dateText: m.dateText ?? '',
      reason: m.reason ?? '',
    });
  editing.value = true;
}
function autoText() {
  const y = form.year ?? (form.date ? Number(form.date.slice(0, 4)) : undefined);
  if (y == null) return ElMessage.warning('请先填写年份');
  form.dateText = reignOf(y) ?? (y < 0 ? `公元前${-y}年` : `${y}年`);
}
async function save() {
  if (!form.fromPlace.trim() || !form.toPlace.trim()) return ElMessage.warning('请填写迁出地与迁入地');
  const data: MigrationInput = {
    personId: form.personId,
    branchName: form.branchName || null,
    fromPlace: form.fromPlace.trim(),
    fromLng: form.fromLng,
    fromLat: form.fromLat,
    toPlace: form.toPlace.trim(),
    toLng: form.toLng,
    toLat: form.toLat,
    year: form.year ?? null,
    date: form.date || null,
    datePrecision: form.datePrecision,
    dateText: form.dateText || null,
    reason: form.reason || null,
  };
  saving.value = true;
  const r = await run(form.id ? visualApi.migrations.update(form.id, data) : visualApi.migrations.create(clanId, data), '已保存');
  saving.value = false;
  if (r) {
    editing.value = false;
    load();
  }
}
async function remove(m: MigrationRecord) {
  if ((await run(visualApi.migrations.remove(m.id), '已删除')) !== undefined) load();
}

onMounted(async () => {
  await loadClan();
  if (clan.value) load();
});
</script>

<style scoped>
.vpage { display: flex; flex-direction: column; height: calc(100vh - 54px); }
.toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 16px; background: #fffaf0; border-bottom: 1px solid #eee2cc; }
.slider { width: 260px; padding: 0 10px; }
.year { color: var(--zp-red); font-size: 15px; min-width: 200px; }
.body { flex: 1; display: flex; min-height: 0; }
.map { flex: 1; position: relative; }
.side { width: 360px; overflow: auto; padding: 12px 14px; background: #fff; border-left: 1px solid #eee2cc; }
.legend { position: absolute; right: 10px; top: 10px; background: rgba(255, 255, 255, 0.9); padding: 6px 10px; border-radius: 4px; font-size: 12px; z-index: 5; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.rec { cursor: pointer; padding: 4px 6px; border-radius: 4px; }
.rec.cur { background: #fff1e0; }
.rec:hover { background: #faf3e6; }
.link { color: #2f6fd6; }
.warn { color: #c0392b; }
.ops { margin-top: 2px; }
</style>
