import { Controller, Get, Injectable, Param, Query, Res, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import type { EffectiveRole, PedigreePerson, PedigreeResponse, RelationType } from '@zupu/shared';
import { AccessService } from '../../common/access.service';
import { AuthUser, CurrentUser } from '../../common/auth';
import { canSeeSensitive } from '../../common/mappers';
import { ClanEntity } from '../../entities';
import { PedigreeQueryDto } from './visual.dto';
import { loadFrontMatter, renderPedigreePdf, resolveCjkFont } from './pedigree-pdf';

const MAX_PERSONS = 5000;

/** 吊线谱数据：以某人为根，沿宗法主线向下取 N 世 */
@Injectable()
export class PedigreeService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
  ) {}

  async data(user: AuthUser | null, clanId: string, q: PedigreeQueryDto): Promise<{ data: PedigreeResponse; clan: ClanEntity; role: EffectiveRole }> {
    const { clan, role } = await this.access.clanAccess(user, clanId);
    await this.access.assertPersonsInClan(clanId, [q.rootId]);
    const generations = q.generations ?? 5;
    const daughters = q.daughters ?? true;
    // 沿主线（is_main_line）向下；path 防环；每人只取首次到达（兼祧子只挂一房）
    const rows: { id: string; parentId: string | null; relationType: RelationType | null; sortOrder: number; depth: number }[] = await this.ds.query(
      `WITH RECURSIVE d AS (
         SELECT p.id, NULL::uuid AS parent_id, NULL::varchar AS relation_type, 0 AS sort_order, 0 AS depth, ARRAY[p.id] AS path
           FROM person p WHERE p.id = $1 AND p.clan_id = $2
         UNION ALL
         SELECT pc.child_id, pc.parent_id, pc.relation_type, pc.sort_order, d.depth + 1, d.path || pc.child_id
           FROM d
           JOIN parent_child pc ON pc.parent_id = d.id AND pc.is_main_line AND pc.clan_id = $2
           JOIN person c ON c.id = pc.child_id
          WHERE d.depth + 1 < $3 AND NOT pc.child_id = ANY(d.path) AND ($4::boolean OR c.gender <> 'female')
       )
       SELECT DISTINCT ON (id) id, parent_id AS "parentId", relation_type AS "relationType", sort_order AS "sortOrder", depth
         FROM d ORDER BY id, depth, sort_order
       LIMIT ${MAX_PERSONS + 1}`,
      [q.rootId, clanId, generations, daughters],
    );
    const truncated = rows.length > MAX_PERSONS;
    const list = rows.slice(0, MAX_PERSONS);
    const ids = list.map((r) => r.id);
    const persons: any[] = await this.ds.query(
      `SELECT id, surname, given_name AS "givenName", gender, generation, generation_char AS "generationChar",
              rank_in_siblings AS "rankInSiblings", courtesy_name AS "courtesyName", art_name AS "artName",
              birth_text AS "birthText", death_text AS "deathText", burial_place AS "burialPlace",
              is_living AS "isLiving", privacy_level AS "privacyLevel"
         FROM person WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    const marriages: { husbandId: string; wifeId: string; type: string; order: number; hs: string; hg: string; ws: string; wg: string }[] = await this.ds.query(
      `SELECT m.husband_id AS "husbandId", m.wife_id AS "wifeId", m.type, m."order",
              h.surname AS hs, h.given_name AS hg, w.surname AS ws, w.given_name AS wg
         FROM marriage m JOIN person h ON h.id = m.husband_id JOIN person w ON w.id = m.wife_id
        WHERE m.clan_id = $2 AND (m.husband_id = ANY($1::uuid[]) OR m.wife_id = ANY($1::uuid[]))
        ORDER BY m."order"`,
      [ids, clanId],
    );
    const spouseOf = new Map<string, string[]>();
    const push = (id: string, s: string) => spouseOf.set(id, [...(spouseOf.get(id) ?? []), s]);
    for (const m of marriages) {
      const wifeName = m.wg === '氏' ? `${m.ws}氏` : `${m.ws}${m.wg}`;
      const prefix = m.type === 'successor' ? '继配' : m.type === 'concubine' ? '侧室' : '配';
      push(m.husbandId, prefix + wifeName);
      push(m.wifeId, `适${m.hs}${m.hg}`);
    }
    const meta = new Map(list.map((r) => [r.id, r]));
    const out: PedigreePerson[] = persons.map((p) => {
      const r = meta.get(p.id)!;
      const sensitive = canSeeSensitive(p, role);
      return {
        id: p.id,
        parentId: r.parentId,
        surname: p.surname,
        givenName: p.givenName,
        gender: p.gender,
        generation: p.generation,
        generationChar: p.generationChar,
        rankInSiblings: p.rankInSiblings,
        courtesyName: p.courtesyName,
        artName: p.artName,
        birthText: sensitive ? p.birthText : null,
        deathText: p.deathText,
        burialPlace: p.burialPlace,
        spouses: spouseOf.get(p.id) ?? [],
        relationType: r.relationType && r.relationType !== 'biological' ? r.relationType : null,
        isLiving: p.isLiving,
        sortOrder: r.sortOrder,
      };
    });
    return {
      clan,
      role,
      data: {
        clan: { id: clan.id, name: clan.name, surname: clan.surname, hallName: clan.hallName },
        rootId: q.rootId,
        generations,
        persons: out,
        truncated,
      },
    };
  }

  async pdf(user: AuthUser | null, clanId: string, q: PedigreeQueryDto): Promise<Buffer> {
    const font = resolveCjkFont();
    if (!font) throw new ServiceUnavailableException('服务器未安装中文字体，无法生成 PDF（请配置 PDF_FONT_PATH 或安装 Noto CJK 字体）');
    const { data, clan } = await this.data(user, clanId, q);
    const front = q.cover === false ? [] : await loadFrontMatter(this.ds, clan);
    return renderPedigreePdf({ data, clan, style: q.style ?? 'ou', paper: q.paper ?? 'A4', font, front, cover: q.cover !== false });
  }
}

@Controller()
export class PedigreeController {
  constructor(private readonly svc: PedigreeService) {}

  @Get('clans/:clanId/pedigree')
  async get(@CurrentUser() u: AuthUser | null, @Param('clanId') clanId: string, @Query() q: PedigreeQueryDto) {
    return (await this.svc.data(u, clanId, q)).data;
  }

  @Get('clans/:clanId/pedigree.pdf')
  async pdf(@CurrentUser() u: AuthUser | null, @Param('clanId') clanId: string, @Query() q: PedigreeQueryDto, @Res() res: Response) {
    const buf = await this.svc.pdf(u, clanId, q);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="pedigree.pdf"; filename*=UTF-8''${encodeURIComponent('吊线谱.pdf')}`);
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  }
}
