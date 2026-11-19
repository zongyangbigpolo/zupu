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
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { DataSource, In, Repository } from 'typeorm';
import type { Site } from '@zupu/shared';
import { SiteEntity, SitePersonEntity, SitePhotoEntity } from '../../entities';
import { AccessService, isUuid } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { StorageService } from '../../common/storage.service';
import { config } from '../../config';
import { assertCoordPair, pick, SiteDto, SiteListQuery, SiteUpdateDto } from './visual.dto';

const FIELDS = ['type', 'name', 'address', 'lng', 'lat', 'intro', 'builtText', 'sortOrder'];
const IMAGE = /^image\/(jpeg|png|gif|webp)$/;

/** 祠堂 / 祖坟 / 祖屋：族人可看，管理员录入；照片走签名地址 */
@Injectable()
export class SitesService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    @InjectRepository(SiteEntity) private readonly sites: Repository<SiteEntity>,
    @InjectRepository(SitePersonEntity) private readonly links: Repository<SitePersonEntity>,
    @InjectRepository(SitePhotoEntity) private readonly photos: Repository<SitePhotoEntity>,
  ) {}

  /** 本地存储时由本模块的签名路由提供文件（与人物媒体同一签名算法） */
  private async photoUrl(p: SitePhotoEntity) {
    const url = await this.storage.mediaUrl(p.id, p.storageKey);
    return url.startsWith('/api/media/') ? url.replace('/api/media/', '/api/site-photos/') : url;
  }

  private async hydrate(list: SiteEntity[]): Promise<Site[]> {
    if (!list.length) return [];
    const ids = list.map((s) => s.id);
    const persons: { siteId: string; id: string; fullName: string; generation: number | null }[] = await this.ds.query(
      `SELECT sp.site_id AS "siteId", p.id, p.full_name AS "fullName", p.generation
         FROM site_person sp JOIN person p ON p.id = sp.person_id
        WHERE sp.site_id = ANY($1::uuid[]) ORDER BY p.generation NULLS LAST, p.full_name`,
      [ids],
    );
    const photos = await this.photos.find({ where: { siteId: In(ids) }, order: { createdAt: 'ASC' } });
    const photoDtos = await Promise.all(photos.map(async (p) => ({ siteId: p.siteId, id: p.id, caption: p.caption, url: await this.photoUrl(p) })));
    return list.map((s) => ({
      id: s.id,
      clanId: s.clanId,
      type: s.type,
      name: s.name,
      address: s.address,
      lng: s.lng,
      lat: s.lat,
      intro: s.intro,
      builtText: s.builtText,
      sortOrder: s.sortOrder,
      persons: persons.filter((p) => p.siteId === s.id).map(({ siteId, ...p }) => (void siteId, p)),
      photos: photoDtos.filter((p) => p.siteId === s.id).map(({ siteId, ...p }) => (void siteId, p)),
    }));
  }

  async list(user: AuthUser | null, clanId: string, q: SiteListQuery) {
    await this.access.clanAccess(user, clanId);
    const rows = await this.sites.find({ where: { clanId, ...(q.type ? { type: q.type } : {}) }, order: { sortOrder: 'ASC', createdAt: 'ASC' } });
    return this.hydrate(rows);
  }

  private async load(user: AuthUser | null, id: string, need: 'visitor' | 'admin') {
    if (!isUuid(id)) throw new NotFoundException('地点不存在');
    const s = await this.sites.findOne({ where: { id } });
    if (!s) throw new NotFoundException('地点不存在');
    await this.access.clanAccess(user, s.clanId, need);
    return s;
  }

  async get(user: AuthUser | null, id: string) {
    const s = await this.load(user, id, 'visitor');
    return (await this.hydrate([s]))[0];
  }

  private async setPersons(clanId: string, siteId: string, personIds: string[]) {
    const uniq = [...new Set(personIds)];
    if (uniq.length) await this.access.assertPersonsInClan(clanId, uniq);
    await this.links.delete({ siteId });
    if (uniq.length) await this.links.insert(uniq.map((personId) => ({ siteId, personId, clanId })));
  }

  async create(user: AuthUser, clanId: string, dto: SiteDto) {
    await this.access.clanAccess(user, clanId, 'admin');
    assertCoordPair(dto.lng, dto.lat, '坐标');
    if (dto.personIds?.length) await this.access.assertPersonsInClan(clanId, dto.personIds);
    const saved = await this.sites.save(this.sites.create({ ...pick(dto, FIELDS), clanId }));
    if (dto.personIds) await this.setPersons(clanId, saved.id, dto.personIds);
    await this.audit.log({ clanId, userId: user.id, entity: 'site', entityId: saved.id, action: 'create', after: { ...saved, personIds: dto.personIds } });
    return (await this.hydrate([saved]))[0];
  }

  async update(user: AuthUser, id: string, dto: SiteUpdateDto) {
    const s = await this.load(user, id, 'admin');
    const before = { ...s };
    Object.assign(s, pick(dto, FIELDS));
    assertCoordPair(s.lng, s.lat, '坐标');
    if (dto.personIds) await this.setPersons(s.clanId, s.id, dto.personIds);
    const saved = await this.sites.save(s);
    await this.audit.log({ clanId: s.clanId, userId: user.id, entity: 'site', entityId: id, action: 'update', before, after: { ...saved, personIds: dto.personIds } });
    return (await this.hydrate([saved]))[0];
  }

  async remove(user: AuthUser, id: string) {
    const s = await this.load(user, id, 'admin');
    const photos = await this.photos.find({ where: { siteId: id } });
    await this.sites.delete(id);
    for (const p of photos) await this.storage.driver.remove(p.storageKey).catch(() => undefined);
    await this.audit.log({ clanId: s.clanId, userId: user.id, entity: 'site', entityId: id, action: 'delete', before: s });
  }

  async uploadPhoto(user: AuthUser, siteId: string, file: Express.Multer.File | undefined, caption?: string) {
    const s = await this.load(user, siteId, 'admin');
    if (!file) throw new BadRequestException('请选择图片');
    if (!IMAGE.test(file.mimetype)) throw new BadRequestException(`仅支持 JPG/PNG/GIF/WebP 图片：${file.mimetype}`);
    const key = `clans/${s.clanId}/sites/${s.id}/${randomUUID()}${extname(file.originalname).toLowerCase().slice(0, 8)}`;
    await this.storage.driver.put(key, file.buffer, file.mimetype);
    const saved = await this.photos.save(
      this.photos.create({
        clanId: s.clanId,
        siteId: s.id,
        storageKey: key,
        mimeType: file.mimetype,
        size: file.size,
        caption: caption || Buffer.from(file.originalname, 'latin1').toString('utf8'),
        createdBy: user.id,
      }),
    );
    await this.audit.log({ clanId: s.clanId, userId: user.id, entity: 'site_photo', entityId: saved.id, action: 'upload', after: saved });
    return { id: saved.id, caption: saved.caption, url: await this.photoUrl(saved) };
  }

  async removePhoto(user: AuthUser, id: string) {
    if (!isUuid(id)) throw new NotFoundException('照片不存在');
    const p = await this.photos.findOne({ where: { id } });
    if (!p) throw new NotFoundException('照片不存在');
    await this.access.clanAccess(user, p.clanId, 'admin');
    await this.photos.delete(id);
    await this.storage.driver.remove(p.storageKey).catch(() => undefined);
    await this.audit.log({ clanId: p.clanId, userId: user.id, entity: 'site_photo', entityId: id, action: 'delete', before: p });
  }

  async stream(id: string, exp: number, sig: string, res: Response) {
    if (!isUuid(id) || !this.storage.verify(id, exp, sig)) throw new ForbiddenException('链接无效或已过期');
    const p = await this.photos.findOne({ where: { id } });
    if (!p) throw new NotFoundException('照片不存在');
    res.setHeader('Content-Type', p.mimeType ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const s = await this.storage.driver.read(p.storageKey);
    s.on('error', () => res.status(404).end());
    s.pipe(res);
  }
}

@Controller()
export class SitesController {
  constructor(private readonly svc: SitesService) {}

  @Get('clans/:clanId/sites')
  list(@CurrentUser() u: AuthUser | null, @Param('clanId') clanId: string, @Query() q: SiteListQuery) {
    return this.svc.list(u, clanId, q);
  }
  @Get('sites/:id')
  get(@CurrentUser() u: AuthUser | null, @Param('id') id: string) {
    return this.svc.get(u, id);
  }
  @Post('clans/:clanId/sites')
  @LoginRequired()
  create(@CurrentUser() u: AuthUser, @Param('clanId') clanId: string, @Body() dto: SiteDto) {
    return this.svc.create(u, clanId, dto);
  }
  @Patch('sites/:id')
  @LoginRequired()
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SiteUpdateDto) {
    return this.svc.update(u, id, dto);
  }
  @Delete('sites/:id')
  @LoginRequired()
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u, id);
  }
  @Post('sites/:id/photos')
  @LoginRequired()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: config.maxUploadMb * 1024 * 1024 } }))
  upload(@CurrentUser() u: AuthUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Body('caption') caption?: string) {
    return this.svc.uploadPhoto(u, id, file, caption);
  }
  @Delete('site-photos/:id')
  @LoginRequired()
  removePhoto(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.removePhoto(u, id);
  }
  /** 签名地址访问照片（<img> 无法携带令牌） */
  @Get('site-photos/:id/file')
  file(@Param('id') id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    return this.svc.stream(id, Number(exp), sig, res);
  }
}
