import { BadRequestException, Controller, Get, Injectable, Module, NotFoundException, Param, Query } from '@nestjs/common';
import { computeKinship } from '@zupu/shared/kinship';
import type { KinshipResult } from '@zupu/shared';
import { AccessService, isUuid } from '../../common/access.service';
import { AuthUser, CurrentUser } from '../../common/auth';
import { KinshipCache } from '../../common/kinship-cache.service';
import { canSeeSensitive } from '../../common/mappers';

@Injectable()
export class KinshipService {
  constructor(
    private readonly access: AccessService,
    private readonly cache: KinshipCache,
  ) {}

  async compute(user: AuthUser | null, clanId: string, from: string, to: string): Promise<KinshipResult> {
    const { role } = await this.access.clanAccess(user, clanId);
    if (!isUuid(from) || !isUuid(to)) throw new BadRequestException('请选择两位人员');
    const graph = await this.cache.graph(clanId);
    if (!graph.persons.has(from) || !graph.persons.has(to)) throw new NotFoundException('人员不在本家族中');
    const r = computeKinship(graph, from, to);
    // 隐私：访客看不到在世者出生信息
    const mask = <T extends { id: string; birthText: string | null }>(b: T): T => {
      const p = graph.persons.get(b.id) as any;
      return p && !canSeeSensitive({ isLiving: p.isLiving, privacyLevel: p.privacyLevel }, role) ? { ...b, birthText: null } : b;
    };
    return {
      ...r,
      from: mask(r.from),
      to: mask(r.to),
      commonAncestor: r.commonAncestor ? mask(r.commonAncestor) : null,
      path: r.path.map(mask),
    };
  }
}

@Controller()
export class KinshipController {
  constructor(private readonly svc: KinshipService) {}

  /** 任意两人亲属关系：GET /clans/:clanId/kinship?from=A&to=B */
  @Get('clans/:clanId/kinship')
  kinship(@CurrentUser() user: AuthUser | null, @Param('clanId') clanId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.svc.compute(user, clanId, from, to);
  }
}

@Module({ controllers: [KinshipController], providers: [KinshipService] })
export class KinshipModule {}
