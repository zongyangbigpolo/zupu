import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';

/** 对象存储抽象：本地磁盘（开发）/ S3 兼容（腾讯云 COS、阿里云 OSS、MinIO） */
export interface StorageDriver {
  put(key: string, body: Buffer, mimeType: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** 返回可直接访问的地址；本地驱动返回 null，由 API 签名路由提供 */
  presign(key: string, expiresSec: number): Promise<string | null>;
  read(key: string): Promise<Readable>;
}

class LocalDriver implements StorageDriver {
  private root = resolve(config.uploadDir);
  private path(key: string) {
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root)) throw new Error('非法路径');
    return p;
  }
  async put(key: string, body: Buffer) {
    const p = this.path(key);
    await fs.mkdir(dirname(p), { recursive: true });
    await fs.writeFile(p, body);
  }
  async remove(key: string) {
    await fs.rm(this.path(key), { force: true });
  }
  async presign() {
    return null;
  }
  async read(key: string) {
    return createReadStream(this.path(key));
  }
}

const s3Client = (endpoint: string | undefined) =>
  new S3Client({
    endpoint,
    region: config.s3.region,
    forcePathStyle: config.s3.forcePathStyle,
    credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey },
  });

class S3Driver implements StorageDriver {
  private client = s3Client(config.s3.endpoint);
  private publicClient = config.s3.publicEndpoint ? s3Client(config.s3.publicEndpoint) : null;
  private ready: Promise<void> | null = null;
  private ensureBucket() {
    if (!config.s3.autoCreateBucket) return Promise.resolve();
    this.ready ??= this.client
      .send(new HeadBucketCommand({ Bucket: config.s3.bucket }))
      .then(() => undefined)
      .catch(() => this.client.send(new CreateBucketCommand({ Bucket: config.s3.bucket })).then(() => undefined))
      .catch((e) => {
        this.ready = null;
        throw e;
      });
    return this.ready;
  }
  async put(key: string, body: Buffer, mimeType: string) {
    await this.ensureBucket();
    await this.client.send(new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, Body: body, ContentType: mimeType }));
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key }));
  }
  async presign(key: string, expiresSec: number) {
    if (!this.publicClient) return null;
    return getSignedUrl(this.publicClient, new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }), { expiresIn: expiresSec });
  }
  async read(key: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }));
    return r.Body as Readable;
  }
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  readonly driver: StorageDriver = config.storageDriver === 's3' ? new S3Driver() : new LocalDriver();

  constructor() {
    this.logger.log(`对象存储驱动：${config.storageDriver}`);
  }

  /** 媒体访问地址（签名 URL，默认 2 小时有效） */
  async mediaUrl(mediaId: string, key: string, expiresSec = 7200): Promise<string> {
    const direct = await this.driver.presign(key, expiresSec);
    if (direct) return direct;
    const exp = Math.floor(Date.now() / 1000) + expiresSec;
    return `/api/media/${mediaId}/file?exp=${exp}&sig=${this.sign(mediaId, exp)}`;
  }

  verify(mediaId: string, exp: number, sig: string): boolean {
    if (!exp || exp < Date.now() / 1000 || !sig) return false;
    const a = Buffer.from(this.sign(mediaId, exp));
    const b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private sign(mediaId: string, exp: number) {
    return createHmac('sha256', config.jwtSecret).update(`${mediaId}.${exp}`).digest('hex').slice(0, 32);
  }
}
