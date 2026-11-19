<template>
  <div class="vpage">
    <VisualHeader :clan-id="clanId" :clan-name="clan?.name" title="传统吊线谱" current="pedigree" />
    <div class="toolbar">
      <span class="muted">起始人物</span>
      <div style="width: 200px"><PersonPicker :clan-id="clanId" v-model="rootId" :initial="rootInitial" placeholder="默认始祖" /></div>
      <span class="muted">世代数</span>
      <el-input-number v-model="generations" :min="1" :max="20" size="small" style="width: 100px" />
      <el-radio-group v-model="style" size="small">
        <el-radio-button value="ou">欧式</el-radio-button>
        <el-radio-button value="su">苏式</el-radio-button>
      </el-radio-group>
      <el-checkbox v-model="daughters">收录女儿</el-checkbox>
      <span class="muted">缩放</span>
      <el-slider v-model="zoom" :min="0.4" :max="1.6" :step="0.1" style="width: 120px" />
      <div class="grow" />
      <el-select v-model="paper" size="small" style="width: 90px">
        <el-option value="A4" label="A4 横" />
        <el-option value="A3" label="A3 横" />
      </el-select>
      <el-checkbox v-model="cover">封面与卷首</el-checkbox>
      <el-button type="danger" :icon="'Download'" :loading="exporting" @click="exportPdf">导出 PDF 谱书</el-button>
    </div>
    <div class="hint muted">
      {{ style === 'ou' ? '欧式：世代分栏，五世一表，名旁小注字号、生卒、葬地、配偶；' : '苏式：不分栏，以吊线垂珠相连，名旁注配偶；' }}古籍竖排，自右向左阅读，长者居右。点击人名查看档案。
    </div>
    <div class="canvas" ref="canvasEl" v-loading="loading">
      <el-empty v-if="!loading && !charts.length" description="请选择起始人物" />
      <div v-for="(c, i) in charts" :key="i" class="chart-block">
        <div class="chart-title title-serif">{{ charts.length > 1 ? `第${cnNumber(i + 1)}表　` : '' }}{{ c.title }}</div>
        <div class="scroller">
          <PedigreeSvg :chart="c" :zoom="zoom" :root-id="data?.rootId" @person="(id) => router.push(`/persons/${id}`)" />
        </div>
      </div>
      <el-alert v-if="data?.truncated" type="warning" :closable="false" title="人数过多，仅显示部分" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { cnNumber, layoutPedigree, type PedigreeResponse, type PedigreeStyle } from '@zupu/shared';
import PersonPicker from '../components/PersonPicker.vue';
import { api, run } from '../api';
import { downloadPedigreePdf, visualApi } from './api';
import PedigreeSvg from './PedigreeSvg.vue';
import VisualHeader from './VisualHeader.vue';
import { useClan } from './useClan';

const route = useRoute();
const router = useRouter();
const clanId = route.params.clanId as string;
const { clan, load: loadClan } = useClan(clanId);
const rootId = ref<string | null>((route.query.root as string) || null);
const rootInitial = ref<{ id: string; fullName: string } | null>(null);
const generations = ref(Number(route.query.gens) || 5);
const style = ref<PedigreeStyle>(route.query.style === 'su' ? 'su' : 'ou');
const daughters = ref(true);
const zoom = ref(1);
const paper = ref<'A4' | 'A3'>('A4');
const cover = ref(true);
const data = ref<PedigreeResponse | null>(null);
const loading = ref(false);
const exporting = ref(false);
const canvasEl = ref<HTMLElement>();

const charts = computed(() => (data.value ? layoutPedigree(data.value, { style: style.value }) : []));

async function load() {
  if (!rootId.value) return;
  loading.value = true;
  data.value = (await run(visualApi.pedigree(clanId, { rootId: rootId.value, generations: generations.value, daughters: daughters.value }))) ?? null;
  loading.value = false;
  scrollRight();
}
async function scrollRight() {
  await nextTick();
  // 竖排自右向左：初始滚动到最右侧
  canvasEl.value?.querySelectorAll<HTMLElement>('.scroller').forEach((s) => (s.scrollLeft = s.scrollWidth));
}
watch([rootId, generations, daughters], load);
watch([style, zoom], scrollRight);

async function exportPdf() {
  if (!rootId.value) return ElMessage.warning('请先选择起始人物');
  exporting.value = true;
  try {
    const name = `${clan.value?.name ?? '族谱'}-${style.value === 'ou' ? '欧式' : '苏式'}吊线谱.pdf`;
    await downloadPedigreePdf(clanId, { rootId: rootId.value, generations: generations.value, style: style.value, daughters: daughters.value, paper: paper.value, cover: cover.value }, name);
    ElMessage.success('已生成 PDF');
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    exporting.value = false;
  }
}

onMounted(async () => {
  await loadClan();
  if (!clan.value) return;
  if (!rootId.value && clan.value.founderId) rootId.value = clan.value.founderId;
  if (rootId.value) {
    const p = await run(api.persons.get(rootId.value));
    if (p) rootInitial.value = { id: p.id, fullName: p.fullName };
  }
});
</script>

<style scoped>
.vpage { display: flex; flex-direction: column; height: calc(100vh - 54px); }
.toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 16px; background: #fffaf0; border-bottom: 1px solid #eee2cc; }
.hint { padding: 4px 16px; background: #fffdf7; }
.canvas { flex: 1; overflow: auto; padding: 10px 16px 30px; }
.chart-block { margin-bottom: 18px; }
.chart-title { color: var(--zp-red); font-size: 16px; text-align: right; margin: 4px 4px 6px; }
.scroller { overflow-x: auto; direction: rtl; border: 1px solid #eadfca; background: #fbf6ea; }
</style>
