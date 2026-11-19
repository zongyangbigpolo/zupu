<template>
  <div>
    <el-alert type="info" :closable="false" show-icon title="导出本族全部数据（成员、亲子、婚姻、事迹、口述历史、家族文献、多媒体清单）。导出的 Excel“成员”表与导入模板格式一致，可作冷备份或迁移。" />
    <div class="row" style="margin-top: 16px">
      <el-card shadow="hover" class="box">
        <el-icon :size="36" color="#1d6f42"><Document /></el-icon>
        <h4>Excel</h4>
        <p class="muted">便于查看、打印与再次导入</p>
        <el-button type="success" :loading="busy === 'xlsx'" @click="go('xlsx')">导出 Excel</el-button>
      </el-card>
      <el-card shadow="hover" class="box">
        <el-icon :size="36" color="#8b1e1e"><Files /></el-icon>
        <h4>JSON</h4>
        <p class="muted">完整结构化数据，便于程序处理</p>
        <el-button type="danger" :loading="busy === 'json'" @click="go('json')">导出 JSON</el-button>
      </el-card>
      <el-card shadow="hover" class="box">
        <el-icon :size="36" color="#999"><Share /></el-icon>
        <h4>GEDCOM</h4>
        <p class="muted">国际通用族谱格式</p>
        <el-button disabled>敬请期待</el-button>
      </el-card>
    </div>
    <p class="muted" style="margin-top: 12px">照片、音视频文件存放在对象存储中，清单见导出文件的“多媒体清单”。平台每日自动备份数据库。</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { downloadFile, heritage } from '../api';

const props = defineProps<{ clanId: string; clanName: string }>();
const busy = ref<'' | 'xlsx' | 'json'>('');
async function go(f: 'xlsx' | 'json') {
  busy.value = f;
  await downloadFile(heritage.exporter.url(props.clanId, f), `${props.clanName}.${f}`);
  busy.value = '';
}
</script>

<style scoped>
.box { width: 220px; text-align: center; }
.box h4 { margin: 8px 0 4px; }
</style>
