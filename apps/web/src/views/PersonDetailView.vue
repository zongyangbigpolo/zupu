<template>
  <div class="page" v-if="p">
    <el-page-header @back="router.push(`/clans/${p.clanId}`)" :title="clan?.name ?? '返回'">
      <template #content>
        <span class="title-serif" style="font-size: 22px" :class="p.gender">{{ p.fullName }}</span>
        <span class="muted" style="margin-left: 8px">{{ p.disambiguation }}</span>
      </template>
      <template #extra>
        <div class="row">
          <el-button type="danger" :icon="'Share'" @click="router.push(`/persons/${p.id}/tree`)">五代树</el-button>
          <el-button :icon="'Connection'" @click="router.push(`/clans/${p.clanId}/kinship?from=${me ?? ''}&to=${p.id}`)">亲属关系</el-button>
          <el-button v-if="isAdmin" type="warning" :icon="'Edit'" @click="router.push(`/persons/${p.id}/edit`)">编辑</el-button>
        </div>
      </template>
    </el-page-header>

    <el-alert v-if="meRel" type="success" :closable="false" show-icon class="me-rel">
      <template #title>
        <span v-if="meRel.termAtoB">
          {{ p.gender === 'female' ? '她' : '他' }}是我的 <b class="term">{{ meRel.termAtoB }}</b>
          <span class="muted">（{{ meRel.generationDiffText }} · 我的{{ meRel.chainText }}）</span>
        </span>
        <span v-else>与我的关系：我的{{ meRel.chainText }}（{{ meRel.generationDiffText }}）</span>
      </template>
    </el-alert>
    <el-alert v-else-if="me === p.id" type="success" :closable="false" title="这是我在谱中的位置" show-icon class="me-rel" />

    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :md="8" :xs="24">
        <el-card shadow="never" class="mb">
          <div class="avatar">
            <el-image v-if="avatar" :src="avatar.url" fit="cover" :preview-src-list="[avatar.url]" style="width: 140px; height: 170px; border-radius: 6px" />
            <div v-else class="avatar-ph title-serif" :class="p.gender">{{ p.givenName.slice(-1) }}</div>
          </div>
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="姓名">{{ p.fullName }}</el-descriptions-item>
            <el-descriptions-item label="性别">{{ GENDER_LABELS[p.gender] }}</el-descriptions-item>
            <el-descriptions-item v-if="p.courtesyName" label="字">{{ p.courtesyName }}</el-descriptions-item>
            <el-descriptions-item v-if="p.artName" label="号">{{ p.artName }}</el-descriptions-item>
            <el-descriptions-item v-if="p.nickname" label="昵称">{{ p.nickname }}</el-descriptions-item>
            <el-descriptions-item label="世代">{{ p.generation ? `第${p.generation}世` : p.isExternal ? '外姓' : '—' }}</el-descriptions-item>
            <el-descriptions-item label="字辈">{{ p.generationChar || '—' }}</el-descriptions-item>
            <el-descriptions-item label="排行">{{ rankLabel(p.rankInSiblings) || '—' }}</el-descriptions-item>
            <el-descriptions-item label="生">{{ dateText(p.birthText, p.birthDate) }}</el-descriptions-item>
            <el-descriptions-item label="卒">{{ p.isLiving ? '在世' : dateText(p.deathText, p.deathDate) }}</el-descriptions-item>
            <el-descriptions-item label="祖籍">{{ p.ancestralHome || '—' }}</el-descriptions-item>
            <el-descriptions-item label="出生地">{{ p.birthPlace || '—' }}</el-descriptions-item>
            <el-descriptions-item v-if="!p.isLiving" label="葬地">{{ p.burialPlace || '—' }}</el-descriptions-item>
            <el-descriptions-item label="职业">{{ p.occupation || '—' }}</el-descriptions-item>
          </el-descriptions>
          <p v-if="p.hiddenFields?.length" class="muted">部分在世者信息仅对本族族人可见。</p>
        </el-card>
      </el-col>

      <el-col :md="16" :xs="24">
        <el-card shadow="never" class="mb">
          <template #header><span class="card-title">亲属</span></template>
          <div class="rel-row">
            <span class="rel-label">父母</span>
            <RelChip v-for="r in p.parents" :key="r.relationId" :r="r" :tag="parentTag(r)" />
            <span v-if="!p.parents.length" class="muted">—</span>
          </div>
          <div class="rel-row">
            <span class="rel-label">配偶</span>
            <RelChip v-for="r in p.spouses" :key="r.relationId" :r="r" :tag="r.marriageType ? MARRIAGE_TYPE_LABELS[r.marriageType] : ''" />
            <span v-if="!p.spouses.length" class="muted">—</span>
          </div>
          <div class="rel-row">
            <span class="rel-label">子女</span>
            <RelChip v-for="r in p.children" :key="r.relationId" :r="r" :tag="childTag(r)" />
            <span v-if="!p.children.length" class="muted">—</span>
          </div>
        </el-card>

        <el-card shadow="never" class="mb">
          <template #header>
            <div class="row">
              <span class="card-title grow">生平事迹</span>
              <el-tooltip v-if="isAdmin" content="AI 生成人物小传，敬请期待">
                <el-button size="small" :icon="'MagicStick'" disabled>AI 生成小传（敬请期待）</el-button>
              </el-tooltip>
            </div>
          </template>
          <div v-if="p.biography" class="rich" v-html="sanitizeHtml(p.biography)" />
          <p v-else class="muted">暂无生平记载</p>
          <el-timeline v-if="p.events.length" style="margin-top: 16px">
            <el-timeline-item v-for="e in p.events" :key="e.id" :timestamp="[e.eventText, e.place].filter(Boolean).join(' · ')" placement="top">
              <el-tag size="small" v-if="e.type" style="margin-right: 6px">{{ e.type }}</el-tag>
              <b>{{ e.title }}</b>
              <div v-if="e.description" class="muted">{{ e.description }}</div>
            </el-timeline-item>
          </el-timeline>
        </el-card>

        <el-card shadow="never">
          <template #header><span class="card-title">照片与影音</span></template>
          <div v-if="photos.length" class="photos">
            <div v-for="(m, i) in photos" :key="m.id" class="photo">
              <el-image :src="m.url" fit="cover" :preview-src-list="photos.map((x) => x.url)" :initial-index="i" style="width: 150px; height: 150px; border-radius: 4px" />
              <div class="muted cap">{{ m.caption }}</div>
            </div>
          </div>
          <div v-for="m in avMedia" :key="m.id" style="margin-top: 10px">
            <div class="muted">{{ m.caption }}</div>
            <video v-if="m.type === 'video'" :src="m.url" controls style="max-width: 100%; max-height: 320px" />
            <audio v-else-if="m.type === 'audio'" :src="m.url" controls />
            <a v-else :href="m.url" target="_blank">下载文档</a>
          </div>
          <p v-if="!p.media.length" class="muted">暂无照片或影音资料</p>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ElTag } from 'element-plus';
import {
  GENDER_LABELS,
  MARRIAGE_TYPE_LABELS,
  RELATION_TYPE_LABELS,
  rankLabel,
  type ClanWithRole,
  type KinshipResult,
  type PersonDetail,
  type RelativeRef,
} from '@zupu/shared';
import { api, run } from '../api';
import { sanitizeHtml } from '../sanitize';

const RelChip = defineComponent({
  props: { r: { type: Object as () => RelativeRef, required: true }, tag: String },
  setup(props) {
    return () =>
      h(RouterLink, { to: `/persons/${props.r.person.id}`, class: 'chip' }, () => [
        h('span', { class: props.r.person.gender }, props.r.person.fullName),
        props.tag ? h(ElTag, { size: 'small', type: 'info', style: 'margin-left:4px' }, () => props.tag) : null,
      ]);
  },
});

const route = useRoute();
const router = useRouter();
const p = ref<PersonDetail | null>(null);
const clan = ref<ClanWithRole | null>(null);
const meRel = ref<KinshipResult | null>(null);
const isAdmin = computed(() => clan.value?.myRole === 'admin' || clan.value?.myRole === 'super');
const me = computed(() => clan.value?.myLinkedPersonId ?? null);
const photos = computed(() => p.value?.media.filter((m) => m.type === 'photo') ?? []);
const avMedia = computed(() => p.value?.media.filter((m) => m.type !== 'photo') ?? []);
const avatar = computed(() => photos.value.find((m) => m.id === p.value?.avatarMediaId) ?? photos.value[0]);

const parentTag = (r: RelativeRef) => {
  if (r.isMainLine === false) return r.relationType === 'biological' ? '本生（出继）' : RELATION_TYPE_LABELS[r.relationType!];
  return r.relationType && r.relationType !== 'biological' ? RELATION_TYPE_LABELS[r.relationType] : '';
};
const childTag = (r: RelativeRef) => {
  if (r.isMainLine === false) return '出继';
  return r.relationType && r.relationType !== 'biological' ? RELATION_TYPE_LABELS[r.relationType] : '';
};
const dateText = (t: string | null, d: string | null) => t || d || '—';

onMounted(async () => {
  p.value = (await run(api.persons.get(route.params.id as string))) ?? null;
  if (!p.value) return;
  clan.value = (await run(api.clans.get(p.value.clanId))) ?? null;
  if (me.value && me.value !== p.value.id) meRel.value = (await run(api.clans.kinship(p.value.clanId, me.value, p.value.id))) ?? null;
});
</script>

<style scoped>
.mb { margin-bottom: 16px; }
.me-rel { margin-top: 14px; }
.term { color: var(--zp-red); font-size: 18px; }
.avatar { display: flex; justify-content: center; margin-bottom: 12px; }
.avatar-ph { width: 120px; height: 150px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 56px; background: #f4efe4; }
.rel-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.rel-label { width: 40px; color: #888; }
:deep(.chip) { padding: 4px 10px; border: 1px solid #eadfca; border-radius: 16px; background: #fffaf0; }
.photos { display: flex; flex-wrap: wrap; gap: 12px; }
.cap { width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
