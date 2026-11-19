// 族谱系统共享类型（API 契约）。Web、小程序、后端共用。

export type Gender = 'male' | 'female' | 'unknown';
export type DatePrecision = 'day' | 'month' | 'year' | 'approx';
export type PrivacyLevel = 'public' | 'members' | 'admins';
export type ClanVisibility = 'public' | 'private' | 'invite';
export type ClanStatus = 'active' | 'disabled';
export type ClanRole = 'admin' | 'member';
/** 当前用户在某家族中的有效角色 */
export type EffectiveRole = 'super' | 'admin' | 'member' | 'visitor';
/** 亲子关系类型：亲生 / 收养 / 过继（承嗣） / 兼祧 */
export type RelationType = 'biological' | 'adopted' | 'heir' | 'jiantiao';
/** 婚姻类型：元配 / 继配 / 侧室 / 其他 */
export type MarriageType = 'principal' | 'successor' | 'concubine' | 'other';
export type MediaType = 'photo' | 'video' | 'audio' | 'doc';
export type TreeLine = 'main' | 'birth';

export const GENDER_LABELS: Record<Gender, string> = { male: '男', female: '女', unknown: '未知' };
export const RELATION_TYPE_LABELS: Record<RelationType, string> = {
  biological: '亲生',
  adopted: '收养',
  heir: '过继',
  jiantiao: '兼祧',
};
export const MARRIAGE_TYPE_LABELS: Record<MarriageType, string> = {
  principal: '元配',
  successor: '继配',
  concubine: '侧室',
  other: '其他',
};
export const PRIVACY_LABELS: Record<PrivacyLevel, string> = {
  public: '公开',
  members: '仅族人',
  admins: '仅管理员',
};
export const VISIBILITY_LABELS: Record<ClanVisibility, string> = {
  public: '公开',
  private: '私密',
  invite: '邀请制',
};
export const ROLE_LABELS: Record<EffectiveRole, string> = {
  super: '超级管理员',
  admin: '家族管理员',
  member: '族人',
  visitor: '访客',
};
export const DATE_PRECISION_LABELS: Record<DatePrecision, string> = {
  day: '精确到日',
  month: '精确到月',
  year: '精确到年',
  approx: '约',
};

export interface UserInfo {
  id: string;
  phone: string | null;
  email: string | null;
  displayName: string | null;
  isSuperAdmin: boolean;
}

export interface AuthResult {
  token: string;
  user: UserInfo;
}

export interface Clan {
  id: string;
  name: string;
  surname: string;
  hallName: string | null;
  origin: string | null;
  generationPoem: string | null;
  /** 字辈诗第一个字对应的世代号 */
  poemStartGeneration: number;
  description: string | null;
  founderId: string | null;
  visibility: ClanVisibility;
  status: ClanStatus;
  createdAt: string;
}

export interface ClanWithRole extends Clan {
  myRole: EffectiveRole;
  myLinkedPersonId: string | null;
  personCount?: number;
}

export interface ClanAdminInfo {
  membershipId: string;
  userId: string;
  phone: string | null;
  displayName: string | null;
  hasPassword: boolean;
  /** 仅在任命时返回一次：对方尚未注册时用于激活账号 */
  activationCode?: string | null;
}

export interface Membership {
  id: string;
  userId: string;
  clanId: string;
  role: ClanRole;
  linkedPersonId: string | null;
  phone?: string | null;
  displayName?: string | null;
  linkedPersonName?: string | null;
  createdAt: string;
  /** 仅在添加族人时返回一次：对方尚未注册时用于激活账号 */
  activationCode?: string | null;
}

export interface Person {
  id: string;
  clanId: string;
  surname: string;
  givenName: string;
  fullName: string;
  courtesyName: string | null;
  artName: string | null;
  nickname: string | null;
  gender: Gender;
  generation: number | null;
  generationChar: string | null;
  rankInSiblings: number | null;
  birthDate: string | null;
  birthPrecision: DatePrecision | null;
  birthText: string | null;
  deathDate: string | null;
  deathPrecision: DatePrecision | null;
  deathText: string | null;
  isLiving: boolean;
  ancestralHome: string | null;
  birthPlace: string | null;
  burialPlace: string | null;
  biography: string | null;
  /** AI 小传草稿（M5 预留，暂不生成） */
  biographyAiDraft: string | null;
  occupation: string | null;
  isExternal: boolean;
  privacyLevel: PrivacyLevel;
  avatarMediaId: string | null;
  createdAt: string;
  updatedAt: string;
  /** 因隐私设置被隐藏的字段 */
  hiddenFields?: string[];
}

export type PersonInput = Partial<
  Omit<Person, 'id' | 'clanId' | 'fullName' | 'createdAt' | 'updatedAt' | 'hiddenFields' | 'biographyAiDraft'>
> & { surname: string; givenName: string };

export interface PersonBrief {
  id: string;
  fullName: string;
  gender: Gender;
  generation: number | null;
  generationChar: string | null;
  rankInSiblings: number | null;
  isLiving: boolean;
  isExternal: boolean;
  birthText: string | null;
  deathText: string | null;
}

export interface ParentChild {
  id: string;
  clanId: string;
  parentId: string;
  childId: string;
  relationType: RelationType;
  /** 宗法主线（过继后承嗣的一支为主线；生父一支为非主线，即"出继"） */
  isMainLine: boolean;
  sortOrder: number;
}

export interface Marriage {
  id: string;
  clanId: string;
  husbandId: string;
  wifeId: string;
  type: MarriageType;
  order: number;
  startText: string | null;
  endText: string | null;
  note: string | null;
}

export interface Media {
  id: string;
  clanId: string;
  personId: string;
  type: MediaType;
  mimeType: string | null;
  size: number | null;
  caption: string | null;
  duration: number | null;
  url: string;
  createdAt: string;
}

export interface LifeEvent {
  id: string;
  clanId: string;
  personId: string;
  type: string | null;
  title: string;
  eventDate: string | null;
  eventText: string | null;
  place: string | null;
  description: string | null;
  sortOrder: number;
}

export interface RelativeRef {
  person: PersonBrief;
  relationType?: RelationType;
  isMainLine?: boolean;
  marriageType?: MarriageType;
  relationId: string;
}

export interface PersonDetail extends Person {
  parents: RelativeRef[];
  children: RelativeRef[];
  spouses: RelativeRef[];
  media: Media[];
  events: LifeEvent[];
  disambiguation: string;
}

export interface PersonSearchItem extends PersonBrief {
  fatherName: string | null;
  /** 重名消歧标签，如"第12世·父李承德·行二" */
  disambiguation: string;
  /** 本族内同名人数（>1 表示有重名） */
  sameNameCount: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PersonSaveResult {
  person: Person;
  warnings: string[];
}

export interface GenerationCheckResult {
  suggestedGeneration: number | null;
  suggestedGenerationChar: string | null;
  warnings: string[];
}

// ---------- 五代树 ----------
export type TreeNodeRole = 'center' | 'ancestor' | 'descendant' | 'spouse';

export interface TreeNode extends PersonBrief {
  role: TreeNodeRole;
  /** 相对中心人物的层级：祖先为负，后代为正，配偶与其伴侣同层 */
  depth: number;
  spouseOf?: string;
  /** 是否还有未加载的上一代 / 下一代 */
  hasMoreUp: boolean;
  hasMoreDown: boolean;
}

export interface TreeEdge {
  source: string;
  target: string;
  type: 'parent' | 'spouse';
  relationType?: RelationType;
  isMainLine?: boolean;
}

export interface TreeResponse {
  centerId: string;
  line: TreeLine;
  up: number;
  down: number;
  nodes: TreeNode[];
  edges: TreeEdge[];
  truncated: boolean;
}

// ---------- 亲属关系 ----------
export type KinshipStepKind = 'parent' | 'child' | 'spouse';

export interface KinshipStep {
  from: string;
  to: string;
  kind: KinshipStepKind;
}

export interface KinshipResult {
  connected: boolean;
  from: PersonBrief;
  to: PersonBrief;
  /** B 是 A 的 ___（A 称呼 B） */
  termAtoB: string | null;
  /** A 是 B 的 ___（B 称呼 A） */
  termBtoA: string | null;
  /** 候选称谓（无法判断长幼时可能有多个） */
  termsAtoB: string[];
  termsBtoA: string[];
  /** 正数表示 B 比 A 长 N 辈，负数表示 B 比 A 晚 N 辈 */
  generationDiff: number | null;
  generationDiffText: string;
  commonAncestor: PersonBrief | null;
  /** 共同祖先到 A、B 的代数 */
  stepsUpFromA: number | null;
  stepsUpFromB: number | null;
  path: PersonBrief[];
  steps: KinshipStep[];
  /** 文字链，如"父亲的哥哥的儿子" */
  chainText: string;
  /** 称谓来源：relationship.js 标准称谓 / 族亲规则 / 仅文字链 */
  source: 'relationship.js' | 'clan-rule' | 'chain' | 'self' | 'none';
  note: string | null;
}

export interface AuditLogEntry {
  id: string;
  clanId: string | null;
  clanName?: string | null;
  userId: string | null;
  userPhone?: string | null;
  entity: string;
  entityId: string | null;
  action: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface ClanStats {
  personCount: number;
  livingCount: number;
  maleCount: number;
  femaleCount: number;
  maxGeneration: number | null;
}
