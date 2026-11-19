import { Module } from '@nestjs/common';
import { BackupController, BackupService } from './backup';
import { DocumentsController, DocumentsService } from './documents';
import { GalleryController, GalleryService } from './gallery';
import { ImportExportController, ImportExportService } from './import-export';
import { MemorialController, MemorialService } from './memorial';
import { StatsController, StatsService } from './stats';

/**
 * M2 内容与传承：相册与口述历史、人物纪念馆、家族文献、统计看板与高级搜索、Excel 导入导出、数据库备份。
 * 权限统一走 AccessService（按 clan_id 隔离），管理员写操作写 AuditService。
 */
@Module({
  controllers: [GalleryController, MemorialController, DocumentsController, StatsController, ImportExportController, BackupController],
  providers: [GalleryService, MemorialService, DocumentsService, StatsService, ImportExportService, BackupService],
})
export class HeritageModule {}
