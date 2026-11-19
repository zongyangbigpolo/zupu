<template>
  <div class="page">
    <div class="row">
      <h2 class="title-serif grow" style="margin: 0">平台管理 <small class="muted">超级管理员</small></h2>
      <el-button type="danger" :icon="'Plus'" @click="openCreate">创建家族</el-button>
    </div>
    <el-alert type="info" :closable="false" show-icon style="margin: 12px 0"
      title="两级管理：超级管理员创建/停用家族，并按手机号任命、更换、撤销各家族管理员；家族管理员只能看到并管理自己的家族。" />

    <el-tabs v-model="tab">
      <el-tab-pane label="家族列表" name="clans">
        <el-table :data="clans" v-loading="loading" border>
          <el-table-column label="族谱" min-width="190">
            <template #default="{ row }">
              <router-link :to="`/clans/${row.id}`" class="clan-link">{{ row.name }}</router-link>
              <div class="muted">{{ row.hallName || '—' }} · {{ row.surname }}氏</div>
            </template>
          </el-table-column>
          <el-table-column label="人数" prop="personCount" width="70" align="center" />
          <el-table-column label="公开范围" width="90">
            <template #default="{ row }">{{ VISIBILITY_LABELS[row.visibility as ClanVisibility] }}</template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">{{ row.status === 'active' ? '启用' : '已停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="家族管理员" min-width="220">
            <template #default="{ row }">
              <div v-for="a in row.admins" :key="a.userId" class="row" style="gap: 6px">
                <span>{{ a.phone }}</span>
                <span class="muted">{{ a.displayName }}</span>
                <el-tag v-if="!a.hasPassword" size="small" type="info">待激活</el-tag>
              </div>
              <span v-if="!row.admins.length" class="muted">未任命</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="230">
            <template #default="{ row }">
              <el-button size="small" type="warning" plain @click="openAdmins(row)">任免管理员</el-button>
              <el-popconfirm
                :title="row.status === 'active' ? '停用后该家族对所有人（除超级管理员）不可见，确定？' : '确定启用？'"
                @confirm="toggle(row)"
              >
                <template #reference>
                  <el-button size="small" :type="row.status === 'active' ? 'danger' : 'success'" plain>{{ row.status === 'active' ? '停用' : '启用' }}</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="全平台操作日志" name="logs">
        <div class="row" style="margin-bottom: 8px">
          <el-select v-model="logClan" clearable placeholder="全部家族" style="width: 220px" @change="loadLogs(1)">
            <el-option v-for="c in clans" :key="c.id" :value="c.id" :label="c.name" />
          </el-select>
        </div>
        <AuditTable :data="logs" show-clan @page="loadLogs" />
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="createVisible" title="创建家族" width="560px">
      <el-form label-width="110px">
        <el-form-item label="族谱名称" required><el-input v-model="nc.name" placeholder="如：颍川堂陈氏·长沙支" /></el-form-item>
        <el-form-item label="姓氏" required><el-input v-model="nc.surname" style="width: 120px" /></el-form-item>
        <el-form-item label="堂号"><el-input v-model="nc.hallName" /></el-form-item>
        <el-form-item label="郡望"><el-input v-model="nc.origin" /></el-form-item>
        <el-form-item label="字辈诗"><el-input v-model="nc.generationPoem" type="textarea" /></el-form-item>
        <el-form-item label="公开范围">
          <el-radio-group v-model="nc.visibility">
            <el-radio v-for="(l, k) in VISIBILITY_LABELS" :key="k" :value="k">{{ l }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="管理员手机号"><el-input v-model="nc.adminPhone" placeholder="选填，可稍后任命" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="danger" :disabled="!nc.name || !nc.surname" @click="create">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="adminVisible" :title="`任免家族管理员 · ${current?.name ?? ''}`" width="560px">
      <el-table :data="current?.admins ?? []" size="small">
        <el-table-column label="手机号" prop="phone" />
        <el-table-column label="姓名" prop="displayName" />
        <el-table-column label="状态"><template #default="{ row }">{{ row.hasPassword ? '已激活' : '待注册激活' }}</template></el-table-column>
        <el-table-column label="" width="80">
          <template #default="{ row }">
            <el-popconfirm title="撤销后该用户降为普通族人，确定？" @confirm="revoke(row.userId)">
              <template #reference><el-button link type="danger">撤销</el-button></template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <el-divider />
      <div class="row">
        <el-input v-model="adminPhone" placeholder="输入手机号" style="width: 200px" />
        <el-button type="danger" :disabled="!adminPhone" @click="appoint">任命为管理员</el-button>
        <el-popconfirm title="将撤销现有全部管理员，并任命该手机号，确定？" @confirm="replace">
          <template #reference><el-button type="warning" :disabled="!adminPhone">更换管理员</el-button></template>
        </el-popconfirm>
      </div>
      <p class="muted">对方未注册也可任命：系统会生成一次性激活码，对方用该手机号注册时填写即可获得权限；已注册用户登录后直接生效。</p>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { VISIBILITY_LABELS, type AuditLogEntry, type Clan, type ClanAdminInfo, type ClanVisibility, type Paged } from '@zupu/shared';
import type { ClanCreateInput } from '@zupu/shared';
import { ElMessageBox } from 'element-plus';
import { api, run } from '../api';
import AuditTable from '../components/AuditTable.vue';

type Row = Clan & { admins: ClanAdminInfo[]; personCount: number };
const tab = ref('clans');
const clans = ref<Row[]>([]);
const loading = ref(false);
const createVisible = ref(false);
const adminVisible = ref(false);
const current = ref<Row | null>(null);
const adminPhone = ref('');
const nc = reactive<ClanCreateInput>({ name: '', surname: '', visibility: 'private' });
const logs = ref<Paged<AuditLogEntry>>({ items: [], total: 0, page: 1, pageSize: 20 });
const logClan = ref<string | undefined>();

async function load() {
  loading.value = true;
  clans.value = (await run(api.superAdmin.clans())) ?? [];
  if (current.value) current.value = clans.value.find((c) => c.id === current.value!.id) ?? null;
  loading.value = false;
}
async function loadLogs(page = 1) {
  logs.value = (await run(api.superAdmin.auditLogs({ page, pageSize: 20, clanId: logClan.value || undefined }))) ?? logs.value;
}
onMounted(load);
watch(tab, (t) => t === 'logs' && loadLogs(1));

function openCreate() {
  Object.assign(nc, { name: '', surname: '', hallName: '', origin: '', generationPoem: '', visibility: 'private', adminPhone: '' });
  createVisible.value = true;
}
async function create() {
  const body = { ...nc, adminPhone: nc.adminPhone || null };
  const r = await run(api.superAdmin.createClan(body), '家族已创建');
  if (r) {
    createVisible.value = false;
    load();
    showCode(body.adminPhone, r.adminActivationCode);
  }
}
function openAdmins(row: Row) {
  current.value = row;
  adminPhone.value = '';
  adminVisible.value = true;
}
function showCode(phone: string | null | undefined, code: string | null | undefined) {
  if (!code) return;
  ElMessageBox.alert(
    `手机号 ${phone} 尚未注册。请把激活码 ${code} 告知对方：用该手机号在"注册"页填写激活码即可获得管理员权限（30 天内有效）。`,
    '激活码',
    { confirmButtonText: '我已记下' },
  );
}
async function appoint() {
  const phone = adminPhone.value.trim();
  const r = await run(api.superAdmin.appointAdmin(current.value!.id, phone), '已任命');
  if (r) {
    adminPhone.value = '';
    load();
    showCode(phone, r.activationCode);
  }
}
async function replace() {
  const phone = adminPhone.value.trim();
  const r = await run(api.superAdmin.replaceAdmin(current.value!.id, phone), '已更换');
  if (r) {
    adminPhone.value = '';
    load();
    showCode(phone, r.activationCode);
  }
}
async function revoke(userId: string) {
  await run(api.superAdmin.revokeAdmin(current.value!.id, userId), '已撤销');
  load();
}
async function toggle(row: Row) {
  await run(api.superAdmin.updateClan(row.id, { status: row.status === 'active' ? 'disabled' : 'active' }), '已更新');
  load();
}
</script>

<style scoped>
.clan-link { color: var(--zp-red); font-weight: 600; }
</style>
