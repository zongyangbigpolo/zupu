import { BadRequestException, Body, Controller, Delete, Get, Injectable, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DataSource } from 'typeorm';
import type { ClanDocument, ClanDocumentKind } from '@zupu/shared';
import { AccessService, isUuid } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { ClanDocumentEntity } from '../../entities';

const KINDS = ['family_rules', 'clan_rules', 'preface', 'conventions', 'other'];
const MAX_CONTENT = 200_000;

class DocUpdateDto {
  @IsOptional() @IsIn(KINDS) kind?: ClanDocumentKind;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) title?: string;
  @IsOptional() @IsString() @MaxLength(MAX_CONTENT) content?: string | null;
  @IsOptional() @IsBoolean() vertical?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}
class DocCreateDto extends DocUpdateDto {
  @IsIn(KINDS) declare kind: ClanDocumentKind;
  @IsString() @MinLength(1) @MaxLength(100) declare title: string;
}

export function toDocument(d: ClanDocumentEntity): ClanDocument {
  return {
    id: d.id,
    clanId: d.clanId,
    kind: d.kind,
    title: d.title,
    content: d.content,
    vertical: d.vertical,
    sortOrder: d.sortOrder,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

/** 家族文献：家训、家规、谱序、凡例（富文本，可竖排展示） */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  private get repo() {
    return this.ds.getRepository(ClanDocumentEntity);
  }

  async list(user: AuthUser | null, clanId: string) {
    await this.access.clanAccess(user, clanId);
    const list = await this.repo.find({ where: { clanId }, order: { sortOrder: 'ASC', createdAt: 'ASC' } });
    return list.map(toDocument);
  }

  private async load(user: AuthUser | null, id: string, admin = false) {
    if (!isUuid(id)) throw new NotFoundException('文献不存在');
    const d = await this.repo.findOne({ where: { id } });
    if (!d) throw new NotFoundException('文献不存在');
    await this.access.clanAccess(user, d.clanId, admin ? 'admin' : 'visitor');
    return d;
  }

  async get(user: AuthUser | null, id: string) {
    return toDocument(await this.load(user, id));
  }

  async create(user: AuthUser, clanId: string, dto: DocCreateDto) {
    await this.access.clanAccess(user, clanId, 'admin');
    const d = await this.repo.save(
      this.repo.create({
        clanId,
        kind: dto.kind,
        title: dto.title.trim(),
        content: dto.content ?? null,
        vertical: dto.vertical ?? false,
        sortOrder: dto.sortOrder ?? 0,
        createdBy: user.id,
      }),
    );
    await this.audit.log({ clanId, userId: user.id, entity: 'clan_document', entityId: d.id, action: 'create', after: d });
    return toDocument(d);
  }

  async update(user: AuthUser, id: string, dto: DocUpdateDto) {
    const d = await this.load(user, id, true);
    const before = { ...d };
    if (dto.title !== undefined) {
      if (!dto.title.trim()) throw new BadRequestException('标题不能为空');
      d.title = dto.title.trim();
    }
    for (const k of ['kind', 'content', 'vertical', 'sortOrder'] as const) if (dto[k] !== undefined) (d as any)[k] = dto[k];
    const saved = await this.repo.save(d);
    await this.audit.log({ clanId: d.clanId, userId: user.id, entity: 'clan_document', entityId: id, action: 'update', before, after: saved });
    return toDocument(saved);
  }

  async remove(user: AuthUser, id: string) {
    const d = await this.load(user, id, true);
    await this.repo.delete(id);
    await this.audit.log({ clanId: d.clanId, userId: user.id, entity: 'clan_document', entityId: id, action: 'delete', before: d });
  }
}

@Controller()
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Get('clans/:clanId/documents')
  list(@CurrentUser() u: AuthUser | null, @Param('clanId') clanId: string) {
    return this.svc.list(u, clanId);
  }

  @Post('clans/:clanId/documents')
  @LoginRequired()
  create(@CurrentUser() u: AuthUser, @Param('clanId') clanId: string, @Body() dto: DocCreateDto) {
    return this.svc.create(u, clanId, dto);
  }

  @Get('documents/:id')
  get(@CurrentUser() u: AuthUser | null, @Param('id') id: string) {
    return this.svc.get(u, id);
  }

  @Patch('documents/:id')
  @LoginRequired()
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: DocUpdateDto) {
    return this.svc.update(u, id, dto);
  }

  @Delete('documents/:id')
  @LoginRequired()
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u, id);
  }
}
