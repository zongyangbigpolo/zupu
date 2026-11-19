import { Body, Controller, Delete, Get, Injectable, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { ChronicleEntry, TimelineItem, TimelineResponse } from '@zupu/shared';
import { ChronicleEntity, MigrationRecordEntity } from '../../entities';
import { AccessService, isUuid } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { canSeeSensitive } from '../../common/mappers';
import { ChronicleDto, ChronicleUpdateDto, pick, resolveYear, TimelineQuery } from './visual.dto';
import { PersonLite, VisualHelper } from './visual.helper';

const FIELDS = ['title', 'year', 'datePrecision', 'dateText', 'place', 'description', 'personId'];
const MAX_ITEMS = 3000;

function toChronicle(e: ChronicleEntity, p?: PersonLite): ChronicleEntry {
  return {
    id: e.id,
    clanId: e.clanId,
    title: e.title,
    year: e.year,
    date: e.eventDate,
    datePrecision: e.datePrecision,
    dateText: e.dateText,
    place: e.place,
    description: e.description,
    personId: e.personId,
    personName: p?.fullName ?? null,
  };
}

const yearOf = (d: string | null) => (d ? Number(d.slice(0, 4)) : null);

/** 家族大事记 + 家族时间轴（大事记、人物事迹、迁徙、生卒），朝代与历史大事由前端用内置数据对照 */
@Injectable()
export class TimelineService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly helper: VisualHelper,
    @InjectRepository(ChronicleEntity) private readonly chronicles: Repository<ChronicleEntity>,
    @InjectRepository(MigrationRecordEntity) private readonly migrations: Repository<MigrationRecordEntity>,
  ) {}

  async listChronicles(user: AuthUser | null, clanId: string) {
    const { role } = await this.access.clanAccess(user, clanId);
    const rows = await this.chronicles.find({ where: { clanId }, order: { year: 'ASC', createdAt: 'ASC' } });
    const persons = await this.helper.personsByIds(clanId, rows.map((r) => r.personId));
    return rows
      .filter((r) => VisualHelper.visible(r.personId ? persons.get(r.personId) : undefined, role))
      .map((r) => toChronicle(r, r.personId ? persons.get(r.personId) : undefined));
  }

  async createChronicle(user: AuthUser, clanId: string, dto: ChronicleDto) {
    await this.access.clanAccess(user, clanId, 'admin');
    if (dto.personId) await this.access.assertPersonsInClan(clanId, [dto.personId]);
    const saved = await this.chronicles.save(
      this.chronicles.create({ ...pick(dto, FIELDS), clanId, eventDate: dto.date ?? null, year: resolveYear(dto.year, dto.date) }),
    );
    await this.audit.log({ clanId, userId: user.id, entity: 'clan_chronicle', entityId: saved.id, action: 'create', after: saved });
    return this.one(saved);
  }

  private async one(e: ChronicleEntity) {
    const persons = await this.helper.personsByIds(e.clanId, [e.personId]);
    return toChronicle(e, e.personId ? persons.get(e.personId) : undefined);
  }

  private async load(user: AuthUser, id: string) {
    if (!isUuid(id)) throw new NotFoundException('大事记不存在');
    const e = await this.chronicles.findOne({ where: { id } });
    if (!e) throw new NotFoundException('大事记不存在');
    await this.access.clanAccess(user, e.clanId, 'admin');
    return e;
  }

  async updateChronicle(user: AuthUser, id: string, dto: ChronicleUpdateDto) {
    const e = await this.load(user, id);
    if (dto.personId) await this.access.assertPersonsInClan(e.clanId, [dto.personId]);
    const before = { ...e };
    Object.assign(e, pick(dto, FIELDS));
    if (dto.date !== undefined) e.eventDate = dto.date;
    if (dto.year !== undefined || dto.date !== undefined) e.year = resolveYear(dto.year !== undefined ? dto.year : null, e.eventDate);
    const saved = await this.chronicles.save(e);
    await this.audit.log({ clanId: e.clanId, userId: user.id, entity: 'clan_chronicle', entityId: id, action: 'update', before, after: saved });
    return this.one(saved);
  }

  async removeChronicle(user: AuthUser, id: string) {
    const e = await this.load(user, id);
    await this.chronicles.delete(id);
    await this.audit.log({ clanId: e.clanId, userId: user.id, entity: 'clan_chronicle', entityId: id, action: 'delete', before: e });
  }

  async timeline(user: AuthUser | null, clanId: string, q: TimelineQuery): Promise<TimelineResponse> {
    const { role } = await this.access.clanAccess(user, clanId);
    const scope = await this.helper.scopeIds(clanId, q);
    const inScope = (pid: string | null) => !scope || (pid != null && scope.has(pid));
    const items: TimelineItem[] = [];

    // 家族大事：与人物无关的全族大事始终显示；关联人物的按筛选范围
    const chron = await this.chronicles.find({ where: { clanId } });
    for (const c of chron) {
      if (c.year == null || (c.personId && !inScope(c.personId))) continue;
      items.push({ kind: 'chronicle', id: c.id, year: c.year, dateText: c.dateText, title: c.title, description: c.description, place: c.place, type: null, personId: c.personId, personName: null });
    }

    const events: { id: string; personId: string; type: string | null; title: string; eventDate: string | null; eventText: string | null; place: string | null; description: string | null }[] =
      await this.ds.query(
        `SELECT id, person_id AS "personId", type, title, event_date::text AS "eventDate", event_text AS "eventText", place, description
           FROM life_event WHERE clan_id = $1 AND event_date IS NOT NULL ${scope ? 'AND person_id = ANY($2::uuid[])' : ''}`,
        scope ? [clanId, [...scope]] : [clanId],
      );
    for (const e of events)
      items.push({ kind: 'event', id: e.id, year: yearOf(e.eventDate)!, dateText: e.eventText, title: e.title, description: e.description, place: e.place, type: e.type, personId: e.personId, personName: null });

    const migs = await this.migrations.find({ where: { clanId } });
    for (const m of migs) {
      if (m.year == null || !inScope(m.personId)) continue;
      items.push({
        kind: 'migration',
        id: m.id,
        year: m.year,
        dateText: m.dateText,
        title: `自${m.fromPlace}迁居${m.toPlace}`,
        description: m.reason,
        place: m.toPlace,
        type: m.branchName,
        personId: m.personId,
        personName: null,
      });
    }

    // 生卒：仅在筛选人物/支系或显式要求时加入（全族上万人时过多）
    if (scope || q.lifeSpans) {
      const rows: { id: string; fullName: string; birthDate: string | null; birthText: string | null; deathDate: string | null; deathText: string | null; isLiving: boolean; privacyLevel: string }[] =
        await this.ds.query(
          `SELECT id, full_name AS "fullName", birth_date::text AS "birthDate", birth_text AS "birthText",
                  death_date::text AS "deathDate", death_text AS "deathText", is_living AS "isLiving", privacy_level AS "privacyLevel"
             FROM person WHERE clan_id = $1 AND NOT is_external ${scope ? 'AND id = ANY($2::uuid[])' : ''}
            ORDER BY generation NULLS LAST LIMIT ${MAX_ITEMS}`,
          scope ? [clanId, [...scope]] : [clanId],
        );
      for (const p of rows) {
        if (!canSeeSensitive(p as any, role)) continue;
        if (p.birthDate) items.push({ kind: 'birth', id: p.id, year: yearOf(p.birthDate)!, dateText: p.birthText, title: `${p.fullName}出生`, description: null, place: null, type: null, personId: p.id, personName: p.fullName });
        if (p.deathDate) items.push({ kind: 'death', id: p.id, year: yearOf(p.deathDate)!, dateText: p.deathText, title: `${p.fullName}逝世`, description: null, place: null, type: null, personId: p.id, personName: p.fullName });
      }
    }

    // 隐私：在世/非公开人物的事迹与行踪按敏感信息处理
    const persons = await this.helper.personsByIds(clanId, items.map((i) => i.personId));
    const visible = items.filter((i) => VisualHelper.visible(i.personId ? persons.get(i.personId) : undefined, role));
    for (const i of visible) if (i.personId) i.personName = persons.get(i.personId)?.fullName ?? i.personName;
    const order = { chronicle: 0, migration: 1, event: 2, birth: 3, death: 4 };
    visible.sort((a, b) => a.year - b.year || order[a.kind] - order[b.kind]);
    return { items: visible.slice(0, MAX_ITEMS), truncated: visible.length > MAX_ITEMS };
  }
}

@Controller()
export class TimelineController {
  constructor(private readonly svc: TimelineService) {}

  @Get('clans/:clanId/timeline')
  timeline(@CurrentUser() u: AuthUser | null, @Param('clanId') clanId: string, @Query() q: TimelineQuery) {
    return this.svc.timeline(u, clanId, q);
  }
  @Get('clans/:clanId/chronicles')
  list(@CurrentUser() u: AuthUser | null, @Param('clanId') clanId: string) {
    return this.svc.listChronicles(u, clanId);
  }
  @Post('clans/:clanId/chronicles')
  @LoginRequired()
  create(@CurrentUser() u: AuthUser, @Param('clanId') clanId: string, @Body() dto: ChronicleDto) {
    return this.svc.createChronicle(u, clanId, dto);
  }
  @Patch('chronicles/:id')
  @LoginRequired()
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ChronicleUpdateDto) {
    return this.svc.updateChronicle(u, id, dto);
  }
  @Delete('chronicles/:id')
  @LoginRequired()
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.removeChronicle(u, id);
  }
}
