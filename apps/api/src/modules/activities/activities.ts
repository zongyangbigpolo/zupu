import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { randomInt } from 'node:crypto';
import { In, Repository } from 'typeorm';
import {
  ACTIVITY_CATEGORY_LABELS,
  type Activity,
  type ActivityDetail,
  type ActivitySignup,
  type EffectiveRole,
  type Paged,
} from '@zupu/shared';
import { AccessService, isUuid } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { ActivitySignupEntity, ClanActivityEntity, MembershipEntity, PersonEntity, UserEntity } from '../../entities';
import { clip, NotificationService, NotificationsModule } from '../notifications/notifications';

class ActivityDto {
  @IsIn(['activity', 'announcement']) kind: 'activity' | 'announcement';
  @IsOptional() @IsIn(['qingming', 'xiupu', 'zongqinhui', 'other']) category?: 'qingming' | 'xiupu' | 'zongqinhui' | 'other';
  @IsString() @MaxLength(120) title: string;
  @IsOptional() @IsString() @MaxLength(20000) content?: string | null;
  @IsOptional() @IsString() @MaxLength(200) location?: string | null;
  @IsOptional() @IsDateString() startAt?: string | null;
  @IsOptional() @IsDateString() endAt?: string | null;
  @IsOptional() @IsDateString() signupDeadline?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(100000) maxParticipants?: number | null;
  @IsOptional() @IsBoolean() allowSignup?: boolean;
  @IsOptional() @IsBoolean() pinned?: boolean;
}

class ActivityUpdateDto {
  @IsOptional() @IsIn(['qingming', 'xiupu', 'zongqinhui', 'other']) category?: 'qingming' | 'xiupu' | 'zongqinhui' | 'other';
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(20000) content?: string | null;
  @IsOptional() @IsString() @MaxLength(200) location?: string | null;
  @IsOptional() @IsDateString() startAt?: string | null;
  @IsOptional() @IsDateString() endAt?: string | null;
  @IsOptional() @IsDateString() signupDeadline?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(100000) maxParticipants?: number | null;
  @IsOptional() @IsBoolean() allowSignup?: boolean;
  @IsOptional() @IsBoolean() pinned?: boolean;
  @IsOptional() @IsIn(['published', 'cancelled']) status?: 'published' | 'cancelled';
}

class SignupDto {
  @IsOptional() @IsInt() @Min(1) @Max(50) headcount?: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string | null;
}

class CheckinDto {
  @IsString() @MaxLength(10) code: string;
}

class ListQuery {
  @IsOptional() @IsIn(['activity', 'announcement']) kind?: 'activity' | 'announcement';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);
const iso = (d: Date | null) => d?.toISOString() ?? null;
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/** 北京时间的"M月D日 HH:mm" */
export function fmtCn(d: Date) {
  const s = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => s.find((p) => p.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
}

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    @InjectRepository(ClanActivityEntity) private readonly repo: Repository<ClanActivityEntity>,
    @InjectRepository(ActivitySignupEntity) private readonly signups: Repository<ActivitySignupEntity>,
    @InjectRepository(MembershipEntity) private readonly memberships: Repository<MembershipEntity>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(PersonEntity) private readonly persons: Repository<PersonEntity>,
  ) {}

  private async load(user: AuthUser, id: string, need: EffectiveRole = 'member') {
    if (!isUuid(id)) throw new NotFoundException('活动不存在');
    const a = await this.repo.findOne({ where: { id } });
    if (!a) throw new NotFoundException('活动不存在');
    const acc = await this.access.clanAccess(user, a.clanId, need);
    return { activity: a, ...acc };
  }

  private async summaries(rows: ClanActivityEntity[], user: AuthUser, isAdmin: boolean): Promise<Activity[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const counts: { activity_id: string; n: string; heads: string; checked: string }[] = await this.signups.query(
      `SELECT activity_id, count(*) n, coalesce(sum(headcount),0) heads, count(checked_in_at) checked
       FROM activity_signup WHERE activity_id = ANY($1) AND status = 'signed' GROUP BY activity_id`,
      [ids],
    );
    const countMap = new Map(counts.map((c) => [c.activity_id, c]));
    const mine = await this.signups.find({ where: { activityId: In(ids), userId: user.id } });
    const mineMap = new Map(mine.map((s) => [s.activityId, s]));
    const authors = await this.users.find({ where: { id: In(rows.map((r) => r.createdBy).filter((x): x is string => !!x)) } });
    const authorMap = new Map(authors.map((u) => [u.id, u.displayName ?? '管理员']));
    return rows.map((r) => {
      const c = countMap.get(r.id);
      const my = mineMap.get(r.id);
      return {
        id: r.id,
        clanId: r.clanId,
        kind: r.kind,
        category: r.category,
        title: r.title,
        content: r.content,
        location: r.location,
        startAt: iso(r.startAt),
        endAt: iso(r.endAt),
        signupDeadline: iso(r.signupDeadline),
        maxParticipants: r.maxParticipants,
        allowSignup: r.allowSignup,
        pinned: r.pinned,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        createdByName: r.createdBy ? (authorMap.get(r.createdBy) ?? null) : null,
        signupCount: Number(c?.n ?? 0),
        headcountTotal: Number(c?.heads ?? 0),
        checkedInCount: Number(c?.checked ?? 0),
        mySignup: my ? this.signupView(my, null, null) : null,
        ...(isAdmin ? { checkinCode: r.checkinCode } : {}),
      };
    });
  }

  private signupView(s: ActivitySignupEntity, displayName: string | null, linkedPersonName: string | null): ActivitySignup {
    return {
      id: s.id,
      userId: s.userId,
      displayName,
      linkedPersonName,
      headcount: s.headcount,
      note: s.note,
      status: s.status,
      checkedInAt: iso(s.checkedInAt),
      createdAt: s.createdAt.toISOString(),
    };
  }

  async list(user: AuthUser, clanId: string, q: ListQuery): Promise<Paged<Activity>> {
    const { role } = await this.access.clanAccess(user, clanId, 'member');
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const [rows, total] = await this.repo.findAndCount({
      where: { clanId, ...(q.kind ? { kind: q.kind } : {}) },
      order: { pinned: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items: await this.summaries(rows, user, AccessService.isAdmin(role)), total, page, pageSize };
  }

  async get(user: AuthUser, id: string): Promise<ActivityDetail> {
    const { activity, role } = await this.load(user, id);
    const isAdmin = AccessService.isAdmin(role);
    const [summary] = await this.summaries([activity], user, isAdmin);
    const list = await this.signups.find({ where: { activityId: id, status: 'signed' }, order: { createdAt: 'ASC' } });
    const users = await this.users.find({ where: { id: In(list.map((s) => s.userId)) } });
    const ms = await this.memberships.find({ where: { clanId: activity.clanId, userId: In(list.map((s) => s.userId)) } });
    const persons = await this.persons.find({ where: { id: In(ms.map((m) => m.linkedPersonId).filter((x): x is string => !!x)) } });
    const uMap = new Map(users.map((u) => [u.id, u.displayName ?? null]));
    const pMap = new Map(persons.map((p) => [p.id, p.fullName]));
    const lpMap = new Map(ms.map((m) => [m.userId, m.linkedPersonId ? (pMap.get(m.linkedPersonId) ?? null) : null]));
    return {
      ...summary,
      signups: list.map((s) => {
        const v = this.signupView(s, uMap.get(s.userId) ?? null, lpMap.get(s.userId) ?? null);
        // 族人只看到报名名单与人数，备注仅管理员和本人可见
        if (!isAdmin && s.userId !== user.id) v.note = null;
        return v;
      }),
    };
  }

  async create(user: AuthUser, clanId: string, dto: ActivityDto): Promise<Activity> {
    const { clan } = await this.access.clanAccess(user, clanId, 'admin');
    if (dto.kind === 'activity' && dto.startAt && dto.endAt && new Date(dto.endAt) < new Date(dto.startAt)) {
      throw new BadRequestException('结束时间不能早于开始时间');
    }
    const isActivity = dto.kind === 'activity';
    const e = await this.repo.save(
      this.repo.create({
        clanId,
        kind: dto.kind,
        category: dto.category ?? 'other',
        title: dto.title.trim(),
        content: dto.content ?? null,
        location: isActivity ? (dto.location ?? null) : null,
        startAt: isActivity ? toDate(dto.startAt) : null,
        endAt: isActivity ? toDate(dto.endAt) : null,
        signupDeadline: isActivity ? toDate(dto.signupDeadline) : null,
        maxParticipants: isActivity ? (dto.maxParticipants ?? null) : null,
        allowSignup: isActivity ? (dto.allowSignup ?? true) : false,
        pinned: dto.pinned ?? false,
        checkinCode: isActivity ? newCode() : null,
        createdBy: user.id,
      }),
    );
    await this.audit.log({ clanId, userId: user.id, entity: 'activity', entityId: e.id, action: 'create', after: { ...e, checkinCode: undefined } });

    // 通知全体族人（站内 + 微信订阅消息）
    const ms = await this.memberships.find({ where: { clanId } });
    const label = isActivity ? ACTIVITY_CATEGORY_LABELS[e.category] : '公告';
    await this.notifications.notify(
      ms
        .filter((m) => m.userId !== user.id)
        .map((m) => ({
          userId: m.userId,
          clanId,
          type: isActivity ? ('activity' as const) : ('announcement' as const),
          title: `【${clan.name}·${label}】${e.title}`,
          body: isActivity ? [e.startAt && `时间：${fmtCn(e.startAt)}`, e.location && `地点：${e.location}`].filter(Boolean).join('；') || null : clip(e.content ?? '', 80) || null,
          link: { kind: 'activity' as const, id: e.id },
          dedupeKey: `activity:${e.id}:${m.userId}`,
        })),
      () => ({
        template: 'activity',
        page: `pages/activity/detail?id=${e.id}`,
        data: {
          thing1: { value: clip(e.title) },
          time2: { value: e.startAt ? fmtCn(e.startAt) : fmtCn(e.createdAt) },
          thing3: { value: clip(e.location || clan.name) },
        },
      }),
    );
    return (await this.summaries([e], user, true))[0];
  }

  async update(user: AuthUser, id: string, dto: ActivityUpdateDto): Promise<Activity> {
    const { activity } = await this.load(user, id, 'admin');
    const before = { ...activity };
    const patch: Partial<ClanActivityEntity> = {};
    for (const k of ['category', 'title', 'content', 'location', 'maxParticipants', 'allowSignup', 'pinned', 'status'] as const) {
      if (dto[k] !== undefined) (patch as any)[k] = dto[k];
    }
    for (const k of ['startAt', 'endAt', 'signupDeadline'] as const) if (dto[k] !== undefined) patch[k] = toDate(dto[k]);
    Object.assign(activity, patch);
    if (activity.startAt && activity.endAt && activity.endAt < activity.startAt) throw new BadRequestException('结束时间不能早于开始时间');
    const saved = await this.repo.save(activity);
    await this.audit.log({
      clanId: activity.clanId,
      userId: user.id,
      entity: 'activity',
      entityId: id,
      action: dto.status === 'cancelled' ? 'cancel' : 'update',
      before: { ...before, checkinCode: undefined },
      after: { ...saved, checkinCode: undefined },
    });
    return (await this.summaries([saved], user, true))[0];
  }

  async remove(user: AuthUser, id: string) {
    const { activity } = await this.load(user, id, 'admin');
    await this.repo.delete(id);
    await this.audit.log({ clanId: activity.clanId, userId: user.id, entity: 'activity', entityId: id, action: 'delete', before: { title: activity.title } });
  }

  private async requireMembership(user: AuthUser, clanId: string) {
    const m = await this.memberships.findOne({ where: { clanId, userId: user.id } });
    if (!m) throw new ForbiddenException('仅本族族人可报名');
    return m;
  }

  async signup(user: AuthUser, id: string, dto: SignupDto): Promise<ActivitySignup> {
    const { activity } = await this.load(user, id);
    await this.requireMembership(user, activity.clanId);
    if (activity.kind !== 'activity' || !activity.allowSignup) throw new BadRequestException('该活动不接受报名');
    if (activity.status !== 'published') throw new BadRequestException('活动已取消');
    const now = new Date();
    if (activity.signupDeadline && activity.signupDeadline < now) throw new BadRequestException('报名已截止');
    if (activity.endAt && activity.endAt < now) throw new BadRequestException('活动已结束');
    const headcount = dto.headcount ?? 1;
    return this.signups.manager.transaction(async (em) => {
      // 锁住活动行，避免并发报名超额
      await em.query(`SELECT id FROM clan_activity WHERE id = $1 FOR UPDATE`, [id]);
      const repo = em.getRepository(ActivitySignupEntity);
      const existing = await repo.findOne({ where: { activityId: id, userId: user.id } });
      if (activity.maxParticipants) {
        const [{ heads }] = await em.query(
          `SELECT coalesce(sum(headcount),0)::int heads FROM activity_signup WHERE activity_id = $1 AND status = 'signed' AND user_id <> $2`,
          [id, user.id],
        );
        if (heads + headcount > activity.maxParticipants) throw new ConflictException(`名额不足（剩余 ${Math.max(0, activity.maxParticipants - heads)} 人）`);
      }
      const s = existing ?? repo.create({ activityId: id, clanId: activity.clanId, userId: user.id });
      s.headcount = headcount;
      s.note = dto.note ?? null;
      s.status = 'signed';
      return this.signupView(await repo.save(s), null, null);
    });
  }

  async cancelSignup(user: AuthUser, id: string) {
    const { activity } = await this.load(user, id);
    const s = await this.signups.findOne({ where: { activityId: activity.id, userId: user.id } });
    if (!s || s.status !== 'signed') throw new NotFoundException('您尚未报名');
    if (s.checkedInAt) throw new BadRequestException('已签到，不能取消报名');
    s.status = 'cancelled';
    await this.signups.save(s);
  }

  /** 族人凭现场签到码自助签到；未报名的族人签到时自动补报名 */
  async checkin(user: AuthUser, id: string, code: string): Promise<ActivitySignup> {
    const { activity } = await this.load(user, id);
    await this.requireMembership(user, activity.clanId);
    if (activity.kind !== 'activity' || activity.status !== 'published') throw new BadRequestException('该活动不能签到');
    if (!activity.checkinCode || code.trim() !== activity.checkinCode) throw new ForbiddenException('签到码不正确');
    return this.markCheckedIn(activity, user.id, user.id);
  }

  async adminCheckin(user: AuthUser, id: string, userId: string): Promise<ActivitySignup> {
    const { activity } = await this.load(user, id, 'admin');
    if (!isUuid(userId) || !(await this.memberships.exists({ where: { clanId: activity.clanId, userId } }))) {
      throw new NotFoundException('该用户不是本族族人');
    }
    const r = await this.markCheckedIn(activity, userId, user.id);
    await this.audit.log({ clanId: activity.clanId, userId: user.id, entity: 'activity', entityId: id, action: 'checkin', after: { userId } });
    return r;
  }

  private async markCheckedIn(activity: ClanActivityEntity, userId: string, by: string) {
    let s = await this.signups.findOne({ where: { activityId: activity.id, userId } });
    if (!s) s = this.signups.create({ activityId: activity.id, clanId: activity.clanId, userId, headcount: 1 });
    s.status = 'signed';
    if (!s.checkedInAt) {
      s.checkedInAt = new Date();
      s.checkedInBy = by;
    }
    return this.signupView(await this.signups.save(s), null, null);
  }
}

@Controller()
@LoginRequired()
export class ActivitiesController {
  constructor(private readonly svc: ActivitiesService) {}

  @Get('clans/:clanId/activities')
  list(@CurrentUser() u: AuthUser, @Param('clanId') clanId: string, @Query() q: ListQuery) {
    return this.svc.list(u, clanId, q);
  }

  @Post('clans/:clanId/activities')
  create(@CurrentUser() u: AuthUser, @Param('clanId') clanId: string, @Body() dto: ActivityDto) {
    return this.svc.create(u, clanId, dto);
  }

  @Get('activities/:id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u, id);
  }

  @Patch('activities/:id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ActivityUpdateDto) {
    return this.svc.update(u, id, dto);
  }

  @Delete('activities/:id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u, id);
  }

  @Post('activities/:id/signup')
  signup(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SignupDto) {
    return this.svc.signup(u, id, dto);
  }

  @Delete('activities/:id/signup')
  cancel(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.cancelSignup(u, id);
  }

  @Post('activities/:id/checkin')
  checkin(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CheckinDto) {
    return this.svc.checkin(u, id, dto.code);
  }

  @Post('activities/:id/signups/:userId/checkin')
  adminCheckin(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.svc.adminCheckin(u, id, userId);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
