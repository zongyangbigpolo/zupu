// 任意两人亲属关系计算：
// 1) 在 父母—子女—配偶 关系图上求加权最短路径（血缘优先，宗法主线优先）；
// 2) 求最近共同祖先(LCA)与双方代数；
// 3) 路径转换为称谓链文本（爸爸的哥哥的儿子），交给 relationship.js 计算标准称谓；
// 4) relationship.js 覆盖不到的出五服族亲，按"族兄/族叔/族侄孙"等规则生成；
// 5) 都不适用时，仅给出文字链与辈分差。
import relationship from 'relationship.js';
import type { Gender, KinshipResult, KinshipStep, PersonBrief, RelationType } from '../types.js';
import { toChineseNumber } from '../genealogy.js';

export interface KinPerson extends PersonBrief {
  birthDate?: string | null;
}

export interface KinParentEdge {
  parentId: string;
  childId: string;
  relationType: RelationType;
  isMainLine: boolean;
}

export interface KinMarriage {
  husbandId: string;
  wifeId: string;
}

interface Adj {
  to: string;
  kind: 'parent' | 'child' | 'spouse';
  cost: number;
}

const COST_MAIN = 1;
const COST_SIDE = 1.3;
const COST_SPOUSE = 1.5;

export class KinshipGraph {
  readonly persons = new Map<string, KinPerson>();
  private adj = new Map<string, Adj[]>();
  private marriages = new Set<string>();

  constructor(persons: KinPerson[], parentEdges: KinParentEdge[], marriages: KinMarriage[]) {
    for (const p of persons) {
      this.persons.set(p.id, p);
      this.adj.set(p.id, []);
    }
    for (const e of parentEdges) {
      if (!this.persons.has(e.parentId) || !this.persons.has(e.childId)) continue;
      const cost = e.isMainLine || e.relationType === 'biological' ? COST_MAIN : COST_SIDE;
      this.adj.get(e.childId)!.push({ to: e.parentId, kind: 'parent', cost });
      this.adj.get(e.parentId)!.push({ to: e.childId, kind: 'child', cost });
    }
    for (const m of marriages) {
      if (!this.persons.has(m.husbandId) || !this.persons.has(m.wifeId)) continue;
      this.adj.get(m.husbandId)!.push({ to: m.wifeId, kind: 'spouse', cost: COST_SPOUSE });
      this.adj.get(m.wifeId)!.push({ to: m.husbandId, kind: 'spouse', cost: COST_SPOUSE });
      this.marriages.add(`${m.husbandId}|${m.wifeId}`);
      this.marriages.add(`${m.wifeId}|${m.husbandId}`);
    }
  }

  isMarried(a: string, b: string) {
    return this.marriages.has(`${a}|${b}`);
  }

  /** Dijkstra 最短路径；返回步骤数组，找不到返回 null */
  findPath(fromId: string, toId: string): KinshipStep[] | null {
    if (!this.persons.has(fromId) || !this.persons.has(toId)) return null;
    if (fromId === toId) return [];
    const dist = new Map<string, number>([[fromId, 0]]);
    const prev = new Map<string, { from: string; kind: Adj['kind'] }>();
    const heap = new MinHeap();
    heap.push(0, fromId);
    while (heap.size) {
      const [d, u] = heap.pop()!;
      if (d > (dist.get(u) ?? Infinity)) continue;
      if (u === toId) break;
      for (const e of this.adj.get(u)!) {
        const nd = d + e.cost;
        if (nd < (dist.get(e.to) ?? Infinity) - 1e-9) {
          dist.set(e.to, nd);
          prev.set(e.to, { from: u, kind: e.kind });
          heap.push(nd, e.to);
        }
      }
    }
    if (!prev.has(toId)) return null;
    const steps: KinshipStep[] = [];
    let cur = toId;
    while (cur !== fromId) {
      const p = prev.get(cur)!;
      steps.unshift({ from: p.from, to: cur, kind: p.kind });
      cur = p.from;
    }
    return this.normalize(steps);
  }

  /** "孩子的母亲" 这类先下后上的绕行，若两人确有婚姻则改写为配偶一步 */
  private normalize(steps: KinshipStep[]): KinshipStep[] {
    const out: KinshipStep[] = [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const n = steps[i + 1];
      if (s.kind === 'child' && n && n.kind === 'parent' && this.isMarried(s.from, n.to)) {
        out.push({ from: s.from, to: n.to, kind: 'spouse' });
        i++;
      } else out.push(s);
    }
    return out;
  }
}

class MinHeap {
  private a: [number, string][] = [];
  get size() {
    return this.a.length;
  }
  push(k: number, v: string) {
    const a = this.a;
    a.push([k, v]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, string] | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** a 比 b 年长返回 -1，年幼返回 1，无法判断返回 0 */
export function compareAge(a: KinPerson, b: KinPerson): number {
  if (a.rankInSiblings && b.rankInSiblings && a.gender === b.gender && a.rankInSiblings !== b.rankInSiblings) {
    return a.rankInSiblings < b.rankInSiblings ? -1 : 1;
  }
  const ya = a.birthDate ?? null;
  const yb = b.birthDate ?? null;
  if (ya && yb && ya !== yb) return ya < yb ? -1 : 1;
  return 0;
}

const TOKEN_HUMAN: Record<string, string> = {
  爸爸: '父亲',
  妈妈: '母亲',
  老公: '丈夫',
  老婆: '妻子',
};

function tokenFor(kind: KinshipStep['kind'], g: Gender): string {
  if (kind === 'parent') return g === 'female' ? '妈妈' : '爸爸';
  if (kind === 'child') return g === 'female' ? '女儿' : '儿子';
  return g === 'female' ? '老婆' : '老公';
}

/** 路径 → relationship.js 称谓链（兄弟姐妹按排行/出生日期区分长幼） */
export function stepsToChain(graph: KinshipGraph, steps: KinshipStep[]): string[] {
  const tokens: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const n = steps[i + 1];
    if (s.kind === 'parent' && n && n.kind === 'child' && n.to !== s.from) {
      const me = graph.persons.get(s.from)!;
      const sib = graph.persons.get(n.to)!;
      const cmp = compareAge(sib, me);
      if (cmp !== 0) {
        const older = cmp < 0;
        tokens.push(sib.gender === 'female' ? (older ? '姐姐' : '妹妹') : older ? '哥哥' : '弟弟');
        i++;
        continue;
      }
    }
    tokens.push(tokenFor(s.kind, graph.persons.get(s.to)!.gender));
  }
  return tokens;
}

function callRelationship(text: string, sex: number, reverse: boolean): string[] {
  try {
    const r = relationship({ text, sex, reverse }) as string[];
    return (r ?? []).filter((t) => t && t !== '自己');
  } catch {
    return [];
  }
}

const OLDER_CHARS = ['哥', '姐', '伯'];
const YOUNGER_CHARS = ['弟', '妹', '叔'];

/** 候选称谓按长幼过滤（如 堂哥/堂弟、堂伯/堂叔） */
function pickByAge(terms: string[], older: number): string[] {
  if (terms.length <= 1 || older === 0) return terms;
  const want = older < 0 ? OLDER_CHARS : YOUNGER_CHARS;
  const avoid = older < 0 ? YOUNGER_CHARS : OLDER_CHARS;
  const f = terms.filter((t) => want.some((c) => t.includes(c)) && !avoid.some((c) => t.includes(c)));
  return f.length ? f : terms;
}

/** 出五服族亲称谓。d>0 表示对方长 d 辈 */
export function clanTerm(d: number, gender: Gender, older: number): string {
  const f = gender === 'female';
  if (d === 0) {
    if (older === 0) return f ? '族姐妹' : '族兄弟';
    return f ? (older < 0 ? '族姐' : '族妹') : older < 0 ? '族兄' : '族弟';
  }
  if (d === 1) return f ? '族姑' : older < 0 ? '族伯' : '族叔';
  if (d === 2) return f ? '族祖姑' : older < 0 ? '族伯祖' : '族叔祖';
  if (d === 3) return f ? '族曾祖姑' : '族曾祖';
  if (d === -1) return f ? '族侄女' : '族侄';
  if (d === -2) return f ? '族侄孙女' : '族侄孙';
  if (d === -3) return f ? '族曾侄孙女' : '族曾侄孙';
  return d > 0 ? `族中长辈（长${toChineseNumber(d)}辈）` : `族中晚辈（晚${toChineseNumber(-d)}辈）`;
}

function directLineTerm(m: number, n: number, gender: Gender): string {
  // 直系超出 relationship.js 范围：N世祖 / N世孙
  if (n === 0) return `${toChineseNumber(m)}世祖${gender === 'female' ? '母' : ''}`;
  return `${toChineseNumber(n)}世孙${gender === 'female' ? '女' : ''}`;
}

export function brief(p: KinPerson): PersonBrief {
  return {
    id: p.id,
    fullName: p.fullName,
    gender: p.gender,
    generation: p.generation,
    generationChar: p.generationChar,
    rankInSiblings: p.rankInSiblings,
    isLiving: p.isLiving,
    isExternal: p.isExternal,
    birthText: p.birthText,
    deathText: p.deathText,
  };
}

function diffText(d: number | null, a: KinPerson, b: KinPerson): string {
  if (d == null) return '辈分无法确定';
  if (d === 0) return '同辈';
  const n = toChineseNumber(Math.abs(d));
  return d > 0 ? `相差${n}代（${b.fullName}长${n}辈）` : `相差${n}代（${a.fullName}长${n}辈）`;
}

export function computeKinship(graph: KinshipGraph, fromId: string, toId: string): KinshipResult {
  const A = graph.persons.get(fromId);
  const B = graph.persons.get(toId);
  if (!A || !B) throw new Error('人员不存在');
  const base = {
    from: brief(A),
    to: brief(B),
    commonAncestor: null,
    stepsUpFromA: null,
    stepsUpFromB: null,
    note: null,
  };
  if (fromId === toId) {
    return {
      ...base,
      connected: true,
      termAtoB: '本人',
      termBtoA: '本人',
      termsAtoB: ['本人'],
      termsBtoA: ['本人'],
      generationDiff: 0,
      generationDiffText: '同一人',
      path: [brief(A)],
      steps: [],
      chainText: '本人',
      source: 'self',
    };
  }
  const steps = graph.findPath(fromId, toId);
  if (!steps) {
    return {
      ...base,
      connected: false,
      termAtoB: null,
      termBtoA: null,
      termsAtoB: [],
      termsBtoA: [],
      generationDiff:
        A.generation != null && B.generation != null && !A.isExternal && !B.isExternal
          ? A.generation - B.generation
          : null,
      generationDiffText: '谱中未找到两人之间的关系路径',
      path: [],
      steps: [],
      chainText: '',
      source: 'none',
    };
  }

  const nodeIds = [fromId, ...steps.map((s) => s.to)];
  const path = nodeIds.map((id) => graph.persons.get(id)!);
  // 相对 A 的辈分层级（向上 +1）
  const levels: number[] = [0];
  for (const s of steps) levels.push(levels[levels.length - 1] + (s.kind === 'parent' ? 1 : s.kind === 'child' ? -1 : 0));
  const pathDiff = levels[levels.length - 1];

  const generationDiff =
    A.generation != null && B.generation != null && !A.isExternal && !B.isExternal
      ? A.generation - B.generation
      : pathDiff;

  // 纯血缘路径：先上 m 步，再下 n 步
  const kinds = steps.map((s) => s.kind);
  const m = kinds.findIndex((k) => k !== 'parent') === -1 ? kinds.length : kinds.findIndex((k) => k !== 'parent');
  const pureBlood = !kinds.includes('spouse') && kinds.slice(m).every((k) => k === 'child');
  const n = steps.length - m;
  const lca = pureBlood ? path[m] : null;

  const tokens = stepsToChain(graph, steps);
  const chainText = tokens.map((t) => TOKEN_HUMAN[t] ?? t).join('的');
  const libChain = tokens.join('的');
  const sexOf = (g: Gender) => (g === 'male' ? 1 : g === 'female' ? 0 : -1);

  // 长幼参照人：A 侧与 B 同辈的人 / B 侧与 A 同辈的人
  let olderFwd = 0;
  let olderRev = 0;
  if (pureBlood) {
    const refA = path.slice(0, m + 1).find((_, i) => levels[i] === pathDiff);
    if (refA && refA.id !== B.id) olderFwd = compareAge(B, refA);
    const refB = path.slice(m).find((_, i) => levels[i + m] === 0);
    if (refB && refB.id !== A.id) olderRev = compareAge(A, refB);
  }

  let termsAtoB: string[] = [];
  let termsBtoA: string[] = [];
  let source: KinshipResult['source'] = 'chain';
  let note: string | null = null;

  const outOfWufu = pureBlood && m >= 5 && n >= 5;
  const allMaleLine = path.slice(1, -1).every((p) => p.gender === 'male');

  if (!outOfWufu) {
    termsAtoB = pickByAge(callRelationship(libChain, sexOf(A.gender), false), olderFwd);
    termsBtoA = pickByAge(callRelationship(libChain, sexOf(A.gender), true), olderRev);
    if (termsAtoB.length) source = 'relationship.js';
  }
  if (!termsAtoB.length && pureBlood) {
    if (m === 0 || n === 0) {
      termsAtoB = [directLineTerm(m, n, B.gender)];
      termsBtoA = [directLineTerm(n, m, A.gender)];
      source = 'clan-rule';
    } else if (allMaleLine) {
      const d = m - n;
      termsAtoB = [clanTerm(d, B.gender, olderFwd)];
      termsBtoA = [clanTerm(-d, A.gender, olderRev)];
      source = 'clan-rule';
      if (outOfWufu) note = '两人已出五服，按族亲称谓';
    }
  }
  if (lca && lca.id !== A.id && lca.id !== B.id) {
    const who = lca.generation ? `第${lca.generation}世祖${lca.fullName}` : lca.fullName;
    note = (note ? note + '；' : '') + `同出${who}，分别相隔${toChineseNumber(m)}代、${toChineseNumber(n)}代`;
  }
  if (!termsAtoB.length) note = (note ? note + '；' : '') + '暂无标准称谓，按关系链描述';

  return {
    ...base,
    connected: true,
    termAtoB: termsAtoB.length ? termsAtoB.join('/') : null,
    termBtoA: termsBtoA.length ? termsBtoA.join('/') : null,
    termsAtoB,
    termsBtoA,
    generationDiff,
    generationDiffText: diffText(generationDiff, A, B),
    commonAncestor: lca ? brief(lca) : null,
    stepsUpFromA: pureBlood ? m : null,
    stepsUpFromB: pureBlood ? n : null,
    path: path.map(brief),
    steps,
    chainText,
    source,
    note,
  };
}
