<template>
  <view class="wrap">
    <view class="brand">
      <view class="seal serif">族</view>
      <view class="title serif">族 谱</view>
      <view class="sub">慎终追远 · 敦亲睦族</view>
    </view>

    <!-- 第一步：微信登录 -->
    <view v-if="!bindToken" class="panel">
      <button v-if="wechatAvailable" class="btn wx" :loading="loading" @click="wechatLogin">微信一键登录</button>
      <view v-if="wechatAvailable" class="divider"><text>或使用手机号</text></view>
      <input class="input" v-model="phone" type="number" maxlength="11" placeholder="手机号" />
      <input class="input" v-model="password" password placeholder="密码" />
      <input v-if="mode === 'activate'" class="input" v-model="activationCode" type="number" maxlength="6" placeholder="管理员提供的 6 位激活码" />
      <input v-if="mode === 'activate'" class="input" v-model="displayName" placeholder="姓名（可选）" />
      <button class="btn" :loading="loading" @click="passwordLogin">{{ mode === 'activate' ? '激活并登录' : '登录' }}</button>
      <view class="switch muted" @click="mode = mode === 'login' ? 'activate' : 'login'">
        {{ mode === 'login' ? '首次使用？用激活码设置密码' : '已有密码，直接登录' }}
      </view>
    </view>

    <!-- 第二步：该微信尚未绑定账号 -->
    <view v-else class="panel">
      <view class="hint">首次使用微信登录，请绑定您在族谱中登记的手机号</view>
      <!-- #ifdef MP-WEIXIN -->
      <button class="btn wx" open-type="getPhoneNumber" @getphonenumber="onPhone">微信手机号快捷绑定</button>
      <!-- #endif -->
      <!-- #ifdef H5 -->
      <button v-if="mock" class="btn wx" @click="mockPhone">（开发模拟）授权手机号</button>
      <!-- #endif -->
      <view class="divider"><text>或输入手机号和密码 / 激活码</text></view>
      <input class="input" v-model="phone" type="number" maxlength="11" placeholder="手机号" />
      <input class="input" v-model="password" password :placeholder="mode === 'activate' ? '设置密码（至少 6 位）' : '密码'" />
      <input v-if="mode === 'activate'" class="input" v-model="activationCode" type="number" maxlength="6" placeholder="6 位激活码" />
      <button class="btn" :loading="loading" @click="bindWithPassword">绑定并登录</button>
      <view class="switch muted" @click="mode = mode === 'login' ? 'activate' : 'login'">
        {{ mode === 'login' ? '还没有密码？使用激活码' : '已有密码' }}
      </view>
      <view class="switch muted" @click="bindToken = ''">返回</view>
    </view>

    <view class="foot muted">仅家族管理员可录入和修改族谱，族人登录后可查看本族信息</view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { AuthResult } from '@zupu/shared';
import { api, m4, run } from '../../api';
import { session } from '../../session';

const phone = ref('');
const password = ref('');
const activationCode = ref('');
const displayName = ref('');
const mode = ref<'login' | 'activate'>('login');
const loading = ref(false);
const bindToken = ref('');
const mock = ref(false);
const wechatAvailable = ref(false);
// #ifdef MP-WEIXIN
wechatAvailable.value = true;
// #endif

onLoad(async () => {
  const cfg = await m4.wechat.config().catch(() => null);
  mock.value = !!cfg?.mock;
  // #ifdef H5
  wechatAvailable.value = mock.value; // H5 仅在开发模拟模式下演示微信登录流程
  // #endif
});

function done(r: AuthResult | undefined) {
  if (!r) return;
  session.set(r);
  uni.showToast({ title: '登录成功', icon: 'success' });
  setTimeout(() => {
    const pages = getCurrentPages();
    if (pages.length > 1) uni.navigateBack();
    else uni.switchTab({ url: '/pages/index/index' });
  }, 400);
}

function getWxCode(): Promise<string> {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => uni.login({ provider: 'weixin', success: (r) => resolve(r.code), fail: reject }));
  // #endif
  // #ifndef MP-WEIXIN
  let id = uni.getStorageSync('zupu_mock_wx') as string;
  if (!id) uni.setStorageSync('zupu_mock_wx', (id = 'h5-' + Math.random().toString(36).slice(2, 10)));
  return Promise.resolve(id);
  // #endif
}

async function wechatLogin() {
  loading.value = true;
  try {
    const code = await getWxCode();
    const r = await run(m4.wechat.login(code));
    if (r?.status === 'ok') done(r);
    else if (r?.status === 'need_bind') bindToken.value = r.bindToken;
  } catch {
    uni.showToast({ title: '微信登录失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function onPhone(e: any) {
  const code = e?.detail?.code;
  if (!code) return uni.showToast({ title: '未授权手机号', icon: 'none' });
  loading.value = true;
  done(await run(m4.wechat.bind({ bindToken: bindToken.value, phoneCode: code })));
  loading.value = false;
}

async function mockPhone() {
  uni.showModal({
    title: '模拟手机号授权',
    editable: true,
    placeholderText: '输入手机号',
    success: async (r) => {
      if (r.confirm && r.content) done(await run(m4.wechat.bind({ bindToken: bindToken.value, phoneCode: `mock-phone-${r.content.trim()}` })));
    },
  });
}

function validate() {
  if (!/^1\d{10}$/.test(phone.value)) return uni.showToast({ title: '请输入正确的手机号', icon: 'none' }), false;
  if (password.value.length < 6) return uni.showToast({ title: '密码至少 6 位', icon: 'none' }), false;
  if (mode.value === 'activate' && !/^\d{6}$/.test(activationCode.value)) return uni.showToast({ title: '请输入 6 位激活码', icon: 'none' }), false;
  return true;
}

async function passwordLogin() {
  if (!validate()) return;
  loading.value = true;
  done(
    await run(
      mode.value === 'activate'
        ? api.auth.register(phone.value, password.value, displayName.value || undefined, activationCode.value)
        : api.auth.login(phone.value, password.value),
    ),
  );
  loading.value = false;
}

async function bindWithPassword() {
  if (!validate()) return;
  loading.value = true;
  done(
    await run(
      m4.wechat.bind({
        bindToken: bindToken.value,
        phone: phone.value,
        password: password.value,
        activationCode: mode.value === 'activate' ? activationCode.value : undefined,
      }),
    ),
  );
  loading.value = false;
}
</script>

<style scoped>
.wrap { min-height: 100vh; background: linear-gradient(180deg, #8b1e1e 0, #8b1e1e 380rpx, #faf6ee 380rpx); padding: 0 40rpx; box-sizing: border-box; }
.brand { text-align: center; padding-top: 60rpx; color: #f6d99b; }
.seal { width: 120rpx; height: 120rpx; line-height: 120rpx; margin: 0 auto; border: 4rpx solid #f6d99b; border-radius: 16rpx; font-size: 64rpx; }
.title { font-size: 48rpx; letter-spacing: 16rpx; margin-top: 16rpx; }
.sub { font-size: 24rpx; opacity: 0.8; margin-top: 8rpx; letter-spacing: 4rpx; }
.panel { background: #fff; border-radius: 20rpx; padding: 40rpx 32rpx; margin-top: 60rpx; box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.08); }
.btn { margin-top: 8rpx; }
.wx { background: #07c160; }
.divider { text-align: center; color: #bbb; font-size: 24rpx; margin: 32rpx 0 24rpx; position: relative; }
.switch { text-align: center; margin-top: 24rpx; color: #8a6d3b; }
.hint { color: #6e1414; font-size: 26rpx; margin-bottom: 24rpx; line-height: 1.6; }
.foot { text-align: center; margin-top: 40rpx; line-height: 1.6; }
</style>
