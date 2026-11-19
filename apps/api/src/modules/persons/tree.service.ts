import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { TreeEdge, TreeLine, TreeNode, TreeResponse } from '@zupu/shared';
import { AccessService } from '../../common/access.service';
import type { AuthUser } from '../../common/auth';
import { rowToPerson, toBrief } from '../../common/mappers';

const MAX_DESCENDANTS = 3000;

/**
 * 五代树：PostgreSQL WITH RECURSIVE 一次取出祖先子图与后代子图。
 * - line=main：只走宗法主线（is_main_line），过继子挂在嗣父下
 * - line=birth：优先走亲生关系（无亲生记录时退回主线）
 */
@Injectable()
export class TreeService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
  ) {}

  private lineFilter(line: TreeLine) {
    return line === 'birth'
      ? `(pc.relation_type = 'biological' OR (pc.is_main_line AND NOT EXISTS (
            SELECT 1 FROM parent_child b WHERE b.child_id = pc.child_id AND b.relation_type = 'biological')))`
      : 'pc.is_main_line';
  }

  async tree(user: AuthUser | null, id: string, upIn = 5, downIn = 5, line: TreeLine = 'main'): Promise<TreeResponse> {
    const { role, clan } = await this.access.personAccess(user, id);
    const up = Math.min(Math.max(upIn, 0), 10);
    const down = Math.min(Math.max(downIn, 0), 10);
    const f = this.lineFilter(line);

    const anc: { id: string; depth: number }[] = await this.ds.query(
      `WITH RECURSIVE anc(id, depth, path) AS (
         SELECT $1::uuid, 0, ARRAY[$1::uuid]
         UNION ALL
         SELECT pc.parent_id, anc.depth + 1, anc.path || pc.parent_id
           FROM anc JOIN parent_child pc ON pc.child_id = anc.id
          WHERE anc.depth < $2 AND NOT pc.parent_id = ANY(anc.path) AND ${f}
       )
       SELECT DISTINCT ON (id) id, depth FROM anc ORDER BY id, depth`,
      [id, up],
    );
    const des: { id: string; depth: number }[] = await this.ds.query(
      `WITH RECURSIVE des(id, depth, path) AS (
         SELECT $1::uuid, 0, ARRAY[$1::uuid]
         UNION ALL
         SELECT pc.child_id, des.depth + 1, des.path || pc.child_id
           FROM des JOIN parent_child pc ON pc.parent_id = des.id
          WHERE des.depth < $2 AND NOT pc.child_id = ANY(des.path) AND ${f}
       )
       SELECT id, min(depth) AS depth FROM des GROUP BY id ORDER BY min(depth) LIMIT ${MAX_DESCENDANTS + 1}`,
      [id, down],
    );
    const truncated = des.length > MAX_DESCENDANTS;
    if (truncated) des.length = MAX_DESCENDANTS;

    const depth = new Map<string, number>();
    const roleOf = new Map<string, TreeNode['role']>();
    for (const a of anc) if (a.id !== id) (depth.set(a.id, -a.depth), roleOf.set(a.id, 'ancestor'));
    for (const d of des) if (d.id !== id && !depth.has(d.id)) (depth.set(d.id, d.depth), roleOf.set(d.id, 'descendant'));
    depth.set(id, 0);
    roleOf.set(id, 'center');

    // 中心人物与后代的配偶（并列显示）
    const lineIds = [...depth.keys()];
    const descSide = lineIds.filter((x) => roleOf.get(x) !== 'ancestor');
    const marriages: any[] = await this.ds.query(
      `SELECT husband_id, wife_id, type, "order" FROM marriage
        WHERE husband_id = ANY($1::uuid[]) OR wife_id = ANY($1::uuid[]) ORDER BY "order"`,
      [lineIds],
    );
    const spouseOf = new Map<string, string>();
    const spouseEdges: TreeEdge[] = [];
    const descSet = new Set(descSide);
    for (const m of marriages) {
      const h = m.husband_id as string;
      const w = m.wife_id as string;
      if (depth.has(h) && depth.has(w)) {
        spouseEdges.push({ source: h, target: w, type: 'spouse' });
        continue;
      }
      const [inTree, other] = depth.has(h) ? [h, w] : [w, h];
      if (!descSet.has(inTree) || spouseOf.has(other)) continue;
      spouseOf.set(other, inTree);
      depth.set(other, depth.get(inTree)!);
      roleOf.set(other, 'spouse');
      spouseEdges.push({ source: h, target: w, type: 'spouse' });
    }

    const allIds = [...depth.keys()];
    const rows: any[] = await this.ds.query(
      `SELECT p.*,
              EXISTS (SELECT 1 FROM parent_child pc WHERE pc.child_id = p.id AND ${f}) AS has_parent,
              EXISTS (SELECT 1 FROM parent_child pc WHERE pc.parent_id = p.id AND ${f}) AS has_child
         FROM person p WHERE p.id = ANY($1::uuid[]) AND p.clan_id = $2`,
      [allIds, clan.id],
    );
    const edgesRows: any[] = await this.ds.query(
      `SELECT parent_id, child_id, relation_type, is_main_line, sort_order FROM parent_child
        WHERE parent_id = ANY($1::uuid[]) AND child_id = ANY($1::uuid[])
        ORDER BY sort_order, child_id`,
      [allIds],
    );
    const rowsById = new Map(rows.map((r) => [r.id, r]));
    const nodes: TreeNode[] = allIds
      .filter((x) => rowsById.has(x))
      .map((x) => {
        const r = rowsById.get(x);
        const d = depth.get(x)!;
        const rl = roleOf.get(x)!;
        return {
          ...toBrief(rowToPerson(r), role),
          role: rl,
          depth: d,
          spouseOf: spouseOf.get(x),
          hasMoreUp: rl !== 'spouse' && rl !== 'descendant' && d === -up && r.has_parent,
          hasMoreDown: rl !== 'spouse' && rl !== 'ancestor' && d === down && r.has_child,
        };
      });
    // 子女按排行排序，便于布局
    const rank = new Map(nodes.map((n) => [n.id, n.rankInSiblings ?? 99]));
    const parentEdges: TreeEdge[] = edgesRows
      .sort((a, b) => a.sort_order - b.sort_order || (rank.get(a.child_id)! - rank.get(b.child_id)!))
      .map((e) => ({
        source: e.parent_id,
        target: e.child_id,
        type: 'parent' as const,
        relationType: e.relation_type,
        isMainLine: e.is_main_line,
      }));
    return { centerId: id, line, up, down, nodes, edges: [...parentEdges, ...spouseEdges], truncated };
  }
}
