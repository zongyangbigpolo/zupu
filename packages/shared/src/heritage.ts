// M2 内容与传承：多媒体相册、口述历史、人物纪念馆、家族文献、统计看板、高级搜索、Excel 导入、备份导出。
// 独立于 M1 的 types.ts / api-client.ts，便于并行开发合并。
import type { ApiTransport } from './api-client.js';
import type { Gender, Media, MediaType, Paged, Person, PersonBrief, PersonSearchItem } from './types.js';

// ---------- 多媒体 ----------
export type MediaCategory = 'gallery' | 'oral_history';
export type TranscodeStatus = 'none' | 'pending' | 'done' | 'skipped' | 'failed';

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = { photo: '照片', video: '视频', audio: '音频', doc: '文档' };

export interface GalleryMedia extends Media {
  category: MediaCategory;
  /** 缩略图地址（照片生成；无缩略图时为 null，前端可退回原图） */
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  /** 拍摄/录制时间（原文，如"1985年春"） */
  takenText: string | null;
  description: string | null;
  sortOrder: number;
  transcodeStatus: TranscodeStatus;
}

export interface ClanGalleryItem extends GalleryMedia {
  person: PersonBrief;
}

export interface GalleryUpdateInput {
  caption?: string | null;
  takenText?: string | null;
  description?: string | null;
  sortOrder?: number;
}

// ---------- 口述历史 ----------
export interface OralHistory {
  id: string;
  clanId: string;
  personId: string;
  title: string;
  narrator: string | null;
  recordedText: string | null;
  transcript: string | null;
  audio: GalleryMedia | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClanOralHistory extends OralHistory {
  person: PersonBrief;
}

export interface OralHistoryInput {
  title: string;
  narrator?: string | null;
  recordedText?: string | null;
  transcript?: string | null;
}

// ---------- 人物纪念馆 ----------
export type TributeKind = 'flower' | 'candle';
export const TRIBUTE_LABELS: Record<TributeKind, string> = { flower: '献花', candle: '点烛' };

export interface MemorialMessage {
  id: string;
  personId: string;
  userId: string | null;
  authorName: string;
  content: string;
  createdAt: string;
  /** 当前用户是否可删除（作者本人或管理员） */
  canDelete: boolean;
}

export interface MemorialTributeStats {
  flower: number;
  candle: number;
  /** 当前用户今日是否已献花/点烛 */
  myFlowerToday: boolean;
  myCandleToday: boolean;
}

export interface MemorialInfo {
  person: Person;
  /** 享年（虚岁按传统 +1；无法计算时为 null） */
  ageAtDeath: number | null;
  photos: GalleryMedia[];
  videos: GalleryMedia[];
  audios: GalleryMedia[];
  oralHistories: OralHistory[];
  events: { id: string; title: string; eventText: string | null; eventDate: string | null; place: string | null; type: string | null; description: string | null }[];
  tributes: MemorialTributeStats;
  /** 是否可留言/献花（本族已登录族人） */
  canInteract: boolean;
  /** 是否可管理留言（家族管理员） */
  canModerate: boolean;
  /** 留言仅对本族族人可见 */
  messagesVisible: boolean;
}

// ---------- 家族文献 ----------
export type ClanDocumentKind = 'family_rules' | 'clan_rules' | 'preface' | 'conventions' | 'other';
export const CLAN_DOCUMENT_KIND_LABELS: Record<ClanDocumentKind, string> = {
  family_rules: '家训',
  clan_rules: '家规',
  preface: '谱序',
  conventions: '凡例',
  other: '其他',
};

export interface ClanDocument {
  id: string;
  clanId: string;
  kind: ClanDocumentKind;
  title: string;
  /** 富文本（HTML，前端渲染前需白名单过滤） */
  content: string | null;
  /** 竖排展示（古籍风格，从右至左） */
  vertical: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClanDocumentInput {
  kind?: ClanDocumentKind;
  title?: string;
  content?: string | null;
  vertical?: boolean;
  sortOrder?: number;
}

// ---------- 统计看板 ----------
export interface GenerationStat {
  generation: number;
  total: number;
  male: number;
  female: number;
  living: number;
  avgLifespan: number | null;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface ClanDashboard {
  total: number;
  /** 本族（非外姓）人数 */
  clanMembers: number;
  external: number;
  living: number;
  deceased: number;
  male: number;
  female: number;
  unknownGender: number;
  maxGeneration: number | null;
  /** 平均寿命（周岁，基于有生卒年份者） */
  avgLifespan: number | null;
  lifespanSamples: number;
  perGeneration: GenerationStat[];
  /** 寿命分布：0-9, 10-19, …, 90+ */
  lifespanBuckets: NamedCount[];
  /** 地域分布（按省份/地区，取出生地，缺失时取祖籍） */
  regions: NamedCount[];
  /** 出生年代分布（按世纪-半世纪） */
  birthPeriods: NamedCount[];
  mediaCounts: Record<MediaType, number>;
  oralHistoryCount: number;
  eventCount: number;
}

// ---------- 高级搜索 ----------
export interface AdvancedSearchQuery {
  /** 姓名 / 字 / 号 / 昵称 */
  q?: string;
  generationChar?: string;
  generationFrom?: number;
  generationTo?: number;
  gender?: Gender;
  living?: 'living' | 'deceased';
  /** 地区关键字：匹配祖籍、出生地、葬地 */
  region?: string;
  birthYearFrom?: number;
  birthYearTo?: number;
  deathYearFrom?: number;
  deathYearTo?: number;
  includeExternal?: boolean;
  sort?: 'generation' | 'birth' | 'name';
  page?: number;
  pageSize?: number;
}

export interface AdvancedSearchItem extends PersonSearchItem {
  ancestralHome: string | null;
  birthPlace: string | null;
  birthYear: number | null;
  deathYear: number | null;
}

// ---------- Excel 导入 ----------
/** Excel 模板列（顺序即模板列顺序）；导出 Excel 的"成员"表与此一致，可回导 */
export const IMPORT_COLUMNS = [
  { key: 'key', header: '编号', required: true, note: '本表内唯一编号，用于填写父母/配偶；也可填谱中已有人物的 ID' },
  { key: 'surname', header: '姓', required: true },
  { key: 'givenName', header: '名', required: true },
  { key: 'gender', header: '性别', note: '男 / 女 / 未知' },
  { key: 'generation', header: '世代', note: '数字，始祖为 1；留空则按父亲推算' },
  { key: 'generationChar', header: '字辈', note: '留空则按字辈诗推算' },
  { key: 'rankInSiblings', header: '排行', note: '数字，如 1、2' },
  { key: 'fatherKey', header: '父亲编号' },
  { key: 'motherKey', header: '母亲编号' },
  { key: 'spouseKeys', header: '配偶编号', note: '多个用 、或 , 分隔' },
  { key: 'relationType', header: '与父母关系', note: '亲生 / 收养 / 过继 / 兼祧，默认亲生' },
  { key: 'courtesyName', header: '字' },
  { key: 'artName', header: '号' },
  { key: 'nickname', header: '小名' },
  { key: 'birthText', header: '出生(原文)', note: '如：康熙三十年' },
  { key: 'birthDate', header: '出生日期', note: '公历 YYYY / YYYY-MM / YYYY-MM-DD' },
  { key: 'deathText', header: '卒(原文)' },
  { key: 'deathDate', header: '卒日期', note: '公历 YYYY / YYYY-MM / YYYY-MM-DD' },
  { key: 'isLiving', header: '在世', note: '是 / 否' },
  { key: 'ancestralHome', header: '祖籍' },
  { key: 'birthPlace', header: '出生地' },
  { key: 'burialPlace', header: '葬地' },
  { key: 'occupation', header: '职业' },
  { key: 'isExternal', header: '外姓', note: '是 / 否（嫁入、入赘的配偶填"是"）' },
  { key: 'biography', header: '生平' },
] as const;

export type ImportColumnKey = (typeof IMPORT_COLUMNS)[number]['key'];

export interface ImportRowPreview {
  /** Excel 行号（从 2 开始，1 为表头） */
  rowNo: number;
  key: string;
  fullName: string;
  gender: Gender;
  generation: number | null;
  generationChar: string | null;
  /** 系统推算/校验后实际写入的世代与字辈 */
  finalGeneration: number | null;
  finalGenerationChar: string | null;
  fatherKey: string | null;
  motherKey: string | null;
  spouseKeys: string[];
  /** create：新建；skip：谱中已存在（按 ID），仅用于关联 */
  action: 'create' | 'skip';
  errors: string[];
  warnings: string[];
  /** 解析后的人物字段（提交时使用） */
  data: Record<string, unknown>;
}

export interface ImportSummary {
  totalRows: number;
  toCreate: number;
  skipped: number;
  errorRows: number;
  warningRows: number;
  parentLinks: number;
  marriages: number;
}

export interface ImportPreview {
  batchId: string;
  fileName: string | null;
  status: 'preview' | 'committed' | 'discarded';
  summary: ImportSummary;
  rows: ImportRowPreview[];
  createdAt: string;
}

export interface ImportCommitResult {
  created: number;
  parentLinks: number;
  marriages: number;
}

// ---------- 备份 ----------
export interface BackupJob {
  id: string;
  trigger: 'scheduled' | 'manual';
  status: 'running' | 'success' | 'failed';
  method: string | null;
  size: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface BackupSettings {
  enabled: boolean;
  dailyAt: string;
  keepDays: number;
  method: string;
  nextRunAt: string | null;
}

// ---------- 工具 ----------
/** 解析公历日期文本：YYYY / YYYY-MM / YYYY-MM-DD（也接受 / . 年月日分隔） */
export function parseLooseDate(input: unknown): { date: string; precision: 'year' | 'month' | 'day' } | null {
  if (input == null || input === '') return null;
  if (input instanceof Date && !isNaN(input.getTime())) {
    return { date: input.toISOString().slice(0, 10), precision: 'day' };
  }
  const s = String(input).trim().replace(/[年月/.]/g, '-').replace(/日$/, '').replace(/-+$/, '');
  const m = /^(\d{3,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = m[2] ? Number(m[2]) : null;
  const d = m[3] ? Number(m[3]) : null;
  if (mo !== null && (mo < 1 || mo > 12)) return null;
  if (d !== null) {
    const dt = new Date(Date.UTC(y, mo! - 1, d));
    if (dt.getUTCMonth() !== mo! - 1) return null;
  }
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  return {
    date: `${pad(y, 4)}-${pad(mo ?? 1)}-${pad(d ?? 1)}`,
    precision: d !== null ? 'day' : mo !== null ? 'month' : 'year',
  };
}

const PROVINCES = [
  '北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东',
  '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾', '内蒙古', '广西', '西藏',
  '宁夏', '新疆', '香港', '澳门',
];

/** 从地址中提取省级地区（用于地域分布统计） */
export function regionOf(place: string | null | undefined): string | null {
  if (!place) return null;
  const s = place.trim();
  if (!s) return null;
  for (const p of PROVINCES) if (s.startsWith(p)) return p;
  for (const p of PROVINCES) if (s.includes(p)) return p;
  // 无省份时取第一级地名（如"湘潭县白石铺" → "湘潭县"）
  const m = /^(.{1,6}?(?:地区|自治州|盟|市|府|州|县|区))/.exec(s);
  return m ? m[1] : s.slice(0, 4);
}

export function createHeritageApi(t: ApiTransport) {
  const get = <T>(url: string, params?: Record<string, unknown>) => t<T>({ method: 'GET', url, params });
  const post = <T>(url: string, data?: unknown) => t<T>({ method: 'POST', url, data });
  const patch = <T>(url: string, data?: unknown) => t<T>({ method: 'PATCH', url, data });
  const del = <T>(url: string) => t<T>({ method: 'DELETE', url });
  return {
    gallery: {
      ofPerson: (personId: string, params?: { type?: MediaType }) => get<GalleryMedia[]>(`/persons/${personId}/gallery`, params),
      ofClan: (clanId: string, params?: { type?: MediaType; page?: number; pageSize?: number }) =>
        get<Paged<ClanGalleryItem>>(`/clans/${clanId}/gallery`, params),
      /** 上传需各端自行实现 multipart：字段 file、caption、takenText、description、duration、width、height */
      uploadUrl: (personId: string) => `/persons/${personId}/gallery`,
      update: (id: string, data: GalleryUpdateInput) => patch<GalleryMedia>(`/gallery/${id}`, data),
      remove: (id: string) => del<void>(`/gallery/${id}`),
    },
    oralHistory: {
      ofPerson: (personId: string) => get<OralHistory[]>(`/persons/${personId}/oral-histories`),
      ofClan: (clanId: string, params?: { page?: number; pageSize?: number; q?: string }) =>
        get<Paged<ClanOralHistory>>(`/clans/${clanId}/oral-histories`, params),
      /** multipart：字段 file（可选音频）、title、narrator、recordedText、transcript、duration */
      uploadUrl: (personId: string) => `/persons/${personId}/oral-histories`,
      update: (id: string, data: Partial<OralHistoryInput>) => patch<OralHistory>(`/oral-histories/${id}`, data),
      remove: (id: string) => del<void>(`/oral-histories/${id}`),
    },
    memorial: {
      get: (personId: string) => get<MemorialInfo>(`/persons/${personId}/memorial`),
      messages: (personId: string, params?: { page?: number; pageSize?: number }) =>
        get<Paged<MemorialMessage>>(`/persons/${personId}/memorial/messages`, params),
      postMessage: (personId: string, content: string) => post<MemorialMessage>(`/persons/${personId}/memorial/messages`, { content }),
      removeMessage: (id: string) => del<void>(`/memorial-messages/${id}`),
      tribute: (personId: string, kind: TributeKind) =>
        post<MemorialTributeStats & { already: boolean }>(`/persons/${personId}/memorial/tributes`, { kind }),
    },
    documents: {
      list: (clanId: string) => get<ClanDocument[]>(`/clans/${clanId}/documents`),
      get: (id: string) => get<ClanDocument>(`/documents/${id}`),
      create: (clanId: string, data: ClanDocumentInput & { kind: ClanDocumentKind; title: string }) =>
        post<ClanDocument>(`/clans/${clanId}/documents`, data),
      update: (id: string, data: ClanDocumentInput) => patch<ClanDocument>(`/documents/${id}`, data),
      remove: (id: string) => del<void>(`/documents/${id}`),
    },
    stats: {
      dashboard: (clanId: string) => get<ClanDashboard>(`/clans/${clanId}/dashboard`),
    },
    search: {
      advanced: (clanId: string, q: AdvancedSearchQuery) =>
        get<Paged<AdvancedSearchItem>>(`/clans/${clanId}/advanced-search`, q as Record<string, unknown>),
    },
    importer: {
      templateUrl: (clanId: string) => `/clans/${clanId}/import/template`,
      /** multipart：字段 file（.xlsx） */
      previewUrl: (clanId: string) => `/clans/${clanId}/import/preview`,
      get: (batchId: string) => get<ImportPreview>(`/import-batches/${batchId}`),
      commit: (batchId: string) => post<ImportCommitResult>(`/import-batches/${batchId}/commit`),
      discard: (batchId: string) => del<void>(`/import-batches/${batchId}`),
    },
    exporter: {
      /** 下载地址（需带登录令牌），format：xlsx | json */
      url: (clanId: string, format: 'xlsx' | 'json') => `/clans/${clanId}/export?format=${format}`,
    },
    backups: {
      list: () => get<{ settings: BackupSettings; items: BackupJob[] }>('/admin/backups'),
      run: () => post<BackupJob>('/admin/backups'),
      downloadUrl: (id: string) => `/admin/backups/${id}/download`,
    },
  };
}

export type HeritageApi = ReturnType<typeof createHeritageApi>;
