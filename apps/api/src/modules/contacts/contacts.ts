import { Body, Controller, ForbiddenException, Get, Injectable, Module, Param, Put, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { In, Repository } from 'typeorm';
import {
  CONTACT_FIELDS,
  type ContactCard,
  type ContactEntry,
  type ContactFieldKey,
  type ContactFields,
  type ContactVisibility,
} from '@zupu/shared';
import { AccessService } from '../../common/access.service';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { toBrief } from '../../common/mappers';
import { ContactCardEntity, MembershipEntity, PersonEntity, UserEntity } from '../../entities';

const VIS: ContactVisibility[] = ['members', 'admins', 'private'];
const MAX_LEN: Record<ContactFieldKey, number> = { phone: 30, wechatId: 60, email: 120, address: 200, city: 60, work: 120, note: 300 };
/** 未设置时的默认可见范围：电话/住址等更敏感，默认仅管理员 */
const DEFAULT_VIS: Record<ContactFieldKey, ContactVisibility> = {
  phone: 'admins',
  wechatId: 'members',
  email: 'members',
  address: 'admins',
  city: 'members',
  work: 'members',
  note: 'members',
};

class SaveCardDto {
  @IsObject() fields: Record<string, unknown>;
  @IsObject() visibility: Record<string, unknown>;
}

class ListQuery {
  @IsOptional() @IsString() @MaxLength(30) q?: string;
}

function sanitize(dto: SaveCardDto) {
  const fields: ContactFields = {};
  const visibility: Partial<Record<ContactFieldKey, ContactVisibility>> = {};
  for (const k of CONTACT_FIELDS) {
    const v = dto.fields?.[k];
    if (typeof v === 'string' && v.trim()) fields[k] = v.trim().slice(0, MAX_LEN[k]);
    const vis = dto.visibility?.[k];
    visibility[k] = VIS.includes(vis as ContactVisibility) ? (vis as ContactVisibility) : DEFAULT_VIS[k];
  }
  return { fields, visibility };
}

function toCard(e: ContactCardEntity | null): ContactCard {
  const visibility: ContactCard['visibility'] = {};
  for (const k of CONTACT_FIELDS) visibility[k] = e?.visibility?.[k] ?? DEFAULT_VIS[k];
  return { fields: e?.fields ?? {}, visibility, updatedAt: e?.updatedAt?.toISOString() ?? null };
}

/**
 * 族人通讯录：仅本族已登录族人（含家族管理员）可见；每个字段由本人设置可见范围。
 * 平台超级管理员若不是该族成员，也看不到通讯录（隐私数据不做代管）。
 */
@Injectable()
export class ContactsService {
  constructor(
    private readonly access: AccessService,
    @InjectRepository(ContactCardEntity) private readonly cards: Repository<ContactCardEntity>,
    @InjectRepository(MembershipEntity) private readonly memberships: Repository<MembershipEntity>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(PersonEntity) private readonly persons: Repository<PersonEntity>,
  ) {}

  private async requireMember(user: AuthUser, clanId: string) {
    const a = await this.access.clanAccess(user, clanId, 'member');
    if (!a.membership) throw new ForbiddenException('通讯录仅对本族族人开放');
    return a.membership;
  }

  async list(user: AuthUser, clanId: string, q?: string): Promise<ContactEntry[]> {
    const me = await this.requireMember(user, clanId);
    const viewerIsAdmin = me.role === 'admin';
    const ms = await this.memberships.find({ where: { clanId }, order: { createdAt: 'ASC' } });
    if (!ms.length) return [];
    const userIds = ms.map((m) => m.userId);
    const [users, cards, persons] = await Promise.all([
      this.users.find({ where: { id: In(userIds) } }),
      this.cards.find({ where: { clanId, userId: In(userIds) } }),
      this.persons.find({ where: { id: In(ms.map((m) => m.linkedPersonId).filter((x): x is string => !!x)), clanId } }),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const cardMap = new Map(cards.map((c) => [c.userId, c]));
    const personMap = new Map(persons.map((p) => [p.id, p]));
    const entries: ContactEntry[] = [];
    for (const m of ms) {
      const u = userMap.get(m.userId);
      if (!u || u.status !== 'active') continue;
      const isMe = m.userId === user.id;
      const card = toCard(cardMap.get(m.userId) ?? null);
      const fields: ContactFields = {};
      for (const k of CONTACT_FIELDS) {
        const v = card.fields[k];
        if (!v) continue;
        const vis = card.visibility[k]!;
        if (isMe || vis === 'members' || (vis === 'admins' && viewerIsAdmin)) fields[k] = v;
      }
      const p = m.linkedPersonId ? personMap.get(m.linkedPersonId) : undefined;
      entries.push({
        userId: m.userId,
        displayName: u.displayName ?? p?.fullName ?? null,
        role: m.role,
        linkedPerson: p ? toBrief(p, 'member') : null,
        fields,
        isMe,
      });
    }
    const kw = q?.trim();
    const filtered = kw
      ? entries.filter((e) => [e.displayName, e.linkedPerson?.fullName, e.fields.city, e.fields.work].some((s) => s?.includes(kw)))
      : entries;
    return filtered.sort((a, b) => Number(b.isMe) - Number(a.isMe) || (a.linkedPerson?.generation ?? 999) - (b.linkedPerson?.generation ?? 999));
  }

  async mine(user: AuthUser, clanId: string) {
    await this.requireMember(user, clanId);
    return toCard(await this.cards.findOne({ where: { clanId, userId: user.id } }));
  }

  async saveMine(user: AuthUser, clanId: string, dto: SaveCardDto) {
    await this.requireMember(user, clanId);
    const data = sanitize(dto);
    await this.cards.upsert({ clanId, userId: user.id, ...data, updatedAt: new Date() }, ['clanId', 'userId']);
    return toCard(await this.cards.findOne({ where: { clanId, userId: user.id } }));
  }
}

@Controller('clans/:clanId/contacts')
@LoginRequired()
export class ContactsController {
  constructor(private readonly svc: ContactsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('clanId') clanId: string, @Query() q: ListQuery) {
    return this.svc.list(user, clanId, q.q);
  }

  @Get('me')
  mine(@CurrentUser() user: AuthUser, @Param('clanId') clanId: string) {
    return this.svc.mine(user, clanId);
  }

  @Put('me')
  save(@CurrentUser() user: AuthUser, @Param('clanId') clanId: string, @Body() dto: SaveCardDto) {
    return this.svc.saveMine(user, clanId, dto);
  }
}

@Module({ controllers: [ContactsController], providers: [ContactsService] })
export class ContactsModule {}
