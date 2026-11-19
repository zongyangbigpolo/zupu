<template>
  <div class="page" v-if="clan">
    <el-page-header @back="router.push(`/clans/${clanId}`)" :title="clan.name">
      <template #content><span class="title-serif" style="font-size: 20px">数据导入导出</span></template>
    </el-page-header>

    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :md="8" :xs="24">
        <el-card shadow="never" class="mb">
          <template #header><span class="card-title">导出 GEDCOM</span></template>
          <p class="muted">GEDCOM 5.5.1 · UTF-8，可导入 Gramps、MyHeritage 等族谱软件。字、号、字辈、世代、排行、过继/兼祧、元配/继配用自定义标签保存，再导入本系统不丢失。</p>
          <el-radio-group v-model="scope" style="margin: 8px 0">
            <el-radio value="all">全族</el-radio>
            <el-radio value="branch">某人的支系</el-radio>
          </el-radio-group>
          <PersonPicker v-if="scope === 'branch'" v-model="rootId" :clan-id="clanId" placeholder="选择支系起点（含其全部后代及配偶）" />
          <div />
          <el-button type="danger" :icon="'Download'" style="margin-top: 12px" :disabled="scope === 'branch' && !rootId" :loading="exporting" @click="doExport">
            下载 .ged 文件
          </el-button>
        </el-card>

        <el-card shadow="never" class="mb ai">
          <template #header>
            <span class="card-title">AI 智能整理</span>
            <el-tag type="warning" size="small" style="margin-left: 8px">敬请期待</el-tag>
          </template>
          <div class="ai-item">
            <el-icon :size="26"><Camera /></el-icon>
            <div class="grow">
              <b>纸质谱拍照识别导入</b>
              <div class="muted">拍照上传老谱 → OCR 识别 → 生成导入草稿 → 管理员核对后入谱</div>
            </div>
            <el-button size="small" @click="comingSoon(m5api.ai.ocrImport(clanId))">敬请期待</el-button>
          </div>
          <div class="ai-item">
            <el-icon :size="26"><MagicStick /></el-icon>
            <div class="grow">
              <b>AI 生成人物小传</b>
              <div class="muted">根据生卒、事迹自动撰写小传草稿，管理员审阅后采用（人物档案页亦有入口）</div>
            </div>
            <el-button size="small" @click="comingSoon(m5api.ai.biography(clan.founderId ?? '00000000-0000-0000-0000-000000000000'))">敬请期待</el-button>
          </div>
          <div class="muted" style="margin-top: 8px">导入草稿：{{ drafts.length ? drafts.length + ' 份' : '暂无' }}</div>
        </el-card>
      </el-col>

      <el-col :md="16" :xs="24">
        <el-card shadow="never">
          <template #header><span class="card-title">导入 GEDCOM</span><span class="muted">（先预览校验，确认无误后导入为本族新成员）</span></template>
          <el-upload drag :auto-upload="false" :show-file-list="false" accept=".ged,.gedcom,text/plain" :on-change="onFile">
            <el-icon :size="40" style="color: #c9a45c"><UploadFilled /></el-icon>
            <div>将 .ged 文件拖到此处，或<em>点击选择</em></div>
            <div class="muted">仅支持 UTF-8 编码，最大 10MB</div>
          </el-upload>
          <div v-if="file" class="row" style="margin-top: 10px">
            <el-icon><Document /></el-icon><span>{{ file.name }}</span>
            <span class="muted">{{ (file.size / 1024).toFixed(1) }} KB</span>
            <div class="grow" />
            <el-button :loading="previewing" @click="doPreview">重新预览</el-button>
          </div>

          <template v-if="preview">
            <el-descriptions :column="4" border size="small" style="margin-top: 14px">
              <el-descriptions-item label="来源">{{ preview.header.source || '—' }}</el-descriptions-item>
              <el-descriptions-item label="版本">{{ preview.header.version || '—' }}</el-descriptions-item>
              <el-descriptions-item label="编码">{{ preview.header.charset || '—' }}</el-descriptions-item>
              <el-descriptions-item label="家庭">{{ preview.stats.families }}</el-descriptions-item>
              <el-descriptions-item label="人物">{{ preview.stats.persons }}</el-descriptions-item>
              <el-descriptions-item label="亲子关系">{{ preview.stats.parentLinks }}</el-descriptions-item>
              <el-descriptions-item label="婚姻">{{ preview.stats.marriages }}</el-descriptions-item>
              <el-descriptions-item label="在世 / 外姓">{{ preview.stats.living }} / {{ preview.stats.external }}</el-descriptions-item>
            </el-descriptions>

            <el-alert v-for="(e, i) in preview.errors" :key="'e' + i" type="error" :closable="false" show-icon style="margin-top: 8px" :title="e.message" />
            <el-collapse v-if="preview.warnings.length" style="margin-top: 8px">
              <el-collapse-item :title="`提示 ${preview.warnings.length} 条（不影响导入）`">
                <div v-for="(w, i) in preview.warnings" :key="'w' + i" class="warn">· {{ w.message }}</div>
              </el-collapse-item>
            </el-collapse>

            <el-table :data="preview.persons" size="small" stripe max-height="420" style="margin-top: 12px">
              <el-table-column label="编号" prop="xref" width="80" />
              <el-table-column label="姓名" width="140">
                <template #default="{ row }">
                  <span :class="row.gender" style="font-weight: 600">{{ row.fullName }}</span>
                  <el-tag v-if="row.possibleDuplicate" size="small" type="warning" style="margin-left: 4px">疑似重复</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="字 / 字辈 / 世代" width="150">
                <template #default="{ row }">
                  {{ [row.courtesyName && '字' + row.courtesyName, row.generationChar && row.generationChar + '字辈', row.generation && '第' + row.generation + '世'].filter(Boolean).join(' · ') || (row.isExternal ? '外姓' : '—') }}
                </template>
              </el-table-column>
              <el-table-column label="生卒" min-width="150">
                <template #default="{ row }">{{ row.birthText || '?' }} — {{ row.isLiving ? '在世' : row.deathText || '?' }}</template>
              </el-table-column>
              <el-table-column label="父母" min-width="120"><template #default="{ row }">{{ row.parents.join('、') || '—' }}</template></el-table-column>
              <el-table-column label="配偶" min-width="100"><template #default="{ row }">{{ row.spouses.join('、') || '—' }}</template></el-table-column>
            </el-table>

            <div class="row" style="margin-top: 14px">
              <div class="grow muted">导入后可在家族首页搜索、在档案页编辑；如需挂到本族已有人物下，可在编辑页添加父母关系。</div>
              <el-button type="danger" size="large" :disabled="!preview.canImport" :loading="importing" @click="doImport">
                确认导入 {{ preview.stats.persons }} 人
              </el-button>
            </div>
          </template>
          <el-result v-if="imported" icon="success" title="导入完成"
            :sub-title="`新增 ${imported.imported} 人、亲子关系 ${imported.parentLinks} 条、婚姻 ${imported.marriages} 条`">
            <template #extra><el-button type="danger" @click="router.push(`/clans/${clanId}`)">返回家族首页</el-button></template>
          </el-result>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type UploadFile } from 'element-plus';
import type { ClanWithRole, GedcomImportResult, GedcomPreview, ImportDraft } from '@zupu/shared';
import { api, errorMessage, run } from '../../api';
import { downloadGedcom, m5api, uploadGedcom } from '../../m5-api';
import PersonPicker from '../../components/PersonPicker.vue';

const route = useRoute();
const router = useRouter();
const clanId = route.params.clanId as string;
const clan = ref<ClanWithRole | null>(null);
const scope = ref<'all' | 'branch'>('all');
const rootId = ref<string | null>(null);
const exporting = ref(false);
const file = ref<File | null>(null);
const preview = ref<GedcomPreview | null>(null);
const previewing = ref(false);
const importing = ref(false);
const imported = ref<GedcomImportResult | null>(null);
const drafts = ref<ImportDraft[]>([]);

async function doExport() {
  exporting.value = true;
  try {
    await downloadGedcom(m5api.gedcom.exportUrl(clanId, scope.value === 'branch' ? rootId.value : null), `${clan.value!.name}.ged`);
  } catch (e) {
    ElMessage.error(errorMessage(e));
  }
  exporting.value = false;
}

function onFile(f: UploadFile) {
  if (!f.raw) return;
  file.value = f.raw;
  imported.value = null;
  doPreview();
}

async function doPreview() {
  if (!file.value) return;
  previewing.value = true;
  preview.value = null;
  try {
    preview.value = await uploadGedcom<GedcomPreview>(m5api.gedcom.previewUrl(clanId), file.value);
  } catch (e) {
    ElMessage.error(errorMessage(e));
  }
  previewing.value = false;
}

async function doImport() {
  const ok = await ElMessageBox.confirm(`将 ${preview.value!.stats.persons} 人作为本族新成员导入，确定？`, '确认导入').catch(() => false);
  if (!ok) return;
  importing.value = true;
  try {
    imported.value = await uploadGedcom<GedcomImportResult>(m5api.gedcom.importUrl(clanId), file.value!);
    preview.value = null;
    file.value = null;
    ElMessage.success('导入完成');
  } catch (e) {
    ElMessage.error(errorMessage(e));
  }
  importing.value = false;
}

async function comingSoon(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    ElMessageBox.alert(errorMessage(e), '敬请期待', { type: 'info' });
  }
}

onMounted(async () => {
  clan.value = (await run(api.clans.get(clanId))) ?? null;
  drafts.value = (await m5api.ai.importDrafts(clanId).catch(() => [])) ?? [];
});
</script>

<style scoped>
.mb { margin-bottom: 16px; }
.ai { background: linear-gradient(180deg, #fff9ec, #fff); }
.ai-item { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px dashed #eee; color: #8b6d2c; }
.warn { font-size: 13px; color: #8a6d3b; line-height: 1.8; }
</style>
