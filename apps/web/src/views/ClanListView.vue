<template>
  <div class="page">
    <div class="row" style="margin-bottom: 16px">
      <h2 class="title-serif grow" style="margin: 0">{{ auth.loggedIn ? '我的族谱' : '公开族谱' }}</h2>
      <el-button v-if="auth.isSuper" type="danger" @click="router.push('/super')">平台管理</el-button>
    </div>
    <el-empty v-if="!loading && !clans.length" description="暂无可查看的族谱。请联系家族管理员把您加入家族。" />
    <el-row :gutter="16" v-loading="loading">
      <el-col v-for="c in clans" :key="c.id" :xs="24" :sm="12" :md="8">
        <el-card shadow="hover" class="clan" @click="router.push(`/clans/${c.id}`)">
          <div class="hall title-serif">{{ c.hallName || c.surname + '氏' }}</div>
          <div class="name">{{ c.name }}</div>
          <div class="row" style="margin-top: 10px">
            <el-tag size="small" :type="roleType(c.myRole)">{{ ROLE_LABELS[c.myRole] }}</el-tag>
            <el-tag size="small" type="info">{{ VISIBILITY_LABELS[c.visibility] }}</el-tag>
            <el-tag v-if="c.status === 'disabled'" size="small" type="danger">已停用</el-tag>
            <span class="muted">{{ c.personCount }} 人</span>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ROLE_LABELS, VISIBILITY_LABELS, type ClanWithRole, type EffectiveRole } from '@zupu/shared';
import { api, run } from '../api';
import { useAuth } from '../stores/auth';

const router = useRouter();
const auth = useAuth();
const clans = ref<ClanWithRole[]>([]);
const loading = ref(true);
const roleType = (r: EffectiveRole) => (r === 'super' ? 'danger' : r === 'admin' ? 'warning' : r === 'member' ? 'success' : 'info');
onMounted(async () => {
  clans.value = (await run(api.clans.list())) ?? [];
  loading.value = false;
});
</script>

<style scoped>
.clan { cursor: pointer; margin-bottom: 16px; border-top: 4px solid var(--zp-red); }
.hall { font-size: 26px; color: var(--zp-red); }
.name { font-size: 15px; margin-top: 4px; }
</style>
