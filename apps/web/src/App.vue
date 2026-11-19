<template>
  <el-container style="min-height: 100%">
    <el-header v-if="route.path !== '/login'" class="hdr">
      <router-link to="/" class="logo title-serif">族 谱</router-link>
      <router-link to="/" class="nav">我的族谱</router-link>
      <router-link v-if="auth.isSuper" to="/super" class="nav">平台管理</router-link>
      <router-link v-if="auth.isSuper" to="/super/links" class="nav">连谱审批</router-link>
      <div class="grow" />
      <template v-if="auth.user">
        <el-tag v-if="auth.isSuper" type="danger" effect="dark" size="small">超级管理员</el-tag>
        <span class="user">{{ auth.user.displayName || auth.user.phone }}</span>
        <el-button text style="color: #f3e3c3" @click="logout">退出</el-button>
      </template>
      <el-button v-else text style="color: #f3e3c3" @click="router.push('/login')">登录</el-button>
    </el-header>
    <el-main style="padding: 0">
      <router-view :key="route.path" />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from './stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.hdr {
  display: flex;
  align-items: center;
  gap: 20px;
  background: linear-gradient(90deg, #6e1414, #8b1e1e);
  color: #f3e3c3;
  height: 54px;
}
.logo { font-size: 22px; letter-spacing: 4px; color: #f6d99b; font-weight: bold; }
.nav { color: #f3e3c3; font-size: 14px; }
.nav.router-link-exact-active { color: #fff; font-weight: 600; }
.user { font-size: 14px; }
</style>
