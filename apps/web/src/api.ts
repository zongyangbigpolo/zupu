import axios, { AxiosError } from 'axios';
import { ElMessage } from 'element-plus';
import { createApiClient, type ApiTransport } from '@zupu/shared';

export const TOKEN_KEY = 'zupu_token';

export const http = axios.create({ baseURL: '/api', timeout: 30000 });

http.interceptors.request.use((cfg) => {
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export function errorMessage(e: unknown): string {
  const ax = e as AxiosError<{ message?: string | string[] }>;
  const m = ax.response?.data?.message;
  if (Array.isArray(m)) return m.join('；');
  return m || ax.message || '请求失败';
}

http.interceptors.response.use(
  (r) => r,
  (e: AxiosError) => {
    if (e.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY);
      location.href = '/login?redirect=' + encodeURIComponent(location.pathname + location.search);
    }
    return Promise.reject(e);
  },
);

const transport: ApiTransport = async (req) => {
  const r = await http.request({ method: req.method, url: req.url, params: req.params, data: req.data });
  return r.data;
};

/** Web 端 API 客户端（小程序端用同一个 createApiClient，传入 uni.request 适配器即可） */
export const api = createApiClient(transport);

/** 统一错误提示 */
export async function run<T>(p: Promise<T>, okMsg?: string): Promise<T | undefined> {
  try {
    const r = await p;
    if (okMsg) ElMessage.success(okMsg);
    return r;
  } catch (e) {
    ElMessage.error(errorMessage(e));
    return undefined;
  }
}

export async function uploadMedia(personId: string, file: File, caption?: string) {
  const fd = new FormData();
  fd.append('file', file);
  if (caption) fd.append('caption', caption);
  const r = await http.post(api.persons.mediaUploadUrl(personId), fd);
  return r.data;
}
