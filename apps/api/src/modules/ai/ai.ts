import { Controller, HttpException, HttpStatus, Module, Param, Post } from '@nestjs/common';
import { LoginRequired } from '../../common/auth';

const COMING_SOON = { message: 'AI 功能敬请期待：将在后续版本（M5）提供', code: 'AI_NOT_IMPLEMENTED' };

/**
 * AI 预留位（M5 实现）：
 * - POST /ai/clans/:clanId/ocr-import    纸质谱拍照 → OCR → 结构化 → 导入草稿（ImportDraft 表届时新增迁移）
 * - POST /ai/persons/:id/biography       AI 生成人物小传，写入 person.biography_ai_draft 供管理员审阅
 */
@Controller('ai')
@LoginRequired()
export class AiController {
  @Post('clans/:clanId/ocr-import')
  ocrImport(@Param('clanId') _clanId: string) {
    throw new HttpException(COMING_SOON, HttpStatus.NOT_IMPLEMENTED);
  }

  @Post('persons/:id/biography')
  biography(@Param('id') _id: string) {
    throw new HttpException(COMING_SOON, HttpStatus.NOT_IMPLEMENTED);
  }
}

@Module({ controllers: [AiController] })
export class AiModule {}
