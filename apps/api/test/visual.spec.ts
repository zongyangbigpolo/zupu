import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { DEMO_ACCOUNTS, seed } from '../src/database/seed';
import { mapConfig } from '../src/modules/visual/visual.module';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('M3 可视化 API', () => {
  let app: INestApplication;
  let http: any;
  let ids: NonNullable<Awaited<ReturnType<typeof seed>>>;
  const tokens: Record<string, string> = {};
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  let wangPersonId: string;

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
    wangPersonId = (await request(http).get(`/api/clans/${ids.wangClanId}/persons`).set(auth('wangAdmin'))).body.items[0].id;
  });
  afterAll(() => app.close());

  it('地图配置：未配置 key 时使用离线地图；配置后返回高德/腾讯', async () => {
    const r = await request(http).get('/api/maps/config').expect(200);
    expect(r.body.provider).toBe('offline');
    expect(mapConfig({ AMAP_KEY: 'k', AMAP_SECURITY_CODE: 's' })).toEqual({ provider: 'amap', key: 'k', securityJsCode: 's' });
    expect(mapConfig({ AMAP_KEY: 'k', TMAP_KEY: 't', MAP_PROVIDER: 'tencent' }).provider).toBe('tencent');
  });

  describe('迁徙记录', () => {
    it('公开族谱访客可看，在世者的行踪仅族人可见', async () => {
      const v = await request(http).get(`/api/clans/${ids.liClanId}/migrations`).expect(200);
      expect(v.body.find((m: any) => m.year === 1684).personId).toBe(ids.founderId);
      const mem = await request(http).get(`/api/clans/${ids.liClanId}/migrations`).set(auth('liMember')).expect(200);
      expect(mem.body.length).toBeGreaterThan(v.body.length);
      await request(http).get(`/api/clans/${ids.wangClanId}/migrations`).expect(401);
      await request(http).get(`/api/clans/${ids.wangClanId}/migrations`).set(auth('liAdmin')).expect(403);
    });

    it('按支系筛选：只含该支后代', async () => {
      const all = (await request(http).get(`/api/clans/${ids.liClanId}/migrations`).set(auth('liAdmin'))).body;
      const branch = (await request(http).get(`/api/clans/${ids.liClanId}/migrations?branchRootId=${ids.founderId}`).set(auth('liAdmin'))).body;
      expect(branch.length).toBe(all.filter((m: any) => m.personId).length);
      await request(http).get(`/api/clans/${ids.liClanId}/migrations?branchRootId=${wangPersonId}`).set(auth('liAdmin')).expect(403);
    });

    it('仅本族管理员可录入/修改/删除，不能关联他族人员', async () => {
      const body = { personId: ids.meId, fromPlace: '深圳', fromLng: 114.05, fromLat: 22.54, toPlace: '北京', toLng: 116.4, toLat: 39.9, date: '2020-03-01', reason: '工作' };
      await request(http).post(`/api/clans/${ids.liClanId}/migrations`).set(auth('liMember')).send(body).expect(403);
      await request(http).post(`/api/clans/${ids.liClanId}/migrations`).set(auth('wangAdmin')).send(body).expect(403);
      await request(http).post(`/api/clans/${ids.liClanId}/migrations`).set(auth('liAdmin')).send({ ...body, personId: wangPersonId }).expect(403);
      await request(http).post(`/api/clans/${ids.liClanId}/migrations`).set(auth('liAdmin')).send({ ...body, toLat: null }).expect(400);
      const r = await request(http).post(`/api/clans/${ids.liClanId}/migrations`).set(auth('liAdmin')).send(body).expect(201);
      expect(r.body.year).toBe(2020);
      expect(r.body.to).toEqual({ name: '北京', lng: 116.4, lat: 39.9 });
      await request(http).patch(`/api/migrations/${r.body.id}`).set(auth('wangAdmin')).send({ reason: 'x' }).expect(403);
      const u = await request(http).patch(`/api/migrations/${r.body.id}`).set(auth('liAdmin')).send({ year: 2021, branchName: '长房' }).expect(200);
      expect(u.body.year).toBe(2021);
      await request(http).delete(`/api/migrations/${r.body.id}`).set(auth('liMember')).expect(403);
      await request(http).delete(`/api/migrations/${r.body.id}`).set(auth('liAdmin')).expect(200);
      const logs = (await request(http).get(`/api/clans/${ids.liClanId}/audit-logs`).set(auth('liAdmin'))).body.items;
      expect(logs.some((l: any) => l.entity === 'migration_record' && l.action === 'delete')).toBe(true);
    });
  });

  describe('祠堂 / 祖坟 / 祖屋', () => {
    it('列表含关联人物，按类型筛选', async () => {
      const r = await request(http).get(`/api/clans/${ids.liClanId}/sites`).expect(200);
      expect(r.body.map((s: any) => s.type)).toEqual(expect.arrayContaining(['ancestral_hall', 'tomb', 'ancestral_house']));
      expect(r.body.find((s: any) => s.type === 'tomb').persons.map((p: any) => p.id)).toContain(ids.founderId);
      const t = await request(http).get(`/api/clans/${ids.liClanId}/sites?type=tomb`).expect(200);
      expect(t.body.every((s: any) => s.type === 'tomb')).toBe(true);
      const wangSite = (await request(http).get(`/api/clans/${ids.wangClanId}/sites`).set(auth('wangAdmin'))).body[0];
      await request(http).get(`/api/sites/${wangSite.id}`).set(auth('liAdmin')).expect(403);
    });

    it('管理员录入地点、关联人物、上传照片；族人与他族不可写', async () => {
      const body = { type: 'tomb', name: '测试墓', lng: 112.7, lat: 27.6, personIds: [ids.founderId] };
      await request(http).post(`/api/clans/${ids.liClanId}/sites`).set(auth('liMember')).send(body).expect(403);
      await request(http).post(`/api/clans/${ids.liClanId}/sites`).set(auth('liAdmin')).send({ ...body, personIds: [wangPersonId] }).expect(403);
      await request(http).post(`/api/clans/${ids.liClanId}/sites`).set(auth('liAdmin')).send({ ...body, type: 'castle' }).expect(400);
      const s = await request(http).post(`/api/clans/${ids.liClanId}/sites`).set(auth('liAdmin')).send(body).expect(201);
      expect(s.body.persons[0].id).toBe(ids.founderId);
      await request(http).post(`/api/sites/${s.body.id}/photos`).set(auth('liMember')).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' }).expect(403);
      await request(http).post(`/api/sites/${s.body.id}/photos`).set(auth('liAdmin')).attach('file', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' }).expect(400);
      const ph = await request(http).post(`/api/sites/${s.body.id}/photos`).set(auth('liAdmin')).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' }).expect(201);
      expect(ph.body.url).toMatch(/^\/api\/site-photos\//);
      const img = await request(http).get(ph.body.url).expect(200);
      expect(img.headers['content-type']).toBe('image/png');
      await request(http).get(ph.body.url.replace(/sig=[0-9a-f]+/, 'sig=bad')).expect(403);
      const u = await request(http).patch(`/api/sites/${s.body.id}`).set(auth('liAdmin')).send({ personIds: [], name: '改名' }).expect(200);
      expect(u.body.persons).toEqual([]);
      expect(u.body.photos).toHaveLength(1);
      await request(http).delete(`/api/site-photos/${ph.body.id}`).set(auth('wangAdmin')).expect(403);
      await request(http).delete(`/api/sites/${s.body.id}`).set(auth('wangAdmin')).expect(403);
      await request(http).delete(`/api/sites/${s.body.id}`).set(auth('liAdmin')).expect(200);
      await request(http).get(`/api/sites/${s.body.id}`).set(auth('liAdmin')).expect(404);
    });
  });

  describe('家族时间轴与大事记', () => {
    it('时间轴合并大事记、人物事迹、迁徙，按年份排序', async () => {
      const r = await request(http).get(`/api/clans/${ids.liClanId}/timeline`).expect(200);
      const kinds = new Set(r.body.items.map((i: any) => i.kind));
      expect([...kinds]).toEqual(expect.arrayContaining(['chronicle', 'event', 'migration']));
      const years = r.body.items.map((i: any) => i.year);
      expect(years).toEqual([...years].sort((a, b) => a - b));
      expect(kinds.has('birth')).toBe(false);
    });

    it('按人物筛选时包含生卒；不能筛选他族人物', async () => {
      const r = await request(http).get(`/api/clans/${ids.liClanId}/timeline?personId=${ids.founderId}`).expect(200);
      expect(r.body.items.some((i: any) => i.kind === 'birth' && i.personId === ids.founderId)).toBe(true);
      expect(r.body.items.filter((i: any) => i.personId).every((i: any) => i.personId === ids.founderId)).toBe(true);
      await request(http).get(`/api/clans/${ids.liClanId}/timeline?personId=${wangPersonId}`).set(auth('liAdmin')).expect(403);
      await request(http).get(`/api/clans/${ids.wangClanId}/timeline`).set(auth('liAdmin')).expect(403);
    });

    it('访客看不到在世者的生日', async () => {
      const v = await request(http).get(`/api/clans/${ids.liClanId}/timeline?personId=${ids.meId}`).expect(200);
      expect(v.body.items.some((i: any) => i.kind === 'birth')).toBe(false);
      const m = await request(http).get(`/api/clans/${ids.liClanId}/timeline?personId=${ids.meId}`).set(auth('liMember')).expect(200);
      expect(m.body.items.some((i: any) => i.kind === 'birth')).toBe(true);
    });

    it('大事记仅管理员可写', async () => {
      await request(http).post(`/api/clans/${ids.liClanId}/chronicles`).set(auth('liMember')).send({ title: 'x', year: 2000 }).expect(403);
      const c = await request(http).post(`/api/clans/${ids.liClanId}/chronicles`).set(auth('liAdmin')).send({ title: '六修族谱', date: '2025-04-05' }).expect(201);
      expect(c.body.year).toBe(2025);
      await request(http).patch(`/api/chronicles/${c.body.id}`).set(auth('wangAdmin')).send({ title: 'x' }).expect(403);
      await request(http).delete(`/api/chronicles/${c.body.id}`).set(auth('liAdmin')).expect(200);
    });
  });

  describe('吊线谱', () => {
    it('以始祖为根取 5 世，沿主线、每人一次', async () => {
      const r = await request(http).get(`/api/clans/${ids.liClanId}/pedigree?rootId=${ids.founderId}&generations=5`).expect(200);
      const gens = r.body.persons.map((p: any) => p.generation);
      expect(Math.min(...gens)).toBe(1);
      expect(Math.max(...gens)).toBe(5);
      expect(new Set(r.body.persons.map((p: any) => p.id)).size).toBe(r.body.persons.length);
      expect(r.body.persons.find((p: any) => p.id === ids.founderId).spouses[0]).toMatch(/^配/);
      const noDaughters = await request(http).get(`/api/clans/${ids.liClanId}/pedigree?rootId=${ids.founderId}&generations=5&daughters=false`).expect(200);
      expect(noDaughters.body.persons.every((p: any) => p.gender !== 'female')).toBe(true);
    });

    it('过继子挂在嗣父下', async () => {
      const r = await request(http).get(`/api/clans/${ids.liClanId}/pedigree?rootId=${ids.founderId}&generations=8`).set(auth('liAdmin')).expect(200);
      const heir = r.body.persons.find((p: any) => p.id === ids.heirId);
      expect(heir.relationType).toBe('heir');
    });

    it('隐私与隔离', async () => {
      const v = await request(http).get(`/api/clans/${ids.liClanId}/pedigree?rootId=${ids.founderId}&generations=13`).expect(200);
      expect(v.body.persons.filter((p: any) => p.isLiving).every((p: any) => p.birthText === null)).toBe(true);
      await request(http).get(`/api/clans/${ids.liClanId}/pedigree?rootId=${wangPersonId}`).set(auth('liAdmin')).expect(403);
      await request(http).get(`/api/clans/${ids.wangClanId}/pedigree?rootId=${wangPersonId}`).expect(401);
      await request(http).get(`/api/clans/${ids.liClanId}/pedigree?rootId=${ids.founderId}&generations=99`).expect(400);
    });

    it('导出 PDF（欧式/苏式）', async () => {
      for (const style of ['ou', 'su']) {
        const r = await request(http)
          .get(`/api/clans/${ids.liClanId}/pedigree.pdf?rootId=${ids.founderId}&generations=6&style=${style}`)
          .buffer(true)
          .parse((res: any, cb: any) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => cb(null, Buffer.concat(chunks)));
          });
        if (r.status === 503) return; // 测试环境未安装中文字体
        expect(r.status).toBe(200);
        expect(r.headers['content-type']).toBe('application/pdf');
        expect((r.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      }
      await request(http).get(`/api/clans/${ids.wangClanId}/pedigree.pdf?rootId=${wangPersonId}`).expect(401);
    });
  });
});
