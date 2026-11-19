import { Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { In, IsNull, Repository } from 'typeorm';
import type { AppNotification, NotificationType, Paged } from '@zupu/shared';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { isUuid } from '../../common/access.service';
import { NotificationEntity, ReminderPrefEntity, UserEntity } from '../../entities';
import { WechatModule, WechatQuotaService, WechatService } from '../wechat/wechat';

export interface NotifyItem {
  userId: string;
  clanId: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: AppNotification['link'];
  /** 去重键：同一键只通知一次（定时任务可重复执行） */
  dedupeKey: string;
}

export interface WechatPush {
  template: 'reminder' | 'activity';
  page: string;
  /** 订阅消息模板字段，见 docs/m4-implementation.md */
  data: Record<string, { value: string }>;
}

/** 订阅消息 thing 类字段最多 20 字 */
export function clip(s: string, n = 20) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function toNotification(e: NotificationEntity): AppNotification {
  return {
    id: e.id,
    clanId: e.clanId,
    type: e.type,
    title: e.title,
    body: e.body,
    link: e.link,
    readAt: e.readAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(NotificationEntity) private readonly repo: Repository<NotificationEntity>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(ReminderPrefEntity) private readonly prefs: Repository<ReminderPrefEntity>,
    private readonly wechat: WechatService,
    private readonly quota: WechatQuotaService,
  ) {}

  /**
   * 写站内通知（按 dedupeKey 去重），并对新写入的用户尝试发送微信订阅消息
   * （需已绑定微信、开启微信提醒、且有剩余订阅额度）。返回 { created, wechatSent }。
   */
  async notify(items: NotifyItem[], push?: (item: NotifyItem) => WechatPush | null) {
    if (!items.length) return { created: 0, wechatSent: 0 };
    const created: NotifyItem[] = [];
    for (let i = 0; i < items.length; i += 500) {
      const chunk = items.slice(i, i + 500);
      const r = await this.repo
        .createQueryBuilder()
        .insert()
        .values(chunk.map((x) => ({ ...x, body: x.body ?? null, link: x.link ?? null })))
        .orIgnore()
        .returning('dedupe_key')
        .execute();
      const keys = new Set((r.raw as { dedupe_key: string }[]).map((x) => x.dedupe_key));
      created.push(...chunk.filter((x) => keys.has(x.dedupeKey)));
    }
    let wechatSent = 0;
    if (push && created.length) {
      const users = await this.users.find({ where: { id: In([...new Set(created.map((c) => c.userId))]) } });
      const openids = new Map(users.filter((u) => u.wechatOpenid && u.status === 'active').map((u) => [u.id, u.wechatOpenid!]));
      const tpl = this.wechat.templates();
      for (const item of created) {
        const openid = openids.get(item.userId);
        if (!openid) continue;
        const msg = push(item);
        const templateId = msg && tpl[msg.template];
        if (!msg || !templateId) continue;
        if (item.clanId) {
          const pref = await this.prefs.findOne({ where: { userId: item.userId, clanId: item.clanId } });
          if (pref && !pref.wechat) continue;
        }
        if (!(await this.quota.consume(item.userId, templateId))) continue;
        const ok = await this.wechat.sendSubscribeMessage({ openid, templateId, page: msg.page, data: msg.data });
        if (ok) wechatSent++;
        else await this.quota.refund(item.userId, templateId);
      }
    }
    return { created: created.length, wechatSent };
  }
}

class ListQuery {
  @IsOptional() @IsString() unread?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

@Controller('notifications')
@LoginRequired()
export class NotificationsController {
  constructor(@InjectRepository(NotificationEntity) private readonly repo: Repository<NotificationEntity>) {}

  @Get()
  async list(@CurrentUser() me: AuthUser, @Query() q: ListQuery): Promise<Paged<AppNotification>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const unread = q.unread === 'true' || q.unread === '1';
    const where = { userId: me.id, ...(unread ? { readAt: IsNull() } : {}) };
    const [rows, total] = await this.repo.findAndCount({ where, order: { createdAt: 'DESC' }, skip: (page - 1) * pageSize, take: pageSize });
    return { items: rows.map(toNotification), total, page, pageSize };
  }

  @Get('unread-count')
  async unread(@CurrentUser() me: AuthUser) {
    return { count: await this.repo.count({ where: { userId: me.id, readAt: IsNull() } }) };
  }

  @Post('read-all')
  async readAll(@CurrentUser() me: AuthUser) {
    await this.repo.update({ userId: me.id, readAt: IsNull() }, { readAt: new Date() });
  }

  @Post(':id/read')
  async read(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    if (!isUuid(id)) throw new NotFoundException('通知不存在');
    if (!(await this.repo.exists({ where: { id, userId: me.id } }))) throw new NotFoundException('通知不存在');
    await this.repo.update({ id, userId: me.id, readAt: IsNull() }, { readAt: new Date() });
  }
}

@Module({
  imports: [WechatModule],
  controllers: [NotificationsController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
