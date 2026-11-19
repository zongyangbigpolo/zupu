<template>
  <div class="page" v-if="clan">
    <el-card class="head" shadow="never">
      <div class="row">
        <div class="hall title-serif">{{ clan.hallName || clan.surname + '氏' }}</div>
        <div class="grow">
          <div class="name title-serif">{{ clan.name }}</div>
          <div class="muted">
            郡望：{{ clan.origin || '—' }} · {{ VISIBILITY_LABELS[clan.visibility] }}族谱 · 我的身份：{{ ROLE_LABELS[clan.myRole] }}
          </div>
        </div>
        <el-button v-if="founderId" type="danger" :icon="'Share'" @click="router.push(`/persons/${founderId}/tree`)">从始祖看五代树</el-button>
        <el-button :icon="'Connection'" @click="router.push(`/clans/${clan.id}/kinship`)">亲属关系查询</el-button>
        <el-button v-if="clan.myRole !== 'visitor'" :icon="'Link'" @click="router.push(`/clans/${clan.id}/links`)">跨族连谱</el-button>
        <el-button v-if="isAdmin" :icon="'Files'" @click="router.push(`/clans/${clan.id}/gedcom`)">导入导出</el-button>
        <el-button v-if="isAdmin" type="warning" :icon="'Setting'" @click="router.push(`/clans/${clan.id}/admin`)">家族管理</el-button>
      </div>
      <p v-if="clan.description" class="desc">{{ clan.description }}</p>
    </el-card>

    <el-row :gutter="16">
      <el-col :md="16" :xs="24">
        <el-card shadow="never" class="mb">
          <template #header><span class="card-title">字辈诗</span><span class="muted">（字下数字为世代）</span></template>
          <div v-if="poemChars.length">
            <span v-for="(c, i) in poemChars" :key="i" class="poem-char">
              <b>{{ c }}</b><small>{{ i + clan.poemStartGeneration }}世</small>
            </span>
          </div>
          <el-empty v-else description="尚未录入字辈诗" :image-size="60" />
        </el-card>

        <el-card shadow="never">
          <template #header>
            <div class="row">
              <span class="card-title grow">族人查询</span>
              <el-button v-if="isAdmin" type="danger" size="small" :icon="'Plus'" @click="router.push(`/clans/${clan.id}/persons/new`)">新增成员</el-button>
            </div>
          </template>
          <div class="row mb">
            <el-input v-model="q" placeholder="姓名 / 字 / 号 / 昵称" clearable style="width: 220px" @keyup.enter="search(1)" />
            <el-input-number v-model="generation" :min="1" placeholder="世代" controls-position="right" style="width: 120px" />
            <el-input v-model="generationChar" placeholder="字辈" clearable style="width: 90px" />
            <el-button type="danger" :icon="'Search'" @click="search(1)">搜索</el-button>
            <el-button link @click="router.push(`/clans/${clan.id}/search`)">高级搜索（地区、时间段…）</el-button>
          </div>
          <el-table :data="result.items" v-loading="searching" size="small" stripe @row-click="(r: any) => router.push(`/persons/${r.id}`)">
            <el-table-column label="姓名" width="150">
              <template #default="{ row }">
                <span :class="row.gender" style="font-weight: 600">{{ row.fullName }}</span>
                <el-tag v-if="row.sameNameCount > 1" size="small" type="warning" style="margin-left: 4px">重名</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="世系（消歧）" min-width="200">
              <template #default="{ row }">{{ row.disambiguation || (row.isExternal ? '外姓' : '—') }}</template>
            </el-table-column>
            <el-table-column label="生卒" min-width="170">
              <template #default="{ row }">{{ lifespanText(row) }}</template>
            </el-table-column>
            <el-table-column label="" width="150">
              <template #default="{ row }">
                <el-button link type="danger" @click.stop="router.push(`/persons/${row.id}/tree`)">五代树</el-button>
                <el-button v-if="me && me !== row.id" link @click.stop="router.push(`/clans/${clan!.id}/kinship?from=${me}&to=${row.id}`)">与我关系</el-button>
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
      </el-col>

      <el-col :md="8" :xs="24">
        <el-card shadow="never" class="mb me">
          <template #header><span class="card-title">我在谱中</span></template>
          <template v-if="mePerson">
            <div class="row">
              <span class="title-serif" style="font-size: 22px" :class="mePerson.gender">{{ mePerson.fullName }}</span>
              <span class="muted">{{ mePerson.disambiguation }}</span>
            </div>
            <div class="row" style="margin-top: 10px">
              <el-button type="danger" size="small" @click="router.push(`/persons/${mePerson.id}/tree`)">以我为中心的五代树</el-button>
              <el-button size="small" @click="router.push(`/persons/${mePerson.id}`)">我的档案</el-button>
            </div>
            <p class="muted" style="margin-top: 10px">浏览任意人物档案时，会显示"他/她是我的XX"。</p>
          </template>
          <el-empty v-else :image-size="50" :description="auth.loggedIn ? '账号尚未与谱中人物绑定，请联系家族管理员' : '登录后可绑定谱中身份'" />
        </el-card>

        <ClanHeritageNav :clan-id="clan.id" :founder-id="founderId" />

        <el-card shadow="never" class="mb" v-if="stats">
          <template #header><span class="card-title">概览</span></template>
          <el-row>
            <el-col :span="12"><el-statistic title="入谱人数" :value="stats.personCount" /></el-col>
            <el-col :span="12"><el-statistic title="传世" :value="stats.maxGeneration ?? 0" suffix="世" /></el-col>
            <el-col :span="12" style="margin-top: 12px"><el-statistic title="男 / 女" :value="stats.maleCount" :suffix="`/ ${stats.femaleCount}`" /></el-col>
            <el-col :span="12" style="margin-top: 12px"><el-statistic title="在世" :value="stats.livingCount" /></el-col>
          </el-row>
          <router-link :to="`/clans/${clan.id}/stats`" class="muted" style="display: inline-block; margin-top: 10px">查看详细统计看板 →</router-link>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  lifespanText,
  parseGenerationPoem,
  ROLE_LABELS,
  VISIBILITY_LABELS,
  type ClanStats,
  type ClanWithRole,
  type Paged,
  type PersonDetail,
  type PersonSearchItem,
} from '@zupu/shared';
import { api, run } from '../api';
import { useAuth } from '../stores/auth';
import ClanHeritageNav from '../heritage/components/ClanHeritageNav.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const clanId = route.params.clanId as string;
const clan = ref<ClanWithRole | null>(null);
const stats = ref<ClanStats | null>(null);
const mePerson = ref<PersonDetail | null>(null);
const q = ref('');
const generation = ref<number | undefined>();
const generationChar = ref('');
const searching = ref(false);
const result = ref<Paged<PersonSearchItem>>({ items: [], total: 0, page: 1, pageSize: 20 });

const isAdmin = computed(() => clan.value?.myRole === 'admin' || clan.value?.myRole === 'super');
const founderId = computed(() => clan.value?.founderId);
const me = computed(() => clan.value?.myLinkedPersonId);
const poemChars = computed(() => parseGenerationPoem(clan.value?.generationPoem));

async function search(page = 1) {
  searching.value = true;
  const r = await run(
    api.clans.searchPersons(clanId, {
      q: q.value || undefined,
      generation: generation.value || undefined,
      generationChar: generationChar.value || undefined,
      page,
      pageSize: 20,
    }),
  );
  if (r) result.value = r;
  searching.value = false;
}

onMounted(async () => {
  clan.value = (await run(api.clans.get(clanId))) ?? null;
  if (!clan.value) return;
  stats.value = (await run(api.clans.stats(clanId))) ?? null;
  if (clan.value.myLinkedPersonId) mePerson.value = (await run(api.persons.get(clan.value.myLinkedPersonId))) ?? null;
  search(1);
});
</script>

<style scoped>
.head { margin-bottom: 16px; border-top: 4px solid var(--zp-red); }
.hall { font-size: 36px; color: var(--zp-red); border: 2px solid var(--zp-red); padding: 4px 12px; border-radius: 4px; }
.name { font-size: 22px; }
.desc { color: #555; line-height: 1.8; margin: 12px 0 0; }
.mb { margin-bottom: 16px; }
.me { background: linear-gradient(180deg, #fff9ec, #fff); }
</style>
