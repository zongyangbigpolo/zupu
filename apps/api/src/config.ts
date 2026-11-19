export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://localhost:5432/zupu',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  /** local | s3（S3 兼容：腾讯云 COS / 阿里云 OSS / MinIO） */
  storageDriver: process.env.STORAGE_DRIVER ?? 'local',
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    /** 浏览器可访问的地址（COS/OSS 可填同 endpoint 或 CDN）；留空则由 API 代理读取 */
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT || '',
    region: process.env.S3_REGION ?? 'ap-guangzhou',
    bucket: process.env.S3_BUCKET ?? 'zupu',
    accessKeyId: process.env.S3_ACCESS_KEY ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    /** 开发环境（MinIO）启动时自动建桶 */
    autoCreateBucket: process.env.S3_AUTO_CREATE_BUCKET === 'true',
  },
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 100),
  webDist: process.env.WEB_DIST,
  /** M4 微信小程序：AppID/AppSecret 在微信公众平台「开发管理 → 开发设置」获取 */
  wechat: {
    appId: process.env.WECHAT_APPID ?? '',
    secret: process.env.WECHAT_SECRET ?? '',
    /** 模拟微信接口（开发/测试）。生产环境必须配置真实 AppID，不会自动启用模拟 */
    mock: process.env.WECHAT_MOCK === 'true' || (process.env.NODE_ENV !== 'production' && !process.env.WECHAT_APPID),
    /** 订阅消息模板 ID（公众平台「订阅消息」中选用） */
    tplReminder: process.env.WECHAT_TPL_REMINDER ?? '',
    tplActivity: process.env.WECHAT_TPL_ACTIVITY ?? '',
    /** 小程序版本：developer / trial / formal */
    miniprogramState: process.env.WECHAT_MP_STATE ?? 'formal',
  },
  /** 每日提醒任务：北京时间几点执行；off 关闭 */
  reminderHour: Number(process.env.REMINDER_HOUR ?? 8),
  reminderScheduler: process.env.REMINDER_SCHEDULER ?? (process.env.NODE_ENV === 'test' ? 'off' : 'on'),
};
