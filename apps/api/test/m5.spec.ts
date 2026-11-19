import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { DEMO_ACCOUNTS, seed } from '../src/database/seed';
import { parseGedcom } from '../src/modules/gedcom/gedcom.codec';

// 衡阳支：与李氏湘潭支同出始祖文远公（GEDCOM 导入），另有一位与连谱无关的人
const HENGYANG_GED = `0 HEAD
1 SOUR TEST
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME 文远 /李/
1 SEX M
1 _SHIDAI 1
1 _ZIBEI 文
1 _LIVING N
1 FAMS @F1@
0 @I2@ INDI
1 NAME 德衡 /李/
1 SEX M
1 _SHIDAI 2
1 _ZIBEI 德
1 _RANK 3
1 _LIVING N
1 FAMC @F1@
2 PEDI birth
1 FAMS @F2@
0 @I3@ INDI
1 NAME 光岳 /李/
1 SEX M
1 _SHIDAI 3
1 _LIVING N
1 FAMC @F2@
1 FAMS @F3@
0 @I4@ INDI
1 NAME 宗南 /李/
1 SEX M
1 _SHIDAI 4
1 _LIVING Y
1 _PRIVACY members
1 BIRT
2 DATE 3 MAR 1985
1 FAMC @F3@
0 @I5@ INDI
1 NAME 秘某 /李/
1 SEX M
1 _SHIDAI 4
1 _LIVING Y
1 _PRIVACY admins
1 FAMC @F3@
0 @I6@ INDI
1 NAME 无关 /李/
1 SEX M
1 _LIVING N
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I2@
0 @F2@ FAM
1 HUSB @I2@
1 CHIL @I3@
0 @F3@ FAM
1 HUSB @I3@
1 CHIL @I4@
1 CHIL @I5@
0 TRLR
`;

describe('M5：跨家族连谱与 GEDCOM（e2e）', () => {
  let app: INestApplication;
  let http: any;
  let ids: NonNullable<Awaited<ReturnType<typeof seed>>>;
  const tokens: Record<string, string> = {};
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  let hyClanId: string;
  let hy: Record<string, string>;

  const createClanWithAdmin = async (name: string, phone: string, key: string) => {
    const c = await request(http).post('/api/admin/clans').set(auth('superAdmin')).send({ name, surname: '李', adminPhone: phone }).expect(201);
    const reg = await request(http)
      .post('/api/auth/register')
      .send({ phone, password: 'pass123', activationCode: c.body.adminActivationCode })
      .expect(201);
    tokens[key] = reg.body.token;
    return c.body.id as string;
  };

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
    hyClanId = await createClanWithAdmin('陇西堂李氏·衡阳支', '13700000101', 'hyAdmin');
  });
  afterAll(() => app.close());

  describe('GEDCOM 导入', () => {
    it('预览校验，不写库；族人与其他族管理员不能导入', async () => {
      const file = Buffer.from(HENGYANG_GED);
      await request(http).post(`/api/clans/${hyClanId}/gedcom/preview`).set(auth('liAdmin')).attach('file', file, 'a.ged').expect(403);
      const r = await request(http).post(`/api/clans/${hyClanId}/gedcom/preview`).set(auth('hyAdmin')).attach('file', file, 'a.ged').expect(201);
      expect(r.body.canImport).toBe(true);
      expect(r.body.stats).toMatchObject({ persons: 6, parentLinks: 4, living: 2 });
      expect(r.body.persons.find((p: any) => p.xref === '@I4@').parents).toEqual(['李光岳']);
      const n = await request(http).get(`/api/clans/${hyClanId}/persons`).set(auth('hyAdmin')).expect(200);
      expect(n.body.total).toBe(0);
    });

    it('错误文件不能导入', async () => {
      await request(http)
        .post(`/api/clans/${hyClanId}/gedcom/import`)
        .set(auth('hyAdmin'))
        .attach('file', Buffer.from('not a gedcom'), 'x.ged')
        .expect(400);
    });

    it('确认导入', async () => {
      const r = await request(http)
        .post(`/api/clans/${hyClanId}/gedcom/import`)
        .set(auth('hyAdmin'))
        .attach('file', Buffer.from(HENGYANG_GED), 'a.ged')
        .expect(201);
      expect(r.body.imported).toBe(6);
      hy = {
        founder: r.body.personIds['@I1@'],
        g2: r.body.personIds['@I2@'],
        g4: r.body.personIds['@I4@'],
        secret: r.body.personIds['@I5@'],
        unrelated: r.body.personIds['@I6@'],
      };
      const p = await request(http).get(`/api/persons/${hy.g2}`).set(auth('hyAdmin')).expect(200);
      expect(p.body).toMatchObject({ generation: 2, generationChar: '德', rankInSiblings: 3 });
    });
  });

  describe('跨家族连谱：发起与审批', () => {
    let linkId: string;

    it('只有本族管理员能发起；能按名称找到对方家族', async () => {
      const c = await request(http).get(`/api/clans/${ids.liClanId}/link-candidates?q=衡阳`).set(auth('liAdmin')).expect(200);
      expect(c.body.map((x: any) => x.id)).toEqual([hyClanId]);
      expect(Object.keys(c.body[0]).sort()).toEqual(['hallName', 'id', 'name', 'origin', 'surname']);
      await request(http).get(`/api/clans/${ids.liClanId}/link-candidates?q=衡阳`).set(auth('liMember')).expect(403);
      await request(http)
        .post(`/api/clans/${ids.liClanId}/links`)
        .set(auth('liMember'))
        .send({ targetClanId: hyClanId, personId: ids.founderId })
        .expect(403);
      // 不能用对方家族的人物发起
      await request(http)
        .post(`/api/clans/${ids.liClanId}/links`)
        .set(auth('liAdmin'))
        .send({ targetClanId: hyClanId, personId: hy.founder })
        .expect(403);
      const r = await request(http)
        .post(`/api/clans/${ids.liClanId}/links`)
        .set(auth('liAdmin'))
        .send({ targetClanId: hyClanId, personId: ids.founderId, note: '同出始迁祖文远公' })
        .expect(201);
      expect(r.body.status).toBe('pending');
      expect(r.body.canApprove).toBe(false);
      linkId = r.body.id;
      await request(http)
        .post(`/api/clans/${hyClanId}/links`)
        .set(auth('hyAdmin'))
        .send({ targetClanId: ids.liClanId, personId: hy.founder })
        .expect(409);
    });

    it('未生效前不能查看连谱数据', async () => {
      await request(http).get(`/api/clan-links/${linkId}/lineage`).set(auth('liAdmin')).expect(403);
    });

    it('对方管理员看到待审批；发起方、无关家族不能审批；必须选本族人物', async () => {
      const l = await request(http).get(`/api/clans/${hyClanId}/links`).set(auth('hyAdmin')).expect(200);
      expect(l.body[0]).toMatchObject({ id: linkId, direction: 'incoming', canApprove: true });
      await request(http).post(`/api/clan-links/${linkId}/approve`).set(auth('liAdmin')).send({ personId: ids.founderId }).expect(403);
      await request(http).post(`/api/clan-links/${linkId}/approve`).set(auth('wangAdmin')).send({ personId: hy.founder }).expect(403);
      await request(http).post(`/api/clan-links/${linkId}/approve`).set(auth('hyAdmin')).send({ personId: ids.founderId }).expect(403);
      const sup = await request(http).get('/api/admin/clan-links').set(auth('superAdmin')).expect(200);
      expect(sup.body.map((x: any) => x.id)).toContain(linkId);
      await request(http).get('/api/admin/clan-links').set(auth('liAdmin')).expect(403);
      const ok = await request(http).post(`/api/clan-links/${linkId}/approve`).set(auth('hyAdmin')).send({ personId: hy.founder }).expect(201);
      expect(ok.body.status).toBe('approved');
      const logs = await request(http).get(`/api/clans/${ids.liClanId}/audit-logs`).set(auth('liAdmin')).expect(200);
      expect(logs.body.items.map((x: any) => x.action)).toEqual(expect.arrayContaining(['propose', 'approve']));
    });

    it('族人看到已生效的连谱与共同祖先链；无关家族看不到', async () => {
      const l = await request(http).get(`/api/clans/${ids.liClanId}/links`).set(auth('liMember')).expect(200);
      expect(l.body.map((x: any) => x.status)).toEqual(['approved']);
      const lin = await request(http).get(`/api/clan-links/${linkId}/lineage`).set(auth('liMember')).expect(200);
      expect(lin.body.sides[1].anchor.id).toBe(hy.founder);
      expect(lin.body.sides[1].children.map((c: any) => c.fullName)).toEqual(['李德衡']);
      expect(lin.body.sides[1].descendantCount).toBe(4);
      await request(http).get(`/api/clan-links/${linkId}/lineage`).set(auth('wangAdmin')).expect(403);
      await request(http).get(`/api/clan-links/${linkId}/lineage`).expect(401);
    });

    it('跨族亲属关系：共同祖先、按对应点对齐的辈分差、在世者隐私', async () => {
      const r = await request(http).get(`/api/clan-links/${linkId}/kinship?from=${ids.meId}&to=${hy.g4}`).set(auth('liMember')).expect(200);
      expect(r.body.connected).toBe(true);
      expect(r.body.commonAncestor.id).toBe(ids.founderId);
      expect(r.body.generationDiff).toBe(12 - 4);
      expect(r.body.to.generation).toBe(4);
      expect(r.body.to.birthText).toBeNull();
      expect(r.body.personClan[hy.g4]).toBe(hyClanId);
      expect(r.body.termAtoB).toBeTruthy();
      // 对方家族的管理员也能从自己一侧查询
      const b = await request(http).get(`/api/clan-links/${linkId}/kinship?from=${hy.g4}&to=${ids.meId}`).set(auth('hyAdmin')).expect(200);
      expect(b.body.generationDiff).toBe(-8);
    });

    it('对方家族只暴露连谱支系：无关人物、仅管理员可见的在世者不可搜索/计算', async () => {
      const s = await request(http).get(`/api/clan-links/${linkId}/persons?clanId=${hyClanId}&q=李`).set(auth('liMember')).expect(200);
      const names = s.body.map((x: any) => x.fullName);
      expect(names).toEqual(expect.arrayContaining(['李文远', '李德衡', '李宗南']));
      expect(names).not.toContain('李无关');
      expect(names).not.toContain('李秘某');
      await request(http).get(`/api/clan-links/${linkId}/kinship?from=${ids.meId}&to=${hy.unrelated}`).set(auth('liMember')).expect(404);
      await request(http).get(`/api/clan-links/${linkId}/kinship?from=${ids.meId}&to=${hy.secret}`).set(auth('liMember')).expect(404);
      // 原有 clan_id 隔离不变
      await request(http).get(`/api/persons/${hy.g4}`).set(auth('liMember')).expect(403);
      await request(http).get(`/api/clans/${hyClanId}/kinship?from=${hy.g4}&to=${hy.founder}`).set(auth('liMember')).expect(403);
      await request(http).get(`/api/clans/${ids.liClanId}/kinship?from=${ids.meId}&to=${hy.g4}`).set(auth('liMember')).expect(404);
    });

    it('解除连谱后不可再查看', async () => {
      await request(http).post(`/api/clan-links/${linkId}/revoke`).set(auth('liMember')).expect(403);
      await request(http).post(`/api/clan-links/${linkId}/revoke`).set(auth('hyAdmin')).expect(201);
      await request(http).get(`/api/clan-links/${linkId}/lineage`).set(auth('liMember')).expect(403);
    });

    it('超级管理员可代为审批', async () => {
      const r = await request(http)
        .post(`/api/clans/${ids.liClanId}/links`)
        .set(auth('liAdmin'))
        .send({ targetClanId: hyClanId, personId: ids.founderId })
        .expect(201);
      await request(http).post(`/api/clan-links/${r.body.id}/approve`).set(auth('superAdmin')).send({ personId: hy.founder }).expect(201);
    });
  });

  describe('GEDCOM 导出与往返', () => {
    it('导出仅管理员；全族导出可原样导入到新家族，人数、关系、过继与称谓一致', async () => {
      await request(http).get(`/api/clans/${ids.liClanId}/gedcom`).set(auth('liMember')).expect(403);
      const ex = await request(http).get(`/api/clans/${ids.liClanId}/gedcom`).set(auth('liAdmin')).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      expect(ex.headers['content-type']).toMatch(/utf-8/);
      const text = (ex.body as Buffer).toString('utf8');
      const parsed = parseGedcom(text);
      expect(parsed.errors).toEqual([]);
      const ds = app.get(DataSource);
      const [{ n, pc, m }] = await ds.query(
        `SELECT (SELECT count(*)::int FROM person WHERE clan_id = $1) n,
                (SELECT count(*)::int FROM parent_child WHERE clan_id = $1) pc,
                (SELECT count(*)::int FROM marriage WHERE clan_id = $1) m`,
        [ids.liClanId],
      );
      expect(parsed.persons.length).toBe(n);
      expect(parsed.parents.length).toBe(pc);
      expect(parsed.marriages.length).toBe(m);

      const copy = await createClanWithAdmin('李氏副本', '13700000102', 'copyAdmin');
      const imp = await request(http).post(`/api/clans/${copy}/gedcom/import`).set(auth('copyAdmin')).attach('file', Buffer.from(text), 'li.ged').expect(201);
      expect(imp.body).toMatchObject({ imported: n, parentLinks: pc, marriages: m });

      // 用"出生原文 + 姓名 + 世代"对应原族与副本中的人
      const map = async (clanId: string) =>
        new Map<string, string>(
          (await ds.query(`SELECT id, full_name || '|' || coalesce(generation::text,'') || '|' || coalesce(birth_text,'') k FROM person WHERE clan_id = $1`, [clanId])).map(
            (r: any) => [r.k, r.id],
          ),
        );
      const [orig, cp] = await Promise.all([map(ids.liClanId), map(copy)]);
      const keyOf = (id: string) => [...orig].find(([, v]) => v === id)![0];
      const twin = (id: string) => cp.get(keyOf(id))!;
      const heirOrig = await ds.query(`SELECT relation_type, is_main_line FROM parent_child WHERE child_id = $1 ORDER BY relation_type`, [ids.heirId]);
      const heirCopy = await ds.query(`SELECT relation_type, is_main_line FROM parent_child WHERE child_id = $1 ORDER BY relation_type`, [twin(ids.heirId!)]);
      expect(heirCopy).toEqual(heirOrig);
      const k1 = await request(http).get(`/api/clans/${ids.liClanId}/kinship?from=${ids.meId}&to=${ids.daughterId}`).set(auth('liAdmin')).expect(200);
      const k2 = await request(http)
        .get(`/api/clans/${copy}/kinship?from=${twin(ids.meId)}&to=${twin(ids.daughterId!)}`)
        .set(auth('copyAdmin'))
        .expect(200);
      expect(k2.body.termAtoB).toBe(k1.body.termAtoB);
      expect(k2.body.chainText).toBe(k1.body.chainText);
    });

    it('按支系导出', async () => {
      const ex = await request(http).get(`/api/clans/${hyClanId}/gedcom?rootId=${hy.g2}`).set(auth('hyAdmin')).expect(200);
      const parsed = parseGedcom(ex.text);
      expect(parsed.persons.map((p) => p.surname + p.givenName).sort()).toEqual(['李光岳', '李宗南', '李德衡', '李秘某'].sort());
      await request(http).get(`/api/clans/${hyClanId}/gedcom?rootId=${ids.founderId}`).set(auth('hyAdmin')).expect(404);
    });
  });

  describe('AI 预留位', () => {
    it('OCR 导入返回 501 敬请期待；导入草稿列表为空', async () => {
      const r = await request(http).post(`/api/ai/clans/${hyClanId}/ocr-import`).set(auth('hyAdmin')).expect(501);
      expect(r.body.message).toContain('敬请期待');
      const d = await request(http).get(`/api/clans/${hyClanId}/import-drafts`).set(auth('hyAdmin')).expect(200);
      expect(d.body).toEqual([]);
      await request(http).get(`/api/clans/${hyClanId}/import-drafts`).set(auth('liAdmin')).expect(403);
    });
  });
});
