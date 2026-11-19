<template>
  <div class="page" v-if="clan">
    <el-page-header @back="router.push(`/clans/${clanId}`)" :title="clan.name">
      <template #content><span class="title-serif" style="font-size: 20px">高级搜索</span></template>
    </el-page-header>

    <el-card shadow="never" style="margin-top: 16px">
      <el-form :model="f" label-width="80px" class="form" @submit.prevent="search(1)">
        <el-form-item label="姓名"><el-input v-model="f.q" placeholder="姓名 / 字 / 号 / 小名" clearable /></el-form-item>
        <el-form-item label="字辈"><el-input v-model="f.generationChar" maxlength="4" clearable style="width: 100px" /></el-form-item>
        <el-form-item label="世代">
          <el-input-number v-model="f.generationFrom" :min="1" controls-position="right" placeholder="从" style="width: 100px" />
          <span class="sep">—</span>
          <el-input-number v-model="f.generationTo" :min="1" controls-position="right" placeholder="至" style="width: 100px" />
        </el-form-item>
        <el-form-item label="性别">
          <el-radio-group v-model="f.gender">
            <el-radio-button value="">不限</el-radio-button>
            <el-radio-button value="male">男</el-radio-button>
            <el-radio-button value="female">女</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="在世">
          <el-radio-group v-model="f.living">
            <el-radio-button value="">不限</el-radio-button>
            <el-radio-button value="living">在世</el-radio-button>
            <el-radio-button value="deceased">已故</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="地区"><el-input v-model="f.region" placeholder="祖籍 / 出生地 / 葬地，如：湘潭" clearable /></el-form-item>
        <el-form-item label="出生年">
          <el-input-number v-model="f.birthYearFrom" :min="1" :max="3000" controls-position="right" placeholder="从" style="width: 110px" />
          <span class="sep">—</span>
          <el-input-number v-model="f.birthYearTo" :min="1" :max="3000" controls-position="right" placeholder="至" style="width: 110px" />
        </el-form-item>
        <el-form-item label="卒年">
          <el-input-number v-model="f.deathYearFrom" :min="1" :max="3000" controls-position="right" placeholder="从" style="width: 110px" />
          <span class="sep">—</span>
          <el-input-number v-model="f.deathYearTo" :min="1" :max="3000" controls-position="right" placeholder="至" style="width: 110px" />
        </el-form-item>
        <el-form-item label="其他">
          <el-checkbox v-model="f.includeExternal">含外姓配偶</el-checkbox>
          <el-select v-model="f.sort" style="width: 130px; margin-left: 12px">
            <el-option value="generation" label="按世代排序" />
            <el-option value="birth" label="按出生排序" />
            <el-option value="name" label="按姓名排序" />
          </el-select>
        </el-form-item>
        <el-form-item label=" ">
          <el-button type="danger" native-type="submit" :icon="'Search'">搜索</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header><span class="card-title">搜索结果</span><span class="muted"> 共 {{ result.total }} 人</span></template>
      <el-table :data="result.items" v-loading="loading" size="small" stripe @row-click="(r: any) => router.push(`/persons/${r.id}`)">
        <el-table-column label="姓名" width="140">
          <template #default="{ row }">
            <span :class="row.gender" style="font-weight: 600">{{ row.fullName }}</span>
            <el-tag v-if="row.sameNameCount > 1" size="small" type="warning" style="margin-left: 4px">重名</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="世系" min-width="190"><template #default="{ row }">{{ row.disambiguation || (row.isExternal ? '外姓' : '—') }}</template></el-table-column>
        <el-table-column label="生卒" min-width="160"><template #default="{ row }">{{ lifespanText(row) }}</template></el-table-column>
        <el-table-column label="生年" width="70"><template #default="{ row }">{{ row.birthYear ?? '' }}</template></el-table-column>
        <el-table-column label="卒年" width="70"><template #default="{ row }">{{ row.deathYear ?? '' }}</template></el-table-column>
        <el-table-column label="地区" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ [row.birthPlace, row.ancestralHome && `祖籍${row.ancestralHome}`].filter(Boolean).join(' · ') }}</template>
        </el-table-column>
        <el-table-column label="" width="140">
          <template #default="{ row }">
            <el-button link type="danger" @click.stop="router.push(`/persons/${row.id}/tree`)">五代树</el-button>
            <el-button v-if="!row.isLiving" link @click.stop="router.push(`/persons/${row.id}/memorial`)">纪念馆</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-if="result.total > result.pageSize"
        layout="prev, pager, next, total"
        :total="result.total"
        :page-size="result.pageSize"
        :current-page="result.page"
        style="margin-top: 10px"
        @current-change="search"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { lifespanText, type AdvancedSearchItem, type AdvancedSearchQuery, type ClanWithRole, type Paged } from '@zupu/shared';
import { api, run } from '../../api';
import { heritage } from '../api';

const route = useRoute();
const router = useRouter();
const clanId = route.params.clanId as string;
const clan = ref<ClanWithRole | null>(null);
const loading = ref(false);
const blank = () => ({
  q: '',
  generationChar: '',
  generationFrom: undefined as number | undefined,
  generationTo: undefined as number | undefined,
  gender: '' as '' | 'male' | 'female',
  living: '' as '' | 'living' | 'deceased',
  region: '',
  birthYearFrom: undefined as number | undefined,
  birthYearTo: undefined as number | undefined,
  deathYearFrom: undefined as number | undefined,
  deathYearTo: undefined as number | undefined,
  includeExternal: false,
  sort: 'generation' as AdvancedSearchQuery['sort'],
});
const f = reactive(blank());
const result = ref<Paged<AdvancedSearchItem>>({ items: [], total: 0, page: 1, pageSize: 20 });

async function search(page = 1) {
  loading.value = true;
  const q: Record<string, unknown> = { page, pageSize: 20 };
  for (const [k, v] of Object.entries(f)) if (v !== '' && v != null && v !== false) q[k] = v;
  router.replace({ query: Object.fromEntries(Object.entries(q).map(([k, v]) => [k, String(v)])) });
  const r = await run(heritage.search.advanced(clanId, q as AdvancedSearchQuery));
  if (r) result.value = r;
  loading.value = false;
}
function reset() {
  Object.assign(f, blank());
  search(1);
}
onMounted(async () => {
  clan.value = (await run(api.clans.get(clanId))) ?? null;
  const nums = ['generationFrom', 'generationTo', 'birthYearFrom', 'birthYearTo', 'deathYearFrom', 'deathYearTo'];
  for (const [k, v] of Object.entries(route.query)) {
    if (!(k in f) || typeof v !== 'string') continue;
    (f as any)[k] = nums.includes(k) ? Number(v) : k === 'includeExternal' ? v === 'true' : v;
  }
  search(Number(route.query.page) || 1);
});
</script>

<style scoped>
.form { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); column-gap: 16px; }
.form :deep(.el-form-item) { margin-bottom: 14px; }
.sep { margin: 0 6px; color: #999; }
</style>
