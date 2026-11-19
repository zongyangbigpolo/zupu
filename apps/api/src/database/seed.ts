import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';
import {
  AuditLogEntity,
  ClanEntity,
  LifeEventEntity,
  MarriageEntity,
  MembershipEntity,
  ParentChildEntity,
  PersonEntity,
  UserEntity,
} from '../entities';
import { AppDataSource } from './data-source';
import { seedHeritage } from './seed-heritage';
import { seedInteraction } from './seed-interaction';
import { generateLiClan, generateWangClan, LI_POEM, reignText, type SeedEvent, type SeedMarriage, type SeedParent, type SeedPerson } from './seed-data';

export const DEMO_ACCOUNTS = {
  superAdmin: { phone: '13800000000', password: 'admin123', displayName: '平台超级管理员' },
  liAdmin: { phone: '13900000001', password: 'admin123', displayName: '李氏家族管理员' },
  liMember: { phone: '13900000002', password: 'member123', displayName: '李诗涵' },
  wangAdmin: { phone: '13900000003', password: 'admin123', displayName: '王氏家族管理员' },
};

async function insertPeople(
  em: EntityManager,
  clanId: string,
  data: { persons: SeedPerson[]; parents: SeedParent[]; marriages: SeedMarriage[]; events: SeedEvent[] },
) {
  const ids = new Map<string, string>();
  let i = 0;
  for (const p of data.persons) {
    i++;
    const livingDate = p.isLiving;
    const month = (i % 12) + 1;
    const day = (i % 27) + 1;
    const birthDate = livingDate ? `${p.birthYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : `${p.birthYear}-01-01`;
    const e = em.getRepository(PersonEntity).create({
      clanId,
      surname: p.surname,
      givenName: p.givenName,
      gender: p.gender,
      generation: p.generation,
      generationChar: p.generationChar,
      rankInSiblings: p.rankInSiblings,
      birthDate,
      birthPrecision: livingDate ? 'day' : 'year',
      birthText: livingDate ? `${p.birthYear}年${month}月${day}日` : reignText(p.birthYear),
      deathDate: p.deathYear ? `${p.deathYear}-01-01` : null,
      deathPrecision: p.deathYear ? 'year' : null,
      deathText: p.deathYear ? reignText(p.deathYear) : null,
      isLiving: p.isLiving,
      isExternal: p.isExternal,
      courtesyName: p.courtesyName ?? null,
      artName: p.artName ?? null,
      nickname: p.nickname ?? null,
      occupation: p.occupation ?? null,
      biography: p.biography ?? null,
      ancestralHome: p.ancestralHome ?? (p.isExternal ? null : '江西吉安府泰和县'),
      birthPlace: p.birthPlace ?? null,
      burialPlace: p.burialPlace ?? null,
      privacyLevel: p.privacyLevel ?? (p.isLiving ? 'members' : 'public'),
    });
    const saved = await em.getRepository(PersonEntity).save(e);
    ids.set(p.key, saved.id);
  }
  await em.getRepository(ParentChildEntity).insert(
    data.parents.map((x) => ({
      clanId,
      parentId: ids.get(x.parent)!,
      childId: ids.get(x.child)!,
      relationType: x.relationType,
      isMainLine: x.isMainLine,
      sortOrder: x.sortOrder,
    })),
  );
  await em.getRepository(MarriageEntity).insert(
    data.marriages.map((m) => ({ clanId, husbandId: ids.get(m.husband)!, wifeId: ids.get(m.wife)!, type: m.type, order: m.order })),
  );
  if (data.events.length)
    await em.getRepository(LifeEventEntity).insert(
      data.events.map((ev, n) => ({
        clanId,
        personId: ids.get(ev.person)!,
        title: ev.title,
        type: ev.type,
        eventDate: `${ev.year}-01-01`,
        eventText: reignText(ev.year),
        place: ev.place ?? null,
        description: ev.description ?? null,
        sortOrder: n,
      })),
    );
  return ids;
}

export async function seed(ds: DataSource, opts: { reset?: boolean } = {}) {
  if (opts.reset) {
    await ds.query(`TRUNCATE audit_log, life_event, media, marriage, parent_child, membership, person, clan, app_user CASCADE`);
  }
  if (await ds.getRepository(ClanEntity).count()) {
    console.log('数据库已有数据，跳过种子数据（使用 --reset 清空后重建）');
    return null;
  }
  return ds.transaction(async (em) => {
    const users = em.getRepository(UserEntity);
    const mkUser = async (a: { phone: string; password: string; displayName: string }, isSuperAdmin = false) =>
      users.save(users.create({ phone: a.phone, displayName: a.displayName, passwordHash: await bcrypt.hash(a.password, 10), isSuperAdmin }));
    const superAdmin = await mkUser(DEMO_ACCOUNTS.superAdmin, true);
    const liAdmin = await mkUser(DEMO_ACCOUNTS.liAdmin);
    const liMember = await mkUser(DEMO_ACCOUNTS.liMember);
    const wangAdmin = await mkUser(DEMO_ACCOUNTS.wangAdmin);

    const clans = em.getRepository(ClanEntity);
    const li = await clans.save(
      clans.create({
        name: '陇西堂李氏·湘潭支',
        surname: '李',
        hallName: '陇西堂',
        origin: '陇西',
        generationPoem: LI_POEM,
        poemStartGeneration: 1,
        description:
          '本支始迁祖文远公，康熙二十三年自江西吉安府泰和县迁居湖南湘潭白石铺，至今三百余年，传十三世。（示例数据，人物均为虚构）',
        visibility: 'public',
        createdBy: superAdmin.id,
      }),
    );
    const liData = generateLiClan();
    const liIds = await insertPeople(em, li.id, liData);
    li.founderId = liIds.get(liData.persons[0].key)!;
    await clans.save(li);

    const wang = await clans.save(
      clans.create({
        name: '太原堂王氏',
        surname: '王',
        hallName: '太原堂',
        origin: '太原',
        generationPoem: '仁义礼智信',
        poemStartGeneration: 1,
        description: '私密族谱示例（演示多家族数据隔离）。',
        visibility: 'private',
        createdBy: superAdmin.id,
      }),
    );
    const wangData = generateWangClan();
    const wangIds = await insertPeople(em, wang.id, wangData);
    wang.founderId = wangIds.get('w1')!;
    await clans.save(wang);

    // "我在谱中"：族人账号绑定第 12 世在世成员
    const me = liData.persons.find((p) => p.generation === 12 && p.isLiving && !p.isExternal && p.gender === 'female')
      ?? liData.persons.find((p) => p.generation === 12 && p.isLiving && !p.isExternal)!;
    const ms = em.getRepository(MembershipEntity);
    await ms.insert([
      { userId: liAdmin.id, clanId: li.id, role: 'admin', linkedPersonId: null },
      { userId: liMember.id, clanId: li.id, role: 'member', linkedPersonId: liIds.get(me.key)! },
      { userId: wangAdmin.id, clanId: wang.id, role: 'admin', linkedPersonId: null },
    ]);
    await seedInteraction(em, { clanId: li.id, adminId: liAdmin.id, memberId: liMember.id }); // M4
    await em.getRepository(AuditLogEntity).insert([
      { clanId: li.id, userId: superAdmin.id, entity: 'clan', entityId: li.id, action: 'create', after: { name: li.name } as any },
      { clanId: li.id, userId: superAdmin.id, entity: 'membership', entityId: null, action: 'appoint-admin', after: { phone: liAdmin.phone } as any },
      { clanId: wang.id, userId: superAdmin.id, entity: 'clan', entityId: wang.id, action: 'create', after: { name: wang.name } as any },
      { clanId: wang.id, userId: superAdmin.id, entity: 'membership', entityId: null, action: 'appoint-admin', after: { phone: wangAdmin.phone } as any },
    ]);
    await seedHeritage(em, { clanId: li.id, founderId: li.founderId!, adminUserId: liAdmin.id, memberUserId: liMember.id });
    const key = (k?: { key: string }) => (k ? liIds.get(k.key) : undefined);
    const result = {
      liClanId: li.id,
      wangClanId: wang.id,
      founderId: li.founderId,
      meId: liIds.get(me.key)!,
      heirId: key(liData.special.heir),
      jiantiaoId: key(liData.special.jiantiao),
      daughterId: key(liData.special.daughter),
      personCount: liData.persons.length + wangData.persons.length,
    };
    console.log(`种子数据完成：李氏 ${liData.persons.length} 人，王氏 ${wangData.persons.length} 人`);
    return result;
  });
}

if (require.main === module) {
  (async () => {
    await AppDataSource.initialize();
    await AppDataSource.runMigrations({ transaction: 'each' });
    await seed(AppDataSource, { reset: process.argv.includes('--reset') });
    await AppDataSource.destroy();
    console.log('演示账号：');
    for (const a of Object.values(DEMO_ACCOUNTS)) console.log(`  ${a.displayName}：${a.phone} / ${a.password}`);
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
