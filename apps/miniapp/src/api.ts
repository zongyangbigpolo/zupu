import { createApiClient, createInteractionApi, type ApiTransport } from '@zupu/shared';
import { session } from './session';

/** 后端地址：小程序必须配置 VITE_API_BASE（HTTPS、已备案、已加入 request 合法域名）；H5 默认走同源 /api */
export const BASE_URL = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function toQuery(params?: Record<string, unknown>) {
  if (!params) return '';
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

/** 基于 uni.request 的传输层，Web 与小程序共用 @zupu/shared 的 API 客户端 */
const transport: ApiTransport = (req) =>
  new Promise((resolve, reject) => {
    const header: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session.token) header.Authorization = `Bearer ${session.token}`;
    uni.request({
      url: BASE_URL + req.url + (req.method === 'GET' ? toQuery(req.params) : ''),
      method: req.method as any,
      data: req.method === 'GET' ? undefined : (req.data as any),
      header,
      timeout: 30000,
      success: (r) => {
        if (r.statusCode < 400) return resolve(r.data as any);
        const m = (r.data as any)?.message;
        const msg = Array.isArray(m) ? m.join('；') : m || `请求失败（${r.statusCode}）`;
        if (r.statusCode === 401 && session.token) session.logout();
        reject(new ApiError(r.statusCode, msg));
      },
      fail: (e) => reject(new ApiError(0, e.errMsg?.includes('timeout') ? '网络超时' : '网络异常，请稍后重试')),
    });
  });

export const api = createApiClient(transport);
export const m4 = createInteractionApi(transport);

/** 统一错误提示：失败返回 undefined */
export async function run<T>(p: Promise<T>, okMsg?: string): Promise<T | undefined> {
  try {
    const r = await p;
    if (okMsg) uni.showToast({ title: okMsg, icon: 'success' });
    return r;
  } catch (e) {
    uni.showToast({ title: (e as Error).message || '请求失败', icon: 'none', duration: 2500 });
    return undefined;
  }
}

export function fmtTime(s: string | null | undefined) {
  if (!s) return '—';
  const d = new Date(s);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
