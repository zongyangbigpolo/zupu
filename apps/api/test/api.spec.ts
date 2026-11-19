import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { DEMO_ACCOUNTS, seed } from '../src/database/seed';

describe('族谱 API（e2e，基于种子数据）', () => {
  let app: INestApplication;
  let http: any;
  let ids: NonNullable<Awaited<ReturnType<typeof seed>>>;
  const tokens: Record<string, string> = {};
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(mod.createNestApplication());
    await app.init();
    http = app.getHttpServer();
    ids = (await seed(app.get(DataSource), { reset: true }))!;
    for (const [k, a] of Object.entries(DEMO_ACCOUNTS)) {
      const r = await request(http).post('/api/auth/login').send({ account: a.phone, password: a.password }).expect(201);
      tokens[k] = r.body.token;
    }
  });
  afterAll(() => app.close());

  describe('认证', () => {
    it('密码错误返回 401', () =>
      request(http).post('/api/auth/login').send({ account: '13800000000', password: 'x' }).expect(401));
    it('me', async () => {
      const r = await request(http).get('/api/auth/me').set(auth('superAdmin')).expect(200);
      expect(r.body.isSuperAdmin).toBe(true);
    });
  });

  describe('多家族隔离与权限', () => {
    it('李氏管理员看不到王氏家族', async () => {
      await request(http).get(`/api/clans/${ids.wangClanId}`).set(auth('liAdmin')).expect(403);
      await request(http).get(`/api/clans/${ids.wangClanId}/persons`).set(auth('liAdmin')).expect(403);
      await request(http).post(`/api/clans/${ids.wangClanId}/persons`).set(auth('liAdmin')).send({ surname: '王', givenName: '某' }).expect(403);
      const list = await request(http).get('/api/clans').set(auth('liAdmin')).expect(200);
      expect(list.body.map((c: any) => c.id)).not.toContain(ids.wangClanId);
    });
    it('不能跨家族建立关系', async () => {
      const wangPerson = (await request(http).get(`/api/clans/${ids.wangClanId}/persons`).set(auth('wangAdmin'))).body.items[0];
      await request(http)
        .post(`/api/clans/${ids.liClanId}/parent-child`)
        .set(auth('liAdmin'))
        .send({ parentId: ids.founderId, childId: wangPerson.id })
        .expect(403);
      await request(http).get(`/api/persons/${wangPerson.id}`).set(auth('liAdmin')).expect(403);
      await request(http).get(`/api/persons/${wangPerson.id}/tree`).expect(401);
    });
    it('访客可看公开族谱，私密族谱需登录', async () => {
      await request(http).get(`/api/clans/${ids.liClanId}`).expect(200);
      await request(http).get(`/api/clans/${ids.wangClanId}`).expect(401);
    });
    it('族人只读，不能录入', async () => {
      await request(http).post(`/api/clans/${ids.liClanId}/persons`).set(auth('liMember')).send({ surname: '李', givenName: '某' }).expect(403);
      await request(http).patch(`/api/persons/${ids.founderId}`).set(auth('liMember')).send({ nickname: 'x' }).expect(403);
    });
    it('家族管理员不能访问超级管理员后台', () => request(http).get('/api/admin/clans').set(auth('liAdmin')).expect(403));
    it('隐私：访客看不到在世者出生信息，族人可以', async () => {
      const v = await request(http).get(`/api/persons/${ids.meId}`).expect(200);
      expect(v.body.birthText).toBeNull();
      expect(v.body.hiddenFields).toContain('birthText');
      const m = await request(http).get(`/api/persons/${ids.meId}`).set(auth('liMember')).expect(200);
      expect(m.body.birthText).toBeTruthy();
    });
  });

  describe('超级管理员：建家族、任免管理员', () => {
    it('创建家族并按手机号任命管理员，对方注册后获得权限；更换与撤销', async () => {
      const c = await request(http)
        .post('/api/admin/clans')
        .set(auth('superAdmin'))
        .send({ name: '测试陈氏', surname: '陈', adminPhone: '13700000001' })
        .expect(201);
      expect(c.body.adminActivationCode).toMatch(/^\d{6}$/);
      // 没有激活码不能抢注已被任命的手机号
      await request(http).post('/api/auth/register').send({ phone: '13700000001', password: 'pass123' }).expect(403);
      await request(http).post('/api/auth/register').send({ phone: '13700000001', password: 'pass123', activationCode: '000000' === c.body.adminActivationCode ? '111111' : '000000' }).expect(403);
      const reg = await request(http)
        .post('/api/auth/register')
        .send({ phone: '13700000001', password: 'pass123', activationCode: c.body.adminActivationCode })
        .expect(201);
      const t1 = { Authorization: `Bearer ${reg.body.token}` };
      await request(http).patch(`/api/clans/${c.body.id}`).set(t1).send({ hallName: '颍川堂' }).expect(200);
      await request(http).get(`/api/clans/${ids.liClanId}/members`).set(t1).expect(403);

      const rep = await request(http).put(`/api/admin/clans/${c.body.id}/admins`).set(auth('superAdmin')).send({ phone: '13700000002' }).expect(200);
      expect(rep.body.phone).toBe('13700000002');
      const admins = await request(http).get(`/api/admin/clans/${c.body.id}/admins`).set(auth('superAdmin')).expect(200);
      expect(admins.body.map((a: any) => a.phone)).toEqual(['13700000002']);
      await request(http).patch(`/api/clans/${c.body.id}`).set(t1).send({ hallName: 'x' }).expect(403);

      await request(http).delete(`/api/admin/clans/${c.body.id}/admins/${rep.body.userId}`).set(auth('superAdmin')).expect(200);
      expect((await request(http).get(`/api/admin/clans/${c.body.id}/admins`).set(auth('superAdmin'))).body).toEqual([]);

      await request(http).patch(`/api/admin/clans/${c.body.id}`).set(auth('superAdmin')).send({ status: 'disabled' }).expect(200);
      await request(http).get(`/api/clans/${c.body.id}`).set(t1).expect(404);
      const logs = await request(http).get(`/api/admin/audit-logs?clanId=${c.body.id}`).set(auth('superAdmin')).expect(200);
      expect(logs.body.items.map((l: any) => l.action)).toEqual(expect.arrayContaining(['appoint-admin', 'revoke-admin', 'disable']));
    });
  });

  describe('五代树', () => {
    it('以"我"为中心向上五代', async () => {
      const r = await request(http).get(`/api/persons/${ids.meId}/tree?up=5&down=5`).set(auth('liMember')).expect(200);
      const depths = r.body.nodes.filter((n: any) => n.role === 'ancestor').map((n: any) => n.depth);
      expect(Math.min(...depths)).toBe(-5);
      expect(r.body.nodes.find((n: any) => n.role === 'center').id).toBe(ids.meId);
    });
    it('始祖向下五代，含配偶', async () => {
      const r = await request(http).get(`/api/persons/${ids.founderId}/tree?up=5&down=5`).expect(200);
      const desc = r.body.nodes.filter((n: any) => n.role === 'descendant');
      expect(Math.max(...desc.map((n: any) => n.depth))).toBe(5);
      expect(r.body.nodes.some((n: any) => n.role === 'spouse')).toBe(true);
      expect(r.body.nodes.some((n: any) => n.hasMoreDown)).toBe(true);
    });
    it('过继：主线挂嗣父，生父线挂生父', async () => {
      const main = await request(http).get(`/api/persons/${ids.heirId}/tree?up=1&down=0&line=main`).expect(200);
      const birth = await request(http).get(`/api/persons/${ids.heirId}/tree?up=1&down=0&line=birth`).expect(200);
      const fatherOf = (b: any) => b.nodes.find((n: any) => n.depth === -1 && n.gender === 'male').id;
      expect(fatherOf(main.body)).not.toBe(fatherOf(birth.body));
    });
  });

  describe('亲属关系', () => {
    it('我与始祖', async () => {
      const r = await request(http).get(`/api/clans/${ids.liClanId}/kinship?from=${ids.meId}&to=${ids.founderId}`).expect(200);
      expect(r.body.connected).toBe(true);
      expect(r.body.generationDiff).toBe(11);
      expect(r.body.termAtoB).toBeTruthy();
    });
    it('过继子与生父仍可算出关系', async () => {
      const t = await request(http).get(`/api/persons/${ids.heirId}`).expect(200);
      const bio = t.body.parents.find((p: any) => !p.isMainLine);
      expect(bio.relationType).toBe('biological');
      const r = await request(http).get(`/api/clans/${ids.liClanId}/kinship?from=${ids.heirId}&to=${bio.person.id}`).expect(200);
      expect(r.body.connected).toBe(true);
      expect(r.body.steps).toHaveLength(1);
    });
    it('女儿的后代可计算表亲关系', async () => {
      const d = await request(http).get(`/api/persons/${ids.daughterId}`).expect(200);
      const child = d.body.children[0].person;
      const brother = d.body.parents[0].person;
      const r = await request(http).get(`/api/clans/${ids.liClanId}/kinship?from=${child.id}&to=${brother.id}`).expect(200);
      expect(r.body.chainText).toBe('母亲的父亲');
      expect(r.body.termAtoB).toBe('外公');
    });
    it('不能跨家族查询', () =>
      request(http).get(`/api/clans/${ids.wangClanId}/kinship?from=${ids.meId}&to=${ids.founderId}`).set(auth('wangAdmin')).expect(404));
  });

  describe('录入：字辈推算、重名消歧、审计', () => {
    it('按父亲自动推算世代与字辈', async () => {
      const r = await request(http)
        .post(`/api/clans/${ids.liClanId}/persons`)
        .set(auth('liAdmin'))
        .send({ surname: '李', givenName: '德新', gender: 'male', parents: [{ parentId: ids.founderId }] })
        .expect(201);
      expect(r.body.person.generation).toBe(2);
      expect(r.body.person.generationChar).toBe('德');
      expect(r.body.warnings).toEqual([]);
      const bad = await request(http)
        .post(`/api/clans/${ids.liClanId}/persons`)
        .set(auth('liAdmin'))
        .send({ surname: '李', givenName: '某某', gender: 'male', generation: 4, generationChar: '光', parents: [{ parentId: ids.founderId }] })
        .expect(201);
      expect(bad.body.warnings.length).toBeGreaterThanOrEqual(2);
      const logs = await request(http).get(`/api/clans/${ids.liClanId}/audit-logs`).set(auth('liAdmin')).expect(200);
      expect(logs.body.items[0].entity).toBe('person');
    });
    it('重名消歧', async () => {
      const r = await request(http).get(`/api/clans/${ids.liClanId}/persons?q=光明`).expect(200);
      expect(r.body.items.length).toBe(2);
      expect(r.body.items[0].sameNameCount).toBe(2);
      expect(r.body.items[0].disambiguation).toMatch(/^第3世·父李德/);
      expect(r.body.items[0].disambiguation).not.toBe(r.body.items[1].disambiguation);
    });
    it('字辈校验接口', async () => {
      const r = await request(http)
        .post(`/api/clans/${ids.liClanId}/generation-check`)
        .send({ parentIds: [ids.founderId], givenName: '德华' })
        .expect(201);
      expect(r.body).toMatchObject({ suggestedGeneration: 2, suggestedGenerationChar: '德', warnings: [] });
    });
  });

  describe('多媒体与 AI 预留', () => {
    it('上传照片并通过签名地址访问', async () => {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      const up = await request(http)
        .post(`/api/persons/${ids.founderId}/media`)
        .set(auth('liAdmin'))
        .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
        .expect(201);
      expect(up.body.type).toBe('photo');
      const f = await request(http).get(up.body.url).expect(200);
      expect(f.headers['content-type']).toBe('image/png');
      await request(http).get(up.body.url.replace(/sig=\w+/, 'sig=bad')).expect(403);
    });
    it('AI 接口返回"敬请期待"', async () => {
      const r = await request(http).post(`/api/ai/persons/${ids.founderId}/biography`).set(auth('liAdmin')).expect(501);
      expect(r.body.message).toContain('敬请期待');
    });
  });
});
