import {
  BadRequestException,
  Body,
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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Repository } from 'typeorm';
import type { MediaType } from '@zupu/shared';
import { LifeEventEntity, MediaEntity } from '../../entities';
import { AccessService, isUuid } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { StorageService } from '../../common/storage.service';
import { config } from '../../config';
import { toEvent, toMedia } from './media.mappers';

const ALLOWED = /^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|aac|wav|x-wav|webm|ogg|x-m4a)|application\/pdf)$/;

function mediaTypeOf(mime: string): MediaType {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'doc';
}

class MediaUpdateDto {
  @IsOptional() @IsString() @MaxLength(200) caption?: string | null;
}

class EventDto {
  @IsOptional() @IsString() @MaxLength(30) type?: string | null;
  @IsString() @MaxLength(100) title: string;
  @IsOptional() @IsDateString() eventDate?: string | null;
  @IsOptional() @IsString() @MaxLength(60) eventText?: string | null;
  @IsOptional() @IsString() @MaxLength(100) place?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsInt() sortOrder?: number;
}
class EventUpdateDto {
  @IsOptional() @IsString() @MaxLength(30) type?: string | null;
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsDateString() eventDate?: string | null;
  @IsOptional() @IsString() @MaxLength(60) eventText?: string | null;
  @IsOptional() @IsString() @MaxLength(100) place?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsInt() sortOrder?: number;
}

/**
 * 多媒体（照片/视频/音频）。M1：上传、签名地址访问、删除；
 * M2：转码、缩略图、相册、口述历史在此扩展（thumbnail_key / duration 字段已预留）。
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    @InjectRepository(MediaEntity) private readonly media: Repository<MediaEntity>,
    @InjectRepository(LifeEventEntity) private readonly events: Repository<LifeEventEntity>,
  ) {}

  async upload(user: AuthUser, personId: string, file: Express.Multer.File | undefined, caption?: string) {
    const { person, clan } = await this.access.personAccess(user, personId, 'admin');
    if (!file) throw new BadRequestException('请选择文件');
    if (!ALLOWED.test(file.mimetype)) throw new BadRequestException(`不支持的文件类型：${file.mimetype}`);
    const key = `clans/${clan.id}/persons/${person.id}/${randomUUID()}${extname(file.originalname).toLowerCase().slice(0, 8)}`;
    await this.storage.driver.put(key, file.buffer, file.mimetype);
    const saved = await this.media.save(
      this.media.create({
        clanId: clan.id,
        personId,
        type: mediaTypeOf(file.mimetype),
        storageKey: key,
        mimeType: file.mimetype,
        size: file.size,
        caption: caption || Buffer.from(file.originalname, 'latin1').toString('utf8'),
        createdBy: user.id,
      }),
    );
    await this.audit.log({ clanId: clan.id, userId: user.id, entity: 'media', entityId: saved.id, action: 'upload', after: saved });
    return toMedia(saved, this.storage);
  }

  private async load(user: AuthUser, id: string) {
    if (!isUuid(id)) throw new NotFoundException('文件不存在');
    const m = await this.media.findOne({ where: { id } });
    if (!m) throw new NotFoundException('文件不存在');
    await this.access.clanAccess(user, m.clanId, 'admin');
    return m;
  }

  async update(user: AuthUser, id: string, dto: MediaUpdateDto) {
    const m = await this.load(user, id);
    if (dto.caption !== undefined) m.caption = dto.caption;
    const saved = await this.media.save(m);
    return toMedia(saved, this.storage);
  }

  async remove(user: AuthUser, id: string) {
    const m = await this.load(user, id);
    await this.media.delete(id);
    await this.media.manager.query(`UPDATE person SET avatar_media_id = NULL WHERE avatar_media_id = $1`, [id]);
    await this.storage.driver.remove(m.storageKey).catch(() => undefined);
    await this.audit.log({ clanId: m.clanId, userId: user.id, entity: 'media', entityId: id, action: 'delete', before: m });
  }

  async stream(id: string, exp: number, sig: string, res: Response) {
    if (!isUuid(id) || !this.storage.verify(id, exp, sig)) throw new ForbiddenException('链接无效或已过期');
    const m = await this.media.findOne({ where: { id } });
    if (!m) throw new NotFoundException('文件不存在');
    res.setHeader('Content-Type', m.mimeType ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const s = await this.storage.driver.read(m.storageKey);
    s.on('error', () => res.status(404).end());
    s.pipe(res);
  }

  async addEvent(user: AuthUser, personId: string, dto: EventDto) {
    const { clan } = await this.access.personAccess(user, personId, 'admin');
    const saved = await this.events.save(this.events.create({ ...dto, personId, clanId: clan.id }));
    await this.audit.log({ clanId: clan.id, userId: user.id, entity: 'life_event', entityId: saved.id, action: 'create', after: saved });
    return toEvent(saved);
  }

  private async loadEvent(user: AuthUser, id: string) {
    if (!isUuid(id)) throw new NotFoundException('事迹不存在');
    const e = await this.events.findOne({ where: { id } });
    if (!e) throw new NotFoundException('事迹不存在');
    await this.access.clanAccess(user, e.clanId, 'admin');
    return e;
  }

  async updateEvent(user: AuthUser, id: string, dto: EventUpdateDto) {
    const e = await this.loadEvent(user, id);
    const before = { ...e };
    for (const [k, v] of Object.entries(dto)) if (v !== undefined) (e as any)[k] = v;
    const saved = await this.events.save(e);
    await this.audit.log({ clanId: e.clanId, userId: user.id, entity: 'life_event', entityId: id, action: 'update', before, after: saved });
    return toEvent(saved);
  }

  async removeEvent(user: AuthUser, id: string) {
    const e = await this.loadEvent(user, id);
    await this.events.delete(id);
    await this.audit.log({ clanId: e.clanId, userId: user.id, entity: 'life_event', entityId: id, action: 'delete', before: e });
  }
}

@Controller()
export class MediaController {
  constructor(private readonly svc: MediaService) {}

  @Post('persons/:id/media')
  @LoginRequired()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: config.maxUploadMb * 1024 * 1024 } }))
  upload(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('caption') caption?: string,
  ) {
    return this.svc.upload(u, id, file, caption);
  }

  @Patch('media/:id')
  @LoginRequired()
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: MediaUpdateDto) {
    return this.svc.update(u, id, dto);
  }

  @Delete('media/:id')
  @LoginRequired()
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u, id);
  }

  /** 签名地址访问文件（<img>/<video> 无法携带令牌，故用签名） */
  @Get('media/:id/file')
  file(@Param('id') id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    return this.svc.stream(id, Number(exp), sig, res);
  }

  @Post('persons/:id/events')
  @LoginRequired()
  addEvent(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: EventDto) {
    return this.svc.addEvent(u, id, dto);
  }

  @Patch('events/:id')
  @LoginRequired()
  updateEvent(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: EventUpdateDto) {
    return this.svc.updateEvent(u, id, dto);
  }

  @Delete('events/:id')
  @LoginRequired()
  removeEvent(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.removeEvent(u, id);
  }
}

@Module({ controllers: [MediaController], providers: [MediaService] })
export class MediaModule {}
