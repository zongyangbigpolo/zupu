import { createHeritageApi, type ApiTransport, type GalleryMedia, type OralHistory } from '@zupu/shared';
import { ElMessage } from 'element-plus';
import { errorMessage, http } from '../api';

const transport: ApiTransport = async (req) => {
  const r = await http.request({ method: req.method, url: req.url, params: req.params, data: req.data });
  return r.data;
};

/** M2 内容与传承 API（相册、口述历史、纪念馆、文献、统计、搜索、导入导出、备份） */
export const heritage = createHeritageApi(transport);

/** 读取音视频时长与画面尺寸（浏览器端，用作媒体元数据） */
export function probeMedia(file: Blob): Promise<{ duration?: number; width?: number; height?: number }> {
  const type = file.type.split('/')[0];
  if (type !== 'video' && type !== 'audio') return Promise.resolve({});
  return new Promise((resolve) => {
    const el = document.createElement(type) as HTMLVideoElement;
    const url = URL.createObjectURL(file);
    const done = (v: { duration?: number; width?: number; height?: number }) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      // MediaRecorder 产生的 webm 时长可能为 Infinity
      const d = Number.isFinite(el.duration) ? Math.round(el.duration) : undefined;
      done({ duration: d, width: el.videoWidth || undefined, height: el.videoHeight || undefined });
    };
    el.onerror = () => done({});
    setTimeout(() => done({}), 5000);
    el.src = url;
  });
}

function form(file: Blob | null, fields: Record<string, unknown>, filename?: string) {
  const fd = new FormData();
  if (file) fd.append('file', file, filename ?? (file as File).name ?? 'file');
  for (const [k, v] of Object.entries(fields)) if (v != null && v !== '') fd.append(k, String(v));
  return fd;
}

export async function uploadGallery(personId: string, file: File, fields: { caption?: string; takenText?: string; description?: string } = {}) {
  const meta = await probeMedia(file);
  const r = await http.post<GalleryMedia>(heritage.gallery.uploadUrl(personId), form(file, { ...fields, ...meta }), { timeout: 600000 });
  return r.data;
}

export async function uploadOralHistory(
  personId: string,
  audio: Blob | null,
  fields: { title: string; narrator?: string; recordedText?: string; transcript?: string; duration?: number },
  filename?: string,
) {
  const meta = audio ? await probeMedia(audio) : {};
  const r = await http.post<OralHistory>(
    heritage.oralHistory.uploadUrl(personId),
    form(audio, { ...meta, ...fields, duration: fields.duration ?? meta.duration }, filename),
    { timeout: 600000 },
  );
  return r.data;
}

/** 带登录令牌下载文件 */
export async function downloadFile(url: string, fallbackName: string) {
  try {
    const r = await http.get(url, { responseType: 'blob', timeout: 600000 });
    const cd: string = r.headers['content-disposition'] ?? '';
    const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
    const name = m ? decodeURIComponent(m[1]) : fallbackName;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(r.data);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) {
    let msg = errorMessage(e);
    const data = (e as any)?.response?.data;
    if (data instanceof Blob) {
      try {
        msg = JSON.parse(await data.text()).message ?? msg;
      } catch {
        /* ignore */
      }
    }
    ElMessage.error(msg);
  }
}

export const fmtDuration = (s: number | null | undefined) => {
  if (s == null) return '';
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

export const fmtSize = (n: number | null | undefined) => {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};
