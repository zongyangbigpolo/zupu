// M4 小程序与互动：微信登录、族人通讯录、活动与通知、生日/忌日提醒。
// 独立于 api-client.ts，各端用同一个 transport 创建：createInteractionApi(transport)。
import type { ApiTransport } from './api-client.js';
import type { AuthResult, Paged, PersonBrief } from './types.js';

// ---------- 微信登录 ----------
export type WechatLoginResult =
  | ({ status: 'ok' } & AuthResult)
  /** 该微信尚未绑定账号：用 bindToken 调用 bind（手机号快速验证 或 手机号+密码/激活码） */
  | { status: 'need_bind'; bindToken: string };

export interface WechatBindInput {
  bindToken: string;
  /** 微信"手机号快速验证"组件返回的 code（推荐） */
  phoneCode?: string;
  /** 或：已有账号的手机号 + 密码 */
  phone?: string;
  password?: string;
  /** 被管理员预先登记、尚未设密码的手机号：激活码 + 新密码 */
  activationCode?: string;
  displayName?: string;
}

export interface WechatPublicConfig {
  /** 订阅消息模板 ID（未配置则为空） */
  templates: { reminder: string | null; activity: string | null };
  mock: boolean;
}

// ---------- 族人通讯录 ----------
export type ContactFieldKey = 'phone' | 'wechatId' | 'email' | 'address' | 'city' | 'work' | 'note';
/** members：本族已登录族人可见；admins：仅家族管理员可见；private：仅自己可见 */
export type ContactVisibility = 'members' | 'admins' | 'private';

export const CONTACT_FIELD_LABELS: Record<ContactFieldKey, string> = {
  phone: '手机',
  wechatId: '微信号',
  email: '邮箱',
  address: '住址',
  city: '现居城市',
  work: '工作单位',
  note: '备注',
};
export const CONTACT_FIELDS = Object.keys(CONTACT_FIELD_LABELS) as ContactFieldKey[];
export const CONTACT_VISIBILITY_LABELS: Record<ContactVisibility, string> = {
  members: '族人可见',
  admins: '仅管理员',
  private: '仅自己',
};

export type ContactFields = Partial<Record<ContactFieldKey, string | null>>;

export interface ContactCard {
  fields: ContactFields;
  visibility: Partial<Record<ContactFieldKey, ContactVisibility>>;
  updatedAt: string | null;
}

export interface ContactEntry {
  userId: string;
  displayName: string | null;
  role: 'admin' | 'member';
  linkedPerson: PersonBrief | null;
  /** 仅包含当前查看者可见的字段 */
  fields: ContactFields;
  isMe: boolean;
}

// ---------- 活动与公告 ----------
export type ActivityKind = 'activity' | 'announcement';
export type ActivityCategory = 'qingming' | 'xiupu' | 'zongqinhui' | 'other';
export type ActivityStatus = 'published' | 'cancelled';

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  qingming: '清明祭祖',
  xiupu: '修谱',
  zongqinhui: '宗亲会',
  other: '其他',
};
export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = { activity: '活动', announcement: '公告' };

export interface ActivityInput {
  kind: ActivityKind;
  category?: ActivityCategory;
  title: string;
  content?: string | null;
  location?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  signupDeadline?: string | null;
  maxParticipants?: number | null;
  allowSignup?: boolean;
  pinned?: boolean;
}

export interface Activity {
  id: string;
  clanId: string;
  kind: ActivityKind;
  category: ActivityCategory;
  title: string;
  content: string | null;
  location: string | null;
  startAt: string | null;
  endAt: string | null;
  signupDeadline: string | null;
  maxParticipants: number | null;
  allowSignup: boolean;
  pinned: boolean;
  status: ActivityStatus;
  createdAt: string;
  createdByName: string | null;
  /** 报名人数（按户数）与总人数（含携带家属） */
  signupCount: number;
  headcountTotal: number;
  checkedInCount: number;
  mySignup: ActivitySignup | null;
  /** 仅管理员可见：现场签到码 */
  checkinCode?: string | null;
}

export interface ActivitySignup {
  id: string;
  userId: string;
  displayName: string | null;
  linkedPersonName: string | null;
  headcount: number;
  note: string | null;
  status: 'signed' | 'cancelled';
  checkedInAt: string | null;
  createdAt: string;
}

export interface ActivityDetail extends Activity {
  signups: ActivitySignup[];
}

// ---------- 提醒与站内通知 ----------
export type ReminderKind = 'birth' | 'death';
export type CalendarType = 'solar' | 'lunar';
export const REMINDER_KIND_LABELS: Record<ReminderKind, string> = { birth: '生日', death: '忌日' };
export const CALENDAR_LABELS: Record<CalendarType, string> = { solar: '公历', lunar: '农历' };

export interface ReminderDate {
  id: string | null;
  personId: string;
  kind: ReminderKind;
  calendar: CalendarType;
  month: number;
  day: number;
  isLeapMonth: boolean;
  year: number | null;
  /** 来源：管理员设定 / 从人物档案的公历日期推算 */
  source: 'manual' | 'profile';
  /** 如"农历八月十五"、"公历 9月3日" */
  text: string;
}

export interface UpcomingReminder {
  person: PersonBrief;
  kind: ReminderKind;
  calendar: CalendarType;
  dateText: string;
  /** 下一次的公历日期 YYYY-MM-DD */
  nextDate: string;
  daysLeft: number;
  /** 周岁 / 逝世周年（知道年份时） */
  years: number | null;
}

export interface ReminderPref {
  enabled: boolean;
  birthday: boolean;
  deathAnniversary: boolean;
  activity: boolean;
  /** 提前几天提醒（当天另有一次） */
  daysBefore: number;
  wechat: boolean;
  /** 剩余可发送的微信订阅消息次数 */
  wechatQuota: { reminder: number; activity: number };
  wechatBound: boolean;
}

export type NotificationType = 'reminder' | 'activity' | 'announcement' | 'activity-reminder';

export interface AppNotification {
  id: string;
  clanId: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  /** 跳转目标，如 { kind: 'activity', id } / { kind: 'person', id } */
  link: { kind: 'activity' | 'person'; id: string } | null;
  readAt: string | null;
  createdAt: string;
}

export interface ReminderRunResult {
  date: string;
  notifications: number;
  wechatSent: number;
}

export function createInteractionApi(t: ApiTransport) {
  const get = <T>(url: string, params?: Record<string, unknown>) => t<T>({ method: 'GET', url, params });
  const post = <T>(url: string, data?: unknown) => t<T>({ method: 'POST', url, data });
  const patch = <T>(url: string, data?: unknown) => t<T>({ method: 'PATCH', url, data });
  const put = <T>(url: string, data?: unknown) => t<T>({ method: 'PUT', url, data });
  const del = <T>(url: string) => t<T>({ method: 'DELETE', url });

  return {
    wechat: {
      config: () => get<WechatPublicConfig>('/wechat/config'),
      login: (code: string) => post<WechatLoginResult>('/auth/wechat/login', { code }),
      bind: (data: WechatBindInput) => post<AuthResult>('/auth/wechat/bind', data),
      /** 已登录（如手机号+密码）后绑定当前微信 */
      bindCurrent: (code: string) => post<{ ok: true }>('/auth/wechat/bind-current', { code }),
      unbind: () => del<{ ok: true }>('/auth/wechat'),
      /** 用户在 wx.requestSubscribeMessage 中同意的模板 */
      addSubscriptions: (templateIds: string[]) => post<ReminderPref['wechatQuota']>('/wechat/subscriptions', { templateIds }),
    },
    contacts: {
      list: (clanId: string, params?: { q?: string }) => get<ContactEntry[]>(`/clans/${clanId}/contacts`, params),
      mine: (clanId: string) => get<ContactCard>(`/clans/${clanId}/contacts/me`),
      saveMine: (clanId: string, data: Pick<ContactCard, 'fields' | 'visibility'>) => put<ContactCard>(`/clans/${clanId}/contacts/me`, data),
    },
    activities: {
      list: (clanId: string, params?: { kind?: ActivityKind; page?: number; pageSize?: number }) =>
        get<Paged<Activity>>(`/clans/${clanId}/activities`, params),
      get: (id: string) => get<ActivityDetail>(`/activities/${id}`),
      create: (clanId: string, data: ActivityInput) => post<Activity>(`/clans/${clanId}/activities`, data),
      update: (id: string, data: Partial<ActivityInput> & { status?: ActivityStatus }) => patch<Activity>(`/activities/${id}`, data),
      remove: (id: string) => del<void>(`/activities/${id}`),
      signup: (id: string, data: { headcount?: number; note?: string | null } = {}) => post<ActivitySignup>(`/activities/${id}/signup`, data),
      cancelSignup: (id: string) => del<void>(`/activities/${id}/signup`),
      checkin: (id: string, code: string) => post<ActivitySignup>(`/activities/${id}/checkin`, { code }),
      adminCheckin: (id: string, userId: string) => post<ActivitySignup>(`/activities/${id}/signups/${userId}/checkin`),
    },
    reminders: {
      upcoming: (clanId: string, days = 30) => get<UpcomingReminder[]>(`/clans/${clanId}/reminders/upcoming`, { days }),
      dates: (personId: string) => get<ReminderDate[]>(`/persons/${personId}/reminder-dates`),
      setDate: (personId: string, kind: ReminderKind, data: { calendar: CalendarType; month: number; day: number; isLeapMonth?: boolean; year?: number | null }) =>
        put<ReminderDate>(`/persons/${personId}/reminder-dates/${kind}`, data),
      removeDate: (personId: string, kind: ReminderKind) => del<void>(`/persons/${personId}/reminder-dates/${kind}`),
      pref: (clanId: string) => get<ReminderPref>(`/clans/${clanId}/reminder-pref`),
      savePref: (clanId: string, data: Partial<Omit<ReminderPref, 'wechatQuota' | 'wechatBound'>>) =>
        put<ReminderPref>(`/clans/${clanId}/reminder-pref`, data),
      /** 超级管理员手动触发每日提醒任务（date 缺省为今天，北京时间） */
      run: (date?: string) => post<ReminderRunResult>('/admin/reminders/run', { date }),
    },
    notifications: {
      list: (params?: { unread?: boolean; page?: number; pageSize?: number }) => get<Paged<AppNotification>>('/notifications', params),
      unreadCount: () => get<{ count: number }>('/notifications/unread-count'),
      read: (id: string) => post<void>(`/notifications/${id}/read`),
      readAll: () => post<void>('/notifications/read-all'),
    },
  };
}

export type InteractionApi = ReturnType<typeof createInteractionApi>;
