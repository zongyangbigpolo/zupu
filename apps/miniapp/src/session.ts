import { reactive } from 'vue';
import type { AuthResult, UserInfo } from '@zupu/shared';

const TOKEN_KEY = 'zupu_token';
const USER_KEY = 'zupu_user';

/** 登录态（存于本地缓存） */
export const session = reactive({
  token: (uni.getStorageSync(TOKEN_KEY) as string) || '',
  user: (uni.getStorageSync(USER_KEY) as UserInfo | '') || null,
  get loggedIn() {
    return !!this.token;
  },
  set(r: AuthResult) {
    this.token = r.token;
    this.user = r.user;
    uni.setStorageSync(TOKEN_KEY, r.token);
    uni.setStorageSync(USER_KEY, r.user);
  },
  logout() {
    this.token = '';
    this.user = null;
    uni.removeStorageSync(TOKEN_KEY);
    uni.removeStorageSync(USER_KEY);
  },
});

export function requireLogin(): boolean {
  if (session.loggedIn) return true;
  uni.navigateTo({ url: '/pages/login/index' });
  return false;
}
