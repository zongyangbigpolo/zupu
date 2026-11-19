import { createInteractionApi } from '@zupu/shared';
import { http } from './api';

/** M4 互动功能 API（通讯录、活动、提醒、通知），与小程序共用 @zupu/shared */
export const m4 = createInteractionApi(async (req) => {
  const r = await http.request({ method: req.method, url: req.url, params: req.params, data: req.data });
  return r.data;
});

export function fmtTime(s: string | null | undefined) {
  if (!s) return '—';
  const d = new Date(s);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
