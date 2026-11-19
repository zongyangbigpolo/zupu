import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { KinshipGraph, type KinPerson } from '@zupu/shared/kinship';

/**
 * 每个家族的关系图内存缓存（单族上万人也只有几 MB）。
 * 任何人员/亲子/婚姻写操作后调用 invalidate(clanId)。多实例部署时可换成 Redis 版本号。
 */
@Injectable()
export class KinshipCache {
  private cache = new Map<string, { graph: KinshipGraph; at: number }>();
  private readonly ttlMs = 10 * 60 * 1000;

  constructor(private readonly ds: DataSource) {}

  invalidate(clanId: string) {
    this.cache.delete(clanId);
  }

  async graph(clanId: string): Promise<KinshipGraph> {
    const hit = this.cache.get(clanId);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.graph;
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
    const kp: (KinPerson & { privacyLevel: string })[] = persons.map((r: any) => ({
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
    }));
    const graph = new KinshipGraph(
      kp,
      edges.map((e: any) => ({ parentId: e.parent_id, childId: e.child_id, relationType: e.relation_type, isMainLine: e.is_main_line })),
      marriages.map((m: any) => ({ husbandId: m.husband_id, wifeId: m.wife_id })),
    );
    this.cache.set(clanId, { graph, at: Date.now() });
    return graph;
  }
}
