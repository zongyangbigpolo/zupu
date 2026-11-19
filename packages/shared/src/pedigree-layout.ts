// 传统吊线谱布局（纯函数）：Web 端 SVG 与后端 PDF 共用同一份坐标。
// - 欧式：世代横向分栏（每栏标"某世"），五世一表，第五世为下一表之首；名下附字号、生卒、葬地、配偶。
// - 苏式：不分栏，仅以吊线相连，名旁只注配偶，一图到底。
// 古籍竖排：每列自上而下书写，列序自右向左；同辈兄弟长者居右。
import { eraYearText } from './history-data.js';
import type { PedigreePerson, PedigreeResponse, PedigreeStyle } from './visual.js';

export interface PedigreeLayoutOptions {
  style: PedigreeStyle;
  /** 名字字号 */
  nameSize?: number;
  /** 小注字号 */
  noteSize?: number;
  /** 小注每列字数 */
  noteCharsPerCol?: number;
  /** 欧式每表世代数 */
  gensPerChart?: number;
}

export interface PedigreeTextColumn {
  /** 该列中心 x */
  x: number;
  /** 首字顶部 y */
  y: number;
  size: number;
  text: string;
  kind: 'name' | 'note';
}

export interface PedigreeLayoutNode {
  id: string;
  person: PedigreePerson;
  /** 名字列中心 x（吊线落点） */
  anchorX: number;
  /** 盒子范围 */
  x0: number;
  x1: number;
  y: number;
  /** 名字列底部 y（吊线起点） */
  nameBottom: number;
  columns: PedigreeTextColumn[];
  /** 下接下一表 */
  continues: boolean;
}

export interface PedigreeBand {
  generation: number | null;
  label: string;
  y: number;
  height: number;
}

export interface PedigreeChart {
  title: string;
  style: PedigreeStyle;
  width: number;
  height: number;
  /** 世代标签栏（右侧）宽度 */
  labelWidth: number;
  nodes: PedigreeLayoutNode[];
  lines: [number, number][][];
  bands: PedigreeBand[];
}

const CN_DIGITS = '〇一二三四五六七八九';

/** 中文数字（1–99），如 12 → 十二 */
export function cnNumber(n: number): string {
  return n === 1 ? '一' : eraYearText(n);
}

/** 阿拉伯数字改为中文，竖排更协调：1985年3月2日 → 一九八五年三月二日 */
export function toChineseDigits(s: string): string {
  return s
    .replace(/(\d+)(?=年)/g, (m) => (m.length <= 2 ? cnNumber(+m) : [...m].map((c) => CN_DIGITS[+c]).join('')))
    .replace(/(\d+)(?=[月日岁世代])/g, (m) => cnNumber(+m))
    .replace(/\d/g, (c) => CN_DIGITS[+c]);
}

const RANK_M = ['', '长子', '次子', '三子', '四子', '五子', '六子', '七子', '八子', '九子', '十子'];
const RANK_F = ['', '长女', '次女', '三女', '四女', '五女', '六女', '七女', '八女', '九女', '十女'];

export function pedigreeRankLabel(p: PedigreePerson): string {
  if (p.relationType === 'heir') return '嗣子';
  if (p.relationType === 'jiantiao') return '兼祧子';
  if (p.relationType === 'adopted') return p.gender === 'female' ? '养女' : '养子';
  const r = p.rankInSiblings ?? 0;
  const arr = p.gender === 'female' ? RANK_F : RANK_M;
  return arr[r] ?? (p.gender === 'female' ? `${cnNumber(r)}女` : `${cnNumber(r)}子`);
}

/** 欧式名下小注 */
export function ouNote(p: PedigreePerson): string {
  const parts: string[] = [];
  if (p.courtesyName) parts.push(`字${p.courtesyName}`);
  if (p.artName) parts.push(`号${p.artName}`);
  if (p.birthText) parts.push(`生${p.birthText}`);
  if (p.deathText) parts.push(`卒${p.deathText}`);
  if (p.burialPlace) parts.push(`葬${p.burialPlace}`);
  if (p.spouses.length) parts.push(p.spouses.join('　'));
  return toChineseDigits(parts.join('　'));
}

function chunkText(s: string, n: number): string[] {
  const chars = [...s];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += n) out.push(chars.slice(i, i + n).join(''));
  return out;
}

interface Tree {
  p: PedigreePerson;
  depth: number;
  children: Tree[];
}

function buildForest(data: PedigreeResponse): Tree | null {
  const byParent = new Map<string, PedigreePerson[]>();
  for (const p of data.persons) {
    if (!p.parentId) continue;
    const arr = byParent.get(p.parentId) ?? [];
    arr.push(p);
    byParent.set(p.parentId, arr);
  }
  const root = data.persons.find((p) => p.id === data.rootId);
  if (!root) return null;
  const seen = new Set<string>();
  const build = (p: PedigreePerson, depth: number): Tree => {
    seen.add(p.id);
    const kids = (byParent.get(p.id) ?? [])
      .filter((c) => !seen.has(c.id))
      .sort((a, b) => a.sortOrder - b.sortOrder || (a.gender === b.gender ? 0 : a.gender === 'male' ? -1 : 1) || (a.rankInSiblings ?? 99) - (b.rankInSiblings ?? 99));
    return { p, depth, children: depth + 1 < data.generations ? kids.map((k) => build(k, depth + 1)) : [] };
  };
  return build(root, 0);
}

/** 生成吊线谱图表（欧式按五世分表，苏式一表） */
export function layoutPedigree(data: PedigreeResponse, opts: PedigreeLayoutOptions): PedigreeChart[] {
  const style = opts.style;
  const nameSize = opts.nameSize ?? 18;
  const noteSize = opts.noteSize ?? 11;
  const noteChars = opts.noteCharsPerCol ?? (style === 'ou' ? 16 : 8);
  const per = Math.max(2, opts.gensPerChart ?? 5);
  // 苏式默认一图到底；指定 gensPerChart 时同样分表（PDF 按纸张高度分表）
  const tree = buildForest(data);
  if (!tree) return [];
  const clanSurname = data.clan.surname;
  const baseGen = tree.p.generation;

  // 分表：欧式每表 per 世，上一表末世为下一表首世
  const charts: { roots: Tree[]; fromDepth: number; toDepth: number }[] = [];
  if (style === 'ou' || opts.gensPerChart) {
    let roots = [tree];
    let from = 0;
    while (roots.length) {
      const to = from + per - 1;
      charts.push({ roots, fromDepth: from, toDepth: to });
      const next: Tree[] = [];
      const walk = (t: Tree) => {
        if (t.depth === to) {
          if (t.children.length) next.push(t);
          return;
        }
        t.children.forEach(walk);
      };
      roots.forEach(walk);
      roots = next;
      from = to;
    }
  } else {
    charts.push({ roots: [tree], fromDepth: 0, toDepth: data.generations - 1 });
  }

  const margin = 28;
  const labelWidth = style === 'ou' ? 40 : 0;
  const nameColW = nameSize + 10;
  const noteColW = noteSize + 5;
  const nodeGap = style === 'ou' ? 14 : 18;

  return charts.map(({ roots, fromDepth, toDepth }) => {
    // 1. 每个人的文字列（逻辑坐标：名字列在左，小注列在右；最后整体镜像为自右向左）
    interface Box {
      t: Tree;
      w: number;
      nameH: number;
      h: number;
      name: string;
      notes: string[];
      left: number;
      anchor: number;
      continues: boolean;
    }
    const boxes: Box[] = [];
    const visit = (t: Tree, fn: (t: Tree) => void) => {
      fn(t);
      if (t.depth < toDepth) t.children.forEach((c) => visit(c, fn));
    };
    const boxOf = new Map<Tree, Box>();
    for (const r of roots)
      visit(r, (t) => {
        const p = t.p;
        const showSurname = t.depth === 0 || p.surname !== clanSurname;
        const name = (showSurname ? p.surname : '') + p.givenName;
        const rank = t.depth === fromDepth ? '' : pedigreeRankLabel(p);
        let noteText = style === 'ou' ? [rank, ouNote(p)].filter(Boolean).join('　') : [rank, p.spouses[0] ?? ''].filter(Boolean).join('　');
        if (style === 'su') noteText = [...noteText].slice(0, noteChars * 2).join('');
        const notes = noteText ? chunkText(noteText, noteChars) : [];
        const nameH = [...name].length * nameSize;
        const noteH = Math.max(0, ...notes.map((n) => [...n].length * noteSize));
        const b: Box = {
          t,
          w: nameColW + notes.length * noteColW,
          nameH,
          h: Math.max(nameH, noteH),
          name,
          notes,
          left: 0,
          anchor: 0,
          continues: t.depth === toDepth && t.children.length > 0,
        };
        boxes.push(b);
        boxOf.set(t, b);
      });

    // 2. 每世一栏的高度
    const depthCount = toDepth - fromDepth + 1;
    const bandH: number[] = Array(depthCount).fill(0);
    for (const b of boxes) bandH[b.t.depth - fromDepth] = Math.max(bandH[b.t.depth - fromDepth], b.h);
    const topPad = 26;
    const bottomPad = style === 'ou' ? 12 : 4;
    const bandY: number[] = [];
    let y = margin;
    for (let i = 0; i < depthCount; i++) {
      bandY.push(y);
      bandH[i] = bandH[i] ? bandH[i] + topPad + bottomPad : 0;
      y += bandH[i];
    }
    const realDepths = bandH.filter((h) => h > 0).length;
    const contentBottom = y;

    // 3. 横向排布（逻辑坐标自左向右，长者在左）
    const shift = (t: Tree, dx: number) => {
      const b = boxOf.get(t)!;
      b.left += dx;
      b.anchor += dx;
      if (t.depth < toDepth) t.children.forEach((c) => shift(c, dx));
    };
    const place = (t: Tree, left: number): number => {
      const b = boxOf.get(t)!;
      const kids = t.depth < toDepth ? t.children : [];
      if (!kids.length) {
        b.left = left;
        b.anchor = left + nameColW / 2;
        return left + b.w + nodeGap;
      }
      let cursor = left;
      for (const k of kids) cursor = place(k, cursor);
      const a0 = boxOf.get(kids[0])!.anchor;
      const a1 = boxOf.get(kids[kids.length - 1])!.anchor;
      let anchor = (a0 + a1) / 2;
      if (anchor - nameColW / 2 < left) {
        const dx = left - (anchor - nameColW / 2);
        kids.forEach((k) => shift(k, dx));
        cursor += dx;
        anchor += dx;
      }
      b.anchor = anchor;
      b.left = anchor - nameColW / 2;
      return Math.max(cursor, b.left + b.w + nodeGap);
    };
    let cursor = margin;
    for (const r of roots) cursor = place(r, cursor) + nodeGap;
    const contentRight = cursor - nodeGap * 2;
    const width = Math.max(contentRight + margin + labelWidth, 200);
    const height = contentBottom + margin;
    const mirror = (x: number) => width - labelWidth - x;

    // 4. 输出节点（镜像为自右向左）
    const nodes: PedigreeLayoutNode[] = boxes.map((b) => {
      const top = bandY[b.t.depth - fromDepth] + topPad;
      const anchorX = mirror(b.anchor);
      const columns: PedigreeTextColumn[] = [{ x: anchorX, y: top, size: nameSize, text: b.name, kind: 'name' }];
      b.notes.forEach((n, i) => columns.push({ x: anchorX - nameColW / 2 - noteColW * i - noteColW / 2, y: top + 2, size: noteSize, text: n, kind: 'note' }));
      return {
        id: b.t.p.id,
        person: b.t.p,
        anchorX,
        x0: mirror(b.left + b.w),
        x1: mirror(b.left),
        y: top,
        nameBottom: top + b.nameH,
        columns,
        continues: b.continues,
      };
    });

    // 5. 吊线
    const lines: [number, number][][] = [];
    const nodeOf = new Map(nodes.map((n) => [n.id, n]));
    for (const b of boxes) {
      const t = b.t;
      if (t.depth >= toDepth || !t.children.length) continue;
      const pn = nodeOf.get(t.p.id)!;
      const kids = t.children.map((c) => nodeOf.get(c.p.id)!).filter(Boolean);
      const childTop = bandY[t.depth + 1 - fromDepth] + topPad;
      const midY = childTop - 12;
      lines.push([
        [pn.anchorX, pn.nameBottom + 3],
        [pn.anchorX, midY],
      ]);
      const xs = [pn.anchorX, ...kids.map((k) => k.anchorX)];
      if (kids.length > 1 || kids[0].anchorX !== pn.anchorX)
        lines.push([
          [Math.min(...xs), midY],
          [Math.max(...xs), midY],
        ]);
      for (const k of kids)
        lines.push([
          [k.anchorX, midY],
          [k.anchorX, childTop - 3],
        ]);
    }

    const bands: PedigreeBand[] = [];
    for (let i = 0; i < realDepths; i++) {
      const gen = baseGen != null ? baseGen + fromDepth + i : null;
      bands.push({ generation: gen, label: `${cnNumber(gen ?? fromDepth + i + 1)}世`, y: bandY[i], height: bandH[i] });
    }
    const g0 = bands[0]?.generation ?? fromDepth + 1;
    const g1 = bands[bands.length - 1]?.generation ?? fromDepth + realDepths;
    return {
      title: `第${cnNumber(g0)}世至第${cnNumber(g1)}世`,
      style,
      width,
      height,
      labelWidth,
      nodes,
      lines,
      bands,
    };
  });
}

/**
 * 横向分页：自右向左切分，尽量不把人物切开。
 * 返回每页的 [x0, x1]（图表坐标），第一页为最右侧。
 */
export function paginateChart(chart: PedigreeChart, pageWidth: number, contentRight = chart.width - chart.labelWidth): [number, number][] {
  const pages: [number, number][] = [];
  let right = contentRight;
  while (right > 0) {
    let left = Math.max(0, right - pageWidth);
    if (left > 0) {
      const crossing = (x: number) => chart.nodes.some((n) => n.x0 - 4 < x && n.x1 + 4 > x);
      let x = left;
      while (x < right - pageWidth / 2 && crossing(x)) x += 2;
      if (!crossing(x)) left = x;
    }
    pages.push([left, right]);
    right = left;
  }
  return pages;
}
