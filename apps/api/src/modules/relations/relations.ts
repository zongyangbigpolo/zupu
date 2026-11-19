import { BadRequestException, Body, Controller, Delete, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import type { Marriage, ParentChild } from '@zupu/shared';
import { MarriageEntity, ParentChildEntity, PersonEntity } from '../../entities';
import { AccessService, isUuid } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { KinshipCache } from '../../common/kinship-cache.service';

const REL = ['biological', 'adopted', 'heir', 'jiantiao'];
const MAR = ['principal', 'successor', 'concubine', 'other'];

class ParentChildDto {
  @IsUUID() parentId: string;
  @IsUUID() childId: string;
  @IsOptional() @IsIn(REL) relationType?: ParentChild['relationType'];
  @IsOptional() @IsBoolean() isMainLine?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}
class ParentChildUpdateDto {
  @IsOptional() @IsIn(REL) relationType?: ParentChild['relationType'];
  @IsOptional() @IsBoolean() isMainLine?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}
class MarriageDto {
  @IsUUID() husbandId: string;
  @IsUUID() wifeId: string;
  @IsOptional() @IsIn(MAR) type?: Marriage['type'];
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsString() @MaxLength(60) startText?: string | null;
  @IsOptional() @IsString() @MaxLength(60) endText?: string | null;
  @IsOptional() @IsString() note?: string | null;
}
class MarriageUpdateDto {
  @IsOptional() @IsIn(MAR) type?: Marriage['type'];
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsString() @MaxLength(60) startText?: string | null;
  @IsOptional() @IsString() @MaxLength(60) endText?: string | null;
  @IsOptional() @IsString() note?: string | null;
}

const pick = <T extends object>(o: T, keys: string[]) =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => keys.includes(k) && v !== undefined));

@Injectable()
export class RelationsService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly kinship: KinshipCache,
    @InjectRepository(ParentChildEntity) private readonly pcs: Repository<ParentChildEntity>,
    @InjectRepository(MarriageEntity) private readonly marriages: Repository<MarriageEntity>,
    @InjectRepository(PersonEntity) private readonly persons: Repository<PersonEntity>,
  ) {}

  /** 防止形成环：child 不能是 parent 的祖先 */
  private async assertNoCycle(parentId: string, childId: string) {
    const [r] = await this.ds.query(
      `WITH RECURSIVE anc(id, depth) AS (
         SELECT $1::uuid, 0 UNION ALL
         SELECT pc.parent_id, anc.depth + 1 FROM anc JOIN parent_child pc ON pc.child_id = anc.id WHERE anc.depth < 200
       ) SELECT EXISTS (SELECT 1 FROM anc WHERE id = $2) AS cyc`,
      [parentId, childId],
    );
    if (r.cyc) throw new BadRequestException('不能把祖先设为子女（会形成循环）');
  }

  async addParentChild(user: AuthUser, clanId: string, dto: ParentChildDto) {
    await this.access.clanAccess(user, clanId, 'admin');
    if (dto.parentId === dto.childId) throw new BadRequestException('不能把自己设为父母');
    await this.access.assertPersonsInClan(clanId, [dto.parentId, dto.childId]);
    await this.assertNoCycle(dto.parentId, dto.childId);
    if (await this.pcs.findOne({ where: { parentId: dto.parentId, childId: dto.childId } })) {
      throw new BadRequestException('该亲子关系已存在');
    }
    const saved = await this.pcs.save(this.pcs.create({ clanId, ...dto }));
    await this.audit.log({ clanId, userId: user.id, entity: 'parent_child', entityId: saved.id, action: 'create', after: saved });
    this.kinship.invalidate(clanId);
    return saved;
  }

  private async loadPc(user: AuthUser, id: string) {
    if (!isUuid(id)) throw new NotFoundException('关系不存在');
    const pc = await this.pcs.findOne({ where: { id } });
    if (!pc) throw new NotFoundException('关系不存在');
    await this.access.clanAccess(user, pc.clanId, 'admin');
    return pc;
  }

  async updateParentChild(user: AuthUser, id: string, dto: ParentChildUpdateDto) {
    const pc = await this.loadPc(user, id);
    const before = { ...pc };
    Object.assign(pc, pick(dto, ['relationType', 'isMainLine', 'sortOrder']));
    const saved = await this.pcs.save(pc);
    await this.audit.log({ clanId: pc.clanId, userId: user.id, entity: 'parent_child', entityId: id, action: 'update', before, after: saved });
    this.kinship.invalidate(pc.clanId);
    return saved;
  }

  async removeParentChild(user: AuthUser, id: string) {
    const pc = await this.loadPc(user, id);
    await this.pcs.delete(id);
    await this.audit.log({ clanId: pc.clanId, userId: user.id, entity: 'parent_child', entityId: id, action: 'delete', before: pc });
    this.kinship.invalidate(pc.clanId);
  }

  async addMarriage(user: AuthUser, clanId: string, dto: MarriageDto) {
    await this.access.clanAccess(user, clanId, 'admin');
    if (dto.husbandId === dto.wifeId) throw new BadRequestException('配偶不能是本人');
    await this.access.assertPersonsInClan(clanId, [dto.husbandId, dto.wifeId]);
    if (await this.marriages.findOne({ where: { husbandId: dto.husbandId, wifeId: dto.wifeId } })) {
      throw new BadRequestException('该婚姻关系已存在');
    }
    const order = dto.order ?? (await this.marriages.count({ where: { husbandId: dto.husbandId } })) + 1;
    const saved = await this.marriages.save(this.marriages.create({ clanId, ...dto, order }));
    await this.audit.log({ clanId, userId: user.id, entity: 'marriage', entityId: saved.id, action: 'create', after: saved });
    this.kinship.invalidate(clanId);
    return saved;
  }

  private async loadMarriage(user: AuthUser, id: string) {
    if (!isUuid(id)) throw new NotFoundException('婚姻关系不存在');
    const m = await this.marriages.findOne({ where: { id } });
    if (!m) throw new NotFoundException('婚姻关系不存在');
    await this.access.clanAccess(user, m.clanId, 'admin');
    return m;
  }

  async updateMarriage(user: AuthUser, id: string, dto: MarriageUpdateDto) {
    const m = await this.loadMarriage(user, id);
    const before = { ...m };
    Object.assign(m, pick(dto, ['type', 'order', 'startText', 'endText', 'note']));
    const saved = await this.marriages.save(m);
    await this.audit.log({ clanId: m.clanId, userId: user.id, entity: 'marriage', entityId: id, action: 'update', before, after: saved });
    return saved;
  }

  async removeMarriage(user: AuthUser, id: string) {
    const m = await this.loadMarriage(user, id);
    await this.marriages.delete(id);
    await this.audit.log({ clanId: m.clanId, userId: user.id, entity: 'marriage', entityId: id, action: 'delete', before: m });
    this.kinship.invalidate(m.clanId);
  }
}

@Controller()
@LoginRequired()
export class RelationsController {
  constructor(private readonly svc: RelationsService) {}

  @Post('clans/:clanId/parent-child')
  addPc(@CurrentUser() u: AuthUser, @Param('clanId') clanId: string, @Body() dto: ParentChildDto) {
    return this.svc.addParentChild(u, clanId, dto);
  }
  @Patch('parent-child/:id')
  updatePc(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ParentChildUpdateDto) {
    return this.svc.updateParentChild(u, id, dto);
  }
  @Delete('parent-child/:id')
  removePc(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.removeParentChild(u, id);
  }
  @Post('clans/:clanId/marriages')
  addMarriage(@CurrentUser() u: AuthUser, @Param('clanId') clanId: string, @Body() dto: MarriageDto) {
    return this.svc.addMarriage(u, clanId, dto);
  }
  @Patch('marriages/:id')
  updateMarriage(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: MarriageUpdateDto) {
    return this.svc.updateMarriage(u, id, dto);
  }
  @Delete('marriages/:id')
  removeMarriage(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.removeMarriage(u, id);
  }
}

@Module({ controllers: [RelationsController], providers: [RelationsService] })
export class RelationsModule {}
