import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { checkGeneration, type Clan, type ClanStats, type ClanWithRole, type Membership } from '@zupu/shared';
import { ClanEntity, MembershipEntity, PersonEntity } from '../../entities';
import { AccessService, isUuid } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/auth';
import { AuthService } from '../auth/auth.service';

export function toClan(c: ClanEntity): Clan {
  return {
    id: c.id,
    name: c.name,
    surname: c.surname,
    hallName: c.hallName,
    origin: c.origin,
    generationPoem: c.generationPoem,
    poemStartGeneration: c.poemStartGeneration,
    description: c.description,
    founderId: c.founderId,
    visibility: c.visibility,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
  };
}

export const CLAN_EDITABLE = [
  'name',
  'surname',
  'hallName',
  'origin',
  'generationPoem',
  'poemStartGeneration',
  'description',
  'visibility',
  'founderId',
] as const;

@Injectable()
export class ClansService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    @InjectRepository(ClanEntity) private readonly clans: Repository<ClanEntity>,
    @InjectRepository(MembershipEntity) private readonly memberships: Repository<MembershipEntity>,
    @InjectRepository(PersonEntity) private readonly persons: Repository<PersonEntity>,
  ) {}

  async list(user: AuthUser | null): Promise<ClanWithRole[]> {
    const rows: any[] = await this.ds.query(
      `SELECT c.id, m.role, m.linked_person_id,
              (SELECT count(*)::int FROM person p WHERE p.clan_id = c.id) AS person_count
         FROM clan c
         LEFT JOIN membership m ON m.clan_id = c.id AND m.user_id = $1
        WHERE ($2::boolean AND true)
           OR (c.status = 'active' AND (m.id IS NOT NULL OR c.visibility = 'public'))
        ORDER BY (m.id IS NULL), c.created_at`,
      [user?.id ?? null, !!user?.isSuperAdmin],
    );
    const entities = await this.clans.findByIds(rows.map((r) => r.id));
    const byId = new Map(entities.map((e) => [e.id, e]));
    return rows.map((r) => ({
      ...toClan(byId.get(r.id)!),
      myRole: user?.isSuperAdmin ? 'super' : (r.role ?? 'visitor'),
      myLinkedPersonId: r.linked_person_id,
      personCount: r.person_count,
    }));
  }

  async get(user: AuthUser | null, clanId: string): Promise<ClanWithRole> {
    const { clan, role, membership } = await this.access.clanAccess(user, clanId);
    const personCount = await this.persons.count({ where: { clanId } });
    return { ...toClan(clan), myRole: role, myLinkedPersonId: membership?.linkedPersonId ?? null, personCount };
  }

  async update(user: AuthUser, clanId: string, dto: Record<string, unknown>) {
    const { clan } = await this.access.clanAccess(user, clanId, 'admin');
    const before = toClan(clan);
    for (const k of CLAN_EDITABLE) if (k in dto) (clan as any)[k] = dto[k];
    if (clan.founderId) {
      if (!isUuid(clan.founderId)) throw new BadRequestException('始祖人员无效');
      await this.access.assertPersonsInClan(clanId, [clan.founderId]);
    }
    const saved = await this.clans.save(clan);
    await this.audit.log({ clanId, userId: user.id, entity: 'clan', entityId: clanId, action: 'update', before, after: toClan(saved) });
    return toClan(saved);
  }

  async stats(user: AuthUser | null, clanId: string): Promise<ClanStats> {
    await this.access.clanAccess(user, clanId);
    const [r] = await this.ds.query(
      `SELECT count(*)::int AS person_count,
              count(*) FILTER (WHERE is_living)::int AS living_count,
              count(*) FILTER (WHERE gender='male')::int AS male_count,
              count(*) FILTER (WHERE gender='female')::int AS female_count,
              max(generation) AS max_generation
         FROM person WHERE clan_id = $1`,
      [clanId],
    );
    return {
      personCount: r.person_count,
      livingCount: r.living_count,
      maleCount: r.male_count,
      femaleCount: r.female_count,
      maxGeneration: r.max_generation,
    };
  }

  /** 字辈推算 + 一致性校验（录入表单实时调用） */
  async generationCheck(
    user: AuthUser | null,
    clanId: string,
    dto: { generation?: number | null; generationChar?: string | null; givenName?: string | null; isExternal?: boolean; parentIds?: string[]; personId?: string },
  ) {
    const { clan } = await this.access.clanAccess(user, clanId);
    let parentIds = (dto.parentIds ?? []).filter(isUuid);
    let childGenerations: (number | null)[] = [];
    if (dto.personId && isUuid(dto.personId)) {
      const rows: any[] = await this.ds.query(
        `SELECT pc.parent_id, pc.child_id, pc.is_main_line FROM parent_child pc WHERE pc.clan_id=$1 AND (pc.child_id=$2 OR pc.parent_id=$2)`,
        [clanId, dto.personId],
      );
      if (!dto.parentIds) parentIds = rows.filter((r) => r.child_id === dto.personId && r.is_main_line).map((r) => r.parent_id);
      const childIds = rows.filter((r) => r.parent_id === dto.personId).map((r) => r.child_id);
      if (childIds.length) {
        const kids = await this.persons.findByIds(childIds);
        childGenerations = kids.filter((k) => !k.isExternal).map((k) => k.generation);
      }
    }
    const parents = parentIds.length ? await this.persons.findByIds(parentIds) : [];
    return checkGeneration(dto, {
      poem: clan.generationPoem,
      poemStartGeneration: clan.poemStartGeneration,
      parentGenerations: parents.filter((p) => p.clanId === clanId && !p.isExternal).map((p) => p.generation),
      childGenerations,
    });
  }

  // ---------- 族人管理（家族管理员） ----------
  async members(user: AuthUser, clanId: string): Promise<Membership[]> {
    await this.access.clanAccess(user, clanId, 'admin');
    const rows: any[] = await this.ds.query(
      `SELECT m.*, u.phone, u.display_name, p.full_name AS linked_person_name
         FROM membership m JOIN app_user u ON u.id = m.user_id
         LEFT JOIN person p ON p.id = m.linked_person_id
        WHERE m.clan_id = $1 ORDER BY m.role, m.created_at`,
      [clanId],
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      clanId: r.clan_id,
      role: r.role,
      linkedPersonId: r.linked_person_id,
      phone: r.phone,
      displayName: r.display_name,
      linkedPersonName: r.linked_person_name,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async addMember(user: AuthUser, clanId: string, dto: { phone: string; linkedPersonId?: string | null; displayName?: string }) {
    await this.access.clanAccess(user, clanId, 'admin');
    if (dto.linkedPersonId) await this.access.assertPersonsInClan(clanId, [dto.linkedPersonId]);
    const u = await this.auth.findOrCreateByPhone(dto.phone?.trim(), dto.displayName);
    let m = await this.memberships.findOne({ where: { clanId, userId: u.id } });
    if (m) throw new BadRequestException('该用户已是本族成员');
    m = await this.memberships.save(
      this.memberships.create({ clanId, userId: u.id, role: 'member', linkedPersonId: dto.linkedPersonId ?? null }),
    );
    await this.audit.log({ clanId, userId: user.id, entity: 'membership', entityId: m.id, action: 'add-member', after: { phone: u.phone, linkedPersonId: m.linkedPersonId } });
    return (await this.members(user, clanId)).find((x) => x.id === m!.id)!;
  }

  private async membershipFor(user: AuthUser, id: string) {
    if (!isUuid(id)) throw new NotFoundException('成员不存在');
    const m = await this.memberships.findOne({ where: { id } });
    if (!m) throw new NotFoundException('成员不存在');
    const acc = await this.access.clanAccess(user, m.clanId, 'admin');
    return { m, acc };
  }

  /** 我在谱中：把账号绑定到谱中人物 */
  async updateMembership(user: AuthUser, id: string, dto: { linkedPersonId: string | null }) {
    const { m } = await this.membershipFor(user, id);
    const before = { ...m };
    if (dto.linkedPersonId) await this.access.assertPersonsInClan(m.clanId, [dto.linkedPersonId]);
    m.linkedPersonId = dto.linkedPersonId ?? null;
    await this.memberships.save(m);
    await this.audit.log({ clanId: m.clanId, userId: user.id, entity: 'membership', entityId: m.id, action: 'link-person', before, after: m });
    return (await this.members(user, m.clanId)).find((x) => x.id === m.id)!;
  }

  async removeMembership(user: AuthUser, id: string) {
    const { m, acc } = await this.membershipFor(user, id);
    if (m.role === 'admin' && acc.role !== 'super') throw new ForbiddenException('家族管理员只能由超级管理员撤销');
    await this.memberships.delete(m.id);
    await this.audit.log({ clanId: m.clanId, userId: user.id, entity: 'membership', entityId: m.id, action: 'remove-member', before: m });
  }

  async auditLogs(user: AuthUser, clanId: string, page = 1, pageSize = 20) {
    await this.access.clanAccess(user, clanId, 'admin');
    return queryAuditLogs(this.ds, { clanId, page, pageSize });
  }
}

export async function queryAuditLogs(ds: DataSource, o: { clanId?: string; page: number; pageSize: number }) {
  const pageSize = Math.min(Math.max(Number(o.pageSize) || 20, 1), 100);
  const page = Math.max(Number(o.page) || 1, 1);
  const params: unknown[] = [];
  let where = '';
  if (o.clanId) {
    params.push(o.clanId);
    where = 'WHERE a.clan_id = $1';
  }
  const [{ total }] = await ds.query(`SELECT count(*)::int AS total FROM audit_log a ${where}`, params);
  const rows: any[] = await ds.query(
    `SELECT a.*, c.name AS clan_name, u.phone AS user_phone
       FROM audit_log a LEFT JOIN clan c ON c.id = a.clan_id LEFT JOIN app_user u ON u.id = a.user_id
       ${where} ORDER BY a.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params,
  );
  return {
    total,
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.id,
      clanId: r.clan_id,
      clanName: r.clan_name,
      userId: r.user_id,
      userPhone: r.user_phone,
      entity: r.entity,
      entityId: r.entity_id,
      action: r.action,
      before: r.before,
      after: r.after,
      createdAt: new Date(r.created_at).toISOString(),
    })),
  };
}
