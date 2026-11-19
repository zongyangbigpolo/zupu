import { Body, Controller, Delete, Get, Injectable, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { MigrationRecord } from '@zupu/shared';
import { MigrationRecordEntity } from '../../entities';
import { AccessService, isUuid } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { assertCoordPair, BranchQuery, MigrationDto, MigrationUpdateDto, pick, resolveYear } from './visual.dto';
import { PersonLite, VisualHelper } from './visual.helper';

const FIELDS = [
  'personId', 'branchName', 'fromPlace', 'fromLng', 'fromLat', 'toPlace', 'toLng', 'toLat',
  'year', 'datePrecision', 'dateText', 'reason', 'sortOrder',
];

export function toMigration(e: MigrationRecordEntity, p?: PersonLite): MigrationRecord {
  return {
    id: e.id,
    clanId: e.clanId,
    personId: e.personId,
    personName: p?.fullName ?? null,
    personGeneration: p?.generation ?? null,
    branchName: e.branchName,
    from: { name: e.fromPlace, lng: e.fromLng, lat: e.fromLat },
    to: { name: e.toPlace, lng: e.toLng, lat: e.toLat },
    year: e.year,
    date: e.migrateDate,
    datePrecision: e.datePrecision,
    dateText: e.dateText,
    reason: e.reason,
    sortOrder: e.sortOrder,
  };
}

/** 迁徙记录：族人可看，管理员录入 */
@Injectable()
export class MigrationsService {
  constructor(
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly helper: VisualHelper,
    @InjectRepository(MigrationRecordEntity) private readonly repo: Repository<MigrationRecordEntity>,
  ) {}

  async list(user: AuthUser | null, clanId: string, q: BranchQuery) {
    const { role } = await this.access.clanAccess(user, clanId);
    const scope = await this.helper.scopeIds(clanId, q);
    const rows = await this.repo.find({ where: { clanId }, order: { year: 'ASC', sortOrder: 'ASC', createdAt: 'ASC' } });
    const filtered = scope ? rows.filter((r) => r.personId && scope.has(r.personId)) : rows;
    const persons = await this.helper.personsByIds(clanId, filtered.map((r) => r.personId));
    return filtered
      .filter((r) => VisualHelper.visible(r.personId ? persons.get(r.personId) : undefined, role))
      .map((r) => toMigration(r, r.personId ? persons.get(r.personId) : undefined));
  }

  private async validate(clanId: string, dto: Partial<MigrationDto>, current?: MigrationRecordEntity) {
    if (dto.personId) await this.access.assertPersonsInClan(clanId, [dto.personId]);
    const m = { ...(current ?? {}), ...pick(dto, FIELDS) } as Partial<MigrationRecordEntity>;
    assertCoordPair(m.fromLng, m.fromLat, '迁出地');
    assertCoordPair(m.toLng, m.toLat, '迁入地');
  }

  async create(user: AuthUser, clanId: string, dto: MigrationDto) {
    await this.access.clanAccess(user, clanId, 'admin');
    await this.validate(clanId, dto);
    const e = this.repo.create({
      ...pick(dto, FIELDS),
      clanId,
      migrateDate: dto.date ?? null,
      year: resolveYear(dto.year, dto.date),
    });
    const saved = await this.repo.save(e);
    await this.audit.log({ clanId, userId: user.id, entity: 'migration_record', entityId: saved.id, action: 'create', after: saved });
    return this.one(clanId, saved);
  }

  private async load(user: AuthUser, id: string) {
    if (!isUuid(id)) throw new NotFoundException('迁徙记录不存在');
    const e = await this.repo.findOne({ where: { id } });
    if (!e) throw new NotFoundException('迁徙记录不存在');
    await this.access.clanAccess(user, e.clanId, 'admin');
    return e;
  }

  private async one(clanId: string, e: MigrationRecordEntity) {
    const persons = await this.helper.personsByIds(clanId, [e.personId]);
    return toMigration(e, e.personId ? persons.get(e.personId) : undefined);
  }

  async update(user: AuthUser, id: string, dto: MigrationUpdateDto) {
    const e = await this.load(user, id);
    await this.validate(e.clanId, dto, e);
    const before = { ...e };
    Object.assign(e, pick(dto, FIELDS));
    if (dto.date !== undefined) e.migrateDate = dto.date;
    if (dto.year !== undefined || dto.date !== undefined) e.year = resolveYear(dto.year !== undefined ? dto.year : null, e.migrateDate);
    const saved = await this.repo.save(e);
    await this.audit.log({ clanId: e.clanId, userId: user.id, entity: 'migration_record', entityId: id, action: 'update', before, after: saved });
    return this.one(e.clanId, saved);
  }

  async remove(user: AuthUser, id: string) {
    const e = await this.load(user, id);
    await this.repo.delete(id);
    await this.audit.log({ clanId: e.clanId, userId: user.id, entity: 'migration_record', entityId: id, action: 'delete', before: e });
  }
}

@Controller()
export class MigrationsController {
  constructor(private readonly svc: MigrationsService) {}

  @Get('clans/:clanId/migrations')
  list(@CurrentUser() u: AuthUser | null, @Param('clanId') clanId: string, @Query() q: BranchQuery) {
    return this.svc.list(u, clanId, q);
  }
  @Post('clans/:clanId/migrations')
  @LoginRequired()
  create(@CurrentUser() u: AuthUser, @Param('clanId') clanId: string, @Body() dto: MigrationDto) {
    return this.svc.create(u, clanId, dto);
  }
  @Patch('migrations/:id')
  @LoginRequired()
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: MigrationUpdateDto) {
    return this.svc.update(u, id, dto);
  }
  @Delete('migrations/:id')
  @LoginRequired()
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u, id);
  }
}
