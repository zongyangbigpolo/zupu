import { defineStore } from 'pinia';
import type { UserInfo } from '@zupu/shared';
import { api, TOKEN_KEY } from '../api';

export const useAuth = defineStore('auth', {
  state: () => ({ user: null as UserInfo | null, token: localStorage.getItem(TOKEN_KEY), loaded: false }),
  getters: {
    loggedIn: (s) => !!s.token,
    isSuper: (s) => !!s.user?.isSuperAdmin,
  },
  actions: {
    async load() {
      if (this.token && !this.user) {
        try {
          this.user = await api.auth.me();
        } catch (e: any) {
          // 只有令牌失效才退出登录；网络错误等保留会话
          if (e?.response?.status === 401) this.logout();
        }
      }
      this.loaded = true;
    },
    setSession(token: string, user: UserInfo) {
      this.token = token;
      this.user = user;
      localStorage.setItem(TOKEN_KEY, token);
    },
    logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem(TOKEN_KEY);
    },
  },
});
