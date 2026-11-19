// M3 可视化：迁徙地图、祠堂/祖坟/祖屋、家族时间轴、吊线谱的共享类型与 API 客户端。
import type { ApiTransport } from './api-client.js';
import type { DatePrecision, Gender, RelationType } from './types.js';

export type SiteType = 'ancestral_hall' | 'tomb' | 'ancestral_house' | 'other';
export const SITE_TYPE_LABELS: Record<SiteType, string> = {
  ancestral_hall: '祠堂',
  tomb: '祖坟',
  ancestral_house: '祖屋',
  other: '其他',
};
export const SITE_TYPE_COLORS: Record<SiteType, string> = {
  ancestral_hall: '#8b1e1e',
  tomb: '#4d5b6b',
  ancestral_house: '#b7791f',
  other: '#2f855a',
};

/** 地图服务：高德 / 腾讯（需配置 key）；未配置时使用离线 ECharts 中国地图 */
export type MapProvider = 'amap' | 'tencent' | 'offline';
export interface MapConfig {
  provider: MapProvider;
  key: string | null;
  /** 高德 JS API 2.0 安全密钥（securityJsCode） */
  securityJsCode: string | null;
}

/** 坐标统一使用 GCJ-02（高德、腾讯地图同一坐标系） */
export interface PlacePoint {
  name: string;
  lng: number | null;
  lat: number | null;
}

/** 模糊日期：年（可为负，表示公元前）+ 可选精确日期 + 精度 + 原文 */
export interface FuzzyDate {
  year: number | null;
  date: string | null;
  datePrecision: DatePrecision | null;
  dateText: string | null;
}

export interface MigrationRecord extends FuzzyDate {
  id: string;
  clanId: string;
  personId: string | null;
  personName: string | null;
  personGeneration: number | null;
  /** 支系名称，如"长房""湘乡支" */
  branchName: string | null;
  from: PlacePoint;
  to: PlacePoint;
  reason: string | null;
  sortOrder: number;
}

export interface MigrationInput {
  personId?: string | null;
  branchName?: string | null;
  fromPlace: string;
  fromLng?: number | null;
  fromLat?: number | null;
  toPlace: string;
  toLng?: number | null;
  toLat?: number | null;
  year?: number | null;
  date?: string | null;
  datePrecision?: DatePrecision | null;
  dateText?: string | null;
  reason?: string | null;
  sortOrder?: number;
}

export interface SitePhoto {
  id: string;
  caption: string | null;
  url: string;
}

export interface SitePersonBrief {
  id: string;
  fullName: string;
  generation: number | null;
}

export interface Site {
  id: string;
  clanId: string;
  type: SiteType;
  name: string;
  address: string | null;
  lng: number | null;
  lat: number | null;
  /** 简介（富文本） */
  intro: string | null;
  /** 始建/修缮年代原文 */
  builtText: string | null;
  sortOrder: number;
  persons: SitePersonBrief[];
  photos: SitePhoto[];
}

export interface SiteInput {
  type: SiteType;
  name: string;
  address?: string | null;
  lng?: number | null;
  lat?: number | null;
  intro?: string | null;
  builtText?: string | null;
  sortOrder?: number;
  personIds?: string[];
}

/** 家族大事记（家族层面的事件，人物事迹见 LifeEvent） */
export interface ChronicleEntry extends FuzzyDate {
  id: string;
  clanId: string;
  title: string;
  place: string | null;
  description: string | null;
  personId: string | null;
  personName: string | null;
}

export interface ChronicleInput {
  title: string;
  year?: number | null;
  date?: string | null;
  datePrecision?: DatePrecision | null;
  dateText?: string | null;
  place?: string | null;
  description?: string | null;
  personId?: string | null;
}

export type TimelineKind = 'chronicle' | 'event' | 'migration' | 'birth' | 'death';
export const TIMELINE_KIND_LABELS: Record<TimelineKind, string> = {
  chronicle: '家族大事',
  event: '人物事迹',
  migration: '迁徙',
  birth: '出生',
  death: '逝世',
};

export interface TimelineItem {
  kind: TimelineKind;
  /** 来源记录 id（出生/逝世为人物 id） */
  id: string;
  year: number;
  dateText: string | null;
  title: string;
  description: string | null;
  place: string | null;
  type: string | null;
  personId: string | null;
  personName: string | null;
}

export interface TimelineResponse {
  items: TimelineItem[];
  truncated: boolean;
}

export type PedigreeStyle = 'ou' | 'su';
export const PEDIGREE_STYLE_LABELS: Record<PedigreeStyle, string> = { ou: '欧式（五世一提）', su: '苏式（垂珠吊线）' };

export interface PedigreePerson {
  id: string;
  parentId: string | null;
  surname: string;
  givenName: string;
  gender: Gender;
  generation: number | null;
  generationChar: string | null;
  rankInSiblings: number | null;
  courtesyName: string | null;
  artName: string | null;
  birthText: string | null;
  deathText: string | null;
  burialPlace: string | null;
  /** 配偶（含前缀），如"配王氏""继配刘氏""适张国栋" */
  spouses: string[];
  /** 与上线的关系（过继、兼祧等；亲生为 null） */
  relationType: RelationType | null;
  isLiving: boolean;
  sortOrder: number;
}

export interface PedigreeResponse {
  clan: { id: string; name: string; surname: string; hallName: string | null };
  rootId: string;
  generations: number;
  persons: PedigreePerson[];
  truncated: boolean;
}

export interface PedigreeQuery {
  rootId: string;
  generations?: number;
  style?: PedigreeStyle;
  /** 是否收录女儿（默认收录，女儿后代有数据即入谱） */
  daughters?: boolean;
}

export function createVisualApi(t: ApiTransport) {
  const get = <T>(url: string, params?: Record<string, unknown>) => t<T>({ method: 'GET', url, params });
  const post = <T>(url: string, data?: unknown) => t<T>({ method: 'POST', url, data });
  const patch = <T>(url: string, data?: unknown) => t<T>({ method: 'PATCH', url, data });
  const del = <T>(url: string) => t<T>({ method: 'DELETE', url });
  return {
    mapConfig: () => get<MapConfig>('/maps/config'),
    migrations: {
      list: (clanId: string, params: { branchRootId?: string; personId?: string } = {}) =>
        get<MigrationRecord[]>(`/clans/${clanId}/migrations`, params),
      create: (clanId: string, data: MigrationInput) => post<MigrationRecord>(`/clans/${clanId}/migrations`, data),
      update: (id: string, data: Partial<MigrationInput>) => patch<MigrationRecord>(`/migrations/${id}`, data),
      remove: (id: string) => del<void>(`/migrations/${id}`),
    },
    sites: {
      list: (clanId: string, params: { type?: SiteType } = {}) => get<Site[]>(`/clans/${clanId}/sites`, params),
      get: (id: string) => get<Site>(`/sites/${id}`),
      create: (clanId: string, data: SiteInput) => post<Site>(`/clans/${clanId}/sites`, data),
      update: (id: string, data: Partial<SiteInput>) => patch<Site>(`/sites/${id}`, data),
      remove: (id: string) => del<void>(`/sites/${id}`),
      /** 上传需各端自行实现 multipart，这里只给出地址 */
      photoUploadUrl: (id: string) => `/sites/${id}/photos`,
      removePhoto: (photoId: string) => del<void>(`/site-photos/${photoId}`),
    },
    chronicles: {
      list: (clanId: string) => get<ChronicleEntry[]>(`/clans/${clanId}/chronicles`),
      create: (clanId: string, data: ChronicleInput) => post<ChronicleEntry>(`/clans/${clanId}/chronicles`, data),
      update: (id: string, data: Partial<ChronicleInput>) => patch<ChronicleEntry>(`/chronicles/${id}`, data),
      remove: (id: string) => del<void>(`/chronicles/${id}`),
    },
    timeline: (clanId: string, params: { branchRootId?: string; personId?: string; lifeSpans?: boolean } = {}) =>
      get<TimelineResponse>(`/clans/${clanId}/timeline`, params),
    pedigree: (clanId: string, q: PedigreeQuery) => get<PedigreeResponse>(`/clans/${clanId}/pedigree`, { ...q }),
    /** PDF 需带登录令牌下载（二进制），这里只给出地址 */
    pedigreePdfUrl: (clanId: string) => `/clans/${clanId}/pedigree.pdf`,
  };
}

export type VisualApi = ReturnType<typeof createVisualApi>;

/** 一键导航链接（GCJ-02 坐标） */
export function navigationLinks(name: string, lng: number, lat: number, tencentKey?: string | null) {
  const n = encodeURIComponent(name);
  return {
    amap: `https://uri.amap.com/navigation?to=${lng},${lat},${n}&mode=car&coordinate=gaode&callnative=1&src=zupu`,
    amapMarker: `https://uri.amap.com/marker?position=${lng},${lat}&name=${n}&coordinate=gaode&callnative=1&src=zupu`,
    tencent: `https://apis.map.qq.com/uri/v1/routeplan?type=drive&to=${n}&tocoord=${lat},${lng}&policy=0&referer=${encodeURIComponent(tencentKey || 'zupu')}`,
  };
}

/** 年份字符串：负数显示为"公元前N年" */
export function fuzzyDateText(d: FuzzyDate): string {
  if (d.dateText) return d.dateText;
  if (d.date) return d.date;
  if (d.year == null) return '年代不详';
  const y = d.year < 0 ? `公元前${-d.year}年` : `${d.year}年`;
  return d.datePrecision === 'approx' ? `约${y}` : y;
}
