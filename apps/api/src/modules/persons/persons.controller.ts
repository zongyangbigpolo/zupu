import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { PersonCreateDto, PersonSearchQuery, PersonUpdateDto, TreeQuery } from './person.dto';
import { PersonsService } from './persons.service';
import { TreeService } from './tree.service';

@Controller()
export class PersonsController {
  constructor(
    private readonly persons: PersonsService,
    private readonly trees: TreeService,
  ) {}

  @Get('clans/:clanId/persons')
  search(@CurrentUser() user: AuthUser | null, @Param('clanId') clanId: string, @Query() q: PersonSearchQuery) {
    return this.persons.search(user, clanId, q);
  }

  @Post('clans/:clanId/persons')
  @LoginRequired()
  create(@CurrentUser() user: AuthUser, @Param('clanId') clanId: string, @Body() dto: PersonCreateDto) {
    return this.persons.create(user, clanId, dto);
  }

  @Get('persons/:id')
  detail(@CurrentUser() user: AuthUser | null, @Param('id') id: string) {
    return this.persons.detail(user, id);
  }

  @Patch('persons/:id')
  @LoginRequired()
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PersonUpdateDto) {
    return this.persons.update(user, id, dto);
  }

  @Delete('persons/:id')
  @LoginRequired()
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.persons.remove(user, id);
  }

  /** 五代树：GET /persons/:id/tree?up=5&down=5&line=main|birth */
  @Get('persons/:id/tree')
  tree(@CurrentUser() user: AuthUser | null, @Param('id') id: string, @Query() q: TreeQuery) {
    return this.trees.tree(user, id, q.up ?? 5, q.down ?? 5, q.line ?? 'main');
  }
}
