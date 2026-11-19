import { config } from '../../config';

/** M2 配置（独立于 M1 的 config.ts，便于合并） */
export const heritageConfig = {
  backup: {
    /** 每日自动备份；测试环境默认关闭 */
    enabled: (process.env.BACKUP_ENABLED ?? (process.env.NODE_ENV === 'test' ? 'false' : 'true')) === 'true',
    /** 每日执行时间（服务器本地时间，HH:mm） */
    dailyAt: process.env.BACKUP_DAILY_AT ?? '03:00',
    /** 保留天数（超期的备份文件会被清理） */
    keepDays: Number(process.env.BACKUP_KEEP_DAYS ?? 14),
    /** auto：优先 pg_dump，不可用时导出 JSON；也可强制 pg_dump / json */
    method: (process.env.BACKUP_METHOD ?? 'auto') as 'auto' | 'pg_dump' | 'json',
    pgDumpPath: process.env.PG_DUMP_PATH ?? 'pg_dump',
    databaseUrl: config.databaseUrl,
  },
  media: {
    /** 可选：配置 ffmpeg 路径后为视频生成封面（转码暂未实现，预留） */
    ffmpegPath: process.env.FFMPEG_PATH ?? '',
    thumbSize: Number(process.env.THUMB_SIZE ?? 400),
  },
  import: {
    maxRows: Number(process.env.IMPORT_MAX_ROWS ?? 5000),
    maxFileMb: Number(process.env.IMPORT_MAX_FILE_MB ?? 10),
  },
};
