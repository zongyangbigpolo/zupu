import { Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EffectiveRole, GalleryMedia, MediaType, PersonBrief } from '@zupu/shared';
import { rowToPerson, toBrief } from '../../common/mappers';
import type { StorageService } from '../../common/storage.service';
import { heritageConfig } from './heritage.config';

const logger = new Logger('HeritageMedia');

export const ALLOWED_MIME =
  /^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|aac|wav|x-wav|webm|ogg|x-m4a)|application\/pdf)$/;

/** 浏览器录音的 MIME 可能带参数（audio/webm;codecs=opus） */
export const baseMime = (m: string) => (m || '').split(';')[0].trim().toLowerCase();

export function mediaTypeOf(mime: string): MediaType {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'doc';
}

export const isAdminRole = (r: EffectiveRole) => r === 'admin' || r === 'super';
export const isMemberRole = (r: EffectiveRole) => r !== 'visitor';

/** 与 canSeeSensitive() 等价的 SQL 条件，用于列表查询中过滤敏感数据（生平、照片、出生信息） */
export function sensitiveSql(role: EffectiveRole, a = 'p'): string {
  if (isAdminRole(role)) return 'true';
  if (role === 'member') return `(${a}.privacy_level <> 'admins')`;
  return `(NOT ${a}.is_living AND ${a}.privacy_level = 'public')`;
}

/** 把 p.* 前缀为 person_ 的原生行转为 PersonBrief */
export function briefFromPrefixed(r: Record<string, any>, role: EffectiveRole, prefix = 'p_'): PersonBrief {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (k.startsWith(prefix)) o[k.slice(prefix.length)] = v;
  return toBrief(rowToPerson(o), role);
}

export const PERSON_BRIEF_COLS = (a = 'p', prefix = 'p_') =>
  ['id', 'surname', 'given_name', 'full_name', 'gender', 'generation', 'generation_char', 'rank_in_siblings', 'is_living', 'is_external', 'birth_text', 'death_text', 'privacy_level']
    .map((c) => `${a}.${c} AS ${prefix}${c}`)
    .join(', ');

/** 缩略图签名：复用 StorageService 的签名算法，作用域加前缀以区别于原文件 */
export const thumbScope = (id: string) => `thumb:${id}`;

async function thumbUrl(storage: StorageService, id: string, key: string): Promise<string> {
  const u = await storage.mediaUrl(thumbScope(id), key);
  if (!u.startsWith('/api/media/')) return u; // S3/COS 直链
  const q = u.slice(u.indexOf('?'));
  return `/api/gallery/${id}/thumb${q}`;
}

/** media 原生行（含 M2 新增列）→ GalleryMedia */
export async function toGalleryMedia(r: Record<string, any>, storage: StorageService): Promise<GalleryMedia> {
  return {
    id: r.id,
    clanId: r.clan_id,
    personId: r.person_id,
    type: r.type,
    mimeType: r.mime_type,
    size: r.size == null ? null : Number(r.size),
    caption: r.caption,
    duration: r.duration,
    url: await storage.mediaUrl(r.id, r.storage_key),
    createdAt: new Date(r.created_at).toISOString(),
    category: r.category,
    thumbnailUrl: r.thumbnail_key ? await thumbUrl(storage, r.id, r.thumbnail_key) : null,
    width: r.width,
    height: r.height,
    takenText: r.taken_text,
    description: r.description,
    sortOrder: r.sort_order ?? 0,
    transcodeStatus: r.transcode_status ?? 'none',
  };
}

type SharpFn = (input: Buffer) => any;
let sharpLoaded: SharpFn | null | undefined;
function loadSharp(): SharpFn | null {
  if (sharpLoaded === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      sharpLoaded = require('sharp') as SharpFn;
    } catch {
      logger.warn('未安装 sharp，照片将不生成缩略图');
      sharpLoaded = null;
    }
  }
  return sharpLoaded;
}

export interface ProcessedMedia {
  width: number | null;
  height: number | null;
  thumbnail: Buffer | null;
  transcodeStatus: 'none' | 'skipped' | 'done' | 'failed';
}

/**
 * 媒体处理：照片读取尺寸并生成缩略图（sharp）；视频在配置 FFMPEG_PATH 时截取封面。
 * 音视频转码为预留能力（transcode_status = skipped），浏览器直接播放原文件。
 */
export async function processMedia(type: MediaType, buf: Buffer): Promise<ProcessedMedia> {
  const size = heritageConfig.media.thumbSize;
  if (type === 'photo') {
    const sharp = loadSharp();
    if (!sharp) return { width: null, height: null, thumbnail: null, transcodeStatus: 'none' };
    try {
      const meta = await sharp(buf).metadata();
      const rotated = (meta.orientation ?? 1) >= 5;
      const thumbnail: Buffer = await sharp(buf)
        .rotate()
        .resize(size, size, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      return {
        width: (rotated ? meta.height : meta.width) ?? null,
        height: (rotated ? meta.width : meta.height) ?? null,
        thumbnail,
        transcodeStatus: 'none',
      };
    } catch (e) {
      logger.warn(`缩略图生成失败：${(e as Error).message}`);
      return { width: null, height: null, thumbnail: null, transcodeStatus: 'none' };
    }
  }
  if (type === 'video' && heritageConfig.media.ffmpegPath) {
    const dir = await fs.mkdtemp(join(tmpdir(), 'zupu-'));
    const src = join(dir, randomUUID());
    const out = join(dir, 'poster.jpg');
    try {
      await fs.writeFile(src, buf);
      await new Promise<void>((resolve, reject) =>
        execFile(
          heritageConfig.media.ffmpegPath,
          ['-y', '-ss', '1', '-i', src, '-frames:v', '1', '-vf', `scale=${size}:-2`, out],
          { timeout: 30000 },
          (err) => (err ? reject(err) : resolve()),
        ),
      );
      return { width: null, height: null, thumbnail: await fs.readFile(out), transcodeStatus: 'skipped' };
    } catch (e) {
      logger.warn(`视频封面生成失败：${(e as Error).message}`);
      return { width: null, height: null, thumbnail: null, transcodeStatus: 'failed' };
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  return { width: null, height: null, thumbnail: null, transcodeStatus: type === 'doc' ? 'none' : 'skipped' };
}

export const toIntOrNull = (v: unknown, max = 1_000_000): number | null => {
  if (v == null || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

export const optStr = (v: unknown, max: number): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

/** multer 把 UTF-8 文件名按 latin1 解码，这里还原 */
export const originalName = (f: Express.Multer.File) => Buffer.from(f.originalname, 'latin1').toString('utf8');

export function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** TypeORM 对 UPDATE/DELETE … RETURNING 返回 [rows, affected]，对 INSERT/SELECT 返回 rows */
export function returningRows<T = any>(res: unknown): T[] {
  const a = res as unknown[];
  return Array.isArray(a) && a.length === 2 && Array.isArray(a[0]) && typeof a[1] === 'number' ? (a[0] as T[]) : (a as T[]);
}
