<template>
  <div>
    <el-descriptions v-if="settings" :column="4" border size="small">
      <el-descriptions-item label="每日自动备份">
        <el-tag :type="settings.enabled ? 'success' : 'info'" size="small">{{ settings.enabled ? '已启用' : '未启用' }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="执行时间">每天 {{ settings.dailyAt }}</el-descriptions-item>
      <el-descriptions-item label="保留">{{ settings.keepDays }} 天</el-descriptions-item>
      <el-descriptions-item label="下次执行">{{ settings.nextRunAt ? new Date(settings.nextRunAt).toLocaleString('zh-CN') : '—' }}</el-descriptions-item>
    </el-descriptions>
    <div class="row" style="margin: 12px 0">
      <el-button type="danger" :icon="'Coin'" :loading="running" @click="runNow">立即备份</el-button>
      <span class="muted">优先使用 pg_dump（可用 pg_restore 恢复），不可用时导出 JSON 快照。配置项：BACKUP_ENABLED / BACKUP_DAILY_AT / BACKUP_KEEP_DAYS / BACKUP_METHOD。</span>
    </div>
    <el-table :data="items" size="small" border>
      <el-table-column label="开始时间" width="170"><template #default="{ row }">{{ new Date(row.startedAt).toLocaleString('zh-CN') }}</template></el-table-column>
      <el-table-column label="触发" width="80"><template #default="{ row }">{{ row.trigger === 'manual' ? '手动' : '定时' }}</template></el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'">{{ { success: '成功', failed: '失败', running: '进行中' }[row.status as 'success'] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="方式" prop="method" width="90" />
      <el-table-column label="大小" width="100"><template #default="{ row }">{{ fmtSize(row.size) }}</template></el-table-column>
      <el-table-column label="错误" prop="error" show-overflow-tooltip />
      <el-table-column label="" width="80">
        <template #default="{ row }">
          <el-button v-if="row.status === 'success'" link type="primary" @click="downloadFile(heritage.backups.downloadUrl(row.id), 'backup')">下载</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { BackupJob, BackupSettings } from '@zupu/shared';
import { run } from '../../api';
import { downloadFile, fmtSize, heritage } from '../api';

const settings = ref<BackupSettings | null>(null);
const items = ref<BackupJob[]>([]);
const running = ref(false);
async function load() {
  const r = await run(heritage.backups.list());
  if (r) {
    settings.value = r.settings;
    items.value = r.items;
  }
}
async function runNow() {
  running.value = true;
  const r = await run(heritage.backups.run());
  running.value = false;
  if (r) await run(Promise.resolve(r), r.status === 'success' ? '备份完成' : undefined);
  await load();
}
onMounted(load);
</script>
