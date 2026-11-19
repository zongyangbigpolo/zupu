// 五代树布局：中心人物居中，祖先在上、后代在下、配偶并列。
// 输出每个节点中心坐标，Web(G6) 与小程序(Canvas) 均可直接使用。
import type { TreeEdge, TreeNode, TreeResponse } from './types.js';

export interface TreeLayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  hGap?: number;
  spouseGap?: number;
  rowHeight?: number;
}

export interface TreeLayout {
  positions: Record<string, { x: number; y: number }>;
  nodeWidth: number;
  nodeHeight: number;
}

export function layoutFamilyTree(tree: TreeResponse, opts: TreeLayoutOptions = {}): TreeLayout {
  const W = opts.nodeWidth ?? 110;
  const H = opts.nodeHeight ?? 56;
  const GAP = opts.hGap ?? 24;
  const SGAP = opts.spouseGap ?? 12;
  const ROW = opts.rowHeight ?? 130;

  const byId = new Map<string, TreeNode>(tree.nodes.map((n) => [n.id, n]));
  const parentEdges = tree.edges.filter((e) => e.type === 'parent');
  const parentsOf = new Map<string, TreeEdge[]>();
  const childrenOf = new Map<string, TreeEdge[]>();
  for (const e of parentEdges) {
    if (!parentsOf.has(e.target)) parentsOf.set(e.target, []);
    parentsOf.get(e.target)!.push(e);
    if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
    childrenOf.get(e.source)!.push(e);
  }
  const spousesOf = new Map<string, TreeNode[]>();
  for (const n of tree.nodes) {
    if (n.role === 'spouse' && n.spouseOf) {
      if (!spousesOf.has(n.spouseOf)) spousesOf.set(n.spouseOf, []);
      spousesOf.get(n.spouseOf)!.push(n);
    }
  }

  const positions: Record<string, { x: number; y: number }> = {};
  const placed = new Set<string>();
  const center = byId.get(tree.centerId);
  if (!center) return { positions, nodeWidth: W, nodeHeight: H };

  // ---------- 后代：每个后代只挂在第一个出现的父/母下面 ----------
  const layoutChildren = new Map<string, string[]>();
  const assigned = new Set<string>([center.id]);
  const queue = [center.id];
  while (queue.length) {
    const pid = queue.shift()!;
    const kids: string[] = [];
    for (const e of childrenOf.get(pid) ?? []) {
      const c = byId.get(e.target);
      if (!c || c.role !== 'descendant' || assigned.has(c.id)) continue;
      assigned.add(c.id);
      kids.push(c.id);
      queue.push(c.id);
    }
    // 后代的子女也可能挂在其配偶（外姓）名下
    for (const sp of spousesOf.get(pid) ?? []) {
      for (const e of childrenOf.get(sp.id) ?? []) {
        const c = byId.get(e.target);
        if (!c || c.role !== 'descendant' || assigned.has(c.id)) continue;
        assigned.add(c.id);
        kids.push(c.id);
        queue.push(c.id);
      }
    }
    layoutChildren.set(pid, kids);
  }

  const unitWidth = (id: string) => {
    const n = 1 + (spousesOf.get(id)?.length ?? 0);
    return n * W + (n - 1) * SGAP;
  };
  const descWidth = new Map<string, number>();
  const measureDesc = (id: string): number => {
    const kids = layoutChildren.get(id) ?? [];
    const kidsW = kids.reduce((s, k) => s + measureDesc(k), 0) + Math.max(0, kids.length - 1) * GAP;
    const w = Math.max(unitWidth(id), kidsW);
    descWidth.set(id, w);
    return w;
  };
  measureDesc(center.id);

  const placeUnit = (id: string, unitCenterX: number) => {
    const n = byId.get(id)!;
    const spouses = spousesOf.get(id) ?? [];
    const uw = unitWidth(id);
    let x = unitCenterX - uw / 2 + W / 2;
    // 女性中心人物：丈夫放左侧
    const order = n.gender === 'female' ? [...spouses, n] : [n, ...spouses];
    for (const m of order) {
      if (!placed.has(m.id)) {
        positions[m.id] = { x, y: m.depth * ROW };
        placed.add(m.id);
      }
      x += W + SGAP;
    }
  };

  const placeDesc = (id: string, left: number) => {
    const w = descWidth.get(id)!;
    const kids = layoutChildren.get(id) ?? [];
    const kidsW = kids.reduce((s, k) => s + descWidth.get(k)!, 0) + Math.max(0, kids.length - 1) * GAP;
    placeUnit(id, left + w / 2);
    let x = left + (w - kidsW) / 2;
    for (const k of kids) {
      placeDesc(k, x);
      x += descWidth.get(k)! + GAP;
    }
  };

  // 中心单元：让中心人物本人位于 x=0
  const centerUnitW = unitWidth(center.id);
  const centerOffsetInUnit =
    center.gender === 'female'
      ? centerUnitW / 2 - W / 2
      : -centerUnitW / 2 + W / 2;
  const unitCenterX = -centerOffsetInUnit;
  placeDesc(center.id, unitCenterX - descWidth.get(center.id)! / 2);

  // ---------- 祖先：倒置的树，父在左、母在右 ----------
  const ancParents = new Map<string, string[]>();
  const ancAssigned = new Set<string>([center.id]);
  const collectAnc = (id: string) => {
    const ps = (parentsOf.get(id) ?? [])
      .map((e) => byId.get(e.source))
      .filter((p): p is TreeNode => !!p && p.role === 'ancestor' && !ancAssigned.has(p.id))
      .sort((a, b) => (a.gender === 'male' ? 0 : 1) - (b.gender === 'male' ? 0 : 1));
    ps.forEach((p) => ancAssigned.add(p.id));
    ancParents.set(
      id,
      ps.map((p) => p.id),
    );
    ps.forEach((p) => collectAnc(p.id));
  };
  collectAnc(center.id);

  const ancWidth = new Map<string, number>();
  const measureAnc = (id: string): number => {
    const ps = ancParents.get(id) ?? [];
    const pw = ps.reduce((s, p) => s + measureAnc(p), 0) + Math.max(0, ps.length - 1) * GAP;
    const w = Math.max(W, pw);
    ancWidth.set(id, w);
    return w;
  };
  measureAnc(center.id);

  const placeAnc = (id: string, cx: number) => {
    const ps = ancParents.get(id) ?? [];
    const pw = ps.reduce((s, p) => s + ancWidth.get(p)!, 0) + Math.max(0, ps.length - 1) * GAP;
    let x = cx - pw / 2;
    for (const p of ps) {
      const w = ancWidth.get(p)!;
      const n = byId.get(p)!;
      if (!placed.has(p)) {
        positions[p] = { x: x + w / 2, y: n.depth * ROW };
        placed.add(p);
      }
      placeAnc(p, x + w / 2);
      x += w + GAP;
    }
  };
  placeAnc(center.id, positions[center.id].x);

  // 兜底：未被放置的节点（如祖先的其他配偶）排在其所在层最右侧
  const rowRight = new Map<number, number>();
  for (const id of placed) {
    const p = positions[id];
    rowRight.set(p.y, Math.max(rowRight.get(p.y) ?? -Infinity, p.x));
  }
  for (const n of tree.nodes) {
    if (placed.has(n.id)) continue;
    const y = n.depth * ROW;
    let x: number;
    const partner = n.spouseOf ? positions[n.spouseOf] : undefined;
    if (partner) x = Math.max(partner.x, rowRight.get(y) ?? partner.x) + W + SGAP;
    else x = (rowRight.get(y) ?? -W) + W + GAP;
    positions[n.id] = { x, y };
    rowRight.set(y, x);
    placed.add(n.id);
  }

  return { positions, nodeWidth: W, nodeHeight: H };
}
