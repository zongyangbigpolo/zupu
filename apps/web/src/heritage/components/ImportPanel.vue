<template>
  <div>
    <el-steps :active="step" finish-status="success" simple style="margin-bottom: 16px">
      <el-step title="下载模板并填写" />
      <el-step title="上传预览与校验" />
      <el-step title="确认入谱" />
    </el-steps>

    <div class="row" style="margin-bottom: 12px">
      <el-button :icon="'Download'" @click="downloadFile(heritage.importer.templateUrl(clanId), '导入模板.xlsx')">下载 Excel 模板</el-button>
      <el-upload :show-file-list="false" accept=".xlsx" :http-request="upload">
        <el-button type="danger" :icon="'Upload'" :loading="loading">上传 Excel 预览</el-button>
      </el-upload>
      <el-tooltip content="纸质谱拍照 → AI 识别生成导入草稿，敬请期待">
        <el-button disabled :icon="'Camera'">拍照识别导入（AI）</el-button>
      </el-tooltip>
      <span class="muted">世代、字辈可留空，系统按父亲与字辈诗自动推算并校验。</span>
    </div>

    <template v-if="preview">
      <el-alert v-if="preview.status === 'committed'" type="success" :closable="false" show-icon :title="`已导入：${preview.fileName ?? ''}`" style="margin-bottom: 12px" />
      <div class="sum">
        <el-statistic title="总行数" :value="preview.summary.totalRows" />
        <el-statistic title="将新建" :value="preview.summary.toCreate" />
        <el-statistic title="已存在(跳过)" :value="preview.summary.skipped" />
        <el-statistic title="父子关系" :value="preview.summary.parentLinks" />
        <el-statistic title="婚姻" :value="preview.summary.marriages" />
        <el-statistic title="错误行" :value="preview.summary.errorRows" :value-style="{ color: preview.summary.errorRows ? '#d33' : '#2a2' }" />
        <el-statistic title="提醒行" :value="preview.summary.warningRows" :value-style="{ color: preview.summary.warningRows ? '#c80' : '#2a2' }" />
      </div>
      <div class="row" style="margin: 10px 0">
        <el-radio-group v-model="filter" size="small">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="error">仅错误</el-radio-button>
          <el-radio-button value="warning">仅提醒</el-radio-button>
        </el-radio-group>
        <div class="grow" />
        <template v-if="preview.status === 'preview'">
          <el-button @click="discard">放弃</el-button>
          <el-button type="danger" :disabled="preview.summary.errorRows > 0 || !preview.summary.toCreate" :loading="committing" @click="commit">
            确认导入 {{ preview.summary.toCreate }} 人
          </el-button>
        </template>
      </div>
      <el-table :data="rows" size="small" border max-height="520" :row-class-name="rowClass">
        <el-table-column label="行" prop="rowNo" width="56" align="center" />
        <el-table-column label="编号" prop="key" width="90" show-overflow-tooltip />
        <el-table-column label="姓名" width="110">
          <template #default="{ row }"><span :class="row.gender">{{ row.fullName }}</span><el-tag v-if="row.action === 'skip'" size="small" type="info" style="margin-left: 4px">已有</el-tag></template>
        </el-table-column>
        <el-table-column label="世代" width="110">
          <template #default="{ row }">
            <span v-if="row.finalGeneration">第{{ row.finalGeneration }}世</span>
            <el-tag v-if="row.generation == null && row.finalGeneration" size="small" type="success" style="margin-left: 4px">推算</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="字辈" width="90">
          <template #default="{ row }">
            {{ row.finalGenerationChar }}
            <el-tag v-if="!row.generationChar && row.finalGenerationChar" size="small" type="success">推算</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="父 / 母 / 配偶" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ [row.fatherKey, row.motherKey, row.spouseKeys.join('、')].map((x: any) => x || '—').join(' / ') }}</template>
        </el-table-column>
        <el-table-column label="校验结果" min-width="320">
          <template #default="{ row }">
            <div v-for="(e, i) in row.errors" :key="'e' + i" class="err">✖ {{ e }}</div>
            <div v-for="(w, i) in row.warnings" :key="'w' + i" class="warn">⚠ {{ w }}</div>
            <span v-if="!row.errors.length && !row.warnings.length" class="ok">✔ 通过</span>
          </template>
        </el-table-column>
      </el-table>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox, type UploadRequestOptions } from 'element-plus';
import type { ImportPreview, ImportRowPreview } from '@zupu/shared';
import { errorMessage, http, run } from '../../api';
import { downloadFile, heritage } from '../api';

const props = defineProps<{ clanId: string }>();
const emit = defineEmits<{ (e: 'imported'): void }>();
const preview = ref<ImportPreview | null>(null);
const loading = ref(false);
const committing = ref(false);
const filter = ref<'all' | 'error' | 'warning'>('all');
const step = computed(() => (!preview.value ? 0 : preview.value.status === 'committed' ? 3 : 1));
const rows = computed(() =>
  (preview.value?.rows ?? []).filter((r) => (filter.value === 'error' ? r.errors.length : filter.value === 'warning' ? r.warnings.length : true)),
);
const rowClass = ({ row }: { row: ImportRowPreview }) => (row.errors.length ? 'row-err' : row.warnings.length ? 'row-warn' : '');

async function upload(opt: UploadRequestOptions) {
  loading.value = true;
  try {
    const fd = new FormData();
    fd.append('file', opt.file);
    const r = await http.post<ImportPreview>(heritage.importer.previewUrl(props.clanId), fd, { timeout: 300000 });
    preview.value = r.data;
    filter.value = r.data.summary.errorRows ? 'error' : 'all';
  } catch (e) {
    ElMessage.error(errorMessage(e));
  } finally {
    loading.value = false;
  }
}
async function commit() {
  const s = preview.value!.summary;
  await ElMessageBox.confirm(`将新建 ${s.toCreate} 人、${s.parentLinks} 条父子关系、${s.marriages} 条婚姻。${s.warningRows ? `其中 ${s.warningRows} 行有提醒，` : ''}确认导入？`, '确认入谱', { type: 'warning' });
  committing.value = true;
  const r = await run(heritage.importer.commit(preview.value!.batchId));
  committing.value = false;
  if (r) {
    ElMessage.success(`导入成功：新建 ${r.created} 人，父子关系 ${r.parentLinks} 条，婚姻 ${r.marriages} 条`);
    preview.value = { ...preview.value!, status: 'committed' };
    emit('imported');
  }
}
async function discard() {
  await run(heritage.importer.discard(preview.value!.batchId));
  preview.value = null;
}
</script>

<style scoped>
.sum { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; background: #fffaf0; padding: 12px; border-radius: 6px; text-align: center; }
.err { color: #d33; font-size: 12px; }
.warn { color: #b77400; font-size: 12px; }
.ok { color: #2a2; font-size: 12px; }
:deep(.row-err) { background: #fff1f0; }
:deep(.row-warn) { background: #fffbe6; }
</style>
