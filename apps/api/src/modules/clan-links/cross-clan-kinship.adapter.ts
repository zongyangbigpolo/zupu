import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { computeKinship, KinshipGraph, type KinMarriage, type KinParentEdge, type KinPerson } from '@zupu/shared/kinship';
import type { ClanPublicBrief, CrossClanKinshipResult, EffectiveRole, PersonBrief } from '@zupu/shared';
import { canSeeSensitive } from '../../common/mappers';

export interface ClanGraphData {
  persons: (KinPerson & { privacyLevel: string })[];
  edges: KinParentEdge[];
  marriages: KinMarriage[];
}

export interface LinkSideInput {
  clan: ClanPublicBrief;
  anchorId: string;
  /** 当前用户在该族的角色（不是族人时为 visitor） */
  role: EffectiveRole;
  /** 非本族族人只能看到连谱相关的支系（对应点的祖先、后代及其配偶） */
  restricted: boolean;
}

/**
 * 跨家族亲属关系适配器：把两族的关系图在"对应点人物"处合并（target 一侧的对应点并入 proposer 一侧），
 * target 族的世代号按对应点平移到 proposer 族的编号，然后复用同一个 computeKinship。
 * 不修改单族 KinshipService / KinshipCache。
 */
@Injectable()
export class CrossClanKinshipAdapter {
  constructor(private readonly ds: DataSource) {}

  /** 对应点人物的连谱支系：祖先 + 后代 + 他们的配偶；排除"仅管理员可见"的在世者 */
  async lineageIds(clanId: string, anchorId: string): Promise<Set<string>> {
    const rows: { id: string }[] = await this.ds.query(
      `WITH RECURSIVE up(id) AS (
         SELECT $2::uuid
         UNION SELECT pc.parent_id FROM parent_child pc JOIN up ON pc.child_id = up.id WHERE pc.clan_id = $1
       ), down(id) AS (
         SELECT $2::uuid
         UNION SELECT pc.child_id FROM parent_child pc JOIN down ON pc.parent_id = down.id WHERE pc.clan_id = $1
       ), core AS (SELECT id FROM up UNION SELECT id FROM down),
       with_spouse AS (
         SELECT id FROM core
         UNION SELECT CASE WHEN m.husband_id = c.id THEN m.wife_id ELSE m.husband_id END
           FROM marriage m JOIN core c ON (m.husband_id = c.id OR m.wife_id = c.id) WHERE m.clan_id = $1
       )
       SELECT p.id FROM with_spouse w JOIN person p ON p.id = w.id
        WHERE p.clan_id = $1 AND NOT (p.is_living AND p.privacy_level = 'admins')`,
      [clanId, anchorId],
    );
    return new Set(rows.map((r) => r.id));
  }

  async loadClan(clanId: string, only?: Set<string> | null): Promise<ClanGraphData> {
    const [persons, edges, marriages] = await Promise.all([
      this.ds.query(
        `SELECT id, full_name, gender, generation, generation_char, rank_in_siblings, is_living, is_external,
                birth_text, death_text, birth_date::text AS birth_date, privacy_level
           FROM person WHERE clan_id = $1`,
        [clanId],
      ),
      this.ds.query(
        `SELECT parent_id, child_id, relation_type, is_main_line FROM parent_child WHERE clan_id = $1 ORDER BY sort_order`,
        [clanId],
      ),
      this.ds.query(`SELECT husband_id, wife_id FROM marriage WHERE clan_id = $1`, [clanId]),
    ]);
    const keep = (id: string) => !only || only.has(id);
    return {
      persons: persons
        .filter((r: any) => keep(r.id))
        .map((r: any) => ({
          id: r.id,
          fullName: r.full_name,
          gender: r.gender,
          generation: r.generation,
          generationChar: r.generation_char,
          rankInSiblings: r.rank_in_siblings,
          isLiving: r.is_living,
          isExternal: r.is_external,
          birthText: r.birth_text,
          deathText: r.death_text,
          birthDate: r.birth_date,
          privacyLevel: r.privacy_level,
        })),
      edges: edges
        .filter((e: any) => keep(e.parent_id) && keep(e.child_id))
        .map((e: any) => ({ parentId: e.parent_id, childId: e.child_id, relationType: e.relation_type, isMainLine: e.is_main_line })),
      marriages: marriages
        .filter((m: any) => keep(m.husband_id) && keep(m.wife_id))
        .map((m: any) => ({ husbandId: m.husband_id, wifeId: m.wife_id })),
    };
  }

  async load(side: LinkSideInput) {
    const only = side.restricted ? await this.lineageIds(side.clan.id, side.anchorId) : null;
    return this.loadClan(side.clan.id, only);
  }

  /** @returns null 表示 from/to 不在可见范围内 */
  async compute(linkId: string, a: LinkSideInput, b: LinkSideInput, fromId: string, toId: string): Promise<CrossClanKinshipResult | null> {
    const [da, db] = await Promise.all([this.load(a), this.load(b)]);
    const anchorA = da.persons.find((p) => p.id === a.anchorId);
    const anchorB = db.persons.find((p) => p.id === b.anchorId);
    if (!anchorA || !anchorB) return null;
    const offset = anchorA.generation != null && anchorB.generation != null ? anchorA.generation - anchorB.generation : null;
    const remap = (id: string) => (id === b.anchorId ? a.anchorId : id);

    type Origin = { clanId: string; role: EffectiveRole; generation: number | null; privacyLevel: string; isLiving: boolean };
    const origin = new Map<string, Origin>();
    for (const p of da.persons)
      origin.set(p.id, { clanId: a.clan.id, role: a.role, generation: p.generation, privacyLevel: p.privacyLevel, isLiving: p.isLiving });
    const bPersons: KinPerson[] = [];
    for (const p of db.persons) {
      if (p.id === b.anchorId) continue;
      origin.set(p.id, { clanId: b.clan.id, role: b.role, generation: p.generation, privacyLevel: p.privacyLevel, isLiving: p.isLiving });
      // 世代号平移到 proposer 族的编号，使辈分差可跨族比较
      bPersons.push({ ...p, generation: p.generation != null && offset != null ? p.generation + offset : null });
    }
    const graph = new KinshipGraph(
      [...da.persons, ...bPersons],
      [...da.edges, ...db.edges.map((e) => ({ ...e, parentId: remap(e.parentId), childId: remap(e.childId) }))],
      [...da.marriages, ...db.marriages.map((m) => ({ husbandId: remap(m.husbandId), wifeId: remap(m.wifeId) }))],
    );
    const from = remap(fromId);
    const to = remap(toId);
    if (!graph.persons.has(from) || !graph.persons.has(to)) return null;
    const r = computeKinship(graph, from, to);

    // 显示时恢复各族自己的世代号；按所属家族中的角色做隐私遮蔽
    const fix = <T extends PersonBrief>(x: T): T => {
      const o = origin.get(x.id);
      if (!o) return x;
      const out = { ...x, generation: o.generation };
      if (!canSeeSensitive({ isLiving: o.isLiving, privacyLevel: o.privacyLevel as any }, o.role)) out.birthText = null;
      return out;
    };
    const personClan: Record<string, string> = {};
    for (const p of r.path) personClan[p.id] = origin.get(p.id)?.clanId ?? a.clan.id;
    return {
      ...r,
      from: fix(r.from),
      to: fix(r.to),
      commonAncestor: r.commonAncestor ? fix(r.commonAncestor) : null,
      path: r.path.map(fix),
      linkId,
      personClan,
      clans: [a.clan, b.clan],
    };
  }
}
