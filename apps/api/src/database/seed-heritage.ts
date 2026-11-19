import { EntityManager } from 'typeorm';
import { ClanDocumentEntity, MemorialMessageEntity, OralHistoryEntity, PersonEntity } from '../entities';

/** M2 示例数据：家训 / 谱序 / 凡例、口述历史（文字稿）、纪念馆留言与献花 */
export async function seedHeritage(em: EntityManager, o: { clanId: string; founderId: string; adminUserId: string; memberUserId: string }) {
  const docs = em.getRepository(ClanDocumentEntity);
  await docs.insert([
    {
      clanId: o.clanId,
      kind: 'family_rules',
      title: '李氏家训十则',
      vertical: true,
      sortOrder: 1,
      createdBy: o.adminUserId,
      content:
        '<p>一曰孝父母。父母之恩，昊天罔极，晨昏定省，毋违其志。</p><p>二曰友兄弟。手足同气，毋以财利伤和。</p><p>三曰勤耕读。耕以养身，读以明理，二者不可偏废。</p><p>四曰睦宗族。同宗共祖，患难相恤，喜庆相贺。</p><p>五曰端品行。立身以诚，处世以忍，毋作非为。</p><p>六曰崇节俭。一粥一饭，当思来处不易。</p><p>七曰慎交游。近君子，远小人。</p><p>八曰重祭祀。春秋祭扫，毋忘根本。</p><p>九曰守法度。遵国法，完赋税。</p><p>十曰勉后学。子孙虽愚，经书不可不读。</p>',
    },
    {
      clanId: o.clanId,
      kind: 'preface',
      title: '重修族谱序',
      vertical: true,
      sortOrder: 2,
      createdBy: o.adminUserId,
      content:
        '<p>尝闻国有史，邑有志，家有谱，其义一也。吾李氏自陇西发祥，支分派衍，散处四方。始迁祖文远公于康熙年间自江西泰和迁湘潭白石铺，筚路蓝缕，以启山林。</p><p>今族人繁衍，散居各地，恐世远年湮，昭穆失序，爰集族众，重修斯谱，俾后之子孙知所自出，敦本睦族，世守勿替云尔。</p><p>（示例文字，人物均为虚构）</p>',
    },
    {
      clanId: o.clanId,
      kind: 'conventions',
      title: '凡例',
      vertical: false,
      sortOrder: 3,
      createdBy: o.adminUserId,
      content:
        '<ul><li>本谱以始迁祖文远公为第一世，依字辈诗排行。</li><li>女儿及其后代有资料者一并入谱。</li><li>过继、兼祧者，于本生、所后两处互注。</li><li>生卒年月，古代以年号纪年为准，并附公历以便检索。</li><li>在世族人之生日、住址等，仅本族族人可见。</li></ul>',
    },
  ]);

  const founder = await em.getRepository(PersonEntity).findOne({ where: { id: o.founderId } });
  await em.getRepository(OralHistoryEntity).insert({
    clanId: o.clanId,
    personId: o.founderId,
    title: '老辈人讲文远公迁湘的故事',
    narrator: '李德厚（族中长辈）',
    recordedText: '2019年清明',
    transcript:
      `听我爷爷讲，${founder?.surname ?? '李'}${founder?.givenName ?? '文远'}公当年是挑着一担书、一担种子从江西过来的。走了一个多月，到白石铺看到这里有山有水，就落了脚。头几年开荒种地，后来才盖起祠堂……（示例文字整理稿）`,
    createdBy: o.adminUserId,
  });

  await em.getRepository(MemorialMessageEntity).insert([
    { clanId: o.clanId, personId: o.founderId, userId: o.memberUserId, content: '先祖筚路蓝缕，泽被后世。后辈谨记家训，不忘根本。' },
    { clanId: o.clanId, personId: o.founderId, userId: o.adminUserId, content: '清明将至，谨以此文告慰先祖：本支已传十三世，人丁兴旺。' },
  ]);
  await em.query(
    `INSERT INTO memorial_tribute (clan_id, person_id, user_id, kind, tribute_day) VALUES
       ($1,$2,$3,'flower', CURRENT_DATE - 1), ($1,$2,$4,'flower', CURRENT_DATE - 1), ($1,$2,$3,'candle', CURRENT_DATE - 2)`,
    [o.clanId, o.founderId, o.adminUserId, o.memberUserId],
  );
}
