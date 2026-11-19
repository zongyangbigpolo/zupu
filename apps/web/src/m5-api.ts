import { createM5Api } from '@zupu/shared';
import { http } from './api';

/** M5 扩展接口（连谱、GEDCOM、AI 预留），复用同一个 axios 实例与令牌 */
export const m5api = createM5Api(async (req) => {
  const r = await http.request({ method: req.method, url: req.url, params: req.params, data: req.data });
  return r.data;
});

export async function uploadGedcom<T>(url: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await http.post(url, fd, { timeout: 120000 });
  return r.data;
}

/** 带令牌下载 GEDCOM 文件 */
export async function downloadGedcom(url: string, fallbackName: string) {
  const r = await http.get(url, { responseType: 'blob', timeout: 120000 });
  const cd: string = r.headers['content-disposition'] ?? '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(r.data);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
