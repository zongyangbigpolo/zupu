import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import {
  REMINDER_KIND_LABELS,
  type ReminderDate,
  type ReminderKind,
  type ReminderPref,
  type ReminderRunResult,
  type UpcomingReminder,
} from '@zupu/shared';
import { AccessService } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, LoginRequired, SuperAdminOnly } from '../../common/auth';
import { canSeeSensitive, toBrief } from '../../common/mappers';
import { config } from '../../config';
import {
  ActivitySignupEntity,
  ClanActivityEntity,
  ClanEntity,
  MembershipEntity,
  PersonEntity,
  ReminderDateEntity,
  ReminderPrefEntity,
  UserEntity,
} from '../../entities';
import { fmtCn } from '../activities/activities';
import { clip, NotificationService, NotificationsModule, NotifyItem } from '../notifications/notifications';
import { WechatModule, WechatQuotaService, WechatService } from '../wechat/wechat';
import { addDays, annualDateText, cnHour, cnToday, daysBetween, isValidAnnualDate, nextOccurrence } from './calendar';

const DEFAULT_PREF = { enabled: true, birthday: true, deathAnniversary: true, activity: true, daysBefore: 1, wechat: true };
const MAX_DAYS_BEFORE = 7;

class ReminderDateDto {
  @IsIn(['solar', 'lunar']) calendar: 'solar' | 'lunar';
  @IsInt() @Min(1) @Max(12) month: number;
  @IsInt() @Min(1) @Max(31) day: number;
  @IsOptional() @IsBoolean() isLeapMonth?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(3000) year?: number | null;
}

class PrefDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() birthday?: boolean;
  @IsOptional() @IsBoolean() deathAnniversary?: boolean;
  @IsOptional() @IsBoolean() activity?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_DAYS_BEFORE) daysBefore?: number;
  @IsOptional() @IsBoolean() wechat?: boolean;
}

class UpcomingQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(60) days?: number;
}

class RunDto {
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
}

interface Occurrence extends UpcomingReminder {
  privacyAdminsOnly: boolean;
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger('Reminders');

  constructor(
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly wechat: WechatService,
    private readonly quota: WechatQuotaService,
    @InjectRepository(ReminderDateEntity) private readonly dates: Repository<ReminderDateEntity>,
    @InjectRepository(ReminderPrefEntity) private readonly prefs: Repository<ReminderPrefEntity>,
    @InjectRepository(PersonEntity) private readonly persons: Repository<PersonEntity>,
    @InjectRepository(MembershipEntity) private readonly memberships: Repository<MembershipEntity>,
    @InjectRepository(ClanEntity) private readonly clans: Repository<ClanEntity>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(ClanActivityEntity) private readonly activities: Repository<ClanActivityEntity>,
    @InjectRepository(ActivitySignupEntity) private readonly signups: Repository<ActivitySignupEntity>,
  ) {}

  /** 人物的有效纪念日：管理员设定优先，否则取档案中精确到日的公历日期 */
  private effectiveDates(p: PersonEntity, manual: ReminderDateEntity[]): ReminderDate[] {
    const out: ReminderDate[] = [];
    for (const kind of ['birth', 'death'] as ReminderKind[]) {
      const m = manual.find((d) => d.kind === kind);
      if (m) {
        out.push({ id: m.id, personId: p.id, kind, calendar: m.calendar, month: m.month, day: m.day, isLeapMonth: m.isLeapMonth, year: m.year, source: 'manual', text: annualDateText(m) });
        continue;
      }
      const date = kind === 'birth' ? p.birthDate : p.deathDate;
      const prec = kind === 'birth' ? p.birthPrecision : p.deathPrecision;
      if (date && prec === 'day') {
        const [y, mo, d] = date.split('-').map(Number);
        const a = { calendar: 'solar' as const, month: mo, day: d, isLeapMonth: false, year: y };
        out.push({ id: null, personId: p.id, ...a, kind, source: 'profile', text: annualDateText(a) });
      }
    }
    return out;
  }

  /** 计算某族 [from, from+days] 内的生日（在世者）与忌日（已故者） */
  async occurrences(clanId: string, from: string, days: number): Promise<Occurrence[]> {
    const persons: PersonEntity[] = await this.persons
      .createQueryBuilder('p')
      .where('p.clan_id = :clanId', { clanId })
      .andWhere(
        `((p.is_living AND p.birth_date IS NOT NULL AND p.birth_precision = 'day')
          OR (NOT p.is_living AND p.death_date IS NOT NULL AND p.death_precision = 'day')
          OR EXISTS (SELECT 1 FROM reminder_date r WHERE r.person_id = p.id))`,
      )
      .getMany();
    const manual = await this.dates.find({ where: { clanId } });
    const byPerson = new Map<string, ReminderDateEntity[]>();
    for (const d of manual) byPerson.set(d.personId, [...(byPerson.get(d.personId) ?? []), d]);
    const out: Occurrence[] = [];
    for (const p of persons) {
      for (const d of this.effectiveDates(p, byPerson.get(p.id) ?? [])) {
        if ((d.kind === 'birth') !== p.isLiving) continue; // 生日只提醒在世者，忌日只提醒已故者
        const next = nextOccurrence(d, from);
        const daysLeft = daysBetween(from, next.date);
        if (daysLeft > days) continue;
        out.push({
          person: toBrief(p, 'admin'),
          kind: d.kind,
          calendar: d.calendar,
          dateText: d.text,
          nextDate: next.date,
          daysLeft,
          years: d.year ? next.year - d.year : null,
          privacyAdminsOnly: p.privacyLevel === 'admins',
        });
      }
    }
    return out.sort((a, b) => a.daysLeft - b.daysLeft || a.person.fullName.localeCompare(b.person.fullName, 'zh'));
  }

  async upcoming(user: AuthUser, clanId: string, days = 30): Promise<UpcomingReminder[]> {
    const { role } = await this.access.clanAccess(user, clanId, 'member');
    const isAdmin = AccessService.isAdmin(role);
    const list = await this.occurrences(clanId, cnToday(), days);
    return list.filter((o) => isAdmin || !o.privacyAdminsOnly).map(({ privacyAdminsOnly, ...o }) => (void privacyAdminsOnly, o));
  }

  async personDates(user: AuthUser | null, personId: string): Promise<ReminderDate[]> {
    const { person, role } = await this.access.personAccess(user, personId, 'member');
    const list = this.effectiveDates(person, await this.dates.find({ where: { personId } }));
    return canSeeSensitive(person, role) ? list : list.filter((d) => d.kind !== 'birth');
  }

  async setDate(user: AuthUser, personId: string, kind: string, dto: ReminderDateDto): Promise<ReminderDate> {
    if (kind !== 'birth' && kind !== 'death') throw new NotFoundException();
    const { person } = await this.access.personAccess(user, personId, 'admin');
    const a = { calendar: dto.calendar, month: dto.month, day: dto.day, isLeapMonth: dto.calendar === 'lunar' && !!dto.isLeapMonth, year: dto.year ?? null };
    if (!isValidAnnualDate(a)) throw new BadRequestException('日期不合法');
    const before = await this.dates.findOne({ where: { personId, kind } });
    await this.dates.upsert({ clanId: person.clanId, personId, kind, ...a }, ['personId', 'kind']);
    const saved = await this.dates.findOneOrFail({ where: { personId, kind } });
    await this.audit.log({ clanId: person.clanId, userId: user.id, entity: 'reminder_date', entityId: saved.id, action: before ? 'update' : 'create', before, after: saved });
    return this.effectiveDates(person, [saved]).find((d) => d.kind === kind)!;
  }

  async removeDate(user: AuthUser, personId: string, kind: string) {
    const { person } = await this.access.personAccess(user, personId, 'admin');
    const before = await this.dates.findOne({ where: { personId, kind: kind as ReminderKind } });
    if (!before) throw new NotFoundException('未设置');
    await this.dates.delete(before.id);
    await this.audit.log({ clanId: person.clanId, userId: user.id, entity: 'reminder_date', entityId: before.id, action: 'delete', before });
  }

  private async requireMembership(user: AuthUser, clanId: string) {
    await this.access.clanAccess(user, clanId, 'member');
    if (!(await this.memberships.exists({ where: { clanId, userId: user.id } }))) throw new ForbiddenException('仅本族族人可设置提醒');
  }

  async getPref(user: AuthUser, clanId: string): Promise<ReminderPref> {
    await this.requireMembership(user, clanId);
    const p = await this.prefs.findOne({ where: { userId: user.id, clanId } });
    const u = await this.users.findOneOrFail({ where: { id: user.id } });
    const t = this.wechat.templates();
    return {
      ...DEFAULT_PREF,
      ...(p ? { enabled: p.enabled, birthday: p.birthday, deathAnniversary: p.deathAnniversary, activity: p.activity, daysBefore: p.daysBefore, wechat: p.wechat } : {}),
      wechatQuota: { reminder: await this.quota.get(user.id, t.reminder), activity: await this.quota.get(user.id, t.activity) },
      wechatBound: !!u.wechatOpenid,
    };
  }

  async savePref(user: AuthUser, clanId: string, dto: PrefDto) {
    await this.requireMembership(user, clanId);
    const cur = (await this.prefs.findOne({ where: { userId: user.id, clanId } })) ?? this.prefs.create({ userId: user.id, clanId, ...DEFAULT_PREF });
    Object.assign(cur, Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)));
    await this.prefs.save(cur);
    return this.getPref(user, clanId);
  }

  /** 每日提醒任务：生日、忌日（提前 N 天与当天各一次）、已报名活动开始前一天 */
  async run(date = cnToday()): Promise<ReminderRunResult> {
    let notifications = 0;
    let wechatSent = 0;
    const clans = await this.clans.find({ where: { status: 'active' } });
    for (const clan of clans) {
      const ms = await this.memberships.find({ where: { clanId: clan.id } });
      if (!ms.length) continue;
      const active = new Set((await this.users.find({ where: { id: In(ms.map((m) => m.userId)), status: 'active' } })).map((u) => u.id));
      const prefMap = new Map((await this.prefs.find({ where: { clanId: clan.id } })).map((p) => [p.userId, p]));
      const occ = await this.occurrences(clan.id, date, MAX_DAYS_BEFORE);
      const items: (NotifyItem & { occ?: Occurrence })[] = [];
      for (const m of ms) {
        if (!active.has(m.userId)) continue;
        const pref = { ...DEFAULT_PREF, ...(prefMap.get(m.userId) ?? {}) };
        if (!pref.enabled) continue;
        for (const o of occ) {
          if (o.daysLeft !== 0 && o.daysLeft !== pref.daysBefore) continue;
          if (o.kind === 'birth' ? !pref.birthday : !pref.deathAnniversary) continue;
          if (o.privacyAdminsOnly && m.role !== 'admin') continue;
          const label = REMINDER_KIND_LABELS[o.kind];
          const yearsText = o.years && o.years > 0 ? (o.kind === 'birth' ? `${o.years} 岁生日` : `逝世 ${o.years} 周年`) : label;
          const when = o.daysLeft === 0 ? '今天' : `${o.daysLeft} 天后（${o.nextDate}）`;
          items.push({
            userId: m.userId,
            clanId: clan.id,
            type: 'reminder',
            title: `${when}是 ${o.person.fullName} 的${label}`,
            body: `${o.dateText}${o.calendar === 'lunar' ? `（公历 ${o.nextDate}）` : ''} · ${yearsText}`,
            link: { kind: 'person', id: o.person.id },
            dedupeKey: `reminder:${m.userId}:${o.person.id}:${o.kind}:${o.nextDate}:${o.daysLeft}`,
            occ: o,
          });
        }
      }
      const r1 = await this.notifications.notify(
        items.map(({ occ: _o, ...i }) => (void _o, i)),
        (item) => {
          const o = items.find((x) => x.dedupeKey === item.dedupeKey)!.occ!;
          return {
            template: 'reminder',
            page: `pages/person/detail?id=${o.person.id}`,
            data: {
              thing1: { value: clip(`${o.person.fullName} ${REMINDER_KIND_LABELS[o.kind]}`) },
              date2: { value: o.nextDate },
              thing3: { value: clip(o.dateText) },
            },
          };
        },
      );

      // 已报名活动：开始前一天提醒
      const tomorrow = addDays(date, 1);
      const acts = await this.activities.find({
        where: {
          clanId: clan.id,
          kind: 'activity',
          status: 'published',
          startAt: MoreThanOrEqual(new Date(`${tomorrow}T00:00:00+08:00`)),
        },
      });
      const soon = acts.filter((a) => a.startAt! < new Date(`${addDays(tomorrow, 1)}T00:00:00+08:00`));
      const actItems: NotifyItem[] = [];
      const actMap = new Map(soon.map((a) => [a.id, a]));
      if (soon.length) {
        const ss = await this.signups.find({ where: { activityId: In(soon.map((a) => a.id)), status: 'signed' } });
        for (const s of ss) {
          const pref = { ...DEFAULT_PREF, ...(prefMap.get(s.userId) ?? {}) };
          if (!pref.enabled || !pref.activity || !active.has(s.userId)) continue;
          const a = actMap.get(s.activityId)!;
          actItems.push({
            userId: s.userId,
            clanId: clan.id,
            type: 'activity-reminder',
            title: `明天：${a.title}`,
            body: [`时间：${fmtCn(a.startAt!)}`, a.location && `地点：${a.location}`].filter(Boolean).join('；'),
            link: { kind: 'activity', id: a.id },
            dedupeKey: `activity-reminder:${a.id}:${s.userId}`,
          });
        }
      }
      const r2 = await this.notifications.notify(actItems, (item) => {
        const a = actMap.get(item.link!.id)!;
        return {
          template: 'activity',
          page: `pages/activity/detail?id=${a.id}`,
          data: { thing1: { value: clip(a.title) }, time2: { value: fmtCn(a.startAt!) }, thing3: { value: clip(a.location || clan.name) } },
        };
      });
      notifications += r1.created + r2.created;
      wechatSent += r1.wechatSent + r2.wechatSent;
    }
    this.logger.log(`提醒任务 ${date}：站内通知 ${notifications} 条，微信订阅消息 ${wechatSent} 条`);
    return { date, notifications, wechatSent };
  }
}

/** 定时任务：每 10 分钟检查一次，北京时间到点后当天执行一次（重复执行由通知去重键保证幂等） */
@Injectable()
export class ReminderScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private lastRun: string | null = null;
  private running = false;
  private readonly logger = new Logger('ReminderScheduler');

  constructor(private readonly svc: RemindersService) {}

  onModuleInit() {
    if (config.reminderScheduler !== 'on') return;
    this.timer = setInterval(() => void this.tick(), 10 * 60 * 1000);
    this.timer.unref();
    setTimeout(() => void this.tick(), 30_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    const today = cnToday();
    if (this.running || this.lastRun === today || cnHour() < config.reminderHour) return;
    this.running = true;
    try {
      await this.svc.run(today);
      this.lastRun = today;
    } catch (e) {
      this.logger.error(`提醒任务失败：${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}

@Controller()
@LoginRequired()
export class RemindersController {
  constructor(private readonly svc: RemindersService) {}

  @Get('clans/:clanId/reminders/upcoming')
  upcoming(@CurrentUser() u: AuthUser, @Param('clanId') clanId: string, @Query() q: UpcomingQuery) {
    return this.svc.upcoming(u, clanId, q.days ?? 30);
  }

  @Get('clans/:clanId/reminder-pref')
  pref(@CurrentUser() u: AuthUser, @Param('clanId') clanId: string) {
    return this.svc.getPref(u, clanId);
  }

  @Put('clans/:clanId/reminder-pref')
  savePref(@CurrentUser() u: AuthUser, @Param('clanId') clanId: string, @Body() dto: PrefDto) {
    return this.svc.savePref(u, clanId, dto);
  }

  @Get('persons/:id/reminder-dates')
  dates(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.personDates(u, id);
  }

  @Put('persons/:id/reminder-dates/:kind')
  setDate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('kind') kind: string, @Body() dto: ReminderDateDto) {
    return this.svc.setDate(u, id, kind, dto);
  }

  @Delete('persons/:id/reminder-dates/:kind')
  removeDate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('kind') kind: string) {
    return this.svc.removeDate(u, id, kind);
  }

  @Post('admin/reminders/run')
  @SuperAdminOnly()
  run(@Body() dto: RunDto) {
    return this.svc.run(dto.date);
  }
}

@Module({
  imports: [NotificationsModule, WechatModule],
  controllers: [RemindersController],
  providers: [RemindersService, ReminderScheduler],
})
export class RemindersModule {}

