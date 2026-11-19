import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  checkGeneration,
  disambiguationLabel,
  type Paged,
  type PersonDetail,
  type PersonSaveResult,
  type PersonSearchItem,
  type RelativeRef,
} from '@zupu/shared';
import { ClanEntity, LifeEventEntity, MediaEntity, ParentChildEntity, PersonEntity } from '../../entities';
import { AccessService } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/auth';
import { KinshipCache } from '../../common/kinship-cache.service';
import { canSeeSensitive, rowToPerson, toBrief, toPerson } from '../../common/mappers';
import { StorageService } from '../../common/storage.service';
import type { PersonCreateDto, PersonSearchQuery, PersonUpdateDto } from './person.dto';
import { toEvent, toMedia } from '../media/media.mappers';

const PERSON_FIELDS = [
  'surname',
  'givenName',
  'courtesyName',
  'artName',
  'nickname',
  'gender',
  'generation',
  'generationChar',
  'rankInSiblings',
  'birthDate',
  'birthPrecision',
  'birthText',
  'deathDate',
  'deathPrecision',
  'deathText',
  'isLiving',
  'ancestralHome',
  'birthPlace',
  'burialPlace',
  'biography',
  'occupation',
  'isExternal',
  'privacyLevel',
  'avatarMediaId',
] as const;

@Injectable()
export class PersonsService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly kinship: KinshipCache,
    private readonly storage: StorageService,
    @InjectRepository(PersonEntity) private readonly persons: Repository<PersonEntity>,
  ) {}

  async search(user: AuthUser | null, clanId: string, q: PersonSearchQuery): Promise<Paged<PersonSearchItem>> {
    const { role } = await this.access.clanAccess(user, clanId);
    const pageSize = Math.min(Math.max(q.pageSize ?? 20, 1), 200);
    const page = Math.max(q.page ?? 1, 1);
    const params: unknown[] = [clanId];
    const where = ['p.clan_id = $1'];
    if (q.q?.trim()) {
      params.push(`%${q.q.trim()}%`);
      const i = params.length;
      where.push(
        `(p.full_name ILIKE $${i} OR p.given_name ILIKE $${i} OR p.courtesy_name ILIKE $${i} OR p.art_name ILIKE $${i} OR p.nickname ILIKE $${i})`,
      );
    }
    if (q.generation) {
      params.push(q.generation);
      where.push(`p.generation = $${params.length}`);
    }
    if (q.generationChar?.trim()) {
      params.push(q.generationChar.trim());
      where.push(`p.generation_char = $${params.length}`);
    }
    if (q.includeExternal === 'false') where.push('NOT p.is_external');
    const w = where.join(' AND ');
    const [{ total }] = await this.ds.query(`SELECT count(*)::int AS total FROM person p WHERE ${w}`, params);
    const rows: any[] = await this.ds.query(
      `SELECT p.*, f.full_name AS father_name,
              (SELECT count(*)::int FROM person p2 WHERE p2.clan_id = p.clan_id AND p2.full_name = p.full_name) AS same_name_count
         FROM person p
         LEFT JOIN LATERAL (
           SELECT fp.full_name FROM parent_child pc JOIN person fp ON fp.id = pc.parent_id
            WHERE pc.child_id = p.id ORDER BY pc.is_main_line DESC, (fp.gender = 'male') DESC LIMIT 1
         ) f ON true
        WHERE ${w}
        ORDER BY p.generation NULLS LAST, p.full_name, p.rank_in_siblings NULLS LAST
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );
    return {
      total,
      page,
      pageSize,
      items: rows.map((r) => {
        const e = rowToPerson(r);
        const b = toBrief(e, role);
        return {
          ...b,
          fatherName: r.father_name,
          sameNameCount: r.same_name_count,
          disambiguation: disambiguationLabel({ ...b, fatherName: r.father_name }),
        };
      }),
    };
  }

  async detail(user: AuthUser | null, id: string): Promise<PersonDetail> {
    const { person, role } = await this.access.personAccess(user, id);
    const rel: any[] = await this.ds.query(
      `SELECT 'parent' AS kind, pc.id AS relation_id, pc.relation_type, pc.is_main_line, NULL AS marriage_type, pc.sort_order AS ord, p.*
         FROM parent_child pc JOIN person p ON p.id = pc.parent_id WHERE pc.child_id = $1
       UNION ALL
       SELECT 'child', pc.id, pc.relation_type, pc.is_main_line, NULL, pc.sort_order, p.*
         FROM parent_child pc JOIN person p ON p.id = pc.child_id WHERE pc.parent_id = $1
       UNION ALL
       SELECT 'spouse', m.id, NULL, NULL, m.type, m."order", p.*
         FROM marriage m JOIN person p ON p.id = CASE WHEN m.husband_id = $1 THEN m.wife_id ELSE m.husband_id END
        WHERE m.husband_id = $1 OR m.wife_id = $1`,
      [id],
    );
    const refs = (kind: string): RelativeRef[] =>
      rel
        .filter((r) => r.kind === kind)
        .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0) || (a.rank_in_siblings ?? 99) - (b.rank_in_siblings ?? 99))
        .map((r) => ({
          person: toBrief(rowToPerson(r), role),
          relationId: r.relation_id,
          relationType: r.relation_type ?? undefined,
          isMainLine: r.is_main_line ?? undefined,
          marriageType: r.marriage_type ?? undefined,
        }));
    const parents = refs('parent').sort(
      (a, b) => Number(b.isMainLine) - Number(a.isMainLine) || (a.person.gender === 'male' ? -1 : 1),
    );
    const father = parents.find((p) => p.isMainLine && p.person.gender === 'male') ?? parents[0];
    const sensitive = canSeeSensitive(person, role);
    let media: PersonDetail['media'] = [];
    let events: PersonDetail['events'] = [];
    if (sensitive) {
      const [m, ev] = await Promise.all([
        this.ds.getRepository(MediaEntity).find({ where: { personId: id }, order: { createdAt: 'ASC' } }),
        this.ds.getRepository(LifeEventEntity).find({ where: { personId: id }, order: { sortOrder: 'ASC', eventDate: 'ASC' } }),
      ]);
      media = await Promise.all(m.map((x) => toMedia(x, this.storage)));
      events = ev.map(toEvent);
    }
    const p = toPerson(person, role);
    return {
      ...p,
      parents,
      children: refs('child'),
      spouses: refs('spouse'),
      media,
      events,
      disambiguation: disambiguationLabel({ ...p, fatherName: father?.person.fullName }),
    };
  }

  private async warningsFor(em: EntityManager, clan: ClanEntity, p: PersonEntity) {
    const rows: any[] = await em.query(
      `SELECT pc.parent_id, pc.child_id, pc.is_main_line, p.generation, p.is_external
         FROM parent_child pc JOIN person p ON p.id = CASE WHEN pc.child_id = $1 THEN pc.parent_id ELSE pc.child_id END
        WHERE pc.child_id = $1 OR pc.parent_id = $1`,
      [p.id],
    );
    return checkGeneration(p, {
      poem: clan.generationPoem,
      poemStartGeneration: clan.poemStartGeneration,
      parentGenerations: rows.filter((r) => r.child_id === p.id && r.is_main_line && !r.is_external).map((r) => r.generation),
      childGenerations: rows.filter((r) => r.parent_id === p.id && !r.is_external).map((r) => r.generation),
    });
  }

  async create(user: AuthUser, clanId: string, dto: PersonCreateDto): Promise<PersonSaveResult> {
    const { clan, role } = await this.access.clanAccess(user, clanId, 'admin');
    const parents = dto.parents ?? [];
    if (parents.length) await this.access.assertPersonsInClan(clanId, parents.map((p) => p.parentId));
    const result = await this.ds.transaction(async (em) => {
      const repo = em.getRepository(PersonEntity);
      const data: Partial<PersonEntity> = { clanId };
      for (const k of PERSON_FIELDS) if (k in dto) (data as any)[k] = (dto as any)[k];
      // 字辈自动推算：未填世代/字辈时按父母与字辈诗补全
      if (!data.isExternal && (data.generation == null || !data.generationChar)) {
        const parentRows = parents.length ? await repo.findByIds(parents.map((p) => p.parentId)) : [];
        const mainParentGens = parentRows
          .filter((r) => !r.isExternal && (parents.find((p) => p.parentId === r.id)?.isMainLine ?? true))
          .map((r) => r.generation);
        const s = checkGeneration(
          { generation: data.generation, generationChar: data.generationChar, givenName: data.givenName, isExternal: data.isExternal },
          { poem: clan.generationPoem, poemStartGeneration: clan.poemStartGeneration, parentGenerations: mainParentGens },
        );
        if (data.generation == null) data.generation = s.suggestedGeneration;
        if (!data.generationChar) data.generationChar = s.suggestedGenerationChar;
      }
      const saved = await repo.save(repo.create(data));
      for (const [i, p] of parents.entries()) {
        await em.getRepository(ParentChildEntity).insert({
          clanId,
          parentId: p.parentId,
          childId: saved.id,
          relationType: p.relationType ?? 'biological',
          isMainLine: p.isMainLine ?? true,
          sortOrder: dto.rankInSiblings ?? i,
        });
      }
      const fresh = (await repo.findOne({ where: { id: saved.id } }))!;
      const { warnings } = await this.warningsFor(em, clan, fresh);
      await this.audit.log({ clanId, userId: user.id, entity: 'person', entityId: saved.id, action: 'create', after: { ...fresh, parents } }, em);
      return { person: toPerson(fresh, role), warnings };
    });
    this.kinship.invalidate(clanId);
    return result;
  }

  async update(user: AuthUser, id: string, dto: PersonUpdateDto): Promise<PersonSaveResult> {
    const { person, clan, role } = await this.access.personAccess(user, id, 'admin');
    if (dto.avatarMediaId) {
      const m = await this.ds.getRepository(MediaEntity).findOne({ where: { id: dto.avatarMediaId, personId: id } });
      if (!m) throw new BadRequestException('头像必须是该人物的照片');
    }
    const before = { ...person };
    for (const k of PERSON_FIELDS) if (k in dto) (person as any)[k] = (dto as any)[k];
    const result = await this.ds.transaction(async (em) => {
      await em.getRepository(PersonEntity).save(person);
      const fresh = (await em.getRepository(PersonEntity).findOne({ where: { id } }))!;
      const { warnings } = await this.warningsFor(em, clan, fresh);
      await this.audit.log({ clanId: clan.id, userId: user.id, entity: 'person', entityId: id, action: 'update', before, after: fresh }, em);
      return { person: toPerson(fresh, role), warnings };
    });
    this.kinship.invalidate(clan.id);
    return result;
  }

  async remove(user: AuthUser, id: string) {
    const { person, clan } = await this.access.personAccess(user, id, 'admin');
    const media = await this.ds.getRepository(MediaEntity).find({ where: { personId: id } });
    await this.ds.transaction(async (em) => {
      await em.getRepository(PersonEntity).delete(id);
      await this.audit.log({ clanId: clan.id, userId: user.id, entity: 'person', entityId: id, action: 'delete', before: person }, em);
    });
    await Promise.all(media.map((m) => this.storage.driver.remove(m.storageKey).catch(() => undefined)));
    this.kinship.invalidate(clan.id);
  }
}
