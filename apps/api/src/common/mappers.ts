import type { EffectiveRole, Person, PersonBrief } from '@zupu/shared';
import type { PersonEntity } from '../entities';

const SENSITIVE: (keyof Person)[] = [
  'birthDate',
  'birthPrecision',
  'birthText',
  'birthPlace',
  'biography',
  'biographyAiDraft',
  'occupation',
];

/** 当前角色是否能看到该人物的敏感信息 */
export function canSeeSensitive(p: Pick<PersonEntity, 'isLiving' | 'privacyLevel'>, role: EffectiveRole): boolean {
  if (role === 'super' || role === 'admin') return true;
  if (p.privacyLevel === 'admins') return false;
  if (role === 'member') return true;
  return !p.isLiving && p.privacyLevel === 'public';
}

export function toPerson(e: PersonEntity, role: EffectiveRole): Person {
  const p: Person = {
    id: e.id,
    clanId: e.clanId,
    surname: e.surname,
    givenName: e.givenName,
    fullName: e.fullName ?? e.surname + e.givenName,
    courtesyName: e.courtesyName,
    artName: e.artName,
    nickname: e.nickname,
    gender: e.gender,
    generation: e.generation,
    generationChar: e.generationChar,
    rankInSiblings: e.rankInSiblings,
    birthDate: e.birthDate,
    birthPrecision: e.birthPrecision,
    birthText: e.birthText,
    deathDate: e.deathDate,
    deathPrecision: e.deathPrecision,
    deathText: e.deathText,
    isLiving: e.isLiving,
    ancestralHome: e.ancestralHome,
    birthPlace: e.birthPlace,
    burialPlace: e.burialPlace,
    biography: e.biography,
    biographyAiDraft: e.biographyAiDraft,
    occupation: e.occupation,
    isExternal: e.isExternal,
    privacyLevel: e.privacyLevel,
    avatarMediaId: e.avatarMediaId,
    createdAt: e.createdAt?.toISOString?.() ?? String(e.createdAt),
    updatedAt: e.updatedAt?.toISOString?.() ?? String(e.updatedAt),
  };
  if (!canSeeSensitive(e, role)) {
    for (const k of SENSITIVE) (p as unknown as Record<string, unknown>)[k] = null;
    p.hiddenFields = SENSITIVE as string[];
  }
  return p;
}

type BriefSource = Pick<
  PersonEntity,
  | 'id'
  | 'surname'
  | 'givenName'
  | 'gender'
  | 'generation'
  | 'generationChar'
  | 'rankInSiblings'
  | 'isLiving'
  | 'isExternal'
  | 'birthText'
  | 'deathText'
  | 'privacyLevel'
> & { fullName?: string };

export function toBrief(e: BriefSource, role: EffectiveRole): PersonBrief {
  return {
    id: e.id,
    fullName: e.fullName ?? e.surname + e.givenName,
    gender: e.gender,
    generation: e.generation,
    generationChar: e.generationChar,
    rankInSiblings: e.rankInSiblings,
    isLiving: e.isLiving,
    isExternal: e.isExternal,
    birthText: canSeeSensitive(e, role) ? e.birthText : null,
    deathText: e.deathText,
  };
}

/** 原生 SQL 行（snake_case）→ 实体字段（camelCase） */
export function rowToPerson(r: Record<string, any>): PersonEntity {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) o[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  for (const k of ['birthDate', 'deathDate']) {
    const v = o[k];
    if (v instanceof Date) o[k] = v.toISOString().slice(0, 10);
  }
  return o as unknown as PersonEntity;
}
