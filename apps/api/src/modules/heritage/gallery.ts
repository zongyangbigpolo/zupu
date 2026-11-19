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
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import type { ClanGalleryItem, ClanOralHistory, GalleryMedia, MediaType, OralHistory, Paged } from '@zupu/shared';
import { canSeeSensitive } from '../../common/mappers';
import { AccessService, isUuid } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { StorageService } from '../../common/storage.service';
import { config } from '../../config';
import { OralHistoryEntity } from '../../entities';
import {
  ALLOWED_MIME,
  baseMime,
  briefFromPrefixed,
  mediaTypeOf,
  optStr,
  originalName,
  PERSON_BRIEF_COLS,
  processMedia,
  returningRows,
  sensitiveSql,
  thumbScope,
  toGalleryMedia,
  toIntOrNull,
} from './heritage-common';

export class GalleryUpdateDto {
  @IsOptional() @IsString() @MaxLength(200) caption?: string | null;
  @IsOptional() @IsString() @MaxLength(60) takenText?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsInt() sortOrder?: number;
}

class GalleryQuery {
  @IsOptional() @IsIn(['photo', 'video', 'audio', 'doc']) type?: MediaType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
  @IsOptional() @IsString() q?: string;
}

export class OralHistoryUpdateDto {
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsString() @MaxLength(60) narrator?: string | null;
  @IsOptional() @IsString() @MaxLength(60) recordedText?: string | null;
  @IsOptional() @IsString() @MaxLength(50000) transcript?: string | null;
}

const uploadOpts = { limits: { fileSize: config.maxUploadMb * 1024 * 1024 } };

/** 相册（照片/视频/音频，含缩略图与元数据）与口述历史 */
@Injectable()
export class GalleryService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /** 保存文件 + 生成缩略图 + 写入 media 行，返回原生行 */
  async storeFile(
    em: EntityManager | DataSource,
    o: { clanId: string; personId: string; userId: string; file: Express.Multer.File; category: 'gallery' | 'oral_history'; body: Record<string, unknown> },
  ) {
    const mime = baseMime(o.file.mimetype);
    if (!ALLOWED_MIME.test(mime)) throw new BadRequestException(`不支持的文件类型：${o.file.mimetype || '未知'}`);
    const type = mediaTypeOf(mime);
    if (o.category === 'oral_history' && type !== 'audio' && type !== 'video') throw new BadRequestException('口述历史请上传音频或视频');
    const base = `clans/${o.clanId}/persons/${o.personId}/${randomUUID()}`;
    const key = `${base}${extname(originalName(o.file)).toLowerCase().slice(0, 8) || '.' + mime.split('/')[1]}`;
    const processed = await processMedia(type, o.file.buffer);
    await this.storage.driver.put(key, o.file.buffer, mime);
    let thumbKey: string | null = null;
    if (processed.thumbnail) {
      thumbKey = `${base}.thumb.jpg`;
      await this.storage.driver.put(thumbKey, processed.thumbnail, 'image/jpeg');
    }
    const [row] = await em.query(
      `INSERT INTO media (clan_id, person_id, type, storage_key, mime_type, size, caption, thumbnail_key, duration, created_by,
                          width, height, category, taken_text, description, transcode_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        o.clanId,
        o.personId,
        type,
        key,
        mime,
        o.file.size,
        optStr(o.body.caption, 200) ?? originalName(o.file).slice(0, 200),
        thumbKey,
        toIntOrNull(o.body.duration, 24 * 3600),
        o.userId,
        processed.width ?? toIntOrNull(o.body.width, 100000),
        processed.height ?? toIntOrNull(o.body.height, 100000),
        o.category,
        optStr(o.body.takenText, 60),
        optStr(o.body.description, 2000),
        processed.transcodeStatus,
      ],
    );
    return row as Record<string, any>;
  }

  private async removeFiles(row: { storage_key: string; thumbnail_key: string | null }) {
    await this.storage.driver.remove(row.storage_key).catch(() => undefined);
    if (row.thumbnail_key) await this.storage.driver.remove(row.thumbnail_key).catch(() => undefined);
  }

  async upload(user: AuthUser, personId: string, file: Express.Multer.File | undefined, body: Record<string, unknown>) {
    const { person, clan } = await this.access.personAccess(user, personId, 'admin');
    if (!file) throw new BadRequestException('请选择文件');
    const row = await this.storeFile(this.ds, { clanId: clan.id, personId: person.id, userId: user.id, file, category: 'gallery', body });
    const m = await toGalleryMedia(row, this.storage);
    await this.audit.log({ clanId: clan.id, userId: user.id, entity: 'media', entityId: m.id, action: 'upload', after: { ...m, url: undefined, thumbnailUrl: undefined } });
    return m;
  }

  async ofPerson(user: AuthUser | null, personId: string, type?: MediaType): Promise<GalleryMedia[]> {
    const { person, role } = await this.access.personAccess(user, personId);
    if (!canSeeSensitive(person, role)) return [];
    const rows = await this.ds.query(
      `SELECT * FROM media WHERE person_id = $1 AND category = 'gallery' AND ($2::varchar IS NULL OR type = $2)
        ORDER BY sort_order, created_at`,
      [personId, type ?? null],
    );
    return Promise.all(rows.map((r: any) => toGalleryMedia(r, this.storage)));
  }

  async ofClan(user: AuthUser | null, clanId: string, q: GalleryQuery): Promise<Paged<ClanGalleryItem>> {
    const { role } = await this.access.clanAccess(user, clanId);
    const pageSize = Math.min(q.pageSize ?? 24, 100);
    const page = q.page ?? 1;
    const where = `m.clan_id = $1 AND m.category = 'gallery' AND ($2::varchar IS NULL OR m.type = $2) AND ${sensitiveSql(role)}`;
    const params = [clanId, q.type ?? null];
    const [{ total }] = await this.ds.query(`SELECT count(*)::int AS total FROM media m JOIN person p ON p.id = m.person_id WHERE ${where}`, params);
    const rows = await this.ds.query(
      `SELECT m.*, ${PERSON_BRIEF_COLS()} FROM media m JOIN person p ON p.id = m.person_id
        WHERE ${where} ORDER BY m.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );
    const items = await Promise.all(
      rows.map(async (r: any) => ({ ...(await toGalleryMedia(r, this.storage)), person: briefFromPrefixed(r, role) })),
    );
    return { total, page, pageSize, items };
  }

  private async loadMedia(user: AuthUser, id: string) {
    if (!isUuid(id)) throw new NotFoundException('文件不存在');
    const [row] = await this.ds.query(`SELECT * FROM media WHERE id = $1`, [id]);
    if (!row) throw new NotFoundException('文件不存在');
    await this.access.clanAccess(user, row.clan_id, 'admin');
    return row;
  }

  async update(user: AuthUser, id: string, dto: GalleryUpdateDto) {
    const before = await this.loadMedia(user, id);
    const [row] = returningRows(await this.ds.query(
      `UPDATE media SET caption = CASE WHEN $2 THEN $3 ELSE caption END,
                        taken_text = CASE WHEN $4 THEN $5 ELSE taken_text END,
                        description = CASE WHEN $6 THEN $7 ELSE description END,
                        sort_order = COALESCE($8, sort_order)
        WHERE id = $1 RETURNING *`,
      [id, dto.caption !== undefined, dto.caption ?? null, dto.takenText !== undefined, dto.takenText ?? null, dto.description !== undefined, dto.description ?? null, dto.sortOrder ?? null],
    ));
    await this.audit.log({
      clanId: row.clan_id,
      userId: user.id,
      entity: 'media',
      entityId: id,
      action: 'update',
      before: { caption: before.caption, takenText: before.taken_text, description: before.description },
      after: { caption: row.caption, takenText: row.taken_text, description: row.description },
    });
    return toGalleryMedia(row, this.storage);
  }

  async remove(user: AuthUser, id: string) {
    const row = await this.loadMedia(user, id);
    await this.ds.transaction(async (em) => {
      await em.query(`DELETE FROM media WHERE id = $1`, [id]);
      await em.query(`UPDATE person SET avatar_media_id = NULL WHERE avatar_media_id = $1`, [id]);
      await this.audit.log({ clanId: row.clan_id, userId: user.id, entity: 'media', entityId: id, action: 'delete', before: { caption: row.caption, type: row.type, storageKey: row.storage_key } }, em);
    });
    await this.removeFiles(row);
  }

  async streamThumb(id: string, exp: number, sig: string, res: Response) {
    if (!isUuid(id) || !this.storage.verify(thumbScope(id), exp, sig)) throw new ForbiddenException('链接无效或已过期');
    const [row] = await this.ds.query(`SELECT thumbnail_key FROM media WHERE id = $1`, [id]);
    if (!row?.thumbnail_key) throw new NotFoundException('缩略图不存在');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const s = await this.storage.driver.read(row.thumbnail_key);
    s.on('error', () => res.status(404).end());
    s.pipe(res);
  }

  // ---------- 口述历史 ----------
  private async toOral(o: OralHistoryEntity, mediaRows?: Map<string, any>): Promise<OralHistory> {
    let audio: GalleryMedia | null = null;
    if (o.mediaId) {
      const row = mediaRows?.get(o.mediaId) ?? (await this.ds.query(`SELECT * FROM media WHERE id = $1`, [o.mediaId]))[0];
      if (row) audio = await toGalleryMedia(row, this.storage);
    }
    return {
      id: o.id,
      clanId: o.clanId,
      personId: o.personId,
      title: o.title,
      narrator: o.narrator,
      recordedText: o.recordedText,
      transcript: o.transcript,
      audio,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  }

  private async mediaMap(ids: (string | null)[]) {
    const list = ids.filter((x): x is string => !!x);
    if (!list.length) return new Map<string, any>();
    const rows = await this.ds.query(`SELECT * FROM media WHERE id = ANY($1::uuid[])`, [list]);
    return new Map<string, any>(rows.map((r: any) => [r.id, r]));
  }

  async createOral(user: AuthUser, personId: string, file: Express.Multer.File | undefined, body: Record<string, unknown>) {
    const { person, clan } = await this.access.personAccess(user, personId, 'admin');
    const title = optStr(body.title, 100);
    if (!title) throw new BadRequestException('请填写标题');
    const transcript = optStr(body.transcript, 50000);
    if (!file && !transcript) throw new BadRequestException('请录音/上传音频，或填写文字整理稿');
    let mediaRow: any = null;
    const saved = await this.ds.transaction(async (em) => {
      if (file) {
        mediaRow = await this.storeFile(em, {
          clanId: clan.id,
          personId: person.id,
          userId: user.id,
          file,
          category: 'oral_history',
          body: { ...body, caption: title, takenText: body.recordedText },
        });
      }
      const repo = em.getRepository(OralHistoryEntity);
      const o = await repo.save(
        repo.create({
          clanId: clan.id,
          personId: person.id,
          mediaId: mediaRow?.id ?? null,
          title,
          narrator: optStr(body.narrator, 60),
          recordedText: optStr(body.recordedText, 60),
          transcript,
          createdBy: user.id,
        }),
      );
      await this.audit.log({ clanId: clan.id, userId: user.id, entity: 'oral_history', entityId: o.id, action: 'create', after: o }, em);
      return o;
    }).catch(async (e) => {
      if (mediaRow) await this.removeFiles(mediaRow);
      throw e;
    });
    return this.toOral(saved);
  }

  async oralOfPerson(user: AuthUser | null, personId: string): Promise<OralHistory[]> {
    const { person, role } = await this.access.personAccess(user, personId);
    if (!canSeeSensitive(person, role)) return [];
    const list = await this.ds.getRepository(OralHistoryEntity).find({ where: { personId }, order: { createdAt: 'DESC' } });
    const map = await this.mediaMap(list.map((o) => o.mediaId));
    return Promise.all(list.map((o) => this.toOral(o, map)));
  }

  async oralOfClan(user: AuthUser | null, clanId: string, q: GalleryQuery): Promise<Paged<ClanOralHistory>> {
    const { role } = await this.access.clanAccess(user, clanId);
    const pageSize = Math.min(q.pageSize ?? 20, 100);
    const page = q.page ?? 1;
    const params: unknown[] = [clanId];
    let where = `o.clan_id = $1 AND ${sensitiveSql(role)}`;
    if (q.q?.trim()) {
      params.push(`%${q.q.trim()}%`);
      where += ` AND (o.title ILIKE $2 OR o.narrator ILIKE $2 OR o.transcript ILIKE $2 OR p.full_name ILIKE $2)`;
    }
    const [{ total }] = await this.ds.query(`SELECT count(*)::int AS total FROM oral_history o JOIN person p ON p.id = o.person_id WHERE ${where}`, params);
    const rows = await this.ds.query(
      `SELECT o.id, ${PERSON_BRIEF_COLS()} FROM oral_history o JOIN person p ON p.id = o.person_id
        WHERE ${where} ORDER BY o.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );
    const ents = rows.length ? await this.ds.getRepository(OralHistoryEntity).findByIds(rows.map((r: any) => r.id)) : [];
    const byId = new Map(ents.map((e) => [e.id, e]));
    const map = await this.mediaMap(ents.map((o) => o.mediaId));
    const items = await Promise.all(
      rows.map(async (r: any) => ({ ...(await this.toOral(byId.get(r.id)!, map)), person: briefFromPrefixed(r, role) })),
    );
    return { total, page, pageSize, items };
  }

  private async loadOral(user: AuthUser, id: string) {
    if (!isUuid(id)) throw new NotFoundException('口述历史不存在');
    const o = await this.ds.getRepository(OralHistoryEntity).findOne({ where: { id } });
    if (!o) throw new NotFoundException('口述历史不存在');
    await this.access.clanAccess(user, o.clanId, 'admin');
    return o;
  }

  async updateOral(user: AuthUser, id: string, dto: OralHistoryUpdateDto) {
    const o = await this.loadOral(user, id);
    const before = { ...o };
    if (dto.title !== undefined) {
      if (!dto.title.trim()) throw new BadRequestException('标题不能为空');
      o.title = dto.title.trim();
    }
    if (dto.narrator !== undefined) o.narrator = dto.narrator;
    if (dto.recordedText !== undefined) o.recordedText = dto.recordedText;
    if (dto.transcript !== undefined) o.transcript = dto.transcript;
    const saved = await this.ds.getRepository(OralHistoryEntity).save(o);
    await this.audit.log({ clanId: o.clanId, userId: user.id, entity: 'oral_history', entityId: id, action: 'update', before, after: saved });
    return this.toOral(saved);
  }

  async removeOral(user: AuthUser, id: string) {
    const o = await this.loadOral(user, id);
    const [mediaRow] = o.mediaId ? await this.ds.query(`SELECT * FROM media WHERE id = $1`, [o.mediaId]) : [];
    await this.ds.transaction(async (em) => {
      await em.getRepository(OralHistoryEntity).delete(id);
      if (mediaRow) await em.query(`DELETE FROM media WHERE id = $1`, [mediaRow.id]);
      await this.audit.log({ clanId: o.clanId, userId: user.id, entity: 'oral_history', entityId: id, action: 'delete', before: o }, em);
    });
    if (mediaRow) await this.removeFiles(mediaRow);
  }
}

@Controller()
export class GalleryController {
  constructor(private readonly svc: GalleryService) {}

  @Post('persons/:id/gallery')
  @LoginRequired()
  @UseInterceptors(FileInterceptor('file', uploadOpts))
  upload(@CurrentUser() u: AuthUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Body() body: Record<string, unknown>) {
    return this.svc.upload(u, id, file, body);
  }

  @Get('persons/:id/gallery')
  ofPerson(@CurrentUser() u: AuthUser | null, @Param('id') id: string, @Query() q: GalleryQuery) {
    return this.svc.ofPerson(u, id, q.type);
  }

  @Get('clans/:clanId/gallery')
  ofClan(@CurrentUser() u: AuthUser | null, @Param('clanId') clanId: string, @Query() q: GalleryQuery) {
    return this.svc.ofClan(u, clanId, q);
  }

  @Patch('gallery/:id')
  @LoginRequired()
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: GalleryUpdateDto) {
    return this.svc.update(u, id, dto);
  }

  @Delete('gallery/:id')
  @LoginRequired()
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u, id);
  }

  @Get('gallery/:id/thumb')
  thumb(@Param('id') id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    return this.svc.streamThumb(id, Number(exp), sig, res);
  }

  @Post('persons/:id/oral-histories')
  @LoginRequired()
  @UseInterceptors(FileInterceptor('file', uploadOpts))
  createOral(@CurrentUser() u: AuthUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() body: Record<string, unknown>) {
    return this.svc.createOral(u, id, file, body);
  }

  @Get('persons/:id/oral-histories')
  oralOfPerson(@CurrentUser() u: AuthUser | null, @Param('id') id: string) {
    return this.svc.oralOfPerson(u, id);
  }

  @Get('clans/:clanId/oral-histories')
  oralOfClan(@CurrentUser() u: AuthUser | null, @Param('clanId') clanId: string, @Query() q: GalleryQuery) {
    return this.svc.oralOfClan(u, clanId, q);
  }

  @Patch('oral-histories/:id')
  @LoginRequired()
  updateOral(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: OralHistoryUpdateDto) {
    return this.svc.updateOral(u, id, dto);
  }

  @Delete('oral-histories/:id')
  @LoginRequired()
  removeOral(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.removeOral(u, id);
  }
}
