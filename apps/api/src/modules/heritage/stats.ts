import { Controller, Get, Injectable, Param, Query } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DataSource } from 'typeorm';
import { disambiguationLabel, regionOf, type AdvancedSearchItem, type ClanDashboard, type Gender, type NamedCount, type Paged } from '@zupu/shared';
import { AccessService } from '../../common/access.service';
import { AuthUser, CurrentUser } from '../../common/auth';
import { canSeeSensitive, rowToPerson, toBrief } from '../../common/mappers';
import { sensitiveSql } from './heritage-common';

const int = () => Type(() => Number);

export class AdvancedSearchDto {
  @IsOptional() @IsString() @MaxLength(30) q?: string;
  @IsOptional() @IsString() @MaxLength(4) generationChar?: string;
  @IsOptional() @int() @IsInt() @Min(1) generationFrom?: number;
  @IsOptional() @int() @IsInt() @Min(1) generationTo?: number;
  @IsOptional() @IsIn(['male', 'female', 'unknown']) gender?: Gender;
  @IsOptional() @IsIn(['living', 'deceased']) living?: 'living' | 'deceased';
  @IsOptional() @IsString() @MaxLength(50) region?: string;
  @IsOptional() @int() @IsInt() @Min(1) @Max(3000) birthYearFrom?: number;
  @IsOptional() @int() @IsInt() @Min(1) @Max(3000) birthYearTo?: number;
  @IsOptional() @int() @IsInt() @Min(1) @Max(3000) deathYearFrom?: number;
  @IsOptional() @int() @IsInt() @Min(1) @Max(3000) deathYearTo?: number;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() includeExternal?: boolean;
  @IsOptional() @IsIn(['generation', 'birth', 'name']) sort?: 'generation' | 'birth' | 'name';
  @IsOptional() @int() @IsInt() @Min(1) page?: number;
  @IsOptional() @int() @IsInt() @Min(1) pageSize?: number;
}

const LIFESPAN_BUCKETS = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80-89', '90+'];

/** 统计看板 + 高级搜索 */
@Injectable()
export class StatsService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
  ) {}

  async dashboard(user: AuthUser | null, clanId: string): Promise<ClanDashboard> {
    const { role } = await this.access.clanAccess(user, clanId);
    const sens = sensitiveSql(role);
    const [t] = await this.ds.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE NOT is_external)::int AS clan_members,
              count(*) FILTER (WHERE is_external)::int AS external,
              count(*) FILTER (WHERE is_living)::int AS living,
              count(*) FILTER (WHERE gender='male')::int AS male,
              count(*) FILTER (WHERE gender='female')::int AS female,
              count(*) FILTER (WHERE gender='unknown')::int AS unknown_gender,
              max(generation) AS max_generation
         FROM person p WHERE clan_id = $1`,
      [clanId],
    );
    // 寿命：有公历生卒年者（周岁近似 = 卒年 − 生年）
    const lifespanExpr = `(extract(year FROM p.death_date) - extract(year FROM p.birth_date))`;
    const lifeWhere = `p.clan_id = $1 AND NOT p.is_living AND p.birth_date IS NOT NULL AND p.death_date IS NOT NULL
                       AND ${lifespanExpr} BETWEEN 0 AND 120`;
    const [life] = await this.ds.query(
      `SELECT round(avg(${lifespanExpr})::numeric, 1)::float AS avg, count(*)::int AS n FROM person p WHERE ${lifeWhere}`,
      [clanId],
    );
    const buckets: any[] = await this.ds.query(
      `SELECT least(floor(${lifespanExpr} / 10), 9)::int AS b, count(*)::int AS n FROM person p WHERE ${lifeWhere} GROUP BY 1`,
      [clanId],
    );
    const gens: any[] = await this.ds.query(
      `SELECT p.generation,
              count(*)::int AS total,
              count(*) FILTER (WHERE p.gender='male')::int AS male,
              count(*) FILTER (WHERE p.gender='female')::int AS female,
              count(*) FILTER (WHERE p.is_living)::int AS living,
              round(avg(${lifespanExpr}) FILTER (WHERE NOT p.is_living AND p.birth_date IS NOT NULL AND p.death_date IS NOT NULL
                    AND ${lifespanExpr} BETWEEN 0 AND 120)::numeric, 1)::float AS avg_life
         FROM person p WHERE p.clan_id = $1 AND p.generation IS NOT NULL AND NOT p.is_external
        GROUP BY p.generation ORDER BY p.generation`,
      [clanId],
    );
    // 地域：出生地（对当前角色不可见的在世者出生地不计入），缺失时取祖籍
    const places: any[] = await this.ds.query(
      `SELECT COALESCE(CASE WHEN ${sens} THEN NULLIF(p.birth_place, '') END, NULLIF(p.ancestral_home, '')) AS place, count(*)::int AS n
         FROM person p WHERE p.clan_id = $1 AND NOT p.is_external GROUP BY 1`,
      [clanId],
    );
    const regionMap = new Map<string, number>();
    for (const r of places) {
      const name = regionOf(r.place) ?? '未知';
      regionMap.set(name, (regionMap.get(name) ?? 0) + r.n);
    }
    const periods: any[] = await this.ds.query(
      `SELECT (floor(extract(year FROM p.birth_date) / 50) * 50)::int AS y, count(*)::int AS n
         FROM person p WHERE p.clan_id = $1 AND p.birth_date IS NOT NULL AND ${sens} GROUP BY 1 ORDER BY 1`,
      [clanId],
    );
    const media: any[] = await this.ds.query(
      `SELECT m.type, count(*)::int AS n FROM media m JOIN person p ON p.id = m.person_id
        WHERE m.clan_id = $1 AND m.category = 'gallery' AND ${sens} GROUP BY m.type`,
      [clanId],
    );
    const [extra] = await this.ds.query(
      `SELECT (SELECT count(*)::int FROM oral_history WHERE clan_id = $1) AS oral,
              (SELECT count(*)::int FROM life_event WHERE clan_id = $1) AS events`,
      [clanId],
    );
    const mediaCounts = { photo: 0, video: 0, audio: 0, doc: 0 };
    for (const m of media) (mediaCounts as any)[m.type] = m.n;
    const bucketCounts = new Map(buckets.map((b) => [b.b, b.n]));
    return {
      total: t.total,
      clanMembers: t.clan_members,
      external: t.external,
      living: t.living,
      deceased: t.total - t.living,
      male: t.male,
      female: t.female,
      unknownGender: t.unknown_gender,
      maxGeneration: t.max_generation,
      avgLifespan: life.avg,
      lifespanSamples: life.n,
      perGeneration: gens.map((g) => ({
        generation: g.generation,
        total: g.total,
        male: g.male,
        female: g.female,
        living: g.living,
        avgLifespan: g.avg_life,
      })),
      lifespanBuckets: LIFESPAN_BUCKETS.map((name, i) => ({ name, count: bucketCounts.get(i) ?? 0 })),
      regions: [...regionMap.entries()]
        .map(([name, count]): NamedCount => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      birthPeriods: periods.map((p) => ({ name: `${p.y}–${p.y + 49}`, count: p.n })),
      mediaCounts,
      oralHistoryCount: extra.oral,
      eventCount: extra.events,
    };
  }

  async advancedSearch(user: AuthUser | null, clanId: string, q: AdvancedSearchDto): Promise<Paged<AdvancedSearchItem>> {
    const { role } = await this.access.clanAccess(user, clanId);
    const sens = sensitiveSql(role);
    const pageSize = Math.min(q.pageSize ?? 20, 200);
    const page = q.page ?? 1;
    const params: unknown[] = [clanId];
    const where = ['p.clan_id = $1'];
    const add = (sql: (i: string) => string, v: unknown) => {
      params.push(v);
      where.push(sql(`$${params.length}`));
    };
    if (q.q?.trim())
      add((i) => `(p.full_name ILIKE ${i} OR p.given_name ILIKE ${i} OR p.courtesy_name ILIKE ${i} OR p.art_name ILIKE ${i} OR p.nickname ILIKE ${i})`, `%${q.q.trim()}%`);
    if (q.generationChar?.trim()) add((i) => `p.generation_char = ${i}`, q.generationChar.trim());
    if (q.generationFrom) add((i) => `p.generation >= ${i}`, q.generationFrom);
    if (q.generationTo) add((i) => `p.generation <= ${i}`, q.generationTo);
    if (q.gender) add((i) => `p.gender = ${i}`, q.gender);
    if (q.living) where.push(q.living === 'living' ? 'p.is_living' : 'NOT p.is_living');
    // 出生地、出生年属敏感信息：仅在当前角色可见时参与匹配，避免借搜索推断隐私
    if (q.region?.trim())
      add(
        (i) => `(p.ancestral_home ILIKE ${i} OR p.burial_place ILIKE ${i} OR (${sens} AND p.birth_place ILIKE ${i}))`,
        `%${q.region.trim()}%`,
      );
    if (q.birthYearFrom) add((i) => `(${sens} AND extract(year FROM p.birth_date) >= ${i})`, q.birthYearFrom);
    if (q.birthYearTo) add((i) => `(${sens} AND extract(year FROM p.birth_date) <= ${i})`, q.birthYearTo);
    if (q.deathYearFrom) add((i) => `extract(year FROM p.death_date) >= ${i}`, q.deathYearFrom);
    if (q.deathYearTo) add((i) => `extract(year FROM p.death_date) <= ${i}`, q.deathYearTo);
    if (!q.includeExternal) where.push('NOT p.is_external');
    const w = where.join(' AND ');
    const order =
      q.sort === 'birth'
        ? `CASE WHEN ${sens} THEN p.birth_date END NULLS LAST, p.generation NULLS LAST`
        : q.sort === 'name'
          ? 'p.full_name, p.generation NULLS LAST'
          : 'p.generation NULLS LAST, p.rank_in_siblings NULLS LAST, p.full_name';
    const [{ total }] = await this.ds.query(`SELECT count(*)::int AS total FROM person p WHERE ${w}`, params);
    const rows: any[] = await this.ds.query(
      `SELECT p.*, f.full_name AS father_name,
              (SELECT count(*)::int FROM person p2 WHERE p2.clan_id = p.clan_id AND p2.full_name = p.full_name) AS same_name_count
         FROM person p
         LEFT JOIN LATERAL (
           SELECT fp.full_name FROM parent_child pc JOIN person fp ON fp.id = pc.parent_id
            WHERE pc.child_id = p.id ORDER BY pc.is_main_line DESC, (fp.gender = 'male') DESC LIMIT 1
         ) f ON true
        WHERE ${w} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );
    return {
      total,
      page,
      pageSize,
      items: rows.map((r) => {
        const e = rowToPerson(r);
        const b = toBrief(e, role);
        const sensitive = canSeeSensitive(e, role);
        return {
          ...b,
          fatherName: r.father_name,
          sameNameCount: r.same_name_count,
          disambiguation: disambiguationLabel({ ...b, fatherName: r.father_name }),
          ancestralHome: e.ancestralHome,
          birthPlace: sensitive ? e.birthPlace : null,
          birthYear: sensitive && e.birthDate ? Number(e.birthDate.slice(0, 4)) : null,
          deathYear: e.deathDate ? Number(e.deathDate.slice(0, 4)) : null,
        };
      }),
    };
  }
}

@Controller()
export class StatsController {
  constructor(private readonly svc: StatsService) {}

  @Get('clans/:clanId/dashboard')
  dashboard(@CurrentUser() u: AuthUser | null, @Param('clanId') clanId: string) {
    return this.svc.dashboard(u, clanId);
  }

  @Get('clans/:clanId/advanced-search')
  search(@CurrentUser() u: AuthUser | null, @Param('clanId') clanId: string, @Query() q: AdvancedSearchDto) {
    return this.svc.advancedSearch(u, clanId, q);
  }
}
