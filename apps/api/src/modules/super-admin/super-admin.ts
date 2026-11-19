import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import type { ClanAdminInfo } from '@zupu/shared';
import { ClanEntity, MembershipEntity } from '../../entities';
import { isUuid } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, SuperAdminOnly } from '../../common/auth';
import { AuthService, PHONE_RE } from '../auth/auth.service';
import { CLAN_EDITABLE, queryAuditLogs, toClan } from '../clans/clans.service';

class ClanCreateDto {
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @IsString() @MinLength(1) @MaxLength(10) surname: string;
  @IsOptional() @IsString() @MaxLength(60) hallName?: string | null;
  @IsOptional() @IsString() @MaxLength(60) origin?: string | null;
  @IsOptional() @IsString() generationPoem?: string | null;
  @IsOptional() @IsInt() @Min(1) poemStartGeneration?: number;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsIn(['public', 'private', 'invite']) visibility?: 'public' | 'private' | 'invite';
  @IsOptional() @IsString() adminPhone?: string | null;
}
class ClanAdminUpdateDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(10) surname?: string;
  @IsOptional() @IsString() @MaxLength(60) hallName?: string | null;
  @IsOptional() @IsString() @MaxLength(60) origin?: string | null;
  @IsOptional() @IsString() generationPoem?: string | null;
  @IsOptional() @IsInt() @Min(1) poemStartGeneration?: number;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsIn(['public', 'private', 'invite']) visibility?: 'public' | 'private' | 'invite';
  @IsOptional() @IsIn(['active', 'disabled']) status?: 'active' | 'disabled';
}
class PhoneDto {
  @IsString() phone: string;
}
class AuditQuery {
  @IsOptional() @Type(() => Number) @IsInt() page?: number;
  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number;
  @IsOptional() @IsUUID() clanId?: string;
}

/**
 * 平台超级管理员：创建/停用家族；按手机号任命、更换、撤销家族管理员；查看全平台操作日志。
 * 所有任免操作写入审计日志。
 */
@Injectable()
export class SuperAdminService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    @InjectRepository(ClanEntity) private readonly clans: Repository<ClanEntity>,
    @InjectRepository(MembershipEntity) private readonly memberships: Repository<MembershipEntity>,
  ) {}

  private async clan(id: string) {
    if (!isUuid(id)) throw new NotFoundException('家族不存在');
    const c = await this.clans.findOne({ where: { id } });
    if (!c) throw new NotFoundException('家族不存在');
    return c;
  }

  async admins(clanId: string): Promise<ClanAdminInfo[]> {
    const rows: any[] = await this.ds.query(
      `SELECT m.id AS membership_id, u.id AS user_id, u.phone, u.display_name, (u.password_hash IS NOT NULL) AS has_password
         FROM membership m JOIN app_user u ON u.id = m.user_id
        WHERE m.clan_id = $1 AND m.role = 'admin' ORDER BY m.created_at`,
      [clanId],
    );
    return rows.map((r) => ({
      membershipId: r.membership_id,
      userId: r.user_id,
      phone: r.phone,
      displayName: r.display_name,
      hasPassword: r.has_password,
    }));
  }

  async list() {
    const all = await this.clans.find({ order: { createdAt: 'ASC' } });
    const counts: any[] = await this.ds.query(`SELECT clan_id, count(*)::int AS n FROM person GROUP BY clan_id`);
    const cm = new Map(counts.map((c) => [c.clan_id, c.n]));
    return Promise.all(all.map(async (c) => ({ ...toClan(c), admins: await this.admins(c.id), personCount: cm.get(c.id) ?? 0 })));
  }

  async create(user: AuthUser, dto: ClanCreateDto) {
    const { adminPhone, ...rest } = dto;
    const saved = await this.clans.save(this.clans.create({ ...rest, createdBy: user.id }));
    await this.audit.log({ clanId: saved.id, userId: user.id, entity: 'clan', entityId: saved.id, action: 'create', after: toClan(saved) });
    const admin = adminPhone ? await this.appoint(user, saved.id, adminPhone) : null;
    return { ...toClan(saved), adminActivationCode: admin?.activationCode ?? null };
  }

  async update(user: AuthUser, id: string, dto: ClanAdminUpdateDto) {
    const c = await this.clan(id);
    const before = toClan(c);
    for (const k of [...CLAN_EDITABLE, 'status'] as const) if (k in dto && k !== 'founderId') (c as any)[k] = (dto as any)[k];
    const saved = await this.clans.save(c);
    const action = dto.status && dto.status !== before.status ? (dto.status === 'disabled' ? 'disable' : 'enable') : 'update';
    await this.audit.log({ clanId: id, userId: user.id, entity: 'clan', entityId: id, action, before, after: toClan(saved) });
    return toClan(saved);
  }

  /** 任命家族管理员（手机号尚未注册时预建账号，对方用该手机号注册/登录后即获得权限） */
  async appoint(user: AuthUser, clanId: string, phone: string): Promise<ClanAdminInfo> {
    await this.clan(clanId);
    const { user: u, activationCode } = await this.auth.findOrCreateByPhone(phone?.trim());
    let m = await this.memberships.findOne({ where: { clanId, userId: u.id } });
    if (m?.role === 'admin') throw new BadRequestException('该用户已是本族管理员');
    const before = m ? { ...m } : null;
    if (m) m.role = 'admin';
    else m = this.memberships.create({ clanId, userId: u.id, role: 'admin' });
    m = await this.memberships.save(m);
    await this.audit.log({ clanId, userId: user.id, entity: 'membership', entityId: m.id, action: 'appoint-admin', before, after: { phone: u.phone, role: 'admin' } });
    return { ...(await this.admins(clanId)).find((a) => a.userId === u.id)!, activationCode };
  }

  /** 撤销管理员：降为普通族人（保留"我在谱中"绑定） */
  async revoke(user: AuthUser, clanId: string, userId: string) {
    await this.clan(clanId);
    if (!isUuid(userId)) throw new NotFoundException('管理员不存在');
    const m = await this.memberships.findOne({ where: { clanId, userId, role: 'admin' } });
    if (!m) throw new NotFoundException('该用户不是本族管理员');
    m.role = 'member';
    await this.memberships.save(m);
    await this.audit.log({ clanId, userId: user.id, entity: 'membership', entityId: m.id, action: 'revoke-admin', before: { userId, role: 'admin' }, after: { userId, role: 'member' } });
  }

  /** 更换管理员：撤销现有全部管理员并任命新的 */
  async replace(user: AuthUser, clanId: string, phone: string) {
    const current = await this.admins(clanId);
    if (!PHONE_RE.test(phone?.trim() ?? '')) throw new BadRequestException('手机号格式不正确');
    const keep = current.find((a) => a.phone === phone.trim());
    for (const a of current) if (a !== keep) await this.revoke(user, clanId, a.userId);
    if (keep) return keep;
    return this.appoint(user, clanId, phone);
  }
}

@Controller('admin')
@SuperAdminOnly()
export class SuperAdminController {
  constructor(private readonly svc: SuperAdminService) {}

  @Get('clans')
  list() {
    return this.svc.list();
  }
  @Post('clans')
  create(@CurrentUser() u: AuthUser, @Body() dto: ClanCreateDto) {
    return this.svc.create(u, dto);
  }
  @Patch('clans/:id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ClanAdminUpdateDto) {
    return this.svc.update(u, id, dto);
  }
  @Get('clans/:id/admins')
  admins(@Param('id') id: string) {
    return this.svc.admins(id);
  }
  @Post('clans/:id/admins')
  appoint(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: PhoneDto) {
    return this.svc.appoint(u, id, dto.phone);
  }
  @Put('clans/:id/admins')
  replace(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: PhoneDto) {
    return this.svc.replace(u, id, dto.phone);
  }
  @Delete('clans/:id/admins/:userId')
  revoke(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.svc.revoke(u, id, userId);
  }
  @Get('audit-logs')
  auditLogs(@Query() q: AuditQuery) {
    return queryAuditLogs(this.svc['ds'], { clanId: q.clanId, page: q.page ?? 1, pageSize: q.pageSize ?? 20 });
  }
}

@Module({ controllers: [SuperAdminController], providers: [SuperAdminService] })
export class SuperAdminModule {}
