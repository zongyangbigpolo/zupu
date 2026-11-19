// M5 演示数据（可选）：在基础种子数据之上，新增两个同源支系家族并建立连谱，用于演示跨族连谱。
// 用法：npm run build -w @zupu/api && node apps/api/dist/database/seed-m5.js
// 衡阳支与湘潭支已连谱（同出始迁祖文远公）；醴陵支向湘潭支发起了待审批的连谱申请。
import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';
import { ClanEntity, MarriageEntity, MembershipEntity, ParentChildEntity, PersonEntity, UserEntity } from '../entities';
import { ClanLinkEntity } from '../entities/m5';
import { AppDataSource } from './data-source';
import { DEMO_ACCOUNTS } from './seed';

export const M5_DEMO_ACCOUNTS = {
  hyAdmin: { phone: '13900000011', password: 'admin123', displayName: '李氏衡阳支管理员' },
  lingAdmin: { phone: '13900000012', password: 'admin123', displayName: '李氏醴陵支管理员' },
};

const CHARS = '文德光宗祖诗书振家声';
const GIVEN = ['远', '衡', '岳', '南', '荫', '礼', '传', '兴', '邦', '明', '岚', '杰', '涛', '安', '峰', '然'];

async function branch(em: EntityManager, clanId: string, founderBirth: number, depth: number, startGen: number, tag: string) {
  const persons = em.getRepository(PersonEntity);
  let n = 0;
  const mk = async (gen: number, birth: number, gender: 'male' | 'female', rank: number, ext = false) => {
    n++;
    const living = birth > 1935;
    return persons.save(
      persons.create({
        clanId,
        surname: ext ? '陈刘周王'[n % 4] : '李',
        givenName: ext ? '氏' : (gen === 1 ? '文远' : CHARS[(gen - 1) % CHARS.length] + GIVEN[(n + tag.length) % GIVEN.length]),
        gender,
        generation: ext ? null : gen,
        generationChar: ext ? null : CHARS[(gen - 1) % CHARS.length],
        rankInSiblings: ext ? null : rank,
        birthDate: `${birth}-0${(n % 9) + 1}-1${n % 9}`,
        birthPrecision: living ? 'day' : 'year',
        birthText: living ? `${birth}年` : null,
        deathDate: living ? null : `${birth + 66}-01-01`,
        deathPrecision: living ? null : 'year',
        isLiving: living,
        isExternal: ext,
        privacyLevel: living ? 'members' : 'public',
      }),
    );
  };
  const founder = await mk(startGen, founderBirth, 'male', 1);
  let level = [founder];
  for (let d = 1; d < depth; d++) {
    const next: PersonEntity[] = [];
    for (const p of level) {
      const wife = await mk(0, (p.birthDate ? Number(p.birthDate.slice(0, 4)) : 1700) + 2, 'female', 1, true);
      await em.getRepository(MarriageEntity).insert({ clanId, husbandId: p.id, wifeId: wife.id, type: 'principal', order: 1 });
      const kids = d < 3 ? 2 : 1;
      for (let k = 0; k < kids; k++) {
        const c = await mk(startGen + d, Number(p.birthDate!.slice(0, 4)) + 26 + k * 3, 'male', k + 1);
        await em.getRepository(ParentChildEntity).insert([
          { clanId, parentId: p.id, childId: c.id, relationType: 'biological', isMainLine: true, sortOrder: k },
          { clanId, parentId: wife.id, childId: c.id, relationType: 'biological', isMainLine: true, sortOrder: k },
        ]);
        next.push(c);
      }
    }
    level = next;
  }
  return founder;
}

export async function seedM5Demo(ds: DataSource) {
  const exists = await ds.getRepository(ClanEntity).findOne({ where: { name: '陇西堂李氏·衡阳支' } });
  if (exists) {
    console.log('M5 演示数据已存在，跳过');
    return;
  }
  const li = await ds.getRepository(ClanEntity).findOne({ where: { name: '陇西堂李氏·湘潭支' } });
  if (!li?.founderId) throw new Error('请先运行基础种子数据');
  const superAdmin = await ds.getRepository(UserEntity).findOneOrFail({ where: { phone: DEMO_ACCOUNTS.superAdmin.phone } });
  const liAdmin = await ds.getRepository(UserEntity).findOneOrFail({ where: { phone: DEMO_ACCOUNTS.liAdmin.phone } });
  await ds.transaction(async (em) => {
    const users = em.getRepository(UserEntity);
    const mkUser = async (a: { phone: string; password: string; displayName: string }) =>
      users.save(users.create({ phone: a.phone, displayName: a.displayName, passwordHash: await bcrypt.hash(a.password, 10) }));
    const hyAdmin = await mkUser(M5_DEMO_ACCOUNTS.hyAdmin);
    const lingAdmin = await mkUser(M5_DEMO_ACCOUNTS.lingAdmin);
    const clans = em.getRepository(ClanEntity);
    const mkClan = (name: string, description: string) =>
      clans.save(
        clans.create({
          name,
          surname: '李',
          hallName: '陇西堂',
          origin: '陇西',
          generationPoem: '文德光宗祖，诗书振家声',
          poemStartGeneration: 1,
          description,
          visibility: 'private',
          createdBy: superAdmin.id,
        }),
      );
    const hy = await mkClan('陇西堂李氏·衡阳支', '文远公次房德衡公乾隆初年由湘潭迁衡阳，自成一支。（示例数据，人物均为虚构）');
    const ling = await mkClan('陇西堂李氏·醴陵支', '醴陵支谱载始祖文远公，待与湘潭支核对后连谱。（示例数据，人物均为虚构）');
    const hyFounder = await branch(em, hy.id, 1652, 10, 1, 'hy');
    const lingFounder = await branch(em, ling.id, 1652, 6, 1, 'ling');
    hy.founderId = hyFounder.id;
    ling.founderId = lingFounder.id;
    await clans.save([hy, ling]);
    await em.getRepository(MembershipEntity).insert([
      { userId: hyAdmin.id, clanId: hy.id, role: 'admin' },
      { userId: lingAdmin.id, clanId: ling.id, role: 'admin' },
    ]);
    const links = em.getRepository(ClanLinkEntity);
    await links.insert({
      proposerClanId: li.id,
      proposerPersonId: li.founderId!,
      targetClanId: hy.id,
      targetPersonId: hyFounder.id,
      status: 'approved',
      note: '两支同出始迁祖文远公，乾隆初年德衡公分居衡阳',
      decisionNote: '经核对两谱世系一致，同意连谱',
      proposedBy: liAdmin.id,
      decidedBy: hyAdmin.id,
      decidedAt: new Date(),
    });
    await links.insert({
      proposerClanId: ling.id,
      proposerPersonId: lingFounder.id,
      targetClanId: li.id,
      status: 'pending',
      note: '醴陵支谱载始祖文远公自江西泰和迁湘，与湘潭支应为同一人，请核对',
      proposedBy: lingAdmin.id,
    });
  });
  console.log('M5 演示数据完成：衡阳支（已连谱）、醴陵支（待审批）');
  for (const a of Object.values(M5_DEMO_ACCOUNTS)) console.log(`  ${a.displayName}：${a.phone} / ${a.password}`);
}

if (require.main === module) {
  (async () => {
    await AppDataSource.initialize();
    await AppDataSource.runMigrations({ transaction: 'each' });
    await seedM5Demo(AppDataSource);
    await AppDataSource.destroy();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
