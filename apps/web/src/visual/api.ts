import { createVisualApi, type MapConfig, type PedigreeQuery } from '@zupu/shared';
import { errorMessage, http } from '../api';

/** M3 可视化 API（与主客户端相同的 axios 实例与令牌） */
export const visualApi = createVisualApi(async (req) => {
  const r = await http.request({ method: req.method, url: req.url, params: req.params, data: req.data });
  return r.data;
});

let mapConfigPromise: Promise<MapConfig> | null = null;
export function getMapConfig(): Promise<MapConfig> {
  mapConfigPromise ??= visualApi.mapConfig().catch(() => ({ provider: 'offline', key: null, securityJsCode: null }) as MapConfig);
  return mapConfigPromise;
}

export async function uploadSitePhoto(siteId: string, file: File, caption?: string) {
  const fd = new FormData();
  fd.append('file', file);
  if (caption) fd.append('caption', caption);
  return (await http.post(visualApi.sites.photoUploadUrl(siteId), fd)).data;
}

/** 下载吊线谱 PDF（带令牌，二进制） */
export async function downloadPedigreePdf(clanId: string, q: PedigreeQuery & { paper?: 'A4' | 'A3'; cover?: boolean }, filename: string) {
  try {
    const r = await http.get(visualApi.pedigreePdfUrl(clanId), { params: q, responseType: 'blob', timeout: 120000 });
    const url = URL.createObjectURL(r.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (e: any) {
    const blob = e?.response?.data;
    if (blob instanceof Blob) {
      try {
        const j = JSON.parse(await blob.text());
        throw new Error(Array.isArray(j.message) ? j.message.join('；') : j.message);
      } catch (inner) {
        if (inner instanceof Error && inner.message) throw inner;
      }
    }
    throw new Error(errorMessage(e));
  }
}
