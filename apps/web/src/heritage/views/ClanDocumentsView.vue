<template>
  <div class="page" v-if="clan">
    <el-page-header @back="router.push(`/clans/${clanId}`)" :title="clan.name">
      <template #content><span class="title-serif" style="font-size: 20px">家训 · 谱序 · 凡例</span></template>
      <template #extra>
        <el-button v-if="isAdmin" type="danger" :icon="'Plus'" @click="openEdit(null)">新增文献</el-button>
      </template>
    </el-page-header>

    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :md="6" :xs="24">
        <el-card shadow="never" class="toc">
          <template v-for="(group, kind) in grouped" :key="kind">
            <div class="kind">{{ CLAN_DOCUMENT_KIND_LABELS[kind as ClanDocumentKind] }}</div>
            <div v-for="d in group" :key="d.id" class="item" :class="{ active: cur?.id === d.id }" @click="select(d)">{{ d.title }}</div>
          </template>
          <el-empty v-if="!docs.length" :image-size="60" description="尚未录入家族文献" />
        </el-card>
      </el-col>
      <el-col :md="18" :xs="24">
        <el-card v-if="cur" shadow="never" class="reader">
          <template #header>
            <div class="row">
              <el-tag effect="dark" color="#8b1e1e" style="border: none">{{ CLAN_DOCUMENT_KIND_LABELS[cur.kind] }}</el-tag>
              <span class="card-title title-serif grow">{{ cur.title }}</span>
              <el-switch v-model="vertical" inline-prompt active-text="竖排" inactive-text="横排" style="--el-switch-on-color: #8b1e1e" />
              <template v-if="isAdmin">
                <el-button size="small" :icon="'Edit'" @click="openEdit(cur)">编辑</el-button>
                <el-popconfirm title="确定删除该文献？" @confirm="remove(cur.id)">
                  <template #reference><el-button size="small" type="danger" :icon="'Delete'" /></template>
                </el-popconfirm>
              </template>
            </div>
          </template>
          <div v-if="vertical" ref="vbox" class="vbox">
            <div class="vertical">
              <h2 class="vtitle">{{ cur.title }}</h2>
              <div class="rich" v-html="sanitizeHtml(cur.content)" />
            </div>
          </div>
          <div v-else class="horizontal rich" v-html="sanitizeHtml(cur.content) || '<p>（暂无内容）</p>'" />
          <div class="muted" style="margin-top: 10px">更新于 {{ new Date(cur.updatedAt).toLocaleString('zh-CN') }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="dlg" :title="editing ? '编辑文献' : '新增文献'" width="min(820px, 96vw)" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="类别">
          <el-radio-group v-model="f.kind">
            <el-radio-button v-for="(l, k) in CLAN_DOCUMENT_KIND_LABELS" :key="k" :value="k">{{ l }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="标题" required><el-input v-model="f.title" maxlength="100" /></el-form-item>
        <el-form-item label="正文"><RichEditor v-model="f.content" /></el-form-item>
        <el-form-item label="展示">
          <el-switch v-model="f.vertical" active-text="默认竖排（古籍风格）" />
          <span class="muted" style="margin-left: 16px">排序</span>
          <el-input-number v-model="f.sortOrder" :min="0" size="small" style="margin-left: 8px" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="danger" :disabled="!f.title.trim()" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CLAN_DOCUMENT_KIND_LABELS, type ClanDocument, type ClanDocumentKind, type ClanWithRole } from '@zupu/shared';
import { api, run } from '../../api';
import RichEditor from '../../components/RichEditor.vue';
import { sanitizeHtml } from '../../sanitize';
import { heritage } from '../api';

const route = useRoute();
const router = useRouter();
const clanId = route.params.clanId as string;
const clan = ref<ClanWithRole | null>(null);
const docs = ref<ClanDocument[]>([]);
const cur = ref<ClanDocument | null>(null);
const vertical = ref(false);
const vbox = ref<HTMLDivElement>();
const dlg = ref(false);
const editing = ref<ClanDocument | null>(null);
const f = reactive({ kind: 'family_rules' as ClanDocumentKind, title: '', content: '' as string | null, vertical: false, sortOrder: 0 });
const isAdmin = computed(() => clan.value?.myRole === 'admin' || clan.value?.myRole === 'super');
const grouped = computed(() => {
  const g: Partial<Record<ClanDocumentKind, ClanDocument[]>> = {};
  for (const d of docs.value) (g[d.kind] ??= []).push(d);
  return g;
});

function select(d: ClanDocument) {
  cur.value = d;
  vertical.value = d.vertical;
  router.replace({ query: { doc: d.id } });
}
// 竖排从右往左读：滚动到最右侧
watch([vertical, cur], async () => {
  await nextTick();
  if (vbox.value) vbox.value.scrollLeft = vbox.value.scrollWidth;
});

async function load(selectId?: string) {
  docs.value = (await run(heritage.documents.list(clanId))) ?? [];
  const d = docs.value.find((x) => x.id === (selectId ?? route.query.doc)) ?? docs.value[0];
  if (d) select(d);
  else cur.value = null;
}
onMounted(async () => {
  clan.value = (await run(api.clans.get(clanId))) ?? null;
  load();
});

function openEdit(d: ClanDocument | null) {
  editing.value = d;
  Object.assign(f, d ? { kind: d.kind, title: d.title, content: d.content, vertical: d.vertical, sortOrder: d.sortOrder } : { kind: 'family_rules', title: '', content: '', vertical: true, sortOrder: docs.value.length + 1 });
  dlg.value = true;
}
async function save() {
  const data = { kind: f.kind, title: f.title.trim(), content: f.content || null, vertical: f.vertical, sortOrder: f.sortOrder };
  const r = editing.value ? await run(heritage.documents.update(editing.value.id, data), '已保存') : await run(heritage.documents.create(clanId, data), '已新增');
  if (r) {
    dlg.value = false;
    await load(r.id);
  }
}
async function remove(id: string) {
  await run(heritage.documents.remove(id), '已删除');
  router.replace({ query: {} });
  await load('');
}
</script>

<style scoped>
.toc .kind { color: var(--zp-red); font-weight: 600; margin: 10px 0 4px; font-family: 'Songti SC', serif; }
.toc .kind:first-child { margin-top: 0; }
.item { padding: 6px 10px; border-radius: 4px; cursor: pointer; }
.item:hover { background: #fff5e6; }
.item.active { background: var(--zp-red); color: #fff; }
.reader :deep(.el-card__body) { background: #fbf5e6; }
.horizontal { font-family: 'Songti SC', 'STSong', serif; font-size: 17px; line-height: 2; max-width: 760px; margin: 0 auto; padding: 10px 0; }
.vbox { overflow-x: auto; overflow-y: hidden; padding: 10px 0; }
.vertical {
  writing-mode: vertical-rl;
  height: 62vh;
  min-height: 420px;
  margin-left: auto;
  padding: 24px 28px;
  font-family: 'Songti SC', 'STSong', 'SimSun', serif;
  font-size: 20px;
  line-height: 2.1;
  letter-spacing: 3px;
  color: #2b1d12;
  border: 3px double #8b1e1e;
  background-color: #f8eed6;
  background-image: repeating-linear-gradient(to left, transparent 0, transparent calc(2.1em - 1px), rgba(139, 30, 30, 0.28) calc(2.1em - 1px), rgba(139, 30, 30, 0.28) 2.1em);
  background-origin: content-box;
}
.vtitle { margin: 0 0 0 0.8em; font-size: 26px; color: #8b1e1e; letter-spacing: 8px; }
.vertical :deep(p), .vertical :deep(li) { margin: 0; text-indent: 2em; }
.vertical :deep(ul) { margin: 0; padding: 0; list-style: none; }
</style>
