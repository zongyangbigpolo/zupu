import { ConflictException, Controller, Get, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Param, Post, Res } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import type { BackupJob, BackupSettings } from '@zupu/shared';
import { isUuid } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, SuperAdminOnly } from '../../common/auth';
import { StorageService } from '../../common/storage.service';
import { BackupJobEntity } from '../../entities';
import { contentDisposition } from './heritage-common';
import { heritageConfig } from './heritage.config';

/** 防止多实例同时备份 */
const LOCK_KEY = 7_320_260_001;

export function nextRunAt(dailyAt: string, now = new Date()): Date {
  const [h, m] = dailyAt.split(':').map((x) => Number(x) || 0);
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

function toJob(j: BackupJobEntity): BackupJob {
  return {
    id: j.id,
    trigger: j.trigger,
    status: j.status,
    method: j.method,
    size: j.size,
    error: j.error,
    startedAt: j.startedAt.toISOString(),
    finishedAt: j.finishedAt?.toISOString() ?? null,
  };
}

/** 数据库每日自动备份（pg_dump 优先，不可用时导出 JSON），备份文件存入对象存储 backups/ 目录 */
@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupService.name);
  private timer: NodeJS.Timeout | null = null;
  private next: Date | null = null;
  private running = false;

  constructor(
    private readonly ds: DataSource,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    if (heritageConfig.backup.enabled) this.schedule();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule() {
    this.next = nextRunAt(heritageConfig.backup.dailyAt);
    const delay = Math.min(this.next.getTime() - Date.now(), 2 ** 31 - 1);
    this.timer = setTimeout(() => {
      this.run('scheduled', null)
        .catch((e) => this.logger.error(`自动备份失败：${e.message}`))
        .finally(() => this.schedule());
    }, delay);
    this.timer.unref?.();
    this.logger.log(`每日备份已启用，下次执行：${this.next.toLocaleString('zh-CN')}`);
  }

  settings(): BackupSettings {
    const b = heritageConfig.backup;
    return { enabled: b.enabled, dailyAt: b.dailyAt, keepDays: b.keepDays, method: b.method, nextRunAt: this.next?.toISOString() ?? null };
  }

  async list() {
    const items = await this.ds.getRepository(BackupJobEntity).find({ order: { startedAt: 'DESC' }, take: 50 });
    return { settings: this.settings(), items: items.map(toJob) };
  }

  private pgDump(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const p = spawn(heritageConfig.backup.pgDumpPath, ['--format=custom', '--no-owner', '--no-privileges', `--dbname=${heritageConfig.backup.databaseUrl}`]);
      const out: Buffer[] = [];
      let err = '';
      p.stdout.on('data', (c) => out.push(c));
      p.stderr.on('data', (c) => (err += c));
      p.on('error', reject);
      p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(err.trim() || `pg_dump 退出码 ${code}`))));
    });
  }

  /** 无 pg_dump 时的兜底：逐表导出为 JSON 并 gzip（一致性快照） */
  private async jsonDump(): Promise<Buffer> {
    const data = await this.ds.transaction('REPEATABLE READ', async (em) => {
      const tables: { table_name: string }[] = await em.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
      );
      const out: Record<string, unknown[]> = {};
      for (const { table_name } of tables) out[table_name] = await em.query(`SELECT * FROM "${table_name.replace(/"/g, '')}"`);
      return out;
    });
    return gzipSync(Buffer.from(JSON.stringify({ format: 'zupu-backup', version: 1, createdAt: new Date().toISOString(), tables: data })));
  }

  async run(trigger: 'scheduled' | 'manual', user: AuthUser | null): Promise<BackupJob> {
    if (this.running) throw new ConflictException('已有备份正在进行');
    this.running = true;
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    const repo = this.ds.getRepository(BackupJobEntity);
    let job: BackupJobEntity | null = null;
    try {
      const [{ ok }] = await qr.query(`SELECT pg_try_advisory_lock($1) AS ok`, [LOCK_KEY]);
      if (!ok) throw new ConflictException('其他实例正在备份');
      job = await repo.save(repo.create({ trigger, status: 'running', createdBy: user?.id ?? null }));
      const method = heritageConfig.backup.method;
      let buf: Buffer;
      let used: 'pg_dump' | 'json';
      if (method === 'json') {
        buf = await this.jsonDump();
        used = 'json';
      } else {
        try {
          buf = await this.pgDump();
          used = 'pg_dump';
        } catch (e) {
          if (method === 'pg_dump') throw e;
          this.logger.warn(`pg_dump 不可用，改用 JSON 备份：${(e as Error).message}`);
          buf = await this.jsonDump();
          used = 'json';
        }
      }
      const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      const key = `backups/zupu-${ts}-${job.id.slice(0, 8)}.${used === 'pg_dump' ? 'dump' : 'json.gz'}`;
      await this.storage.driver.put(key, buf, used === 'pg_dump' ? 'application/octet-stream' : 'application/gzip');
      Object.assign(job, { status: 'success', method: used, storageKey: key, size: buf.length, finishedAt: new Date() });
      await repo.save(job);
      if (user) await this.audit.log({ clanId: null, userId: user.id, entity: 'backup_job', entityId: job.id, action: 'backup', after: { method: used, size: buf.length } });
      await this.prune();
      this.logger.log(`备份完成：${key}（${(buf.length / 1024).toFixed(1)} KB）`);
      return toJob(job);
    } catch (e) {
      if (job) {
        Object.assign(job, { status: 'failed', error: (e as Error).message.slice(0, 2000), finishedAt: new Date() });
        await repo.save(job);
        return toJob(job);
      }
      throw e;
    } finally {
      await qr.query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY]).catch(() => undefined);
      await qr.release();
      this.running = false;
    }
  }

  /** 清理超过保留天数的备份文件 */
  private async prune() {
    const days = heritageConfig.backup.keepDays;
    if (!(days > 0)) return;
    const old: BackupJobEntity[] = await this.ds.query(
      `SELECT id, storage_key AS "storageKey" FROM backup_job WHERE started_at < now() - ($1 || ' days')::interval`,
      [String(days)],
    );
    for (const j of old) {
      if (j.storageKey) await this.storage.driver.remove(j.storageKey).catch(() => undefined);
      await this.ds.query(`DELETE FROM backup_job WHERE id = $1`, [j.id]);
    }
  }

  async download(user: AuthUser, id: string, res: Response) {
    if (!isUuid(id)) throw new NotFoundException('备份不存在');
    const job = await this.ds.getRepository(BackupJobEntity).findOne({ where: { id } });
    if (!job?.storageKey || job.status !== 'success') throw new NotFoundException('备份不存在');
    await this.audit.log({ clanId: null, userId: user.id, entity: 'backup_job', entityId: id, action: 'download' });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', contentDisposition(job.storageKey.split('/').pop()!));
    const s = await this.storage.driver.read(job.storageKey);
    s.on('error', () => res.status(404).end());
    s.pipe(res);
  }
}

@Controller('admin/backups')
@SuperAdminOnly()
export class BackupController {
  constructor(private readonly svc: BackupService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Post()
  run(@CurrentUser() u: AuthUser) {
    return this.svc.run('manual', u);
  }

  @Get(':id/download')
  download(@CurrentUser() u: AuthUser, @Param('id') id: string, @Res() res: Response) {
    return this.svc.download(u, id, res);
  }
}
