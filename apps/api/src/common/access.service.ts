import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { EffectiveRole } from '@zupu/shared';
import { ClanEntity, MembershipEntity, PersonEntity } from '../entities';
import type { AuthUser } from './auth';

export interface ClanAccess {
  clan: ClanEntity;
  role: EffectiveRole;
  membership: MembershipEntity | null;
}

const RANK: Record<EffectiveRole, number> = { visitor: 0, member: 1, admin: 2, super: 3 };

/**
 * 家族数据隔离与权限的唯一入口：所有按 clan 访问的接口都先经过这里。
 * - 超级管理员：任意家族（含已停用）
 * - 家族管理员 / 族人：仅自己所属家族
 * - 访客：仅公开且启用的家族
 */
@Injectable()
export class AccessService {
  constructor(
    @InjectRepository(ClanEntity) private readonly clans: Repository<ClanEntity>,
    @InjectRepository(MembershipEntity) private readonly memberships: Repository<MembershipEntity>,
    @InjectRepository(PersonEntity) private readonly persons: Repository<PersonEntity>,
  ) {}

  async clanAccess(user: AuthUser | null, clanId: string, need: EffectiveRole = 'visitor'): Promise<ClanAccess> {
    if (!isUuid(clanId)) throw new NotFoundException('家族不存在');
    const clan = await this.clans.findOne({ where: { id: clanId } });
    if (!clan) throw new NotFoundException('家族不存在');
    let role: EffectiveRole | null = null;
    let membership: MembershipEntity | null = null;
    if (user) {
      membership = await this.memberships.findOne({ where: { clanId, userId: user.id } });
      if (user.isSuperAdmin) role = 'super';
      else if (membership) role = membership.role;
    }
    if (clan.status === 'disabled' && role !== 'super') throw new NotFoundException('家族不存在或已停用');
    if (!role) {
      if (clan.visibility === 'public') role = 'visitor';
      else if (!user) throw new UnauthorizedException('该族谱不公开，请登录后查看');
      else throw new ForbiddenException('您不是该家族成员');
    }
    if (RANK[role] < RANK[need]) {
      if (need === 'admin') throw new ForbiddenException('仅家族管理员可操作');
      if (!user) throw new UnauthorizedException('请先登录');
      throw new ForbiddenException('权限不足');
    }
    return { clan, role, membership };
  }

  async personAccess(user: AuthUser | null, personId: string, need: EffectiveRole = 'visitor') {
    if (!isUuid(personId)) throw new NotFoundException('人员不存在');
    const person = await this.persons.findOne({ where: { id: personId } });
    if (!person) throw new NotFoundException('人员不存在');
    const access = await this.clanAccess(user, person.clanId, need);
    return { ...access, person };
  }

  /** 校验一组人员都属于同一家族（防止跨族关联） */
  async assertPersonsInClan(clanId: string, ids: string[]) {
    const uniq = [...new Set(ids)];
    if (uniq.some((id) => !isUuid(id))) throw new NotFoundException('人员不存在');
    const n = await this.persons.count({ where: uniq.map((id) => ({ id, clanId })) });
    if (n !== uniq.length) throw new ForbiddenException('只能关联本家族的人员');
  }

  static isAdmin(role: EffectiveRole) {
    return role === 'admin' || role === 'super';
  }
}

export function isUuid(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
