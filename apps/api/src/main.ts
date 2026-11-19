import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { config } from './config';

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  app.enableCors();
  // 生产环境可由 API 直接托管 Web 静态文件（Docker 中由 Nginx 托管）
  if (config.webDist && existsSync(config.webDist)) {
    app.useStaticAssets(config.webDist);
    const index = join(config.webDist, 'index.html');
    app.use((req: any, res: any, next: any) =>
      req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(index) : next(),
    );
  }
  await app.listen(config.port);
  console.log(`族谱 API 已启动：http://localhost:${config.port}/api`);
}
main();
