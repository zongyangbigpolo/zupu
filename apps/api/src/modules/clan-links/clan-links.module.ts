import { Body, Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, LoginRequired, SuperAdminOnly } from '../../common/auth';
import { ClanLinkEntity } from '../../entities/m5';
import { ClanLinksService } from './clan-links.service';
import { CrossClanKinshipAdapter } from './cross-clan-kinship.adapter';

class ProposeDto {
  @IsUUID() targetClanId: string;
  @IsUUID() personId: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}

class ApproveDto {
  @IsUUID() personId: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}

class NoteDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}

/**
 * 跨家族连谱（M5）：
 * - 本族管理员选本族人物向对方家族发起 → 对方管理员（或超级管理员）选定对方的同一人物后同意
 * - 生效后双方族人可查看共同祖先链、跨族查询亲属关系；对方家族只暴露连谱支系，在世者隐私按访客处理
 */
@Controller()
@LoginRequired()
export class ClanLinksController {
  constructor(private readonly svc: ClanLinksService) {}

  @Get('clans/:clanId/links')
  list(@CurrentUser() user: AuthUser, @Param('clanId') clanId: string) {
    return this.svc.list(user, clanId);
  }

  @Get('clans/:clanId/link-candidates')
  candidates(@CurrentUser() user: AuthUser, @Param('clanId') clanId: string, @Query('q') q: string) {
    return this.svc.candidates(user, clanId, q);
  }

  @Post('clans/:clanId/links')
  propose(@CurrentUser() user: AuthUser, @Param('clanId') clanId: string, @Body() dto: ProposeDto) {
    return this.svc.propose(user, clanId, dto);
  }

  @Get('admin/clan-links')
  @SuperAdminOnly()
  pending(@CurrentUser() user: AuthUser) {
    return this.svc.pendingForSuper(user);
  }

  @Post('clan-links/:id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ApproveDto) {
    return this.svc.approve(user, id, dto);
  }

  @Post('clan-links/:id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.svc.reject(user, id, dto.note);
  }

  @Post('clan-links/:id/revoke')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.revoke(user, id);
  }

  @Get('clan-links/:id/lineage')
  lineage(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.lineage(user, id);
  }

  @Get('clan-links/:id/persons')
  persons(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('clanId') clanId: string, @Query('q') q: string) {
    return this.svc.searchPersons(user, id, clanId, q);
  }

  @Get('clan-links/:id/kinship')
  kinship(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('from') from: string, @Query('to') to: string) {
    return this.svc.kinship(user, id, from, to);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([ClanLinkEntity])],
  controllers: [ClanLinksController],
  providers: [ClanLinksService, CrossClanKinshipAdapter],
})
export class ClanLinksModule {}
