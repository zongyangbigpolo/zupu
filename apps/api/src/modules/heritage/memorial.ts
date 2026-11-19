import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { DataSource } from 'typeorm';
import type { EffectiveRole, MemorialInfo, MemorialMessage, MemorialTributeStats, Paged, TributeKind } from '@zupu/shared';
import { AccessService, isUuid } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { canSeeSensitive, toPerson } from '../../common/mappers';
import { toEvent } from '../media/media.mappers';
import { LifeEventEntity, MemorialMessageEntity, PersonEntity } from '../../entities';
import { GalleryService } from './gallery';
import { isAdminRole, isMemberRole } from './heritage-common';

class MessageDto {
  @IsString() @MinLength(1) @MaxLength(500) content: string;
}
class TributeDto {
  @IsIn(['flower', 'candle']) kind: TributeKind;
}
class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

const yearOf = (d: string | null) => (d ? Number(d.slice(0, 4)) : null);

/** 享年（传统按虚岁：卒年 − 生年 + 1） */
export function ageAtDeath(p: Pick<PersonEntity, 'birthDate' | 'deathDate' | 'isLiving'>): number | null {
  const b = yearOf(p.birthDate);
  const d = yearOf(p.deathDate);
  if (p.isLiving || b == null || d == null || d < b || d - b > 130) return null;
  return d - b + 1;
}

const maskPhone = (p: string | null) => (p && p.length >= 7 ? `${p.slice(0, 3)}****${p.slice(-4)}` : '族人');

/** 人物纪念馆：生平、照片、语音；族人留言、献花、点烛；管理员可删除留言 */
@Injectable()
export class MemorialService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly gallery: GalleryService,
  ) {}

  private async deceased(user: AuthUser | null, personId: string, need: EffectiveRole = 'visitor') {
    const a = await this.access.personAccess(user, personId, need);
    if (a.person.isLiving) throw new BadRequestException('在世人物没有纪念馆');
    return a;
  }

  private async tributeStats(personId: string, userId: string | null): Promise<MemorialTributeStats> {
    const [r] = await this.ds.query(
      `SELECT count(*) FILTER (WHERE kind='flower')::int AS flower,
              count(*) FILTER (WHERE kind='candle')::int AS candle,
              bool_or(kind='flower' AND user_id = $2 AND tribute_day = CURRENT_DATE) AS my_flower,
              bool_or(kind='candle' AND user_id = $2 AND tribute_day = CURRENT_DATE) AS my_candle
         FROM memorial_tribute WHERE person_id = $1`,
      [personId, userId],
    );
    return { flower: r.flower, candle: r.candle, myFlowerToday: !!r.my_flower, myCandleToday: !!r.my_candle };
  }

  async info(user: AuthUser | null, personId: string): Promise<MemorialInfo> {
    const { person, role } = await this.deceased(user, personId);
    const sensitive = canSeeSensitive(person, role);
    const [media, oral, events] = sensitive
      ? await Promise.all([
          this.gallery.ofPerson(user, personId),
          this.gallery.oralOfPerson(user, personId),
          this.ds.getRepository(LifeEventEntity).find({ where: { personId }, order: { sortOrder: 'ASC', eventDate: 'ASC' } }),
        ])
      : [[], [], []];
    return {
      person: toPerson(person, role),
      ageAtDeath: ageAtDeath(person),
      photos: media.filter((m) => m.type === 'photo'),
      videos: media.filter((m) => m.type === 'video'),
      audios: media.filter((m) => m.type === 'audio'),
      oralHistories: oral,
      events: events.map(toEvent),
      tributes: await this.tributeStats(personId, user?.id ?? null),
      canInteract: !!user && isMemberRole(role),
      canModerate: isAdminRole(role),
      messagesVisible: isMemberRole(role),
    };
  }

  async messages(user: AuthUser, personId: string, q: PageQuery): Promise<Paged<MemorialMessage>> {
    const { role } = await this.deceased(user, personId, 'member');
    const pageSize = Math.min(q.pageSize ?? 20, 100);
    const page = q.page ?? 1;
    const [{ total }] = await this.ds.query(`SELECT count(*)::int AS total FROM memorial_message WHERE person_id = $1`, [personId]);
    const rows = await this.ds.query(
      `SELECT m.*, u.display_name, u.phone FROM memorial_message m LEFT JOIN app_user u ON u.id = m.user_id
        WHERE m.person_id = $1 ORDER BY m.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      [personId],
    );
    return {
      total,
      page,
      pageSize,
      items: rows.map((r: any) => ({
        id: r.id,
        personId: r.person_id,
        userId: r.user_id,
        authorName: r.display_name || maskPhone(r.phone),
        content: r.content,
        createdAt: new Date(r.created_at).toISOString(),
        canDelete: isAdminRole(role) || r.user_id === user.id,
      })),
    };
  }

  async postMessage(user: AuthUser, personId: string, content: string): Promise<MemorialMessage> {
    const { person } = await this.deceased(user, personId, 'member');
    const text = content.trim();
    if (!text) throw new BadRequestException('留言不能为空');
    const repo = this.ds.getRepository(MemorialMessageEntity);
    const m = await repo.save(repo.create({ clanId: person.clanId, personId, userId: user.id, content: text }));
    const [u] = await this.ds.query(`SELECT display_name, phone FROM app_user WHERE id = $1`, [user.id]);
    return {
      id: m.id,
      personId,
      userId: user.id,
      authorName: u?.display_name || maskPhone(u?.phone ?? null),
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      canDelete: true,
    };
  }

  async removeMessage(user: AuthUser, id: string) {
    if (!isUuid(id)) throw new NotFoundException('留言不存在');
    const repo = this.ds.getRepository(MemorialMessageEntity);
    const m = await repo.findOne({ where: { id } });
    if (!m) throw new NotFoundException('留言不存在');
    const { role } = await this.access.clanAccess(user, m.clanId, 'member');
    const own = m.userId === user.id;
    if (!own && !isAdminRole(role)) throw new ForbiddenException('只能删除自己的留言');
    await repo.delete(id);
    if (!own) await this.audit.log({ clanId: m.clanId, userId: user.id, entity: 'memorial_message', entityId: id, action: 'moderate-delete', before: m });
  }

  async tribute(user: AuthUser, personId: string, kind: TributeKind) {
    const { person } = await this.deceased(user, personId, 'member');
    const r = await this.ds.query(
      `INSERT INTO memorial_tribute (clan_id, person_id, user_id, kind) VALUES ($1,$2,$3,$4)
       ON CONFLICT (person_id, user_id, kind, tribute_day) DO NOTHING RETURNING id`,
      [person.clanId, personId, user.id, kind],
    );
    return { ...(await this.tributeStats(personId, user.id)), already: r.length === 0 };
  }
}

@Controller()
export class MemorialController {
  constructor(private readonly svc: MemorialService) {}

  @Get('persons/:id/memorial')
  info(@CurrentUser() u: AuthUser | null, @Param('id') id: string) {
    return this.svc.info(u, id);
  }

  @Get('persons/:id/memorial/messages')
  @LoginRequired()
  messages(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query() q: PageQuery) {
    return this.svc.messages(u, id, q);
  }

  @Post('persons/:id/memorial/messages')
  @LoginRequired()
  post(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: MessageDto) {
    return this.svc.postMessage(u, id, dto.content);
  }

  @Delete('memorial-messages/:id')
  @LoginRequired()
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.removeMessage(u, id);
  }

  @Post('persons/:id/memorial/tributes')
  @LoginRequired()
  tribute(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: TributeDto) {
    return this.svc.tribute(u, id, dto.kind);
  }
}
