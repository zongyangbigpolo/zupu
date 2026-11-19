// GEDCOM 5.5.1（UTF-8）编解码，纯函数，便于单元测试。
// 中国族谱特有字段使用自定义标签（GEDCOM 允许以下划线开头的扩展标签）：
//   _ZI 字    _HAO 号    _ZIBEI 字辈    _SHIDAI 世代    _RANK 排行
//   _ZUJI 祖籍    _EXTERNAL 外姓配偶(Y)    _LIVING 在世(Y/N)    _PRIVACY 隐私级别
//   FAMC 下：PEDI birth/adopted + _ZPREL heir(过继)/jiantiao(兼祧)/adopted(收养) + _MAIN N(非宗法主线，即出继)
//   FAM 下：_MARR_TYPE principal/successor/concubine/other（元配/继配/侧室）  _ORDER 序号  _END 结束
// 日期：精确日期用标准格式；有原文（如"康熙二十九年"）时用 INT 日期 (原文)；只有原文时用 (原文)。

import type { DatePrecision, Gender, MarriageType, PrivacyLevel, RelationType } from '@zupu/shared';

export interface GedPerson {
  id: string;
  surname: string;
  givenName: string;
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
  occupation: string | null;
  isExternal: boolean;
  privacyLevel: PrivacyLevel;
}

export interface GedParentLink {
  parentId: string;
  childId: string;
  relationType: RelationType;
  isMainLine: boolean;
  sortOrder: number;
}

export interface GedMarriage {
  husbandId: string;
  wifeId: string;
  type: MarriageType;
  order: number;
  startText: string | null;
  endText: string | null;
  note: string | null;
}

export interface GedData {
  persons: GedPerson[];
  parents: GedParentLink[];
  marriages: GedMarriage[];
}

export interface GedIssue {
  line?: number;
  xref?: string;
  message: string;
}

export interface ParsedGedcom extends GedData {
  header: { source: string | null; version: string | null; charset: string | null };
  familyCount: number;
  errors: GedIssue[];
  warnings: GedIssue[];
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const RELATION_TYPES: RelationType[] = ['biological', 'adopted', 'heir', 'jiantiao'];
const MARRIAGE_TYPES: MarriageType[] = ['principal', 'successor', 'concubine', 'other'];
const PRIVACY: PrivacyLevel[] = ['public', 'members', 'admins'];

// ---------------- 写出 ----------------

class Writer {
  lines: string[] = [];
  line(level: number, tag: string, value?: string | number | null, xref?: string) {
    const head = `${level}${xref ? ` ${xref}` : ''} ${tag}`;
    if (value == null || value === '') {
      this.lines.push(head);
      return;
    }
    // 文本值中的 @ 需转义为 @@（引用值除外）
    const v = String(value);
    const isPointer = /^@[^@\s]+@$/.test(v);
    const parts = (isPointer ? v : v.replace(/@/g, '@@')).replace(/\r\n?/g, '\n').split('\n');
    parts.forEach((p, i) => {
      const chunks = splitChunks(p, 200);
      chunks.forEach((c, j) => {
        if (i === 0 && j === 0) this.lines.push(c ? `${head} ${c}` : head);
        else this.lines.push(`${level + 1} ${j === 0 ? 'CONT' : 'CONC'}${c ? ' ' + c : ''}`);
      });
    });
  }
}

function splitChunks(s: string, n: number): string[] {
  const chars = Array.from(s);
  if (chars.length <= n) return [s];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += n) out.push(chars.slice(i, i + n).join(''));
  return out;
}

export function formatGedDate(date: string | null, precision: DatePrecision | null, text: string | null): string | null {
  let core: string | null = null;
  if (date) {
    const [y, m, d] = date.split('-').map((x) => Number(x));
    const yy = String(y);
    if (precision === 'day' || !precision) core = `${d} ${MONTHS[m - 1]} ${yy}`;
    else if (precision === 'month') core = `${MONTHS[m - 1]} ${yy}`;
    else if (precision === 'approx') core = `ABT ${yy}`;
    else core = yy;
  }
  const t = text?.replace(/[()]/g, '').trim() || null;
  if (core && t && precision !== 'approx') return `INT ${core} (${t})`;
  if (core) return core;
  if (t) return `(${t})`;
  return null;
}

export interface ParsedDate {
  date: string | null;
  precision: DatePrecision | null;
  text: string | null;
}

export function parseGedDate(raw: string | null | undefined): ParsedDate {
  const empty: ParsedDate = { date: null, precision: null, text: null };
  if (!raw) return empty;
  let s = raw.trim();
  let text: string | null = null;
  const phrase = s.match(/\(([^)]*)\)\s*$/);
  if (phrase) {
    text = phrase[1].trim() || null;
    s = s.slice(0, phrase.index).trim();
  }
  s = s.replace(/^INT\s+/i, '');
  if (!s) return { ...empty, text };
  let approx = false;
  const q = s.match(/^(ABT|EST|CAL|BEF|AFT|FROM|TO|BET)\s+(.*)$/i);
  if (q) {
    approx = true;
    // 范围日期取第一个日期
    s = q[2].split(/\s+(?:AND|TO)\s+/i)[0];
    if (!text && q[1].toUpperCase() !== 'ABT' && q[1].toUpperCase() !== 'EST' && q[1].toUpperCase() !== 'CAL') text = raw.trim();
  }
  s = s.replace(/^@#D[A-Z ]+@\s*/, '');
  const m = s.match(/^(?:(\d{1,2})\s+)?(?:([A-Za-z]{3})\s+)?(\d{1,4})(?:\/\d{2})?(?:\s+B\.?C\.?)?$/);
  if (!m) return { date: null, precision: null, text: text ?? raw.trim() };
  const year = Number(m[3]);
  const mon = m[2] ? MONTHS.indexOf(m[2].toUpperCase()) + 1 : 0;
  const day = m[1] ? Number(m[1]) : 0;
  if (!year || (m[2] && mon === 0)) return { date: null, precision: null, text: text ?? raw.trim() };
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const date = `${pad(year, 4)}-${pad(mon || 1)}-${pad(day || 1)}`;
  const precision: DatePrecision = approx ? 'approx' : day && mon ? 'day' : mon ? 'month' : 'year';
  if (day && mon) {
    const d = new Date(Date.UTC(year, mon - 1, day));
    if (d.getUTCMonth() !== mon - 1) return { date: null, precision: null, text: text ?? raw.trim() };
  }
  return { date, precision, text };
}

function sexCode(g: Gender) {
  return g === 'male' ? 'M' : g === 'female' ? 'F' : 'U';
}

/** 把族谱数据写成 GEDCOM 5.5.1 文本 */
export function writeGedcom(data: GedData, meta: { clanName: string; exportedAt?: Date }): string {
  const w = new Writer();
  const now = meta.exportedAt ?? new Date();
  const indiRef = new Map<string, string>();
  data.persons.forEach((p, i) => indiRef.set(p.id, `@I${i + 1}@`));
  const personMap = new Map(data.persons.map((p) => [p.id, p]));

  // ---- 组织家庭（FAM）：婚姻 + 同一组父母（同一关系类型、主线）的子女 ----
  interface Fam {
    ref: string;
    husb: string | null;
    wife: string | null;
    marriage: GedMarriage | null;
    children: { id: string; link: GedParentLink }[];
  }
  const fams = new Map<string, Fam>();
  const famOf = (h: string | null, wf: string | null) => {
    const key = `${h ?? ''}|${wf ?? ''}`;
    let f = fams.get(key);
    if (!f) {
      f = { ref: `@F${fams.size + 1}@`, husb: h, wife: wf, marriage: null, children: [] };
      fams.set(key, f);
    }
    return f;
  };
  const married = new Set<string>();
  for (const m of data.marriages) {
    if (!personMap.has(m.husbandId) || !personMap.has(m.wifeId)) continue;
    famOf(m.husbandId, m.wifeId).marriage = m;
    married.add(`${m.husbandId}|${m.wifeId}`);
  }
  const byChild = new Map<string, GedParentLink[]>();
  for (const l of data.parents) {
    if (!personMap.has(l.parentId) || !personMap.has(l.childId)) continue;
    if (!byChild.has(l.childId)) byChild.set(l.childId, []);
    byChild.get(l.childId)!.push(l);
  }
  const famc = new Map<string, { fam: Fam; link: GedParentLink }[]>();
  for (const [childId, links] of byChild) {
    const groups = new Map<string, GedParentLink[]>();
    for (const l of links) {
      const k = `${l.relationType}|${l.isMainLine}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(l);
    }
    for (const g of groups.values()) {
      const fathers = g.filter((l) => personMap.get(l.parentId)!.gender !== 'female');
      const mothers = g.filter((l) => personMap.get(l.parentId)!.gender === 'female');
      const used = new Set<string>();
      const add = (f: GedParentLink | null, m: GedParentLink | null) => {
        const fam = famOf(f?.parentId ?? null, m?.parentId ?? null);
        const link = (f ?? m)!;
        fam.children.push({ id: childId, link });
        if (!famc.has(childId)) famc.set(childId, []);
        famc.get(childId)!.push({ fam, link });
      };
      for (const f of fathers) {
        const m =
          mothers.find((x) => !used.has(x.parentId) && married.has(`${f.parentId}|${x.parentId}`)) ??
          (fathers.length === 1 ? mothers.find((x) => !used.has(x.parentId)) : undefined) ??
          null;
        if (m) used.add(m.parentId);
        add(f, m);
      }
      for (const m of mothers) if (!used.has(m.parentId)) add(null, m);
    }
  }
  const fams_ = new Map<string, Fam[]>();
  for (const f of fams.values())
    for (const id of [f.husb, f.wife])
      if (id) {
        if (!fams_.has(id)) fams_.set(id, []);
        fams_.get(id)!.push(f);
      }

  // ---- HEAD ----
  w.line(0, 'HEAD');
  w.line(1, 'SOUR', 'ZUPU');
  w.line(2, 'NAME', '族谱');
  w.line(2, 'VERS', '0.1');
  w.line(1, 'DEST', 'ANY');
  w.line(1, 'DATE', `${now.getUTCDate()} ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`);
  w.line(1, 'SUBM', '@U1@');
  w.line(1, 'FILE', `${meta.clanName}.ged`);
  w.line(1, 'GEDC');
  w.line(2, 'VERS', '5.5.1');
  w.line(2, 'FORM', 'LINEAGE-LINKED');
  w.line(1, 'CHAR', 'UTF-8');
  w.line(1, 'LANG', 'Chinese');
  w.line(1, 'NOTE', meta.clanName);
  w.line(0, 'SUBM', undefined, '@U1@');
  w.line(1, 'NAME', meta.clanName);

  // ---- INDI ----
  for (const p of data.persons) {
    w.line(0, 'INDI', undefined, indiRef.get(p.id));
    w.line(1, 'NAME', `${p.givenName} /${p.surname}/`);
    w.line(2, 'GIVN', p.givenName);
    w.line(2, 'SURN', p.surname);
    if (p.nickname) w.line(2, 'NICK', p.nickname);
    w.line(1, 'SEX', sexCode(p.gender));
    if (p.courtesyName) w.line(1, '_ZI', p.courtesyName);
    if (p.artName) w.line(1, '_HAO', p.artName);
    if (p.generation != null) w.line(1, '_SHIDAI', p.generation);
    if (p.generationChar) w.line(1, '_ZIBEI', p.generationChar);
    if (p.rankInSiblings != null) w.line(1, '_RANK', p.rankInSiblings);
    if (p.ancestralHome) w.line(1, '_ZUJI', p.ancestralHome);
    if (p.isExternal) w.line(1, '_EXTERNAL', 'Y');
    w.line(1, '_LIVING', p.isLiving ? 'Y' : 'N');
    w.line(1, '_PRIVACY', p.privacyLevel);
    const bd = formatGedDate(p.birthDate, p.birthPrecision, p.birthText);
    if (bd || p.birthPlace) {
      w.line(1, 'BIRT');
      if (bd) w.line(2, 'DATE', bd);
      if (p.birthPlace) w.line(2, 'PLAC', p.birthPlace);
      if (p.birthPrecision === 'approx' && p.birthText) w.line(2, '_TEXT', p.birthText);
    }
    if (!p.isLiving) {
      const dd = formatGedDate(p.deathDate, p.deathPrecision, p.deathText);
      if (dd) {
        w.line(1, 'DEAT');
        w.line(2, 'DATE', dd);
        if (p.deathPrecision === 'approx' && p.deathText) w.line(2, '_TEXT', p.deathText);
      } else w.line(1, 'DEAT', 'Y');
    }
    if (p.burialPlace) {
      w.line(1, 'BURI');
      w.line(2, 'PLAC', p.burialPlace);
    }
    if (p.occupation) w.line(1, 'OCCU', p.occupation);
    if (p.biography) w.line(1, 'NOTE', p.biography);
    for (const { fam, link } of famc.get(p.id) ?? []) {
      w.line(1, 'FAMC', fam.ref);
      w.line(2, 'PEDI', link.relationType === 'biological' ? 'birth' : 'adopted');
      if (link.relationType !== 'biological') w.line(2, '_ZPREL', link.relationType);
      if (!link.isMainLine) w.line(2, '_MAIN', 'N');
    }
    for (const f of fams_.get(p.id) ?? []) w.line(1, 'FAMS', f.ref);
  }

  // ---- FAM ----
  for (const f of fams.values()) {
    w.line(0, 'FAM', undefined, f.ref);
    if (f.husb) w.line(1, 'HUSB', indiRef.get(f.husb));
    if (f.wife) w.line(1, 'WIFE', indiRef.get(f.wife));
    if (f.marriage) {
      const m = f.marriage;
      w.line(1, 'MARR', m.startText ? undefined : 'Y');
      if (m.startText) w.line(2, 'DATE', `(${m.startText.replace(/[()]/g, '')})`);
      w.line(1, '_MARR_TYPE', m.type);
      w.line(1, '_ORDER', m.order);
      if (m.endText) w.line(1, '_END', m.endText);
      if (m.note) w.line(1, 'NOTE', m.note);
    }
    const kids = [...f.children].sort((a, b) => a.link.sortOrder - b.link.sortOrder);
    for (const c of kids) w.line(1, 'CHIL', indiRef.get(c.id));
  }
  w.line(0, 'TRLR');
  return w.lines.join('\r\n') + '\r\n';
}

// ---------------- 解析 ----------------

interface Node {
  level: number;
  xref: string | null;
  tag: string;
  value: string;
  line: number;
  children: Node[];
}

function tree(text: string, errors: GedIssue[]): Node[] {
  const roots: Node[] = [];
  const stack: Node[] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  lines.forEach((raw, i) => {
    const ln = i + 1;
    if (!raw.trim()) return;
    const m = raw.match(/^\s*(\d{1,2})\s+(?:(@[^@\s]+@)\s+)?([A-Za-z0-9_]+)(?: (.*))?$/);
    if (!m) {
      errors.push({ line: ln, message: `第 ${ln} 行格式不正确：${raw.slice(0, 40)}` });
      return;
    }
    const level = Number(m[1]);
    const node: Node = { level, xref: m[2] ?? null, tag: m[3].toUpperCase(), value: m[4] ?? '', line: ln, children: [] };
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    if (node.tag === 'CONC' || node.tag === 'CONT') {
      const parent = stack[stack.length - 1];
      if (parent && parent.level === level - 1) {
        parent.value += (node.tag === 'CONT' ? '\n' : '') + node.value;
        return;
      }
    }
    if (level === 0) roots.push(node);
    else {
      const parent = stack[stack.length - 1];
      if (!parent || parent.level !== level - 1) {
        errors.push({ line: ln, message: `第 ${ln} 行层级不连续` });
        return;
      }
      parent.children.push(node);
    }
    stack.push(node);
  });
  return roots;
}

const unesc = (s: string) => s.replace(/@@/g, '@');
const child = (n: Node, tag: string) => n.children.find((c) => c.tag === tag);
const val = (n: Node | undefined, tag?: string): string | null => {
  const t = tag ? (n ? child(n, tag) : undefined) : n;
  const v = t?.value?.trim();
  return v ? unesc(v) : null;
};

function clip(v: string | null, max: number, label: string, xref: string, warnings: GedIssue[]): string | null {
  if (v == null) return null;
  const chars = Array.from(v);
  if (chars.length <= max) return v;
  warnings.push({ xref, message: `${xref} 的${label}超过 ${max} 字，已截断` });
  return chars.slice(0, max).join('');
}

function intOrNull(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export interface ParseOptions {
  /** 缺少姓氏时使用的默认姓（通常为本族姓氏） */
  defaultSurname?: string;
  maxPersons?: number;
  now?: Date;
}

/** 解析 GEDCOM 文本；errors 非空时不应导入 */
export function parseGedcom(text: string, opts: ParseOptions = {}): ParsedGedcom {
  const errors: GedIssue[] = [];
  const warnings: GedIssue[] = [];
  const roots = tree(text, errors);
  const head = roots.find((r) => r.tag === 'HEAD');
  const header = {
    source: head ? val(head, 'SOUR') : null,
    version: head ? val(child(head, 'GEDC'), 'VERS') : null,
    charset: head ? val(head, 'CHAR') : null,
  };
  if (!head) errors.push({ message: '缺少 HEAD 头记录，不是有效的 GEDCOM 文件' });
  if (header.charset && !/^UTF-?8$/i.test(header.charset))
    warnings.push({ message: `文件声明编码为 ${header.charset}，系统按 UTF-8 读取，非 ASCII 字符可能乱码` });
  if (header.version && !header.version.startsWith('5.5')) warnings.push({ message: `GEDCOM 版本 ${header.version}，按 5.5.1 解析` });
  if (!roots.some((r) => r.tag === 'TRLR')) warnings.push({ message: '缺少 TRLR 结束记录，文件可能不完整' });

  const notes = new Map(roots.filter((r) => r.tag === 'NOTE' && r.xref).map((r) => [r.xref!, r.value]));
  const noteText = (n: Node | undefined) => {
    const v = val(n, 'NOTE');
    if (v && /^@[^@\s]+@$/.test(v)) return notes.get(v) ? unesc(notes.get(v)!).trim() || null : null;
    return v;
  };
  const indis = roots.filter((r) => r.tag === 'INDI');
  const famNodes = roots.filter((r) => r.tag === 'FAM');
  const max = opts.maxPersons ?? 20000;
  if (!indis.length) errors.push({ message: '文件中没有人物（INDI）记录' });
  if (indis.length > max) errors.push({ message: `人物数量 ${indis.length} 超过单次导入上限 ${max}` });

  const persons: GedPerson[] = [];
  const ids = new Set<string>();
  const nowYear = (opts.now ?? new Date()).getFullYear();
  for (const n of indis) {
    const xref = n.xref;
    if (!xref) {
      errors.push({ line: n.line, message: `第 ${n.line} 行的人物记录缺少编号` });
      continue;
    }
    if (ids.has(xref)) {
      errors.push({ xref, line: n.line, message: `人物编号 ${xref} 重复` });
      continue;
    }
    ids.add(xref);
    const nameNode = child(n, 'NAME');
    const rawName = nameNode?.value ? unesc(nameNode.value) : '';
    const slash = rawName.match(/^(.*?)\/([^/]*)\/(.*)$/);
    let surname = val(nameNode, 'SURN') ?? (slash ? slash[2].trim() : null);
    let givenName = val(nameNode, 'GIVN') ?? (slash ? (slash[1] + slash[3]).trim() : rawName.trim()) ?? '';
    if (!surname) {
      if (opts.defaultSurname) {
        surname = opts.defaultSurname;
        warnings.push({ xref, message: `${xref}（${givenName || '无名'}）缺少姓氏，按"${surname}"导入` });
      } else {
        errors.push({ xref, line: n.line, message: `${xref} 缺少姓氏` });
        continue;
      }
    }
    if (!givenName) {
      givenName = '某';
      warnings.push({ xref, message: `${xref}（${surname}）缺少名字，以"某"代替` });
    }
    const sex = (val(n, 'SEX') ?? 'U').toUpperCase();
    const birt = child(n, 'BIRT');
    const deat = child(n, 'DEAT');
    const bd = parseGedDate(val(birt, 'DATE'));
    const dd = parseGedDate(val(deat, 'DATE'));
    if (birt && !bd.text) bd.text = val(birt, '_TEXT');
    if (deat && !dd.text) dd.text = val(deat, '_TEXT');
    const livingTag = val(n, '_LIVING');
    const birthYear = bd.date ? Number(bd.date.slice(0, 4)) : null;
    const isLiving = livingTag
      ? livingTag.toUpperCase() === 'Y'
      : !deat && (birthYear == null ? false : nowYear - birthYear < 110);
    const privacyRaw = val(n, '_PRIVACY') as PrivacyLevel | null;
    const generation = intOrNull(val(n, '_SHIDAI'));
    if (val(n, '_SHIDAI') && generation == null) warnings.push({ xref, message: `${xref} 的世代"${val(n, '_SHIDAI')}"不是正整数，已忽略` });
    persons.push({
      id: xref,
      surname: clip(surname, 10, '姓氏', xref, warnings)!,
      givenName: clip(givenName, 30, '名字', xref, warnings)!,
      courtesyName: clip(val(n, '_ZI'), 30, '字', xref, warnings),
      artName: clip(val(n, '_HAO'), 30, '号', xref, warnings),
      nickname: clip(val(nameNode, 'NICK'), 30, '昵称', xref, warnings),
      gender: sex === 'M' ? 'male' : sex === 'F' ? 'female' : 'unknown',
      generation,
      generationChar: clip(val(n, '_ZIBEI'), 4, '字辈', xref, warnings),
      rankInSiblings: intOrNull(val(n, '_RANK')),
      birthDate: bd.date,
      birthPrecision: bd.precision,
      birthText: clip(bd.text, 60, '出生原文', xref, warnings),
      deathDate: dd.date,
      deathPrecision: dd.precision,
      deathText: clip(dd.text, 60, '去世原文', xref, warnings),
      isLiving,
      ancestralHome: clip(val(n, '_ZUJI'), 100, '祖籍', xref, warnings),
      birthPlace: clip(val(birt, 'PLAC'), 100, '出生地', xref, warnings),
      burialPlace: clip(val(child(n, 'BURI'), 'PLAC'), 200, '葬地', xref, warnings),
      biography: noteText(n),
      occupation: clip(val(n, 'OCCU'), 100, '职业', xref, warnings),
      isExternal: (val(n, '_EXTERNAL') ?? '').toUpperCase() === 'Y',
      privacyLevel: privacyRaw && PRIVACY.includes(privacyRaw) ? privacyRaw : isLiving ? 'members' : 'public',
    });
  }

  // ---- 家庭 → 亲子 / 婚姻 ----
  const fams = new Map<string, { husb: string | null; wife: string | null; chil: string[]; node: Node }>();
  for (const f of famNodes) {
    if (!f.xref) continue;
    const ref = (tag: string) => {
      const v = val(f, tag);
      if (v && !ids.has(v)) {
        warnings.push({ xref: f.xref!, message: `家庭 ${f.xref} 引用了不存在的人物 ${v}，已忽略` });
        return null;
      }
      return v;
    };
    const chil = f.children
      .filter((c) => c.tag === 'CHIL')
      .map((c) => c.value.trim())
      .filter((v) => {
        if (ids.has(v)) return true;
        warnings.push({ xref: f.xref!, message: `家庭 ${f.xref} 的子女 ${v} 不存在，已忽略` });
        return false;
      });
    fams.set(f.xref, { husb: ref('HUSB'), wife: ref('WIFE'), chil, node: f });
  }

  const parents: GedParentLink[] = [];
  const pcSeen = new Set<string>();
  const addLink = (parentId: string | null, childId: string, relationType: RelationType, isMainLine: boolean, sortOrder: number) => {
    if (!parentId) return;
    if (parentId === childId) {
      warnings.push({ xref: childId, message: `${childId} 不能是自己的父母，已忽略` });
      return;
    }
    const k = `${parentId}|${childId}`;
    if (pcSeen.has(k)) return;
    pcSeen.add(k);
    parents.push({ parentId, childId, relationType, isMainLine, sortOrder });
  };
  // 先按人物的 FAMC（带 PEDI/_ZPREL/_MAIN），再补家庭中 CHIL 未在 FAMC 声明的
  for (const n of indis) {
    if (!n.xref || !ids.has(n.xref)) continue;
    for (const fc of n.children.filter((c) => c.tag === 'FAMC')) {
      const fam = fams.get(fc.value.trim());
      if (!fam) {
        warnings.push({ xref: n.xref, message: `${n.xref} 引用了不存在的家庭 ${fc.value.trim()}，已忽略` });
        continue;
      }
      const z = val(fc, '_ZPREL') as RelationType | null;
      const pedi = (val(fc, 'PEDI') ?? 'birth').toLowerCase();
      const rt: RelationType = z && RELATION_TYPES.includes(z) ? z : pedi === 'adopted' || pedi === 'foster' ? 'adopted' : 'biological';
      const main = (val(fc, '_MAIN') ?? 'Y').toUpperCase() !== 'N';
      const order = Math.max(0, fam.chil.indexOf(n.xref));
      addLink(fam.husb, n.xref, rt, main, order);
      addLink(fam.wife, n.xref, rt, main, order);
    }
  }
  for (const fam of fams.values())
    fam.chil.forEach((c, i) => {
      addLink(fam.husb, c, 'biological', true, i);
      addLink(fam.wife, c, 'biological', true, i);
    });

  const marriages: GedMarriage[] = [];
  const mSeen = new Set<string>();
  for (const [xref, fam] of fams) {
    if (!fam.husb || !fam.wife) continue;
    const k = `${fam.husb}|${fam.wife}`;
    if (mSeen.has(k)) continue;
    mSeen.add(k);
    const t = val(fam.node, '_MARR_TYPE') as MarriageType | null;
    const marr = child(fam.node, 'MARR');
    const md = val(marr, 'DATE');
    const mp = md ? parseGedDate(md) : null;
    marriages.push({
      husbandId: fam.husb,
      wifeId: fam.wife,
      type: t && MARRIAGE_TYPES.includes(t) ? t : 'principal',
      order: intOrNull(val(fam.node, '_ORDER')) ?? 1,
      startText: md ? (mp?.text ?? md) : null,
      endText: val(fam.node, '_END'),
      note: noteText(fam.node),
    });
    void xref;
  }

  // 环检测：祖先链中出现自己
  const parentsOf = new Map<string, string[]>();
  for (const l of parents) {
    if (!parentsOf.has(l.childId)) parentsOf.set(l.childId, []);
    parentsOf.get(l.childId)!.push(l.parentId);
  }
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    const s = state.get(id);
    if (s === 1) return true;
    if (s === 2) return false;
    state.set(id, 1);
    for (const p of parentsOf.get(id) ?? []) if (visit(p)) return true;
    state.set(id, 2);
    return false;
  };
  for (const id of ids)
    if (visit(id)) {
      errors.push({ xref: id, message: `${id} 的亲子关系出现循环（自己是自己的祖先）` });
      break;
    }

  return { header, persons, parents, marriages, familyCount: fams.size, errors, warnings };
}
