import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EffectiveRole } from '@zupu/shared';
import { AccessService } from '../../common/access.service';
import { canSeeSensitive } from '../../common/mappers';

export interface PersonLite {
  id: string;
  fullName: string;
  generation: number | null;
  isLiving: boolean;
  privacyLevel: 'public' | 'members' | 'admins';
}

/** 可视化模块共用：支系人员集合、人物隐私过滤 */
@Injectable()
export class VisualHelper {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
  ) {}

  /**
   * 人员过滤集合：personId 只含本人；branchRootId 含支系始祖及其全部后代（含配偶）。
   * 返回 null 表示不过滤。两个参数都会校验必须属于本族。
   */
  async scopeIds(clanId: string, q: { branchRootId?: string; personId?: string }): Promise<Set<string> | null> {
    if (q.personId) {
      await this.access.assertPersonsInClan(clanId, [q.personId]);
      return new Set([q.personId]);
    }
    if (!q.branchRootId) return null;
    await this.access.assertPersonsInClan(clanId, [q.branchRootId]);
    const rows: { id: string }[] = await this.ds.query(
      `WITH RECURSIVE d(id, depth) AS (
         SELECT $1::uuid, 0
         UNION
         SELECT pc.child_id, d.depth + 1 FROM d JOIN parent_child pc ON pc.parent_id = d.id AND pc.clan_id = $2 WHERE d.depth < 80
       )
       SELECT DISTINCT id FROM d
       UNION
       SELECT CASE WHEN m.husband_id = d.id THEN m.wife_id ELSE m.husband_id END
         FROM d JOIN marriage m ON (m.husband_id = d.id OR m.wife_id = d.id) AND m.clan_id = $2`,
      [q.branchRootId, clanId],
    );
    return new Set(rows.map((r) => r.id));
  }

  async personsByIds(clanId: string, ids: (string | null | undefined)[]): Promise<Map<string, PersonLite>> {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uniq.length) return new Map();
    const rows: PersonLite[] = await this.ds.query(
      `SELECT id, full_name AS "fullName", generation, is_living AS "isLiving", privacy_level AS "privacyLevel"
         FROM person WHERE clan_id = $1 AND id = ANY($2::uuid[])`,
      [clanId, uniq],
    );
    return new Map(rows.map((r) => [r.id, r]));
  }

  /** 与人物关联的记录是否对当前角色可见（在世者/隐私人物的行踪按敏感信息处理） */
  static visible(p: PersonLite | undefined, role: EffectiveRole) {
    return !p || canSeeSensitive(p, role);
  }
}
