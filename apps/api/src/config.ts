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
};
