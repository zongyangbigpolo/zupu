<template>
  <div>
    <el-table :data="data.items" size="small" v-loading="loading">
      <el-table-column label="时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
      </el-table-column>
      <el-table-column v-if="showClan" label="家族" prop="clanName" width="160" />
      <el-table-column label="操作人" prop="userPhone" width="130" />
      <el-table-column label="操作" width="160">
        <template #default="{ row }">{{ ENTITY[row.entity] ?? row.entity }} · {{ ACTION[row.action] ?? row.action }}</template>
      </el-table-column>
      <el-table-column label="内容">
        <template #default="{ row }"><span class="muted">{{ summary(row) }}</span></template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-if="data.total > data.pageSize"
      layout="prev, pager, next, total"
      :total="data.total"
      :page-size="data.pageSize"
      :current-page="data.page"
      style="margin-top: 8px"
      @current-change="(p: number) => emit('page', p)"
    />
  </div>
</template>

<script setup lang="ts">
import type { AuditLogEntry, Paged } from '@zupu/shared';

defineProps<{ data: Paged<AuditLogEntry>; loading?: boolean; showClan?: boolean }>();
const emit = defineEmits<{ (e: 'page', p: number): void }>();
const ENTITY: Record<string, string> = { person: '人员', parent_child: '亲子关系', marriage: '婚姻', clan: '家族', membership: '成员', media: '多媒体', life_event: '事迹' };
const ACTION: Record<string, string> = {
  create: '新增', update: '修改', delete: '删除', upload: '上传', 'appoint-admin': '任命管理员', 'revoke-admin': '撤销管理员',
  'add-member': '添加族人', 'remove-member': '移除族人', 'link-person': '绑定谱中身份', disable: '停用', enable: '启用',
};
function summary(row: AuditLogEntry) {
  const o = (row.after ?? row.before) as Record<string, any> | null;
  if (!o) return '';
  if (o.surname && o.givenName) return `${o.surname}${o.givenName}`;
  if (o.phone) return `手机号 ${o.phone}`;
  if (o.name) return o.name;
  if (o.title) return o.title;
  if (o.caption) return o.caption;
  return '';
}
</script>
