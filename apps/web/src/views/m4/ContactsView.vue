<template>
  <div class="page">
    <div class="row mb">
      <el-button text :icon="'ArrowLeft'" @click="router.push(`/clans/${clanId}`)">返回家族首页</el-button>
      <h2 class="title-serif grow" style="margin: 0">族人通讯录</h2>
      <el-input v-model="q" placeholder="姓名 / 城市 / 单位" clearable style="width: 220px" :prefix-icon="'Search'" />
    </div>
    <el-alert type="info" :closable="false" show-icon class="mb">
      通讯录仅本族已登录族人可见；每位族人可自行设置各项信息的可见范围（族人可见 / 仅管理员 / 仅自己）。
    </el-alert>

    <el-row :gutter="16">
      <el-col :md="16" :xs="24">
        <el-card shadow="never" v-loading="loading">
          <el-empty v-if="!loading && !filtered.length" description="暂无族人" />
          <div v-for="c in filtered" :key="c.userId" class="contact">
            <div class="avatar" :class="c.linkedPerson?.gender">{{ (c.displayName || '族')[0] }}</div>
            <div class="grow">
              <div class="row" style="gap: 8px">
                <b>{{ c.displayName || '未命名' }}</b>
                <el-tag v-if="c.isMe" size="small" type="success">我</el-tag>
                <el-tag v-if="c.role === 'admin'" size="small" type="danger">管理员</el-tag>
                <router-link v-if="c.linkedPerson" :to="`/persons/${c.linkedPerson.id}`" class="muted">
                  谱名 {{ c.linkedPerson.fullName }}<template v-if="c.linkedPerson.generation"> · 第{{ c.linkedPerson.generation }}世</template>
                </router-link>
              </div>
              <div class="fields">
                <span v-for="k in CONTACT_FIELDS.filter((k) => c.fields[k])" :key="k">
                  <span class="muted">{{ CONTACT_FIELD_LABELS[k] }}：</span>{{ c.fields[k] }}
                </span>
                <span v-if="!Object.keys(c.fields).length" class="muted">未公开联系方式</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :md="8" :xs="24">
        <el-card shadow="never">
          <template #header><span class="card-title">我的名片</span></template>
          <el-form label-width="72px" size="small">
            <el-form-item v-for="k in CONTACT_FIELDS" :key="k" :label="CONTACT_FIELD_LABELS[k]">
              <div class="row" style="gap: 6px; width: 100%; flex-wrap: nowrap">
                <el-input v-model="card.fields[k]" :type="k === 'note' ? 'textarea' : 'text'" class="grow" />
                <el-select v-model="card.visibility[k]" style="width: 96px">
                  <el-option v-for="(label, v) in CONTACT_VISIBILITY_LABELS" :key="v" :value="v" :label="label" />
                </el-select>
              </div>
            </el-form-item>
            <el-button type="danger" style="width: 100%" :loading="saving" @click="save">保存</el-button>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CONTACT_FIELD_LABELS, CONTACT_FIELDS, CONTACT_VISIBILITY_LABELS, type ContactCard, type ContactEntry } from '@zupu/shared';
import { run } from '../../api';
import { m4 } from '../../m4';

const route = useRoute();
const router = useRouter();
const clanId = route.params.clanId as string;
const list = ref<ContactEntry[]>([]);
const loading = ref(true);
const saving = ref(false);
const q = ref('');
const card = reactive<Pick<ContactCard, 'fields' | 'visibility'>>({ fields: {}, visibility: {} });

const filtered = computed(() => {
  const k = q.value.trim();
  if (!k) return list.value;
  return list.value.filter((c) => [c.displayName, c.linkedPerson?.fullName, c.fields.city, c.fields.work].some((s) => s?.includes(k)));
});

async function load() {
  loading.value = true;
  list.value = (await run(m4.contacts.list(clanId))) ?? [];
  loading.value = false;
}

async function save() {
  saving.value = true;
  const r = await run(m4.contacts.saveMine(clanId, card), '已保存');
  saving.value = false;
  if (r) load();
}

onMounted(async () => {
  load();
  const mine = await run(m4.contacts.mine(clanId));
  if (mine) Object.assign(card, { fields: { ...mine.fields }, visibility: { ...mine.visibility } });
});
</script>

<style scoped>
.mb { margin-bottom: 14px; }
.contact { display: flex; gap: 12px; padding: 12px 4px; border-bottom: 1px dashed #eadfca; }
.contact:last-child { border-bottom: 0; }
.avatar {
  width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: #f3e3c3; color: var(--zp-red); font-size: 18px; font-family: 'Songti SC', serif; flex-shrink: 0;
}
.avatar.male { background: #e3ecfa; color: #2f6fd6; }
.avatar.female { background: #fbe6ec; color: #d14d72; }
.fields { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-top: 6px; font-size: 14px; }
</style>
