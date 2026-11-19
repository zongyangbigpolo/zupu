import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type {
  ClanLinkInfo,
  ClanLinkLineage,
  ClanLinkLineageSide,
  ClanPublicBrief,
  CrossClanKinshipResult,
  EffectiveRole,
  LinkedPersonItem,
  PersonBrief,
} from '@zupu/shared';
import { ClanEntity, PersonEntity } from '../../entities';
import { ClanLinkEntity } from '../../entities/m5';
import { AccessService, isUuid } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/auth';
import { rowToPerson, toBrief } from '../../common/mappers';
import { CrossClanKinshipAdapter } from './cross-clan-kinship.adapter';

const RANK: Record<EffectiveRole, number> = { visitor: 0, member: 1, admin: 2, super: 3 };
const isMemberPlus = (r: EffectiveRole | null): r is EffectiveRole => !!r && RANK[r] >= RANK.member;
const isAdminRole = (r: EffectiveRole | null) => r === 'admin' || r === 'super';

function clanBrief(c: ClanEntity): ClanPublicBrief {
  return { id: c.id, name: c.name, surname: c.surname, hallName: c.hallName, origin: c.origin };
}

interface ViewerRoles {
  proposer: EffectiveRole | null;
  target: EffectiveRole | null;
}

@Injectable()
export class ClanLinksService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly adapter: CrossClanKinshipAdapter,
    @InjectRepository(ClanLinkEntity) private readonly links: Repository<ClanLinkEntity>,
    @InjectRepository(ClanEntity) private readonly clans: Repository<ClanEntity>,
    @InjectRepository(PersonEntity) private readonly persons: Repository<PersonEntity>,
  ) {}

  /** 当前用户在某族的有效角色；无权访问返回 null（不抛错，用于跨族判断） */
  private async roleIn(user: AuthUser | null, clanId: string): Promise<EffectiveRole | null> {
    try {
      return (await this.access.clanAccess(user, clanId)).role;
    } catch {
      return null;
    }
  }

  private async roles(user: AuthUser | null, l: ClanLinkEntity): Promise<ViewerRoles> {
    const [proposer, target] = await Promise.all([this.roleIn(user, l.proposerClanId), this.roleIn(user, l.targetClanId)]);
    return { proposer, target };
  }

  private async getLink(id: string) {
    if (!isUuid(id)) throw new NotFoundException('连谱记录不存在');
    const l = await this.links.findOne({ where: { id } });
    if (!l) throw new NotFoundException('连谱记录不存在');
    return l;
  }

  /** 只有任一方家族的族人（或超级管理员）能看到已连谱的数据 */
  private async viewable(user: AuthUser | null, l: ClanLinkEntity) {
    const r = await this.roles(user, l);
    if (!isMemberPlus(r.proposer) && !isMemberPlus(r.target)) throw new ForbiddenException('您不是连谱双方家族的成员');
    if (l.status !== 'approved') throw new ForbiddenException('连谱尚未生效');
    return r;
  }

  private async toInfos(user: AuthUser | null, list: ClanLinkEntity[], viewingClanId?: string): Promise<ClanLinkInfo[]> {
    if (!list.length) return [];
    const clanIds = [...new Set(list.flatMap((l) => [l.proposerClanId, l.targetClanId]))];
    const personIds = [...new Set(list.flatMap((l) => [l.proposerPersonId, l.targetPersonId]).filter(Boolean) as string[])];
    const [clans, persons] = await Promise.all([
      this.clans.find({ where: { id: In(clanIds) } }),
      personIds.length ? this.persons.find({ where: { id: In(personIds) } }) : Promise.resolve([]),
    ]);
    const clanMap = new Map(clans.map((c) => [c.id, c]));
    const personMap = new Map(persons.map((p) => [p.id, p]));
    const roleCache = new Map<string, EffectiveRole | null>();
    const role = async (clanId: string) => {
      if (!roleCache.has(clanId)) roleCache.set(clanId, await this.roleIn(user, clanId));
      return roleCache.get(clanId)!;
    };
    const out: ClanLinkInfo[] = [];
    for (const l of list) {
      const [rp, rt] = [await role(l.proposerClanId), await role(l.targetClanId)];
      const brief = (id: string | null, r: EffectiveRole | null): PersonBrief | null => {
        const p = id ? personMap.get(id) : null;
        return p ? toBrief(p, r ?? 'visitor') : null;
      };
      out.push({
        id: l.id,
        status: l.status,
        note: l.note,
        decisionNote: l.decisionNote,
        createdAt: l.createdAt.toISOString(),
        decidedAt: l.decidedAt ? l.decidedAt.toISOString() : null,
        proposer: { clan: clanBrief(clanMap.get(l.proposerClanId)!), person: brief(l.proposerPersonId, rp) },
        target: { clan: clanBrief(clanMap.get(l.targetClanId)!), person: brief(l.targetPersonId, rt) },
        direction: viewingClanId ? (viewingClanId === l.proposerClanId ? 'outgoing' : 'incoming') : undefined,
        canApprove: l.status === 'pending' && isAdminRole(rt),
        canRevoke: (l.status === 'pending' || l.status === 'approved') && (isAdminRole(rp) || isAdminRole(rt)),
      });
    }
    return out;
  }

  async list(user: AuthUser | null, clanId: string) {
    const { role } = await this.access.clanAccess(user, clanId, 'member');
    const qb = this.links
      .createQueryBuilder('l')
      .where('(l.proposerClanId = :clanId OR l.targetClanId = :clanId)', { clanId })
      .orderBy('l.createdAt', 'DESC');
    if (!AccessService.isAdmin(role)) qb.andWhere(`l.status = 'approved'`);
    return this.toInfos(user, await qb.getMany(), clanId);
  }

  async pendingForSuper(user: AuthUser) {
    const list = await this.links.find({ where: { status: 'pending' }, order: { createdAt: 'DESC' } });
    return this.toInfos(user, list);
  }

  /** 发起连谱时查找对方家族（只返回家族公开信息） */
  async candidates(user: AuthUser, clanId: string, q: string) {
    await this.access.clanAccess(user, clanId, 'admin');
    const kw = (q ?? '').trim();
    if (!kw) return [];
    const rows = await this.clans
      .createQueryBuilder('c')
      .where(`c.status = 'active' AND c.id <> :clanId`, { clanId })
      .andWhere('(c.name ILIKE :kw OR c.surname = :q OR c.hallName ILIKE :kw OR c.origin ILIKE :kw)', { kw: `%${kw}%`, q: kw })
      .orderBy('c.name')
      .limit(20)
      .getMany();
    return rows.map(clanBrief);
  }

  async propose(user: AuthUser, clanId: string, dto: { targetClanId: string; personId: string; note?: string | null }) {
    await this.access.clanAccess(user, clanId, 'admin');
    if (!isUuid(dto.targetClanId) || dto.targetClanId === clanId) throw new BadRequestException('请选择另一个家族');
    const target = await this.clans.findOne({ where: { id: dto.targetClanId } });
    if (!target || target.status !== 'active') throw new NotFoundException('对方家族不存在或已停用');
    await this.access.assertPersonsInClan(clanId, [dto.personId]);
    const active = await this.links
      .createQueryBuilder('l')
      .where(`l.status IN ('pending','approved')`)
      .andWhere(
        '((l.proposerClanId = :a AND l.targetClanId = :b) OR (l.proposerClanId = :b AND l.targetClanId = :a))',
        { a: clanId, b: dto.targetClanId },
      )
      .getOne();
    if (active) throw new ConflictException(active.status === 'approved' ? '两族已连谱' : '已有待处理的连谱申请');
    const saved = await this.links.save(
      this.links.create({
        proposerClanId: clanId,
        proposerPersonId: dto.personId,
        targetClanId: dto.targetClanId,
        note: dto.note ?? null,
        proposedBy: user.id,
        status: 'pending',
      }),
    );
    await this.logBoth(user, saved, 'propose', null);
    return (await this.toInfos(user, [saved], clanId))[0];
  }

  async approve(user: AuthUser, id: string, dto: { personId: string; note?: string | null }) {
    const l = await this.getLink(id);
    if (l.status !== 'pending') throw new BadRequestException('该申请已处理');
    // 必须是对方（被申请）家族的管理员，或超级管理员
    await this.access.clanAccess(user, l.targetClanId, 'admin');
    await this.access.assertPersonsInClan(l.targetClanId, [dto.personId]);
    const before = { ...l };
    l.targetPersonId = dto.personId;
    l.status = 'approved';
    l.decisionNote = dto.note ?? null;
    l.decidedBy = user.id;
    l.decidedAt = new Date();
    const saved = await this.links.save(l);
    await this.logBoth(user, saved, 'approve', before);
    return (await this.toInfos(user, [saved], l.targetClanId))[0];
  }

  async reject(user: AuthUser, id: string, note?: string | null) {
    const l = await this.getLink(id);
    if (l.status !== 'pending') throw new BadRequestException('该申请已处理');
    await this.access.clanAccess(user, l.targetClanId, 'admin');
    const before = { ...l };
    Object.assign(l, { status: 'rejected', decisionNote: note ?? null, decidedBy: user.id, decidedAt: new Date() });
    const saved = await this.links.save(l);
    await this.logBoth(user, saved, 'reject', before);
    return (await this.toInfos(user, [saved], l.targetClanId))[0];
  }

  async revoke(user: AuthUser, id: string) {
    const l = await this.getLink(id);
    if (l.status !== 'pending' && l.status !== 'approved') throw new BadRequestException('该连谱已失效');
    const r = await this.roles(user, l);
    if (!isAdminRole(r.proposer) && !isAdminRole(r.target)) throw new ForbiddenException('仅连谱双方的家族管理员可解除');
    const before = { ...l };
    Object.assign(l, { status: 'revoked', decidedBy: user.id, decidedAt: new Date() });
    const saved = await this.links.save(l);
    await this.logBoth(user, saved, 'revoke', before);
    return (await this.toInfos(user, [saved]))[0];
  }

  private async logBoth(user: AuthUser, l: ClanLinkEntity, action: string, before: unknown) {
    for (const clanId of [l.proposerClanId, l.targetClanId])
      await this.audit.log({ clanId, userId: user.id, entity: 'clan_link', entityId: l.id, action, before, after: l });
  }

  private async sides(user: AuthUser | null, l: ClanLinkEntity, r: ViewerRoles) {
    const clans = await this.clans.find({ where: { id: In([l.proposerClanId, l.targetClanId]) } });
    const byId = new Map(clans.map((c) => [c.id, c]));
    const mk = (clanId: string, anchorId: string, role: EffectiveRole | null) => ({
      clan: clanBrief(byId.get(clanId)!),
      anchorId,
      role: role ?? ('visitor' as EffectiveRole),
      restricted: !isMemberPlus(role),
    });
    return [mk(l.proposerClanId, l.proposerPersonId, r.proposer), mk(l.targetClanId, l.targetPersonId!, r.target)] as const;
  }

  /** 共同祖先链：双方对应点人物及其主线祖先、子女 */
  async lineage(user: AuthUser | null, id: string): Promise<ClanLinkLineage> {
    const l = await this.getLink(id);
    const r = await this.viewable(user, l);
    const [a, b] = await this.sides(user, l, r);
    const side = async (s: typeof a): Promise<ClanLinkLineageSide> => {
      const anchor = await this.persons.findOneOrFail({ where: { id: s.anchorId } });
      const ancestors: PersonBrief[] = [];
      const seen = new Set([anchor.id]);
      let cur = anchor.id;
      for (let i = 0; i < 60; i++) {
        const rows = await this.ds.query(
          `SELECT p.* FROM parent_child pc JOIN person p ON p.id = pc.parent_id
            WHERE pc.child_id = $1 AND pc.clan_id = $2
            ORDER BY pc.is_main_line DESC, p.is_external ASC, (p.gender = 'male') DESC LIMIT 1`,
          [cur, s.clan.id],
        );
        if (!rows.length || seen.has(rows[0].id)) break;
        seen.add(rows[0].id);
        ancestors.push(toBrief(rowToPerson(rows[0]), s.role));
        cur = rows[0].id;
      }
      const kids = await this.ds.query(
        `SELECT p.* FROM parent_child pc JOIN person p ON p.id = pc.child_id
          WHERE pc.parent_id = $1 AND pc.clan_id = $2 AND NOT (p.is_living AND p.privacy_level = 'admins' AND $3)
          ORDER BY pc.sort_order, p.rank_in_siblings NULLS LAST`,
        [anchor.id, s.clan.id, s.restricted],
      );
      const [{ n }] = await this.ds.query(
        `WITH RECURSIVE down(id) AS (
           SELECT $1::uuid UNION SELECT pc.child_id FROM parent_child pc JOIN down ON pc.parent_id = down.id WHERE pc.clan_id = $2
         ) SELECT count(*)::int - 1 AS n FROM down`,
        [anchor.id, s.clan.id],
      );
      return {
        clan: s.clan,
        anchor: toBrief(anchor, s.role),
        ancestors,
        children: kids.map((k: any) => toBrief(rowToPerson(k), s.role)),
        descendantCount: n,
      };
    };
    const [sa, sb] = await Promise.all([side(a), side(b)]);
    const info = (await this.toInfos(user, [l]))[0];
    const offset = sa.anchor.generation != null && sb.anchor.generation != null ? sa.anchor.generation - sb.anchor.generation : 0;
    return { link: info, sides: [sa, sb], generationOffset: offset };
  }

  /** 在连谱的某一方中搜索人物：本族族人可搜全族，否则只能搜连谱支系 */
  async searchPersons(user: AuthUser | null, id: string, clanId: string, q: string): Promise<LinkedPersonItem[]> {
    const l = await this.getLink(id);
    const r = await this.viewable(user, l);
    if (clanId !== l.proposerClanId && clanId !== l.targetClanId) throw new BadRequestException('家族不在该连谱中');
    const [a, b] = await this.sides(user, l, r);
    const s = clanId === a.clan.id ? a : b;
    const kw = (q ?? '').trim();
    if (!kw) return [];
    const params: unknown[] = [clanId, `%${kw}%`];
    let filter = '';
    if (s.restricted) {
      const ids = [...(await this.adapter.lineageIds(clanId, s.anchorId))];
      if (!ids.length) return [];
      params.push(ids);
      filter = 'AND id = ANY($3::uuid[])';
    }
    const rows = await this.ds.query(
      `SELECT * FROM person WHERE clan_id = $1 AND (full_name ILIKE $2 OR courtesy_name ILIKE $2) ${filter}
        ORDER BY generation NULLS LAST, full_name LIMIT 30`,
      params,
    );
    return rows.map((row: any) => ({ ...toBrief(rowToPerson(row), s.role), clanId }));
  }

  async kinship(user: AuthUser | null, id: string, from: string, to: string): Promise<CrossClanKinshipResult> {
    if (!isUuid(from) || !isUuid(to)) throw new BadRequestException('请选择两位人员');
    const l = await this.getLink(id);
    const r = await this.viewable(user, l);
    const [a, b] = await this.sides(user, l, r);
    const res = await this.adapter.compute(l.id, a, b, from, to);
    if (!res) throw new NotFoundException('人员不在连谱可见范围内');
    return res;
  }
}
