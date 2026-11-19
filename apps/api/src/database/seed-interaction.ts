import { EntityManager } from 'typeorm';
import { ClanActivityEntity, ContactCardEntity, PersonEntity, ReminderDateEntity } from '../entities';

/** M4 示例数据：祖先忌日（农历）、活动与公告、通讯录名片 */
export async function seedInteraction(
  em: EntityManager,
  o: { clanId: string; adminId: string; memberId: string; adminPersonId?: string | null },
) {
  const persons = await em.getRepository(PersonEntity).find({ where: { clanId: o.clanId, isLiving: false, isExternal: false }, order: { generation: 'ASC' }, take: 12 });
  const lunar = [
    [3, 3],
    [7, 15],
    [9, 9],
    [10, 1],
    [12, 8],
    [1, 15],
    [4, 8],
    [8, 15],
  ];
  await em.getRepository(ReminderDateEntity).insert(
    persons.slice(0, lunar.length).map((p, i) => ({
      clanId: o.clanId,
      personId: p.id,
      kind: 'death' as const,
      calendar: 'lunar' as const,
      month: lunar[i][0],
      day: lunar[i][1],
      isLeapMonth: false,
      year: p.deathDate ? Number(p.deathDate.slice(0, 4)) : null,
    })),
  );

  const year = new Date().getFullYear();
  const nextQingming = new Date(`${new Date() > new Date(`${year}-04-04`) ? year + 1 : year}-04-04T08:00:00+08:00`);
  const acts = em.getRepository(ClanActivityEntity);
  await acts.insert([
    {
      clanId: o.clanId,
      kind: 'activity',
      category: 'qingming',
      title: '清明祭祖：白石铺祖茔集体祭扫',
      content: '敬请各房族人携家眷参加。\n早 8 时在祠堂集合，统一前往祖茔祭扫，午间祠堂聚餐。\n祭品由族中统一采购，自愿随礼。',
      location: '湘潭白石铺李氏宗祠',
      startAt: nextQingming,
      endAt: new Date(nextQingming.getTime() + 8 * 3600_000),
      signupDeadline: new Date(nextQingming.getTime() - 3 * 86400_000),
      maxParticipants: 200,
      allowSignup: true,
      pinned: true,
      checkinCode: '202404',
      createdBy: o.adminId,
    },
    {
      clanId: o.clanId,
      kind: 'activity',
      category: 'xiupu',
      title: '第五次续修族谱资料征集',
      content: '请各房于年底前提交新增人口、婚嫁、迁居信息，可直接联系家族管理员。',
      location: '线上 / 宗祠',
      startAt: new Date(Date.now() + 20 * 86400_000),
      endAt: new Date(Date.now() + 80 * 86400_000),
      allowSignup: true,
      checkinCode: '518888',
      createdBy: o.adminId,
    },
    {
      clanId: o.clanId,
      kind: 'announcement',
      category: 'other',
      title: '关于启用族谱小程序的通知',
      content: '族谱已上线微信小程序，族人可用微信一键登录查看五代树、亲属关系，并接收生日、忌日与活动提醒。',
      allowSignup: false,
      createdBy: o.adminId,
    },
  ]);

  await em.getRepository(ContactCardEntity).insert([
    {
      clanId: o.clanId,
      userId: o.adminId,
      fields: { phone: '13900000001', wechatId: 'li_zupu_admin', city: '湖南湘潭', work: '李氏宗亲理事会' },
      visibility: { phone: 'members', wechatId: 'members', city: 'members', work: 'members' },
    },
    {
      clanId: o.clanId,
      userId: o.memberId,
      fields: { phone: '13900000002', city: '广东深圳', work: '某科技公司', address: '深圳市南山区（示例）' },
      visibility: { phone: 'admins', city: 'members', work: 'members', address: 'private' },
    },
  ]);
}
