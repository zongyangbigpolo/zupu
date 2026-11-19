import { Controller, Get, Module, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { GEDCOM_MAX_BYTES, GedcomService } from './gedcom.service';

const upload = FileInterceptor('file', { limits: { fileSize: GEDCOM_MAX_BYTES } });

/**
 * GEDCOM 5.5.1 导入导出（M5，仅家族管理员）：
 * - GET  /clans/:clanId/gedcom?rootId=    导出全族或某人的支系（UTF-8）
 * - POST /clans/:clanId/gedcom/preview    上传文件预览与校验（不写库）
 * - POST /clans/:clanId/gedcom/import     上传同一文件确认导入
 */
@Controller('clans/:clanId/gedcom')
@LoginRequired()
export class GedcomController {
  constructor(private readonly svc: GedcomService) {}

  @Get()
  async export(@CurrentUser() user: AuthUser, @Param('clanId') clanId: string, @Query('rootId') rootId: string | undefined, @Res() res: Response) {
    const { text, filename } = await this.svc.export(user, clanId, rootId || null);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="family.ged"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(text);
  }

  @Post('preview')
  @UseInterceptors(upload)
  preview(@CurrentUser() user: AuthUser, @Param('clanId') clanId: string, @UploadedFile() file: Express.Multer.File) {
    return this.svc.preview(user, clanId, file?.buffer);
  }

  @Post('import')
  @UseInterceptors(upload)
  import(@CurrentUser() user: AuthUser, @Param('clanId') clanId: string, @UploadedFile() file: Express.Multer.File) {
    return this.svc.import(user, clanId, file?.buffer);
  }
}

@Module({ controllers: [GedcomController], providers: [GedcomService] })
export class GedcomModule {}
