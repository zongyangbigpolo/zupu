import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { DEMO_ACCOUNTS, seed } from '../src/database/seed';

const binary = (res: any, cb: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

async function xlsx(rows: Record<string, unknown>[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('成员');
  const headers = ['编号', '姓', '名', '性别', '世代', '字辈', '父亲编号', '母亲编号', '配偶编号', '出生日期', '卒日期', '在世', '外姓', '出生地'];
  ws.addRow(headers);
  for (const r of rows) ws.addRow(headers.map((h) => r[h] ?? null));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('M2 内容与传承（e2e）', () => {
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

  describe('相册：缩略图与元数据', () => {
    let photoId: string;
    it('管理员上传照片，自动生成缩略图并读取尺寸', async () => {
      const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#a33' } }).png().toBuffer();
      const r = await request(http)
        .post(`/api/persons/${ids.founderId}/gallery`)
        .set(auth('liAdmin'))
        .field('caption', '祠堂旧照')
        .field('takenText', '民国初年')
        .attach('file', png, { filename: '祠堂.png', contentType: 'image/png' })
        .expect(201);
      photoId = r.body.id;
      expect(r.body).toMatchObject({ type: 'photo', width: 800, height: 600, caption: '祠堂旧照', takenText: '民国初年', category: 'gallery' });
      const t = await request(http).get(r.body.thumbnailUrl).buffer(true).parse(binary).expect(200);
      expect(t.headers['content-type']).toBe('image/jpeg');
      const meta = await sharp(t.body).metadata();
      expect(meta.width).toBe(400);
      await request(http).get(r.body.thumbnailUrl.replace(/sig=\w+/, 'sig=bad')).expect(403);
    });
    it('音视频保存客户端上报的时长，转码标记为跳过', async () => {
      const r = await request(http)
        .post(`/api/persons/${ids.founderId}/gallery`)
        .set(auth('liAdmin'))
        .field('duration', '12')
        .attach('file', Buffer.from('fake-mp4'), { filename: 'v.mp4', contentType: 'video/mp4' })
        .expect(201);
      expect(r.body).toMatchObject({ type: 'video', duration: 12, transcodeStatus: 'skipped', thumbnailUrl: null });
    });
    it('族人只读；其他家族管理员不能上传', async () => {
      const png = Buffer.from('x');
      await request(http).post(`/api/persons/${ids.founderId}/gallery`).set(auth('liMember')).attach('file', png, { filename: 'a.png', contentType: 'image/png' }).expect(403);
      await request(http).post(`/api/persons/${ids.founderId}/gallery`).set(auth('wangAdmin')).attach('file', png, { filename: 'a.png', contentType: 'image/png' }).expect(403);
      await request(http).patch(`/api/gallery/${photoId}`).set(auth('wangAdmin')).send({ caption: 'x' }).expect(403);
      await request(http).delete(`/api/gallery/${photoId}`).set(auth('liMember')).expect(403);
    });
    it('家族相册：访客看不到在世者的照片', async () => {
      const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer();
      await request(http).post(`/api/persons/${ids.meId}/gallery`).set(auth('liAdmin')).attach('file', png, { filename: 'me.png', contentType: 'image/png' }).expect(201);
      const member = await request(http).get(`/api/clans/${ids.liClanId}/gallery?type=photo`).set(auth('liMember')).expect(200);
      expect(member.body.items.map((m: any) => m.personId)).toEqual(expect.arrayContaining([ids.meId, ids.founderId]));
      const visitor = await request(http).get(`/api/clans/${ids.liClanId}/gallery?type=photo`).expect(200);
      expect(visitor.body.items.map((m: any) => m.personId)).not.toContain(ids.meId);
      expect((await request(http).get(`/api/persons/${ids.meId}/gallery`).expect(200)).body).toEqual([]);
      await request(http).get(`/api/clans/${ids.wangClanId}/gallery`).set(auth('liAdmin')).expect(403);
    });
    it('编辑说明并删除（同时删除缩略图）', async () => {
      const u = await request(http).patch(`/api/gallery/${photoId}`).set(auth('liAdmin')).send({ caption: '宗祠', description: '摄于重修前' }).expect(200);
      expect(u.body).toMatchObject({ caption: '宗祠', description: '摄于重修前' });
      await request(http).delete(`/api/gallery/${photoId}`).set(auth('liAdmin')).expect(200);
      expect(u.body.thumbnailUrl).toBeTruthy();
      await request(http).get(u.body.thumbnailUrl).expect(404);
    });
  });

  describe('口述历史', () => {
    it('上传浏览器录音（带 codecs 参数）并附文字稿；仅文字稿也可', async () => {
      const r = await request(http)
        .post(`/api/persons/${ids.founderId}/oral-histories`)
        .set(auth('liAdmin'))
        .field('title', '三叔公讲祠堂')
        .field('narrator', '李三')
        .field('transcript', '那年发大水……')
        .field('duration', '65')
        .attach('file', Buffer.from('webm-audio'), { filename: 'rec.webm', contentType: 'audio/webm;codecs=opus' })
        .expect(201);
      expect(r.body.audio).toMatchObject({ type: 'audio', mimeType: 'audio/webm', duration: 65, category: 'oral_history' });
      const audio = await request(http).get(r.body.audio.url).expect(200);
      expect(audio.headers['content-type']).toContain('audio/webm');
      await request(http).post(`/api/persons/${ids.founderId}/oral-histories`).set(auth('liAdmin')).field('title', '仅文字').field('transcript', '整理稿').expect(201);
      await request(http).post(`/api/persons/${ids.founderId}/oral-histories`).set(auth('liAdmin')).field('title', '空的').expect(400);
      await request(http).post(`/api/persons/${ids.founderId}/oral-histories`).set(auth('liMember')).field('title', 'x').field('transcript', 'y').expect(403);
      // 口述历史音频不出现在相册中
      const g = await request(http).get(`/api/persons/${ids.founderId}/gallery`).set(auth('liMember')).expect(200);
      expect(g.body.map((m: any) => m.id)).not.toContain(r.body.audio.id);
      const list = await request(http).get(`/api/persons/${ids.founderId}/oral-histories`).set(auth('liMember')).expect(200);
      expect(list.body.length).toBeGreaterThanOrEqual(3);
      const clanList = await request(http).get(`/api/clans/${ids.liClanId}/oral-histories?q=祠堂`).set(auth('liMember')).expect(200);
      expect(clanList.body.items[0].person.id).toBe(ids.founderId);
      const up = await request(http).patch(`/api/oral-histories/${r.body.id}`).set(auth('liAdmin')).send({ transcript: '修订稿' }).expect(200);
      expect(up.body.transcript).toBe('修订稿');
      await request(http).delete(`/api/oral-histories/${r.body.id}`).set(auth('wangAdmin')).expect(403);
      await request(http).delete(`/api/oral-histories/${r.body.id}`).set(auth('liAdmin')).expect(200);
      await request(http).get(r.body.audio.url).expect(404);
    });
  });

  describe('人物纪念馆', () => {
    it('访客可看纪念馆但看不到留言；在世者没有纪念馆', async () => {
      const r = await request(http).get(`/api/persons/${ids.founderId}/memorial`).expect(200);
      expect(r.body).toMatchObject({ canInteract: false, messagesVisible: false });
      expect(r.body.tributes.flower).toBe(2);
      expect(r.body.oralHistories.length).toBeGreaterThan(0);
      await request(http).get(`/api/persons/${ids.founderId}/memorial/messages`).expect(401);
      await request(http).get(`/api/persons/${ids.meId}/memorial`).set(auth('liMember')).expect(400);
    });
    it('族人留言、献花（每日一次）、点烛', async () => {
      const m = await request(http).post(`/api/persons/${ids.founderId}/memorial/messages`).set(auth('liMember')).send({ content: '缅怀先祖' }).expect(201);
      expect(m.body).toMatchObject({ content: '缅怀先祖', authorName: '李诗涵', canDelete: true });
      const f1 = await request(http).post(`/api/persons/${ids.founderId}/memorial/tributes`).set(auth('liMember')).send({ kind: 'flower' }).expect(201);
      expect(f1.body).toMatchObject({ flower: 3, myFlowerToday: true, already: false });
      const f2 = await request(http).post(`/api/persons/${ids.founderId}/memorial/tributes`).set(auth('liMember')).send({ kind: 'flower' }).expect(201);
      expect(f2.body).toMatchObject({ flower: 3, already: true });
      const c = await request(http).post(`/api/persons/${ids.founderId}/memorial/tributes`).set(auth('liMember')).send({ kind: 'candle' }).expect(201);
      expect(c.body.candle).toBe(2);
      await request(http).post(`/api/persons/${ids.founderId}/memorial/tributes`).set(auth('liMember')).send({ kind: 'bomb' }).expect(400);
      await request(http).post(`/api/persons/${ids.founderId}/memorial/messages`).set(auth('wangAdmin')).send({ content: 'x' }).expect(403);
      await request(http).post(`/api/persons/${ids.founderId}/memorial/messages`).set(auth('liMember')).send({ content: '' }).expect(400);
    });
    it('族人只能删除自己的留言，管理员可删除任意留言并留痕', async () => {
      const list = await request(http).get(`/api/persons/${ids.founderId}/memorial/messages`).set(auth('liMember')).expect(200);
      const others = list.body.items.find((x: any) => !x.canDelete);
      const mine = list.body.items.find((x: any) => x.canDelete);
      await request(http).delete(`/api/memorial-messages/${others.id}`).set(auth('liMember')).expect(403);
      await request(http).delete(`/api/memorial-messages/${mine.id}`).set(auth('liMember')).expect(200);
      const adminList = await request(http).get(`/api/persons/${ids.founderId}/memorial/messages`).set(auth('liAdmin')).expect(200);
      expect(adminList.body.items.every((x: any) => x.canDelete)).toBe(true);
      const victim = adminList.body.items.find((x: any) => x.authorName === '李诗涵');
      await request(http).delete(`/api/memorial-messages/${victim.id}`).set(auth('liAdmin')).expect(200);
      const logs = await request(http).get(`/api/clans/${ids.liClanId}/audit-logs`).set(auth('liAdmin')).expect(200);
      expect(logs.body.items[0]).toMatchObject({ entity: 'memorial_message', action: 'moderate-delete' });
    });
  });

  describe('家族文献', () => {
    it('访客可读公开族谱的文献；仅管理员可编辑；私密族谱隔离', async () => {
      const list = await request(http).get(`/api/clans/${ids.liClanId}/documents`).expect(200);
      expect(list.body.map((d: any) => d.kind)).toEqual(['family_rules', 'preface', 'conventions']);
      expect(list.body[0].vertical).toBe(true);
      await request(http).post(`/api/clans/${ids.liClanId}/documents`).set(auth('liMember')).send({ kind: 'clan_rules', title: '家规' }).expect(403);
      await request(http).post(`/api/clans/${ids.liClanId}/documents`).set(auth('wangAdmin')).send({ kind: 'clan_rules', title: '家规' }).expect(403);
      const c = await request(http).post(`/api/clans/${ids.liClanId}/documents`).set(auth('liAdmin')).send({ kind: 'clan_rules', title: '家规', content: '<p>禁赌</p>' }).expect(201);
      await request(http).post(`/api/clans/${ids.liClanId}/documents`).set(auth('liAdmin')).send({ kind: 'bad', title: 'x' }).expect(400);
      const u = await request(http).patch(`/api/documents/${c.body.id}`).set(auth('liAdmin')).send({ vertical: true, title: '家规八条' }).expect(200);
      expect(u.body).toMatchObject({ vertical: true, title: '家规八条' });
      await request(http).patch(`/api/documents/${c.body.id}`).set(auth('wangAdmin')).send({ title: 'x' }).expect(403);
      await request(http).delete(`/api/documents/${c.body.id}`).set(auth('liAdmin')).expect(200);
      const w = await request(http).post(`/api/clans/${ids.wangClanId}/documents`).set(auth('wangAdmin')).send({ kind: 'preface', title: '王氏谱序' }).expect(201);
      await request(http).get(`/api/documents/${w.body.id}`).set(auth('liAdmin')).expect(403);
      await request(http).get(`/api/documents/${w.body.id}`).expect(401);
    });
  });

  describe('统计看板与高级搜索', () => {
    it('统计看板', async () => {
      const r = await request(http).get(`/api/clans/${ids.liClanId}/dashboard`).expect(200);
      const d = r.body;
      expect(d.total).toBe(d.living + d.deceased);
      expect(d.male + d.female + d.unknownGender).toBe(d.total);
      expect(d.perGeneration[0].generation).toBe(1);
      expect(d.perGeneration.length).toBe(d.maxGeneration);
      expect(d.avgLifespan).toBeGreaterThan(20);
      expect(d.lifespanBuckets).toHaveLength(10);
      expect(d.regions.length).toBeGreaterThan(0);
      expect(d.regions[0].name).not.toMatch(/白石铺/);
      expect(d.oralHistoryCount).toBeGreaterThan(0);
      await request(http).get(`/api/clans/${ids.wangClanId}/dashboard`).set(auth('liAdmin')).expect(403);
    });
    it('按世代区间、性别、地区、在世筛选', async () => {
      const r = await request(http)
        .get(`/api/clans/${ids.liClanId}/advanced-search?generationFrom=3&generationTo=4&gender=male&pageSize=200`)
        .expect(200);
      expect(r.body.total).toBeGreaterThan(0);
      expect(r.body.items.every((p: any) => p.generation >= 3 && p.generation <= 4 && p.gender === 'male')).toBe(true);
      const region = await request(http).get(`/api/clans/${ids.liClanId}/advanced-search?region=花石&pageSize=200`).set(auth('liMember')).expect(200);
      expect(region.body.total).toBeGreaterThan(0);
      const living = await request(http).get(`/api/clans/${ids.liClanId}/advanced-search?living=living&pageSize=200`).set(auth('liMember')).expect(200);
      expect(living.body.items.every((p: any) => p.isLiving)).toBe(true);
    });
    it('按出生年份筛选：访客无法借此查到在世者', async () => {
      const m = await request(http).get(`/api/clans/${ids.liClanId}/advanced-search?birthYearFrom=1950&pageSize=200`).set(auth('liMember')).expect(200);
      expect(m.body.items.some((p: any) => p.isLiving)).toBe(true);
      expect(m.body.items.every((p: any) => p.birthYear >= 1950)).toBe(true);
      const v = await request(http).get(`/api/clans/${ids.liClanId}/advanced-search?birthYearFrom=1950&pageSize=200`).expect(200);
      expect(v.body.items.some((p: any) => p.isLiving)).toBe(false);
      const d = await request(http).get(`/api/clans/${ids.liClanId}/advanced-search?deathYearFrom=1800&deathYearTo=1850`).expect(200);
      expect(d.body.items.every((p: any) => p.deathYear >= 1800 && p.deathYear <= 1850)).toBe(true);
    });
  });

  describe('Excel 导入', () => {
    it('下载模板', async () => {
      const r = await request(http).get(`/api/clans/${ids.liClanId}/import/template`).set(auth('liAdmin')).buffer(true).parse(binary).expect(200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(r.body);
      expect(wb.getWorksheet('成员')!.getRow(1).getCell(2).value).toBe('姓');
      await request(http).get(`/api/clans/${ids.liClanId}/import/template`).set(auth('liMember')).expect(403);
    });
    it('预览校验：错误行阻止提交', async () => {
      const file = await xlsx([
        { 编号: 'X1', 姓: '李', 名: '', 性别: '男' },
        { 编号: 'X2', 姓: '李', 名: '某', 性别: '公', 父亲编号: 'NOPE', 出生日期: '1990-13-01' },
        { 编号: 'X2', 姓: '李', 名: '重复' },
      ]);
      const r = await request(http).post(`/api/clans/${ids.liClanId}/import/preview`).set(auth('liAdmin')).attach('file', file, '错误.xlsx').expect(201);
      expect(r.body.summary.errorRows).toBe(3);
      const e = r.body.rows.map((x: any) => x.errors.join('；'));
      expect(e[0]).toContain('缺少"名"');
      expect(e[1]).toMatch(/性别.*无法识别/);
      expect(e[1]).toContain('找不到父亲');
      expect(e[1]).toContain('出生日期');
      expect(e[2]).toContain('重复');
      await request(http).post(`/api/import-batches/${r.body.batchId}/commit`).set(auth('liAdmin')).expect(400);
    });
    it('推算世代与字辈、校验字辈，提交后入谱并建立父子与婚姻关系', async () => {
      const file = await xlsx([
        { 编号: 'N1', 姓: '李', 名: '德馨', 性别: '男', 父亲编号: ids.founderId, 出生日期: '1720', 卒日期: '1790-05', 在世: '否', 出生地: '湖南湘潭' },
        { 编号: 'N2', 姓: '周', 名: '氏', 性别: '女', 配偶编号: 'N1', 外姓: '是' },
        { 编号: 'N3', 姓: '李', 名: '光耀', 性别: '男', 父亲编号: 'N1', 母亲编号: 'N2', 字辈: '宗' },
      ]);
      await request(http).post(`/api/clans/${ids.liClanId}/import/preview`).set(auth('liMember')).attach('file', file, 'a.xlsx').expect(403);
      await request(http).post(`/api/clans/${ids.liClanId}/import/preview`).set(auth('wangAdmin')).attach('file', file, 'a.xlsx').expect(403);
      const r = await request(http).post(`/api/clans/${ids.liClanId}/import/preview`).set(auth('liAdmin')).attach('file', file, '新增.xlsx').expect(201);
      expect(r.body.summary).toMatchObject({ totalRows: 3, toCreate: 3, errorRows: 0, parentLinks: 3, marriages: 1 });
      const [n1, n2, n3] = r.body.rows;
      expect(n1).toMatchObject({ finalGeneration: 2, finalGenerationChar: '德' });
      expect(n2.finalGeneration).toBeNull();
      expect(n3.finalGeneration).toBe(3);
      expect(n3.warnings.join()).toContain('字辈不符');
      await request(http).post(`/api/import-batches/${r.body.batchId}/commit`).set(auth('wangAdmin')).expect(403);
      const c = await request(http).post(`/api/import-batches/${r.body.batchId}/commit`).set(auth('liAdmin')).expect(201);
      expect(c.body).toEqual({ created: 3, parentLinks: 3, marriages: 1 });
      await request(http).post(`/api/import-batches/${r.body.batchId}/commit`).set(auth('liAdmin')).expect(400);
      const s = await request(http).get(`/api/clans/${ids.liClanId}/persons?q=光耀`).set(auth('liAdmin')).expect(200);
      const p = await request(http).get(`/api/persons/${s.body.items[0].id}`).set(auth('liAdmin')).expect(200);
      expect(p.body.parents.map((x: any) => x.person.fullName).sort()).toEqual(['周氏', '李德馨']);
      expect(p.body.generation).toBe(3);
      const n1p = await request(http).get(`/api/persons/${p.body.parents.find((x: any) => x.person.fullName === '李德馨').person.id}`).set(auth('liAdmin')).expect(200);
      expect(n1p.body).toMatchObject({ birthDate: '1720-01-01', birthPrecision: 'year', deathPrecision: 'month' });
      expect(n1p.body.spouses[0].person.fullName).toBe('周氏');
      const logs = await request(http).get(`/api/clans/${ids.liClanId}/audit-logs`).set(auth('liAdmin')).expect(200);
      expect(logs.body.items[0]).toMatchObject({ entity: 'import_batch', action: 'import-commit' });
    });
  });

  describe('导出与备份', () => {
    it('家族管理员一键导出 JSON / Excel；导出的 Excel 可回导（已有人物自动跳过）', async () => {
      const j = await request(http).get(`/api/clans/${ids.liClanId}/export?format=json`).set(auth('liAdmin')).expect(200);
      expect(j.headers['content-disposition']).toContain("filename*=UTF-8''");
      const data = JSON.parse(j.text);
      expect(data.clan.id).toBe(ids.liClanId);
      expect(data.persons.every((p: any) => p.clan_id === ids.liClanId)).toBe(true);
      expect(data.documents.length).toBeGreaterThan(0);
      await request(http).get(`/api/clans/${ids.liClanId}/export?format=json`).set(auth('liMember')).expect(403);
      await request(http).get(`/api/clans/${ids.liClanId}/export?format=json`).set(auth('wangAdmin')).expect(403);

      const x = await request(http).get(`/api/clans/${ids.liClanId}/export?format=xlsx`).set(auth('liAdmin')).buffer(true).parse(binary).expect(200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(x.body);
      expect(wb.getWorksheet('成员')!.rowCount - 1).toBe(data.persons.length);
      const back = await request(http).post(`/api/clans/${ids.liClanId}/import/preview`).set(auth('liAdmin')).attach('file', x.body, 'export.xlsx').expect(201);
      expect(back.body.summary).toMatchObject({ toCreate: 0, errorRows: 0, skipped: data.persons.length });
    });
    it('超级管理员手动备份、查看与下载；家族管理员无权', async () => {
      await request(http).post('/api/admin/backups').set(auth('liAdmin')).expect(403);
      const r = await request(http).post('/api/admin/backups').set(auth('superAdmin')).expect(201);
      expect(r.body.status).toBe('success');
      expect(['pg_dump', 'json']).toContain(r.body.method);
      expect(r.body.size).toBeGreaterThan(100);
      const list = await request(http).get('/api/admin/backups').set(auth('superAdmin')).expect(200);
      expect(list.body.items[0].id).toBe(r.body.id);
      expect(list.body.settings).toHaveProperty('dailyAt');
      const d = await request(http).get(`/api/admin/backups/${r.body.id}/download`).set(auth('superAdmin')).buffer(true).parse(binary).expect(200);
      expect(d.body.length).toBe(r.body.size);
      await request(http).get(`/api/admin/backups/${r.body.id}/download`).set(auth('liAdmin')).expect(403);
    });
  });
});
