import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { GedcomImportResult, GedcomPreview, GedcomPreviewPerson } from '@zupu/shared';
import { MarriageEntity, ParentChildEntity, PersonEntity } from '../../entities';
import { AccessService, isUuid } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/auth';
import { KinshipCache } from '../../common/kinship-cache.service';
import { rowToPerson } from '../../common/mappers';
import { parseGedcom, writeGedcom, type GedData, type ParsedGedcom } from './gedcom.codec';

export const GEDCOM_MAX_BYTES = 10 * 1024 * 1024;
const PREVIEW_LIMIT = 500;
const ISSUE_LIMIT = 200;

@Injectable()
export class GedcomService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly kinship: KinshipCache,
  ) {}

  /** 导出全族，或以 rootId 为根的支系（其所有后代及配偶） */
  async export(user: AuthUser, clanId: string, rootId?: string | null) {
    const { clan } = await this.access.clanAccess(user, clanId, 'admin');
    let ids: string[] | null = null;
    let root: PersonEntity | null = null;
    if (rootId) {
      if (!isUuid(rootId)) throw new NotFoundException('人员不存在');
      root = await this.ds.getRepository(PersonEntity).findOne({ where: { id: rootId, clanId } });
      if (!root) throw new NotFoundException('人员不在本家族中');
      const rows: { id: string }[] = await this.ds.query(
        `WITH RECURSIVE down(id) AS (
           SELECT $2::uuid UNION SELECT pc.child_id FROM parent_child pc JOIN down ON pc.parent_id = down.id WHERE pc.clan_id = $1
         )
         SELECT id FROM down
         UNION SELECT CASE WHEN m.husband_id = d.id THEN m.wife_id ELSE m.husband_id END
           FROM marriage m JOIN down d ON (m.husband_id = d.id OR m.wife_id = d.id) WHERE m.clan_id = $1`,
        [clanId, rootId],
      );
      ids = rows.map((r) => r.id);
    }
    const params: unknown[] = [clanId];
    const filter = ids ? 'AND id = ANY($2::uuid[])' : '';
    if (ids) params.push(ids);
    const persons = (
      await this.ds.query(`SELECT * FROM person WHERE clan_id = $1 ${filter} ORDER BY generation NULLS LAST, created_at`, params)
    ).map(rowToPerson);
    const keep = new Set(persons.map((p: PersonEntity) => p.id));
    const pcs = (await this.ds.getRepository(ParentChildEntity).find({ where: { clanId }, order: { sortOrder: 'ASC' } })).filter(
      (l) => keep.has(l.parentId) && keep.has(l.childId),
    );
    const ms = (await this.ds.getRepository(MarriageEntity).find({ where: { clanId } })).filter(
      (m) => keep.has(m.husbandId) && keep.has(m.wifeId),
    );
    const data: GedData = { persons, parents: pcs, marriages: ms };
    const name = root ? `${clan.name}-${root.fullName}支` : clan.name;
    const text = writeGedcom(data, { clanName: name });
    await this.audit.log({
      clanId,
      userId: user.id,
      entity: 'gedcom',
      entityId: rootId ?? null,
      action: 'export',
      after: { persons: persons.length, rootId: rootId ?? null },
    });
    return { text, filename: `${name}.ged` };
  }

  private decode(buf: Buffer | undefined): string {
    if (!buf?.length) throw new BadRequestException('请上传 GEDCOM 文件');
    if (buf.length > GEDCOM_MAX_BYTES) throw new BadRequestException('文件超过 10MB');
    // 只支持 UTF-8（含 BOM）；UTF-16 给出明确提示
    if ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))
      throw new BadRequestException('暂不支持 UTF-16 编码，请另存为 UTF-8 后再导入');
    return buf.toString('utf8');
  }

  private async parse(clanId: string, surname: string, buf: Buffer | undefined) {
    const parsed = parseGedcom(this.decode(buf), { defaultSurname: surname });
    // 与本族已有成员重名且世代相同，提示可能重复
    const existing: { full_name: string; generation: number | null }[] = await this.ds.query(
      `SELECT full_name, generation FROM person WHERE clan_id = $1`,
      [clanId],
    );
    const key = (n: string, g: number | null) => `${n}|${g ?? ''}`;
    const have = new Set(existing.map((e) => key(e.full_name, e.generation)));
    const dup = new Set(parsed.persons.filter((p) => have.has(key(p.surname + p.givenName, p.generation))).map((p) => p.id));
    return { parsed, dup };
  }

  async preview(user: AuthUser, clanId: string, buf: Buffer | undefined): Promise<GedcomPreview> {
    const { clan } = await this.access.clanAccess(user, clanId, 'admin');
    const { parsed, dup } = await this.parse(clanId, clan.surname, buf);
    return toPreview(parsed, dup);
  }

  async import(user: AuthUser, clanId: string, buf: Buffer | undefined): Promise<GedcomImportResult> {
    const { clan } = await this.access.clanAccess(user, clanId, 'admin');
    const { parsed } = await this.parse(clanId, clan.surname, buf);
    if (parsed.errors.length) throw new BadRequestException(`文件有 ${parsed.errors.length} 处错误，请修正后再导入：${parsed.errors[0].message}`);
    const result = await this.ds.transaction(async (em) => {
      const idMap = new Map<string, string>();
      const repo = em.getRepository(PersonEntity);
      // 分批插入，避免单条 SQL 参数过多
      for (let i = 0; i < parsed.persons.length; i += 500) {
        const batch = parsed.persons.slice(i, i + 500);
        const r = await repo.insert(batch.map(({ id: _x, ...p }) => ({ ...p, clanId })));
        batch.forEach((p, j) => idMap.set(p.id, r.identifiers[j].id));
      }
      const pcs = parsed.parents.map((l) => ({ ...l, clanId, parentId: idMap.get(l.parentId)!, childId: idMap.get(l.childId)! }));
      for (let i = 0; i < pcs.length; i += 1000) await em.getRepository(ParentChildEntity).insert(pcs.slice(i, i + 1000));
      const ms = parsed.marriages.map((m) => ({ ...m, clanId, husbandId: idMap.get(m.husbandId)!, wifeId: idMap.get(m.wifeId)! }));
      for (let i = 0; i < ms.length; i += 1000) await em.getRepository(MarriageEntity).insert(ms.slice(i, i + 1000));
      await this.audit.log(
        {
          clanId,
          userId: user.id,
          entity: 'gedcom',
          entityId: null,
          action: 'import',
          after: { persons: parsed.persons.length, parentLinks: pcs.length, marriages: ms.length, source: parsed.header.source },
        },
        em,
      );
      return { imported: parsed.persons.length, parentLinks: pcs.length, marriages: ms.length, personIds: Object.fromEntries(idMap) };
    });
    this.kinship.invalidate(clanId);
    return result;
  }
}

function toPreview(p: ParsedGedcom, dup: Set<string>): GedcomPreview {
  const name = new Map(p.persons.map((x) => [x.id, x.surname + x.givenName]));
  const parentsOf = new Map<string, string[]>();
  for (const l of p.parents) {
    if (!parentsOf.has(l.childId)) parentsOf.set(l.childId, []);
    parentsOf.get(l.childId)!.push(name.get(l.parentId) ?? l.parentId);
  }
  const spousesOf = new Map<string, string[]>();
  for (const m of p.marriages)
    for (const [a, b] of [
      [m.husbandId, m.wifeId],
      [m.wifeId, m.husbandId],
    ]) {
      if (!spousesOf.has(a)) spousesOf.set(a, []);
      spousesOf.get(a)!.push(name.get(b) ?? b);
    }
  const persons: GedcomPreviewPerson[] = p.persons.slice(0, PREVIEW_LIMIT).map((x) => ({
    xref: x.id,
    fullName: x.surname + x.givenName,
    gender: x.gender,
    generation: x.generation,
    generationChar: x.generationChar,
    courtesyName: x.courtesyName,
    birthText: x.birthText ?? x.birthDate,
    deathText: x.deathText ?? x.deathDate,
    isLiving: x.isLiving,
    isExternal: x.isExternal,
    parents: parentsOf.get(x.id) ?? [],
    spouses: spousesOf.get(x.id) ?? [],
    possibleDuplicate: dup.has(x.id),
  }));
  const warnings = [...p.warnings];
  if (dup.size) warnings.unshift({ message: `${dup.size} 人与本族已有成员同名同世代，可能重复，请核对（仍会作为新成员导入）` });
  if (p.persons.length > PREVIEW_LIMIT) warnings.unshift({ message: `仅预览前 ${PREVIEW_LIMIT} 人，导入时将导入全部 ${p.persons.length} 人` });
  return {
    header: p.header,
    stats: {
      persons: p.persons.length,
      families: p.familyCount,
      parentLinks: p.parents.length,
      marriages: p.marriages.length,
      living: p.persons.filter((x) => x.isLiving).length,
      external: p.persons.filter((x) => x.isExternal).length,
      duplicates: dup.size,
    },
    persons,
    errors: p.errors.slice(0, ISSUE_LIMIT),
    warnings: warnings.slice(0, ISSUE_LIMIT),
    canImport: p.errors.length === 0,
  };
}
