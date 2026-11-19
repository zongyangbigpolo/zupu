import { Controller, Get, Injectable, Module, Param } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ImportDraft } from '@zupu/shared';
import { AccessService } from '../../common/access.service';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { ImportDraftEntity } from '../../entities/m5';

/**
 * AI 纸质谱识别导入草稿（M5 仅预留）：
 * 未来流程为 POST /ai/clans/:clanId/ocr-import 上传照片 → 生成 import_draft（status: processing → ready）
 * → 管理员在此列表核对后入谱。目前 OCR 接口返回 501"敬请期待"，列表恒为空。
 */
@Injectable()
export class ImportDraftsService {
  constructor(
    private readonly access: AccessService,
    @InjectRepository(ImportDraftEntity) private readonly drafts: Repository<ImportDraftEntity>,
  ) {}

  async list(user: AuthUser, clanId: string): Promise<ImportDraft[]> {
    await this.access.clanAccess(user, clanId, 'admin');
    const rows = await this.drafts.find({ where: { clanId }, order: { createdAt: 'DESC' }, take: 50 });
    return rows.map((d) => ({
      id: d.id,
      clanId: d.clanId,
      source: d.source,
      status: d.status,
      error: d.error,
      createdAt: d.createdAt.toISOString(),
    }));
  }
}

@Controller()
@LoginRequired()
export class ImportDraftsController {
  constructor(private readonly svc: ImportDraftsService) {}

  @Get('clans/:clanId/import-drafts')
  list(@CurrentUser() user: AuthUser, @Param('clanId') clanId: string) {
    return this.svc.list(user, clanId);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([ImportDraftEntity])],
  controllers: [ImportDraftsController],
  providers: [ImportDraftsService],
})
export class ImportDraftsModule {}
