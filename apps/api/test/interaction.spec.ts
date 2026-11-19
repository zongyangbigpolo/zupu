import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { DEMO_ACCOUNTS, seed } from '../src/database/seed';
import { annualDateText, cnToday, nextOccurrence } from '../src/modules/reminders/calendar';
import { WechatService } from '../src/modules/wechat/wechat';

describe('农历 / 公历纪念日换算', () => {
  it('农历转公历：2026 年中秋为 9 月 25 日', () => {
    expect(nextOccurrence({ calendar: 'lunar', month: 8, day: 15 }, '2026-01-01').date).toBe('2026-09-25');
    expect(nextOccurrence({ calendar: 'lunar', month: 8, day: 15 }, '2026-09-26').date).toBe('2027-09-15');
  });
  it('农历年末日期会跨到次年公历', () => {
    // 2026 年腊月初八 = 2027-01-15
    expect(nextOccurrence({ calendar: 'lunar', month: 12, day: 8 }, '2026-11-19').date).toBe('2027-01-15');
  });
  it('闰月：有闰月的年份过闰月，否则过正常月份；小月三十按廿九', () => {
    // 2025 年闰六月初一 = 2025-07-25；2026 年无闰六月 → 六月初一 = 2026-07-14
    expect(nextOccurrence({ calendar: 'lunar', month: 6, day: 1, isLeapMonth: true }, '2025-07-01').date).toBe('2025-07-25');
    expect(nextOccurrence({ calendar: 'lunar', month: 6, day: 1, isLeapMonth: true }, '2026-01-01').date).toBe('2026-07-14');
    const d = nextOccurrence({ calendar: 'lunar', month: 12, day: 30 }, '2025-06-01').date;
    expect(d).toMatch(/^2026-02-1[67]$/);
  });
  it('公历 2 月 29 日在平年按 2 月 28 日', () => {
    expect(nextOccurrence({ calendar: 'solar', month: 2, day: 29 }, '2026-01-01').date).toBe('2026-02-28');
    expect(nextOccurrence({ calendar: 'solar', month: 2, day: 29 }, '2027-03-01').date).toBe('2028-02-29');
  });
  it('称谓文本', () => {
    expect(annualDateText({ calendar: 'lunar', month: 1, day: 15 })).toBe('农历正月十五');
    expect(annualDateText({ calendar: 'lunar', month: 4, day: 8, isLeapMonth: true })).toBe('农历闰四月初八');
    expect(annualDateText({ calendar: 'lunar', month: 12, day: 20 })).toBe('农历腊月二十');
    expect(annualDateText({ calendar: 'solar', month: 9, day: 3 })).toBe('公历9月3日');
  });
});

describe('M4 小程序与互动（e2e）', () => {
  let app: INestApplication;
  let http: any;
  let ids: NonNullable<Awaited<ReturnType<typeof seed>>>;
  let wechat: WechatService;
  const tokens: Record<string, string> = {};
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(mod.createNestApplication());
    await app.init();
    http = app.getHttpServer();
    wechat = app.get(WechatService, { strict: false });
    ids = (await seed(app.get(DataSource), { reset: true }))!;
    for (const [k, a] of Object.entries(DEMO_ACCOUNTS)) {
      const r = await request(http).post('/api/auth/login').send({ account: a.phone, password: a.password }).expect(201);
      tokens[k] = r.body.token;
    }
  });
  afterAll(() => app.close());

  describe('微信登录（模拟 code2session）', () => {
    it('未绑定 → 绑定已有账号（手机号+密码）→ 之后一键登录', async () => {
      const r1 = await request(http).post('/api/auth/wechat/login').send({ code: 'member' }).expect(201);
      expect(r1.body.status).toBe('need_bind');
      // 绑定令牌不能当作登录令牌
      await request(http).get('/api/auth/me').set({ Authorization: `Bearer ${r1.body.bindToken}` }).expect(401);
      await request(http)
        .post('/api/auth/wechat/bind')
        .send({ bindToken: r1.body.bindToken, phone: DEMO_ACCOUNTS.liMember.phone, password: 'wrong' })
        .expect(401);
      const b = await request(http)
        .post('/api/auth/wechat/bind')
        .send({ bindToken: r1.body.bindToken, phone: DEMO_ACCOUNTS.liMember.phone, password: DEMO_ACCOUNTS.liMember.password })
        .expect(201);
      expect(b.body.user.phone).toBe(DEMO_ACCOUNTS.liMember.phone);
      const r2 = await request(http).post('/api/auth/wechat/login').send({ code: 'member' }).expect(201);
      expect(r2.body.status).toBe('ok');
      expect(r2.body.user.id).toBe(b.body.user.id);
      // 同一账号不能再绑另一个微信
      const r3 = await request(http).post('/api/auth/wechat/login').send({ code: 'other' }).expect(201);
      await request(http)
        .post('/api/auth/wechat/bind')
        .send({ bindToken: r3.body.bindToken, phone: DEMO_ACCOUNTS.liMember.phone, password: DEMO_ACCOUNTS.liMember.password })
        .expect(409);
    });

    it('手机号快速验证：新手机号自动建号；管理员预登记的手机号直接激活并获得族人身份', async () => {
      const add = await request(http).post(`/api/clans/${ids.liClanId}/members`).set(auth('liAdmin')).send({ phone: '13600000009' }).expect(201);
      expect(add.body.activationCode).toMatch(/^\d{6}$/);
      const r = await request(http).post('/api/auth/wechat/login').send({ code: 'newbie' }).expect(201);
      await request(http).post('/api/auth/wechat/bind').send({ bindToken: r.body.bindToken, phoneCode: 'bad' }).expect(400);
      const b = await request(http).post('/api/auth/wechat/bind').send({ bindToken: r.body.bindToken, phoneCode: 'mock-phone-13600000009' }).expect(201);
      tokens.newbie = b.body.token;
      const clans = await request(http).get('/api/clans').set(auth('newbie')).expect(200);
      expect(clans.body.find((c: any) => c.id === ids.liClanId)?.myRole).toBe('member');
    });

    it('已登录后绑定当前微信、解绑', async () => {
      await request(http).post('/api/auth/wechat/bind-current').set(auth('liAdmin')).send({ code: 'member' }).expect(409);
      await request(http).post('/api/auth/wechat/bind-current').set(auth('liAdmin')).send({ code: 'admin' }).expect(201);
      expect((await request(http).post('/api/auth/wechat/login').send({ code: 'admin' })).body.status).toBe('ok');
      await request(http).delete('/api/auth/wechat').set(auth('liAdmin')).expect(200);
      expect((await request(http).post('/api/auth/wechat/login').send({ code: 'admin' })).body.status).toBe('need_bind');
    });
  });

  describe('族人通讯录', () => {
    it('按本人设置的可见范围返回字段', async () => {
      // 种子：族人手机仅管理员可见、住址仅自己可见；管理员手机族人可见
      const byAdmin = await request(http).get(`/api/clans/${ids.liClanId}/contacts`).set(auth('liAdmin')).expect(200);
      const memberSeenByAdmin = byAdmin.body.find((c: any) => c.displayName === DEMO_ACCOUNTS.liMember.displayName);
      expect(memberSeenByAdmin.fields.phone).toBe('13900000002');
      expect(memberSeenByAdmin.fields.address).toBeUndefined();
      expect(memberSeenByAdmin.linkedPerson.id).toBe(ids.meId);

      const byNewbie = await request(http).get(`/api/clans/${ids.liClanId}/contacts`).set(auth('newbie')).expect(200);
      const memberSeenByPeer = byNewbie.body.find((c: any) => c.displayName === DEMO_ACCOUNTS.liMember.displayName);
      expect(memberSeenByPeer.fields.phone).toBeUndefined();
      expect(memberSeenByPeer.fields.city).toBe('广东深圳');
      expect(byNewbie.body.find((c: any) => c.role === 'admin').fields.phone).toBe('13900000001');

      const self = await request(http).get(`/api/clans/${ids.liClanId}/contacts`).set(auth('liMember')).expect(200);
      expect(self.body[0].isMe).toBe(true);
      expect(self.body[0].fields.address).toBeTruthy();
    });

    it('本人修改名片与可见范围；非法可见范围按默认处理', async () => {
      const r = await request(http)
        .put(`/api/clans/${ids.liClanId}/contacts/me`)
        .set(auth('newbie'))
        .send({ fields: { phone: ' 13600000009 ', wechatId: 'nb', hacker: 'x' }, visibility: { phone: 'members', wechatId: 'everyone' } })
        .expect(200);
      expect(r.body.fields).toEqual({ phone: '13600000009', wechatId: 'nb' });
      expect(r.body.visibility.wechatId).toBe('members');
      const list = await request(http).get(`/api/clans/${ids.liClanId}/contacts`).set(auth('liMember')).expect(200);
      expect(list.body.find((c: any) => c.fields.wechatId === 'nb').fields.phone).toBe('13600000009');
    });

    it('其他家族、访客、非本族超级管理员都看不到', async () => {
      await request(http).get(`/api/clans/${ids.liClanId}/contacts`).set(auth('wangAdmin')).expect(403);
      await request(http).get(`/api/clans/${ids.liClanId}/contacts`).expect(401);
      await request(http).get(`/api/clans/${ids.liClanId}/contacts`).set(auth('superAdmin')).expect(403);
      await request(http).put(`/api/clans/${ids.wangClanId}/contacts/me`).set(auth('liMember')).send({ fields: {}, visibility: {} }).expect(403);
    });
  });

  describe('活动与公告', () => {
    let actId: string;
    it('仅管理员可发布；发布后通知族人并推送微信订阅消息', async () => {
      await request(http).post('/api/wechat/subscriptions').set(auth('liMember')).send({ templateIds: ['mock-tpl-activity', 'not-allowed'] }).expect(201);
      await request(http).post(`/api/clans/${ids.liClanId}/activities`).set(auth('liMember')).send({ kind: 'activity', title: 'x' }).expect(403);
      await request(http).post(`/api/clans/${ids.liClanId}/activities`).set(auth('wangAdmin')).send({ kind: 'activity', title: 'x' }).expect(403);
      const before = wechat.sentMessages.length;
      const r = await request(http)
        .post(`/api/clans/${ids.liClanId}/activities`)
        .set(auth('liAdmin'))
        .send({ kind: 'activity', category: 'zongqinhui', title: '宗亲联谊会', location: '湘潭', startAt: new Date(Date.now() + 5 * 86400_000).toISOString(), maxParticipants: 3 })
        .expect(201);
      actId = r.body.id;
      expect(r.body.checkinCode).toMatch(/^\d{6}$/);
      const sent = wechat.sentMessages.slice(before);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ openid: 'mock-member', templateId: 'mock-tpl-activity' });
      const n = await request(http).get('/api/notifications?unread=true').set(auth('liMember')).expect(200);
      expect(n.body.items[0]).toMatchObject({ type: 'activity', link: { kind: 'activity', id: actId } });
      expect(n.body.items[0].title).toContain('宗亲联谊会');
      // 额度用完后不再推送
      await request(http).post(`/api/clans/${ids.liClanId}/activities`).set(auth('liAdmin')).send({ kind: 'announcement', title: '公告二' }).expect(201);
      expect(wechat.sentMessages.length).toBe(before + 1);
    });

    it('族人看不到签到码；其他家族不可访问', async () => {
      const list = await request(http).get(`/api/clans/${ids.liClanId}/activities`).set(auth('liMember')).expect(200);
      expect(list.body.items.every((a: any) => a.checkinCode === undefined)).toBe(true);
      await request(http).get(`/api/activities/${actId}`).set(auth('wangAdmin')).expect(403);
      await request(http).get(`/api/clans/${ids.liClanId}/activities`).expect(401);
      await request(http).post(`/api/activities/${actId}/signup`).set(auth('wangAdmin')).send({}).expect(403);
    });

    it('报名（名额限制）、签到码签到、管理员代签到', async () => {
      await request(http).post(`/api/activities/${actId}/signup`).set(auth('liMember')).send({ headcount: 2, note: '带孩子' }).expect(201);
      await request(http).post(`/api/activities/${actId}/signup`).set(auth('newbie')).send({ headcount: 2 }).expect(409);
      await request(http).post(`/api/activities/${actId}/signup`).set(auth('newbie')).send({ headcount: 1 }).expect(201);
      const d = await request(http).get(`/api/activities/${actId}`).set(auth('newbie')).expect(200);
      expect(d.body.headcountTotal).toBe(3);
      expect(d.body.signups.find((s: any) => s.headcount === 2).note).toBeNull();
      const adminView = await request(http).get(`/api/activities/${actId}`).set(auth('liAdmin')).expect(200);
      expect(adminView.body.signups.find((s: any) => s.headcount === 2).note).toBe('带孩子');
      expect(adminView.body.signups.find((s: any) => s.headcount === 2).linkedPersonName).toBeTruthy();

      await request(http).post(`/api/activities/${actId}/checkin`).set(auth('liMember')).send({ code: '000000x' }).expect(403);
      const c = await request(http).post(`/api/activities/${actId}/checkin`).set(auth('liMember')).send({ code: adminView.body.checkinCode }).expect(201);
      expect(c.body.checkedInAt).toBeTruthy();
      await request(http).delete(`/api/activities/${actId}/signup`).set(auth('liMember')).expect(400);
      const newbieId = adminView.body.signups.find((s: any) => s.headcount === 1).userId;
      await request(http).post(`/api/activities/${actId}/signups/${newbieId}/checkin`).set(auth('liMember')).expect(403);
      await request(http).post(`/api/activities/${actId}/signups/${newbieId}/checkin`).set(auth('liAdmin')).expect(201);
      expect((await request(http).get(`/api/activities/${actId}`).set(auth('liAdmin'))).body.checkedInCount).toBe(2);

      await request(http).patch(`/api/activities/${actId}`).set(auth('liAdmin')).send({ status: 'cancelled' }).expect(200);
      await request(http).post(`/api/activities/${actId}/signup`).set(auth('newbie')).send({}).expect(400);
    });
  });

  describe('生日 / 忌日提醒', () => {
    let ancestorId: string;
    beforeAll(async () => {
      const r = await request(http).get(`/api/clans/${ids.liClanId}/persons?generation=3`).set(auth('liAdmin'));
      ancestorId = r.body.items.find((p: any) => !p.isLiving).id;
    });

    it('仅管理员可设置农历忌日，日期校验', async () => {
      await request(http).put(`/api/persons/${ancestorId}/reminder-dates/death`).set(auth('liMember')).send({ calendar: 'lunar', month: 8, day: 15 }).expect(403);
      await request(http).put(`/api/persons/${ancestorId}/reminder-dates/death`).set(auth('liAdmin')).send({ calendar: 'solar', month: 2, day: 30 }).expect(400);
      await request(http).put(`/api/persons/${ancestorId}/reminder-dates/death`).set(auth('wangAdmin')).send({ calendar: 'lunar', month: 8, day: 15 }).expect(403);
      const r = await request(http).put(`/api/persons/${ancestorId}/reminder-dates/death`).set(auth('liAdmin')).send({ calendar: 'lunar', month: 8, day: 15, year: 1800 }).expect(200);
      expect(r.body.text).toBe('农历八月十五');
      const list = await request(http).get(`/api/persons/${ancestorId}/reminder-dates`).set(auth('liMember')).expect(200);
      expect(list.body.find((d: any) => d.kind === 'death').source).toBe('manual');
    });

    it('定时任务：当天与提前 N 天提醒，幂等；按偏好与微信额度推送', async () => {
      await request(http).post('/api/wechat/subscriptions').set(auth('liMember')).send({ templateIds: ['mock-tpl-reminder'] }).expect(201);
      const pref = await request(http).put(`/api/clans/${ids.liClanId}/reminder-pref`).set(auth('liMember')).send({ daysBefore: 3 }).expect(200);
      expect(pref.body).toMatchObject({ daysBefore: 3, wechatBound: true, wechatQuota: { reminder: 1 } });
      await request(http).put(`/api/clans/${ids.liClanId}/reminder-pref`).set(auth('liMember')).send({ daysBefore: 30 }).expect(400);
      await request(http).post('/api/admin/reminders/run').set(auth('liAdmin')).send({}).expect(403);

      // 2026-09-22 = 农历八月十二：中秋前 3 天
      const before = wechat.sentMessages.length;
      await request(http).post('/api/admin/reminders/run').set(auth('superAdmin')).send({ date: '2026-09-22' }).expect(201);
      const sent = wechat.sentMessages.slice(before).filter((m) => m.templateId === 'mock-tpl-reminder');
      expect(sent.length).toBe(1);
      expect(sent[0].data.date2.value).toBe('2026-09-25');
      const n1 = await request(http).get('/api/notifications?pageSize=100').set(auth('liMember')).expect(200);
      const early = n1.body.items.find((x: any) => x.type === 'reminder' && x.link.id === ancestorId);
      expect(early.title).toContain('3 天后（2026-09-25）');
      expect(early.body).toContain('逝世 226 周年');

      const r1 = await request(http).post('/api/admin/reminders/run').set(auth('superAdmin')).send({ date: '2026-09-25' }).expect(201);
      expect(r1.body.notifications).toBeGreaterThan(0);
      const r2 = await request(http).post('/api/admin/reminders/run').set(auth('superAdmin')).send({ date: '2026-09-25' }).expect(201);
      expect(r2.body.notifications).toBe(0);
      const n2 = await request(http).get('/api/notifications?pageSize=100').set(auth('liMember')).expect(200);
      expect(n2.body.items.some((x: any) => x.title.startsWith('今天是') && x.link?.id === ancestorId)).toBe(true);
      // 管理员（提前 1 天）也收到当天提醒，但不会收到提前 3 天的那条
      const na = await request(http).get('/api/notifications?pageSize=100').set(auth('liAdmin')).expect(200);
      const forAncestor = na.body.items.filter((x: any) => x.link?.id === ancestorId);
      expect(forAncestor.map((x: any) => x.title.slice(0, 3))).toEqual(['今天是']);
    });

    it('关闭忌日提醒后不再收到；他人不能读写我的通知', async () => {
      await request(http).put(`/api/clans/${ids.liClanId}/reminder-pref`).set(auth('newbie')).send({ deathAnniversary: false }).expect(200);
      await request(http).post('/api/admin/reminders/run').set(auth('superAdmin')).send({ date: '2027-09-15' }).expect(201);
      const is2027 = (x: any) => x.type === 'reminder' && x.link?.id === ancestorId && x.body.includes('227');
      const n = await request(http).get('/api/notifications?pageSize=100').set(auth('newbie')).expect(200);
      expect(n.body.items.filter(is2027)).toHaveLength(0);
      const ctrl = await request(http).get('/api/notifications?pageSize=100').set(auth('liMember')).expect(200);
      expect(ctrl.body.items.filter(is2027)).toHaveLength(1);

      const mine = await request(http).get('/api/notifications').set(auth('liMember')).expect(200);
      const id = mine.body.items[0].id;
      await request(http).post(`/api/notifications/${id}/read`).set(auth('newbie')).expect(404);
      await request(http).post(`/api/notifications/${id}/read`).set(auth('liMember')).expect(201);
      const cnt = (await request(http).get('/api/notifications/unread-count').set(auth('liMember'))).body.count;
      await request(http).post('/api/notifications/read-all').set(auth('liMember')).expect(201);
      expect(cnt).toBeGreaterThan(0);
      expect((await request(http).get('/api/notifications/unread-count').set(auth('liMember'))).body.count).toBe(0);
    });

    it('即将到来的生日与忌日（族人可见，访客不可）', async () => {
      const today = cnToday();
      const [, m, d] = today.split('-').map(Number);
      await request(http).put(`/api/persons/${ancestorId}/reminder-dates/death`).set(auth('liAdmin')).send({ calendar: 'solar', month: m, day: d }).expect(200);
      const r = await request(http).get(`/api/clans/${ids.liClanId}/reminders/upcoming?days=7`).set(auth('liMember')).expect(200);
      expect(r.body.find((x: any) => x.person.id === ancestorId)).toMatchObject({ daysLeft: 0, kind: 'death', nextDate: today });
      await request(http).get(`/api/clans/${ids.liClanId}/reminders/upcoming`).expect(401);
      await request(http).get(`/api/clans/${ids.liClanId}/reminders/upcoming`).set(auth('wangAdmin')).expect(403);
    });
  });
});
