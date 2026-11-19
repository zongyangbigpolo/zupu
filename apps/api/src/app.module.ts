import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from './common/auth';
import { CoreModule } from './common/core.module';
import { config } from './config';
import { dataSourceOptions } from './database/data-source';
import { AiModule } from './modules/ai/ai';
import { AuthModule } from './modules/auth/auth.module';
import { ClansModule } from './modules/clans/clans.module';
import { HeritageModule } from './modules/heritage/heritage.module';
import { KinshipModule } from './modules/kinship/kinship';
import { MediaModule } from './modules/media/media';
import { PersonsModule } from './modules/persons/persons.module';
import { RelationsModule } from './modules/relations/relations';
import { SuperAdminModule } from './modules/super-admin/super-admin';
import { ClanLinksModule } from './modules/clan-links/clan-links.module';
import { GedcomModule } from './modules/gedcom/gedcom.module';
import { ImportDraftsModule } from './modules/import-drafts/import-drafts';

/**
 * 模块清单。后续里程碑（M2 内容与传承、M3 可视化、M4 小程序与互动、M5 扩展）
 * 请在 src/modules/<feature>/ 新建模块并在此注册；权限统一走 AccessService，写操作统一写 AuditService。
 */
@Module({
  imports: [
    TypeOrmModule.forRoot({ ...dataSourceOptions(), migrationsRun: true }),
    JwtModule.register({ global: true, secret: config.jwtSecret, signOptions: { expiresIn: config.jwtExpiresIn as any } }),
    CoreModule,
    AuthModule,
    ClansModule,
    PersonsModule,
    RelationsModule,
    KinshipModule,
    MediaModule,
    SuperAdminModule,
    AiModule,
    // M5 扩展
    ClanLinksModule,
    GedcomModule,
    ImportDraftsModule,
    // M2 内容与传承
    HeritageModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
