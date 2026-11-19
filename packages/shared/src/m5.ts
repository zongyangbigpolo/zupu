// M5 扩展：跨家族连谱、GEDCOM 导入导出、AI 预留位的类型与 API 客户端。
// 单独成文件以免与其他里程碑并行修改 types.ts / api-client.ts 冲突。
import type { ApiTransport } from './api-client.js';
import type { KinshipResult, PersonBrief } from './types.js';

// ---------- 跨家族连谱 ----------
export type ClanLinkStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export const CLAN_LINK_STATUS_LABELS: Record<ClanLinkStatus, string> = {
  pending: '待对方同意',
  approved: '已连谱',
  rejected: '已拒绝',
  revoked: '已解除',
};

/** 连谱中展示的家族公开信息（不含成员数据） */
export interface ClanPublicBrief {
  id: string;
  name: string;
  surname: string;
  hallName: string | null;
  origin: string | null;
}

export interface ClanLinkSide {
  clan: ClanPublicBrief;
  /** 对应点人物（对方尚未同意时，对方一侧为 null） */
  person: PersonBrief | null;
}

export interface ClanLinkInfo {
  id: string;
  status: ClanLinkStatus;
  note: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  proposer: ClanLinkSide;
  target: ClanLinkSide;
  /** 相对于当前查看的家族：outgoing 为本族发起 */
  direction?: 'outgoing' | 'incoming';
  canApprove: boolean;
  canRevoke: boolean;
}

export interface ClanLinkLineageSide {
  clan: ClanPublicBrief;
  anchor: PersonBrief;
  /** 对应点人物向上的宗法主线祖先（父 → 祖 → …） */
  ancestors: PersonBrief[];
  /** 对应点人物的子女（本支的分支起点） */
  children: PersonBrief[];
  /** 对应点人物在本族的后代人数 */
  descendantCount: number;
}

export interface ClanLinkLineage {
  link: ClanLinkInfo;
  sides: [ClanLinkLineageSide, ClanLinkLineageSide];
  /** 两族世代编号差：target 世代 + offset = proposer 世代 */
  generationOffset: number;
}

export interface CrossClanKinshipResult extends KinshipResult {
  linkId: string;
  /** 路径上每个人所属的家族 id（对应点人物属于两族时给出 proposer 一方） */
  personClan: Record<string, string>;
  clans: ClanPublicBrief[];
}

export interface LinkedPersonItem extends PersonBrief {
  clanId: string;
}

// ---------- GEDCOM ----------
export interface GedcomIssue {
  line?: number;
  xref?: string;
  message: string;
}

export interface GedcomPreviewPerson {
  xref: string;
  fullName: string;
  gender: PersonBrief['gender'];
  generation: number | null;
  generationChar: string | null;
  courtesyName: string | null;
  birthText: string | null;
  deathText: string | null;
  isLiving: boolean;
  isExternal: boolean;
  parents: string[];
  spouses: string[];
  possibleDuplicate: boolean;
}

export interface GedcomPreview {
  header: { source: string | null; version: string | null; charset: string | null };
  stats: { persons: number; families: number; parentLinks: number; marriages: number; living: number; external: number; duplicates: number };
  persons: GedcomPreviewPerson[];
  errors: GedcomIssue[];
  warnings: GedcomIssue[];
  canImport: boolean;
}

export interface GedcomImportResult {
  imported: number;
  parentLinks: number;
  marriages: number;
  personIds: Record<string, string>;
}

// ---------- AI（预留） ----------
export type ImportDraftSource = 'ocr' | 'excel' | 'gedcom';
export type ImportDraftStatus = 'pending' | 'processing' | 'ready' | 'imported' | 'failed';

export interface ImportDraft {
  id: string;
  clanId: string;
  source: ImportDraftSource;
  status: ImportDraftStatus;
  error: string | null;
  createdAt: string;
}

export const AI_COMING_SOON = '敬请期待';

export function createM5Api(t: ApiTransport) {
  const get = <T>(url: string, params?: Record<string, unknown>) => t<T>({ method: 'GET', url, params });
  const post = <T>(url: string, data?: unknown) => t<T>({ method: 'POST', url, data });
  return {
    clanLinks: {
      list: (clanId: string) => get<ClanLinkInfo[]>(`/clans/${clanId}/links`),
      searchClans: (clanId: string, q: string) => get<ClanPublicBrief[]>(`/clans/${clanId}/link-candidates`, { q }),
      propose: (clanId: string, data: { targetClanId: string; personId: string; note?: string | null }) =>
        post<ClanLinkInfo>(`/clans/${clanId}/links`, data),
      pending: () => get<ClanLinkInfo[]>('/admin/clan-links'),
      approve: (id: string, data: { personId: string; note?: string | null }) => post<ClanLinkInfo>(`/clan-links/${id}/approve`, data),
      reject: (id: string, note?: string | null) => post<ClanLinkInfo>(`/clan-links/${id}/reject`, { note }),
      revoke: (id: string) => post<ClanLinkInfo>(`/clan-links/${id}/revoke`),
      lineage: (id: string) => get<ClanLinkLineage>(`/clan-links/${id}/lineage`),
      persons: (id: string, params: { clanId: string; q: string }) => get<LinkedPersonItem[]>(`/clan-links/${id}/persons`, params),
      kinship: (id: string, from: string, to: string) => get<CrossClanKinshipResult>(`/clan-links/${id}/kinship`, { from, to }),
    },
    gedcom: {
      /** 导出地址（需带令牌下载）；rootId 为空导出全族 */
      exportUrl: (clanId: string, rootId?: string | null) =>
        `/clans/${clanId}/gedcom` + (rootId ? `?rootId=${encodeURIComponent(rootId)}` : ''),
      /** 预览与导入需上传文件（multipart，字段名 file），这里只给出地址 */
      previewUrl: (clanId: string) => `/clans/${clanId}/gedcom/preview`,
      importUrl: (clanId: string) => `/clans/${clanId}/gedcom/import`,
    },
    ai: {
      importDrafts: (clanId: string) => get<ImportDraft[]>(`/clans/${clanId}/import-drafts`),
      ocrImport: (clanId: string) => post<{ message: string }>(`/ai/clans/${clanId}/ocr-import`),
      biography: (personId: string) => post<{ message: string }>(`/ai/persons/${personId}/biography`),
    },
  };
}

export type M5Api = ReturnType<typeof createM5Api>;
