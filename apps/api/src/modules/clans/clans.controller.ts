import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { ClansService } from './clans.service';

export class ClanUpdateDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(10) surname?: string;
  @IsOptional() @IsString() @MaxLength(60) hallName?: string | null;
  @IsOptional() @IsString() @MaxLength(60) origin?: string | null;
  @IsOptional() @IsString() generationPoem?: string | null;
  @IsOptional() @IsInt() @Min(1) poemStartGeneration?: number;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsIn(['public', 'private', 'invite']) visibility?: 'public' | 'private' | 'invite';
  @IsOptional() @IsUUID() founderId?: string | null;
}

class GenerationCheckDto {
  @IsOptional() @IsInt() generation?: number | null;
  @IsOptional() @IsString() generationChar?: string | null;
  @IsOptional() @IsString() givenName?: string | null;
  @IsOptional() @IsBoolean() isExternal?: boolean;
  @IsOptional() @IsArray() parentIds?: string[];
  @IsOptional() @IsUUID() personId?: string;
}

class AddMemberDto {
  @IsString() phone: string;
  @IsOptional() @IsUUID() linkedPersonId?: string | null;
  @IsOptional() @IsString() displayName?: string;
}

class UpdateMembershipDto {
  @IsOptional() @IsUUID() linkedPersonId: string | null;
}

class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() page?: number;
  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number;
}

@Controller()
export class ClansController {
  constructor(private readonly clans: ClansService) {}

  @Get('clans')
  list(@CurrentUser() user: AuthUser | null) {
    return this.clans.list(user);
  }

  @Get('clans/:clanId')
  get(@CurrentUser() user: AuthUser | null, @Param('clanId') clanId: string) {
    return this.clans.get(user, clanId);
  }

  @Patch('clans/:clanId')
  @LoginRequired()
  update(@CurrentUser() user: AuthUser, @Param('clanId') clanId: string, @Body() dto: ClanUpdateDto) {
    return this.clans.update(user, clanId, dto as Record<string, unknown>);
  }

  @Get('clans/:clanId/stats')
  stats(@CurrentUser() user: AuthUser | null, @Param('clanId') clanId: string) {
    return this.clans.stats(user, clanId);
  }

  @Post('clans/:clanId/generation-check')
  generationCheck(@CurrentUser() user: AuthUser | null, @Param('clanId') clanId: string, @Body() dto: GenerationCheckDto) {
    return this.clans.generationCheck(user, clanId, dto);
  }

  @Get('clans/:clanId/members')
  @LoginRequired()
  members(@CurrentUser() user: AuthUser, @Param('clanId') clanId: string) {
    return this.clans.members(user, clanId);
  }

  @Post('clans/:clanId/members')
  @LoginRequired()
  addMember(@CurrentUser() user: AuthUser, @Param('clanId') clanId: string, @Body() dto: AddMemberDto) {
    return this.clans.addMember(user, clanId, dto);
  }

  @Patch('memberships/:id')
  @LoginRequired()
  updateMembership(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateMembershipDto) {
    return this.clans.updateMembership(user, id, { linkedPersonId: dto.linkedPersonId ?? null });
  }

  @Delete('memberships/:id')
  @LoginRequired()
  removeMembership(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clans.removeMembership(user, id);
  }

  @Get('clans/:clanId/audit-logs')
  @LoginRequired()
  auditLogs(@CurrentUser() user: AuthUser, @Param('clanId') clanId: string, @Query() q: PageQuery) {
    return this.clans.auditLogs(user, clanId, q.page, q.pageSize);
  }
}
