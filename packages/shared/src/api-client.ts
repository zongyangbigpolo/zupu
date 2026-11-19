// 与传输层无关的 API 客户端：Web 端传入 axios/fetch 适配器，小程序传入 uni.request 适配器。
import type {
  AuditLogEntry,
  AuthResult,
  Clan,
  ClanAdminInfo,
  ClanStats,
  ClanWithRole,
  GenerationCheckResult,
  KinshipResult,
  LifeEvent,
  Marriage,
  Media,
  Membership,
  Paged,
  ParentChild,
  PersonDetail,
  PersonInput,
  PersonSaveResult,
  PersonSearchItem,
  TreeLine,
  TreeResponse,
  UserInfo,
} from './types.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ApiRequest {
  method: HttpMethod;
  url: string;
  params?: Record<string, unknown>;
  data?: unknown;
}

export type ApiTransport = <T>(req: ApiRequest) => Promise<T>;

export interface ParentLinkInput {
  parentId: string;
  relationType?: ParentChild['relationType'];
  isMainLine?: boolean;
}

export interface PersonCreateInput extends PersonInput {
  parents?: ParentLinkInput[];
}

export interface ClanCreateInput {
  name: string;
  surname: string;
  hallName?: string | null;
  origin?: string | null;
  generationPoem?: string | null;
  poemStartGeneration?: number;
  description?: string | null;
  visibility?: Clan['visibility'];
  adminPhone?: string | null;
}

export function createApiClient(t: ApiTransport) {
  const get = <T>(url: string, params?: Record<string, unknown>) => t<T>({ method: 'GET', url, params });
  const post = <T>(url: string, data?: unknown) => t<T>({ method: 'POST', url, data });
  const patch = <T>(url: string, data?: unknown) => t<T>({ method: 'PATCH', url, data });
  const put = <T>(url: string, data?: unknown) => t<T>({ method: 'PUT', url, data });
  const del = <T>(url: string) => t<T>({ method: 'DELETE', url });

  return {
    auth: {
      login: (account: string, password: string) => post<AuthResult>('/auth/login', { account, password }),
      register: (phone: string, password: string, displayName?: string) =>
        post<AuthResult>('/auth/register', { phone, password, displayName }),
      me: () => get<UserInfo>('/auth/me'),
    },
    clans: {
      list: () => get<ClanWithRole[]>('/clans'),
      get: (clanId: string) => get<ClanWithRole>(`/clans/${clanId}`),
      update: (clanId: string, data: Partial<ClanCreateInput> & { founderId?: string | null }) =>
        patch<Clan>(`/clans/${clanId}`, data),
      stats: (clanId: string) => get<ClanStats>(`/clans/${clanId}/stats`),
      generationCheck: (
        clanId: string,
        data: {
          generation?: number | null;
          generationChar?: string | null;
          givenName?: string | null;
          isExternal?: boolean;
          parentIds?: string[];
          personId?: string;
        },
      ) => post<GenerationCheckResult>(`/clans/${clanId}/generation-check`, data),
      searchPersons: (
        clanId: string,
        params: { q?: string; generation?: number; generationChar?: string; page?: number; pageSize?: number; includeExternal?: boolean },
      ) => get<Paged<PersonSearchItem>>(`/clans/${clanId}/persons`, params),
      createPerson: (clanId: string, data: PersonCreateInput) => post<PersonSaveResult>(`/clans/${clanId}/persons`, data),
      kinship: (clanId: string, from: string, to: string) => get<KinshipResult>(`/clans/${clanId}/kinship`, { from, to }),
      members: (clanId: string) => get<Membership[]>(`/clans/${clanId}/members`),
      addMember: (clanId: string, data: { phone: string; linkedPersonId?: string | null; displayName?: string }) =>
        post<Membership>(`/clans/${clanId}/members`, data),
      auditLogs: (clanId: string, params?: { page?: number; pageSize?: number }) =>
        get<Paged<AuditLogEntry>>(`/clans/${clanId}/audit-logs`, params),
      addParentChild: (clanId: string, data: Omit<ParentChild, 'id' | 'clanId' | 'sortOrder'> & { sortOrder?: number }) =>
        post<ParentChild>(`/clans/${clanId}/parent-child`, data),
      addMarriage: (clanId: string, data: Omit<Marriage, 'id' | 'clanId' | 'order' | 'startText' | 'endText' | 'note'> & Partial<Marriage>) =>
        post<Marriage>(`/clans/${clanId}/marriages`, data),
    },
    memberships: {
      update: (id: string, data: { linkedPersonId: string | null }) => patch<Membership>(`/memberships/${id}`, data),
      remove: (id: string) => del<void>(`/memberships/${id}`),
    },
    persons: {
      get: (id: string) => get<PersonDetail>(`/persons/${id}`),
      update: (id: string, data: Partial<PersonInput>) => patch<PersonSaveResult>(`/persons/${id}`, data),
      remove: (id: string) => del<void>(`/persons/${id}`),
      tree: (id: string, params: { up?: number; down?: number; line?: TreeLine } = {}) =>
        get<TreeResponse>(`/persons/${id}/tree`, params),
      addEvent: (id: string, data: Partial<LifeEvent> & { title: string }) => post<LifeEvent>(`/persons/${id}/events`, data),
      /** 上传需各端自行实现 multipart，这里只给出地址 */
      mediaUploadUrl: (id: string) => `/persons/${id}/media`,
      aiBiography: (id: string) => post<{ message: string }>(`/ai/persons/${id}/biography`),
    },
    relations: {
      updateParentChild: (id: string, data: Partial<ParentChild>) => patch<ParentChild>(`/parent-child/${id}`, data),
      removeParentChild: (id: string) => del<void>(`/parent-child/${id}`),
      updateMarriage: (id: string, data: Partial<Marriage>) => patch<Marriage>(`/marriages/${id}`, data),
      removeMarriage: (id: string) => del<void>(`/marriages/${id}`),
    },
    events: {
      update: (id: string, data: Partial<LifeEvent>) => patch<LifeEvent>(`/events/${id}`, data),
      remove: (id: string) => del<void>(`/events/${id}`),
    },
    media: {
      update: (id: string, data: { caption?: string | null }) => patch<Media>(`/media/${id}`, data),
      remove: (id: string) => del<void>(`/media/${id}`),
    },
    superAdmin: {
      clans: () => get<(Clan & { admins: ClanAdminInfo[]; personCount: number })[]>('/admin/clans'),
      createClan: (data: ClanCreateInput) => post<Clan>('/admin/clans', data),
      updateClan: (id: string, data: Partial<ClanCreateInput> & { status?: Clan['status'] }) =>
        patch<Clan>(`/admin/clans/${id}`, data),
      admins: (id: string) => get<ClanAdminInfo[]>(`/admin/clans/${id}/admins`),
      appointAdmin: (id: string, phone: string) => post<ClanAdminInfo>(`/admin/clans/${id}/admins`, { phone }),
      replaceAdmin: (id: string, phone: string) => put<ClanAdminInfo>(`/admin/clans/${id}/admins`, { phone }),
      revokeAdmin: (id: string, userId: string) => del<void>(`/admin/clans/${id}/admins/${userId}`),
      auditLogs: (params?: { page?: number; pageSize?: number; clanId?: string }) =>
        get<Paged<AuditLogEntry>>('/admin/audit-logs', params),
    },
    ai: {
      ocrImport: (clanId: string) => post<{ message: string }>(`/ai/clans/${clanId}/ocr-import`),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
