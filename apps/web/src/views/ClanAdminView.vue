<template>
  <div class="page" v-if="clan">
    <el-page-header @back="router.push(`/clans/${clanId}`)" :title="clan.name">
      <template #content><span class="title-serif" style="font-size: 20px">家族管理</span></template>
      <template #extra>
        <el-button type="danger" :icon="'Plus'" @click="router.push(`/clans/${clanId}/persons/new`)">新增成员</el-button>
      </template>
    </el-page-header>
    <el-alert type="info" :closable="false" style="margin-top: 12px" show-icon
      title="您是本族管理员：可录入/修改本族成员、关系与资料，管理族人账号。人员的查找与编辑可在家族首页搜索后进入档案页点击“编辑”。" />

    <el-tabs v-model="tab" style="margin-top: 12px">
      <el-tab-pane label="族谱信息" name="info">
        <el-card shadow="never">
          <el-form label-width="110px" style="max-width: 720px">
            <el-form-item label="族谱名称"><el-input v-model="info.name" /></el-form-item>
            <el-form-item label="姓氏"><el-input v-model="info.surname" style="width: 120px" /></el-form-item>
            <el-form-item label="堂号"><el-input v-model="info.hallName" /></el-form-item>
            <el-form-item label="郡望"><el-input v-model="info.origin" /></el-form-item>
            <el-form-item label="字辈诗"><el-input v-model="info.generationPoem" type="textarea" :rows="2" placeholder="如：文德光宗祖，诗书振家声" /></el-form-item>
            <el-form-item label="首字对应世代">
              <el-input-number v-model="info.poemStartGeneration" :min="1" />
              <span class="muted" style="margin-left: 8px">字辈诗第一个字从第几世开始使用</span>
            </el-form-item>
            <el-form-item label="始祖"><PersonPicker v-model="info.founderId" :clan-id="clanId" :initial="founderInit" /></el-form-item>
            <el-form-item label="公开范围">
              <el-radio-group v-model="info.visibility">
                <el-radio v-for="(l, k) in VISIBILITY_LABELS" :key="k" :value="k">{{ l }}</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="简介 / 谱序"><el-input v-model="info.description" type="textarea" :rows="4" /></el-form-item>
            <el-form-item><el-button type="danger" @click="saveInfo">保存</el-button></el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="族人账号与“我在谱中”" name="members">
        <el-card shadow="never">
          <div class="row" style="margin-bottom: 12px">
            <el-input v-model="newPhone" placeholder="族人手机号" style="width: 180px" />
            <div style="width: 240px"><PersonPicker v-model="newLink" :clan-id="clanId" placeholder="绑定谱中人物（选填）" /></div>
            <el-button type="danger" :disabled="!newPhone" @click="addMember">添加族人</el-button>
            <span class="muted">已注册用户登录即可查看；未注册用户会得到一次性激活码</span>
          </div>
          <el-table :data="members" size="small">
            <el-table-column label="手机号" prop="phone" width="140" />
            <el-table-column label="姓名" prop="displayName" width="140" />
            <el-table-column label="角色" width="110">
              <template #default="{ row }"><el-tag size="small" :type="row.role === 'admin' ? 'warning' : 'success'">{{ row.role === 'admin' ? '家族管理员' : '族人' }}</el-tag></template>
            </el-table-column>
            <el-table-column label="我在谱中（绑定人物）">
              <template #default="{ row }">
                <PersonPicker
                  :model-value="row.linkedPersonId"
                  :clan-id="clanId"
                  :initial="row.linkedPersonId ? { id: row.linkedPersonId, fullName: row.linkedPersonName } : null"
                  placeholder="未绑定"
                  @update:model-value="(v) => link(row, v)"
                />
              </template>
            </el-table-column>
            <el-table-column label="" width="90">
              <template #default="{ row }">
                <el-popconfirm v-if="row.role !== 'admin'" title="确定移除该族人？" @confirm="removeMember(row.id)">
                  <template #reference><el-button link type="danger">移除</el-button></template>
                </el-popconfirm>
                <el-tooltip v-else content="管理员由平台超级管理员任免"><span class="muted">—</span></el-tooltip>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="操作日志" name="logs">
        <el-card shadow="never"><AuditTable :data="logs" @page="loadLogs" /></el-card>
      </el-tab-pane>

      <el-tab-pane label="Excel 导入" name="import">
        <el-card shadow="never"><ImportPanel :clan-id="clanId" @imported="loadLogs()" /></el-card>
      </el-tab-pane>

      <el-tab-pane label="数据导出" name="export">
        <el-card shadow="never"><ExportPanel :clan-id="clanId" :clan-name="clan.name" /></el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { VISIBILITY_LABELS, type AuditLogEntry, type ClanWithRole, type Membership, type Paged } from '@zupu/shared';
import { ElMessageBox } from 'element-plus';
import { api, run } from '../api';
import AuditTable from '../components/AuditTable.vue';
import PersonPicker from '../components/PersonPicker.vue';
import ExportPanel from '../heritage/components/ExportPanel.vue';
import ImportPanel from '../heritage/components/ImportPanel.vue';

const route = useRoute();
const router = useRouter();
const clanId = route.params.clanId as string;
const tab = ref((route.query.tab as string) || 'info');
const clan = ref<ClanWithRole | null>(null);
const info = reactive<Record<string, any>>({});
const founderInit = ref<{ id: string; fullName: string } | null>(null);
const members = ref<Membership[]>([]);
const newPhone = ref('');
const newLink = ref<string | null>(null);
const logs = ref<Paged<AuditLogEntry>>({ items: [], total: 0, page: 1, pageSize: 20 });

async function loadMembers() {
  members.value = (await run(api.clans.members(clanId))) ?? [];
}
async function loadLogs(page = 1) {
  logs.value = (await run(api.clans.auditLogs(clanId, { page, pageSize: 20 }))) ?? logs.value;
}
onMounted(async () => {
  clan.value = (await run(api.clans.get(clanId))) ?? null;
  if (!clan.value) return;
  if (clan.value.myRole !== 'admin' && clan.value.myRole !== 'super') return router.replace(`/clans/${clanId}`);
  Object.assign(info, clan.value);
  if (clan.value.founderId) {
    const f = await run(api.persons.get(clan.value.founderId));
    if (f) founderInit.value = { id: f.id, fullName: f.fullName };
  }
  loadMembers();
  loadLogs();
});
watch(tab, (t) => {
  router.replace({ query: { tab: t } });
  if (t === 'logs') loadLogs();
});

async function saveInfo() {
  const { name, surname, hallName, origin, generationPoem, poemStartGeneration, description, visibility, founderId } = info;
  const r = await run(api.clans.update(clanId, { name, surname, hallName, origin, generationPoem, poemStartGeneration, description, visibility, founderId: founderId || null }), '已保存');
  if (r) Object.assign(info, r);
}
async function addMember() {
  const phone = newPhone.value.trim();
  const r = await run(api.clans.addMember(clanId, { phone, linkedPersonId: newLink.value }), '已添加');
  if (r) {
    if (r.activationCode)
      ElMessageBox.alert(`手机号 ${phone} 尚未注册。请把激活码 ${r.activationCode} 告知对方，注册时填写即可加入本族（30 天内有效）。`, '激活码', { confirmButtonText: '我已记下' });
    newPhone.value = '';
    newLink.value = null;
    loadMembers();
  }
}
async function link(row: Membership, v: string | null) {
  if (await run(api.memberships.update(row.id, { linkedPersonId: v }), v ? '已绑定' : '已解除绑定')) loadMembers();
}
async function removeMember(id: string) {
  await run(api.memberships.remove(id), '已移除');
  loadMembers();
}
</script>
