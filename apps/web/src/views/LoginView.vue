<template>
  <div class="bg">
    <el-card class="box" shadow="always">
      <h1 class="title-serif">族 谱</h1>
      <p class="muted" style="text-align: center; margin-top: -8px">慎终追远 · 敦宗睦族</p>
      <el-tabs v-model="tab" stretch>
        <el-tab-pane label="登录" name="login">
          <el-form @submit.prevent="login" label-position="top">
            <el-form-item label="手机号 / 邮箱"><el-input v-model="account" placeholder="请输入手机号" /></el-form-item>
            <el-form-item label="密码"><el-input v-model="password" type="password" show-password @keyup.enter="login" /></el-form-item>
            <el-button type="danger" style="width: 100%" :loading="busy" @click="login">登录</el-button>
          </el-form>
          <el-divider>其他方式</el-divider>
          <div class="row" style="justify-content: center">
            <el-tooltip content="小程序上线后支持微信登录（敬请期待）"><el-button disabled>微信登录</el-button></el-tooltip>
            <el-button text @click="router.push('/')">以访客身份浏览公开族谱</el-button>
          </div>
        </el-tab-pane>
        <el-tab-pane label="注册" name="register">
          <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px">
            家族管理员由平台指定。若管理员已用您的手机号登记，请填写对方提供的激活码，注册后即自动获得相应权限。
          </el-alert>
          <el-form label-position="top">
            <el-form-item label="手机号"><el-input v-model="phone" /></el-form-item>
            <el-form-item label="姓名（选填）"><el-input v-model="displayName" /></el-form-item>
            <el-form-item label="密码（至少 6 位）"><el-input v-model="password" type="password" show-password autocomplete="new-password" /></el-form-item>
            <el-form-item label="激活码（被任命为管理员或被邀请入族时，由管理员提供）"><el-input v-model="activationCode" maxlength="6" placeholder="6 位数字，未被邀请可不填" /></el-form-item>
            <el-button type="danger" style="width: 100%" :loading="busy" @click="register">注册并登录</el-button>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, run } from '../api';
import { useAuth } from '../stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useAuth();
const tab = ref('login');
const account = ref('');
const phone = ref('');
const password = ref('');
const displayName = ref('');
const activationCode = ref('');
const busy = ref(false);

async function done(r: Awaited<ReturnType<typeof api.auth.login>> | undefined) {
  if (!r) return;
  auth.setSession(r.token, r.user);
  router.push((route.query.redirect as string) || (r.user.isSuperAdmin ? '/super' : '/'));
}
async function login() {
  auth.logout();
  busy.value = true;
  await done(await run(api.auth.login(account.value.trim(), password.value)));
  busy.value = false;
}
async function register() {
  auth.logout();
  busy.value = true;
  await done(await run(api.auth.register(phone.value.trim(), password.value, displayName.value || undefined, activationCode.value.trim() || undefined)));
  busy.value = false;
}
</script>

<style scoped>
.bg {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 30% 20%, #a83232, #5a0f0f);
}
.box { width: 400px; }
h1 { text-align: center; color: var(--zp-red); letter-spacing: 12px; font-size: 34px; margin: 6px 0 12px; }
</style>
