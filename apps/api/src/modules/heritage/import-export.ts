import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { DataSource, EntityManager } from 'typeorm';
import {
  checkGeneration,
  CLAN_DOCUMENT_KIND_LABELS,
  GENDER_LABELS,
  IMPORT_COLUMNS,
  MARRIAGE_TYPE_LABELS,
  parseLooseDate,
  RELATION_TYPE_LABELS,
  type Gender,
  type ImportColumnKey,
  type ImportCommitResult,
  type ImportPreview,
  type ImportRowPreview,
  type ImportSummary,
  type RelationType,
} from '@zupu/shared';
import { AccessService, isUuid } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { KinshipCache } from '../../common/kinship-cache.service';
import { ClanEntity, ImportBatchEntity, PersonEntity } from '../../entities';
import { contentDisposition, originalName, returningRows } from './heritage-common';
import { heritageConfig } from './heritage.config';

const GENDER_IN: Record<string, Gender> = {
  男: 'male', 男性: 'male', m: 'male', male: 'male', 乾: 'male',
  女: 'female', 女性: 'female', f: 'female', female: 'female', 坤: 'female',
  未知: 'unknown', unknown: 'unknown', '': 'unknown',
};
const RELATION_IN: Record<string, RelationType> = {
  亲生: 'biological', '': 'biological', biological: 'biological',
  收养: 'adopted', 养子: 'adopted', 养女: 'adopted', adopted: 'adopted',
  过继: 'heir', 嗣子: 'heir', 承嗣: 'heir', heir: 'heir',
  兼祧: 'jiantiao', jiantiao: 'jiantiao',
};
const YES = new Set(['是', 'y', 'yes', 'true', '1', '√', '在世']);
const NO = new Set(['否', 'n', 'no', 'false', '0', '', '已故', '殁']);

/** exceljs 单元格值 → 文本 */
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as any;
    if (Array.isArray(o.richText)) return o.richText.map((t: any) => t.text).join('').trim();
    if ('result' in o) return cellText(o.result);
    if ('text' in o) return String(o.text).trim();
    if ('error' in o) return '';
  }
  return String(v).trim();
}

const splitKeys = (s: string) =>
  s
    .split(/[、,，;；\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

type RawRow = { rowNo: number } & Partial<Record<ImportColumnKey, string>>;

/** Excel 模板导入（预览 + 校验 + 提交）与一键导出（Excel / JSON） */
@Injectable()
export class ImportExportService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly kinship: KinshipCache,
  ) {}

  // ---------- 模板 ----------
  private memberSheet(wb: ExcelJS.Workbook) {
    const ws = wb.addWorksheet('成员', { views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }] });
    ws.columns = IMPORT_COLUMNS.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.key === 'biography' ? 40 : c.key === 'key' ? 38 : Math.max(10, c.header.length * 2 + 4),
    }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.height = 22;
    IMPORT_COLUMNS.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'required' in c && c.required ? 'FF8B1E1E' : 'FFB08A4A' } };
      if ('note' in c && c.note) cell.note = c.note;
    });
    return ws;
  }

  private addValidations(ws: ExcelJS.Worksheet, rows = 2000) {
    const col = (k: ImportColumnKey) => IMPORT_COLUMNS.findIndex((c) => c.key === k) + 1;
    const list = (k: ImportColumnKey, values: string) => {
      const letter = ws.getColumn(col(k)).letter;
      for (let r = 2; r <= rows; r++)
        ws.getCell(`${letter}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${values}"`] };
    };
    list('gender', '男,女,未知');
    list('isLiving', '是,否');
    list('isExternal', '是,否');
    list('relationType', '亲生,收养,过继,兼祧');
  }

  async template(user: AuthUser, clanId: string, res: Response) {
    const { clan } = await this.access.clanAccess(user, clanId, 'admin');
    const wb = new ExcelJS.Workbook();
    wb.creator = '族谱系统';
    const ws = this.memberSheet(wb);
    const s = clan.surname;
    const sample: Partial<Record<ImportColumnKey, string | number>>[] = [
      { key: 'A1', surname: s, givenName: '某公', gender: '男', generation: 1, birthText: '康熙三十年', deathText: '乾隆十五年', isLiving: '否', ancestralHome: '江西吉安府', biography: '示例：始迁祖' },
      { key: 'A2', surname: '张', givenName: '氏', gender: '女', spouseKeys: 'A1', isExternal: '是', isLiving: '否' },
      { key: 'A3', surname: s, givenName: '某甲', gender: '男', fatherKey: 'A1', motherKey: 'A2', rankInSiblings: 1, birthDate: '1725', isLiving: '否' },
      { key: 'A4', surname: s, givenName: '某乙', gender: '女', fatherKey: 'A1', motherKey: 'A2', rankInSiblings: 2, isLiving: '否' },
    ];
    for (const r of sample) ws.addRow(r).font = { color: { argb: 'FF888888' }, italic: true };
    this.addValidations(ws);

    const help = wb.addWorksheet('填写说明');
    help.columns = [{ width: 16 }, { width: 10 }, { width: 70 }];
    help.addRow(['列名', '必填', '说明']).font = { bold: true };
    for (const c of IMPORT_COLUMNS) help.addRow([c.header, 'required' in c && c.required ? '是' : '', ('note' in c && c.note) || '']);
    help.addRow([]);
    for (const line of [
      '1. 灰色斜体为示例行，导入前请删除或覆盖。',
      '2. "编号"在本表内唯一；父亲编号/母亲编号/配偶编号填写本表中的编号，也可填写谱中已有人物的 ID 或其唯一姓名（用于挂接到现有世系）。',
      `3. 世代、字辈可留空，系统按父亲世代 + 1 与字辈诗（${clan.generationPoem || '未设置'}）自动推算，并校验是否一致。`,
      '4. 日期：古代日期建议填"原文"列（如"康熙三十年"）；公历可填 1725 / 1725-03 / 1725-03-12。',
      '5. 上传后先预览校验，确认无误再提交入谱；有"错误"的行需修改后重新上传，"提醒"不阻止导入。',
      '6. 本系统导出的 Excel "成员"表格式与本模板一致，可直接回导（已存在的人物会自动跳过）。',
    ])
      help.addRow([line]);
    await this.send(res, wb, `${clan.name}-导入模板.xlsx`);
  }

  private async send(res: Response, wb: ExcelJS.Workbook, filename: string) {
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', contentDisposition(filename));
    res.end(buf);
  }

  // ---------- 预览与校验 ----------
  private async readRows(file: Express.Multer.File): Promise<RawRow[]> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(file.buffer as any);
    } catch {
      throw new BadRequestException('无法读取文件，请上传 .xlsx 格式的 Excel 文件');
    }
    const ws = wb.getWorksheet('成员') ?? wb.worksheets[0];
    if (!ws) throw new BadRequestException('Excel 中没有工作表');
    const norm = (s: string) => s.replace(/[*＊\s（）()]/g, '').replace(/原文/, '原文');
    const byHeader = new Map(IMPORT_COLUMNS.map((c) => [norm(c.header), c.key]));
    let headerRow = 0;
    const colKey = new Map<number, ImportColumnKey>();
    ws.eachRow((row, n) => {
      if (headerRow) return;
      const found = new Map<number, ImportColumnKey>();
      row.eachCell((cell, col) => {
        const k = byHeader.get(norm(cellText(cell.value)));
        if (k) found.set(col, k);
      });
      const keys = new Set(found.values());
      if (keys.has('surname') && keys.has('givenName')) {
        headerRow = n;
        found.forEach((v, k) => colKey.set(k, v));
      }
    });
    if (!headerRow) throw new BadRequestException('未找到表头，请使用系统提供的导入模板（需包含"姓""名"列）');
    const rows: RawRow[] = [];
    ws.eachRow((row, n) => {
      if (n <= headerRow) return;
      const r: RawRow = { rowNo: n };
      let any = false;
      colKey.forEach((key, col) => {
        const cell = row.getCell(col);
        const v = cell.value instanceof Date ? cell.value : cellText(cell.value);
        const t = v instanceof Date ? v.toISOString().slice(0, 10) : v;
        if (t) {
          r[key] = t;
          any = true;
        }
      });
      if (any) rows.push(r);
    });
    if (!rows.length) throw new BadRequestException('没有可导入的数据行');
    if (rows.length > heritageConfig.import.maxRows) throw new BadRequestException(`单次最多导入 ${heritageConfig.import.maxRows} 行，请分批导入`);
    return rows;
  }

  async preview(user: AuthUser, clanId: string, file: Express.Multer.File | undefined): Promise<ImportPreview> {
    const { clan } = await this.access.clanAccess(user, clanId, 'admin');
    if (!file) throw new BadRequestException('请选择 Excel 文件');
    const raw = await this.readRows(file);
    const { rows, summary } = await this.validate(clan, raw);
    const repo = this.ds.getRepository(ImportBatchEntity);
    const batch = await repo.save(repo.create({ clanId, fileName: originalName(file).slice(0, 200), status: 'preview', rows, summary, createdBy: user.id }));
    return this.toPreview(batch);
  }

  private toPreview(b: ImportBatchEntity): ImportPreview {
    return { batchId: b.id, fileName: b.fileName, status: b.status, summary: b.summary, rows: b.rows, createdAt: b.createdAt.toISOString() };
  }

  /** 校验并推算世代/字辈；纯逻辑 + 少量查询（已有人物） */
  async validate(clan: ClanEntity, raw: RawRow[]): Promise<{ rows: ImportRowPreview[]; summary: ImportSummary }> {
    const existing: { id: string; full_name: string; gender: Gender; generation: number | null; is_external: boolean }[] = await this.ds.query(
      `SELECT id, full_name, gender, generation, is_external FROM person WHERE clan_id = $1`,
      [clan.id],
    );
    const existingById = new Map(existing.map((e) => [e.id, e]));
    const existingByName = new Map<string, typeof existing>();
    for (const e of existing) existingByName.set(e.full_name, [...(existingByName.get(e.full_name) ?? []), e]);

    const rows: ImportRowPreview[] = [];
    const byKey = new Map<string, ImportRowPreview>();
    for (const r of raw) {
      const errors: string[] = [];
      const warnings: string[] = [];
      const key = (r.key ?? '').trim() || `#${r.rowNo}`;
      const surname = (r.surname ?? '').trim();
      const givenName = (r.givenName ?? '').trim();
      if (!surname) errors.push('缺少"姓"');
      else if (surname.length > 10) errors.push('"姓"过长（最多 10 字）');
      if (!givenName) errors.push('缺少"名"');
      else if (givenName.length > 30) errors.push('"名"过长（最多 30 字）');
      const gender = GENDER_IN[(r.gender ?? '').toLowerCase()];
      if (!gender) errors.push(`性别"${r.gender}"无法识别（应为 男/女/未知）`);
      const intOf = (v: string | undefined, label: string) => {
        if (!v) return null;
        const n = Number(String(v).replace(/^第|世$/g, ''));
        if (!Number.isInteger(n) || n < 1 || n > 500) {
          errors.push(`${label}"${v}"不是有效的正整数`);
          return null;
        }
        return n;
      };
      const generation = intOf(r.generation, '世代');
      const rank = intOf(r.rankInSiblings, '排行');
      const generationChar = (r.generationChar ?? '').trim() || null;
      if (generationChar && generationChar.length > 4) errors.push('字辈过长（最多 4 字）');
      const bool = (v: string | undefined, label: string) => {
        const s = (v ?? '').toLowerCase();
        if (YES.has(s)) return true;
        if (NO.has(s)) return false;
        errors.push(`${label}"${v}"应填 是/否`);
        return false;
      };
      const isLiving = bool(r.isLiving, '在世');
      const isExternal = bool(r.isExternal, '外姓');
      const date = (v: string | undefined, label: string) => {
        if (!v) return null;
        const d = parseLooseDate(v);
        if (!d) errors.push(`${label}"${v}"格式不正确（应为 YYYY、YYYY-MM 或 YYYY-MM-DD；古代日期请填"原文"列）`);
        return d;
      };
      const birth = date(r.birthDate, '出生日期');
      const death = date(r.deathDate, '卒日期');
      if (birth && death && death.date < birth.date) errors.push('卒日期早于出生日期');
      if (isLiving && (death || r.deathText)) warnings.push('标记为在世，但填写了卒年');
      const relationType = RELATION_IN[(r.relationType ?? '').trim().toLowerCase()];
      if (!relationType) errors.push(`与父母关系"${r.relationType}"无法识别（亲生/收养/过继/兼祧）`);
      const tooLong = (v: string | undefined, label: string, max: number) => {
        if (v && v.length > max) errors.push(`${label}过长（最多 ${max} 字）`);
        return v?.trim() || null;
      };

      let action: ImportRowPreview['action'] = 'create';
      if (isUuid(key)) {
        if (existingById.has(key)) {
          action = 'skip';
          warnings.push('谱中已有该人物（按 ID），将跳过，仅用于关联父母/配偶');
        } else errors.push('编号是 ID 格式，但本谱中不存在该人物');
      }
      if (byKey.has(key)) errors.push(`编号"${key}"重复（与第 ${byKey.get(key)!.rowNo} 行）`);

      const row: ImportRowPreview = {
        rowNo: r.rowNo,
        key,
        fullName: surname + givenName,
        gender: gender ?? 'unknown',
        generation,
        generationChar,
        finalGeneration: generation,
        finalGenerationChar: generationChar,
        fatherKey: r.fatherKey?.trim() || null,
        motherKey: r.motherKey?.trim() || null,
        spouseKeys: splitKeys(r.spouseKeys ?? ''),
        action,
        errors,
        warnings,
        data: {
          surname,
          givenName,
          gender: gender ?? 'unknown',
          generation,
          generationChar,
          rankInSiblings: rank,
          courtesyName: tooLong(r.courtesyName, '字', 30),
          artName: tooLong(r.artName, '号', 30),
          nickname: tooLong(r.nickname, '小名', 30),
          birthText: tooLong(r.birthText, '出生(原文)', 60),
          birthDate: birth?.date ?? null,
          birthPrecision: birth?.precision ?? null,
          deathText: tooLong(r.deathText, '卒(原文)', 60),
          deathDate: death?.date ?? null,
          deathPrecision: death?.precision ?? null,
          isLiving,
          isExternal,
          ancestralHome: tooLong(r.ancestralHome, '祖籍', 100),
          birthPlace: tooLong(r.birthPlace, '出生地', 100),
          burialPlace: tooLong(r.burialPlace, '葬地', 200),
          occupation: tooLong(r.occupation, '职业', 100),
          biography: r.biography?.trim() || null,
          relationType: relationType ?? 'biological',
          privacyLevel: isLiving ? 'members' : 'public',
        },
      };
      if (!byKey.has(key)) byKey.set(key, row);
      rows.push(row);
    }

    // 解析引用：本表编号 → 谱中 ID → 谱中唯一姓名
    type Ref = { kind: 'row'; row: ImportRowPreview } | { kind: 'db'; id: string; gender: Gender; generation: number | null; isExternal: boolean; name: string };
    const resolve = (row: ImportRowPreview, ref: string, label: string): Ref | null => {
      if (ref === row.key) {
        row.errors.push(`${label}不能是本人`);
        return null;
      }
      const inFile = byKey.get(ref);
      if (inFile) {
        if (inFile.action === 'skip') {
          const e = existingById.get(inFile.key)!;
          return { kind: 'db', id: e.id, gender: e.gender, generation: e.generation, isExternal: e.is_external, name: e.full_name };
        }
        return { kind: 'row', row: inFile };
      }
      if (isUuid(ref)) {
        const e = existingById.get(ref);
        if (e) return { kind: 'db', id: e.id, gender: e.gender, generation: e.generation, isExternal: e.is_external, name: e.full_name };
        row.errors.push(`${label}"${ref}"在本谱中不存在`);
        return null;
      }
      const named = existingByName.get(ref) ?? [];
      if (named.length === 1) {
        const e = named[0];
        row.warnings.push(`${label}按姓名匹配到谱中已有人物"${e.full_name}"${e.generation ? `（第${e.generation}世）` : ''}`);
        return { kind: 'db', id: e.id, gender: e.gender, generation: e.generation, isExternal: e.is_external, name: e.full_name };
      }
      if (named.length > 1) row.errors.push(`${label}"${ref}"在谱中有 ${named.length} 位同名，请改填人物 ID`);
      else row.errors.push(`找不到${label}"${ref}"（既不是本表编号，也不是谱中人物）`);
      return null;
    };
    const refGender = (r: Ref) => (r.kind === 'row' ? r.row.gender : r.gender);
    const refExternal = (r: Ref) => (r.kind === 'row' ? !!r.row.data.isExternal : r.isExternal);

    const parentsOf = new Map<ImportRowPreview, { father: Ref | null; mother: Ref | null }>();
    const marriages = new Set<string>();
    const refId = (r: Ref | { kind: 'row'; row: ImportRowPreview }) => (r.kind === 'row' ? `row:${r.row.key}` : `db:${r.id}`);
    for (const row of rows) {
      if (row.action === 'skip') continue;
      const father = row.fatherKey ? resolve(row, row.fatherKey, '父亲') : null;
      const mother = row.motherKey ? resolve(row, row.motherKey, '母亲') : null;
      if (father && refGender(father) === 'female') row.warnings.push('父亲的性别为女');
      if (mother && refGender(mother) === 'male') row.warnings.push('母亲的性别为男');
      parentsOf.set(row, { father, mother });
      for (const sk of row.spouseKeys) {
        const sp = resolve(row, sk, '配偶');
        if (!sp) continue;
        const g1 = row.gender;
        const g2 = refGender(sp);
        if (!((g1 === 'male' && g2 === 'female') || (g1 === 'female' && g2 === 'male'))) {
          row.errors.push(`无法确定与配偶"${sk}"的夫妻关系，请填写双方性别（一男一女）`);
          continue;
        }
        const self = refId({ kind: 'row', row });
        const pair = g1 === 'male' ? `${self}|${refId(sp)}` : `${refId(sp)}|${self}`;
        marriages.add(pair);
      }
    }

    // 环检测（本表内父子关系）
    const state = new Map<ImportRowPreview, number>();
    const visit = (row: ImportRowPreview, stack: ImportRowPreview[]): boolean => {
      const s = state.get(row);
      if (s === 2) return false;
      if (s === 1) {
        row.errors.push('父子关系存在循环');
        return true;
      }
      state.set(row, 1);
      const p = parentsOf.get(row);
      for (const ref of [p?.father, p?.mother]) if (ref?.kind === 'row' && visit(ref.row, [...stack, row])) {
        if (!row.errors.includes('父子关系存在循环')) row.errors.push('父子关系存在循环');
      }
      state.set(row, 2);
      return false;
    };
    for (const row of rows) visit(row, []);

    // 世代/字辈推算：按父系（主线）递推；字辈诗校验
    const genOf = (ref: Ref | null, seen: Set<ImportRowPreview>): number | null => {
      if (!ref) return null;
      if (ref.kind === 'db') return ref.isExternal ? null : ref.generation;
      return ref.row.data.isExternal ? null : compute(ref.row, seen);
    };
    const done = new Set<ImportRowPreview>();
    const compute = (row: ImportRowPreview, seen: Set<ImportRowPreview>): number | null => {
      if (done.has(row) || seen.has(row)) return row.finalGeneration;
      seen.add(row);
      const p = parentsOf.get(row);
      const parentGens = [genOf(p?.father ?? null, seen), genOf(p?.mother ?? null, seen)];
      const isExternal = !!row.data.isExternal;
      const c = checkGeneration(
        { generation: row.generation, generationChar: row.generationChar, givenName: String(row.data.givenName ?? ''), isExternal },
        { poem: clan.generationPoem, poemStartGeneration: clan.poemStartGeneration, parentGenerations: parentGens },
      );
      row.finalGeneration = isExternal ? row.generation : c.suggestedGeneration;
      row.finalGenerationChar = isExternal ? row.generationChar : c.suggestedGenerationChar;
      for (const w of c.warnings) if (!row.warnings.includes(w)) row.warnings.push(w);
      if (!isExternal && row.finalGeneration == null) row.warnings.push('无法推算世代（无父母世代信息），将留空');
      done.add(row);
      return row.finalGeneration;
    };
    for (const row of rows) if (row.action === 'create') compute(row, new Set());
    for (const row of rows) {
      row.data.generation = row.finalGeneration;
      row.data.generationChar = row.finalGenerationChar;
      const p = parentsOf.get(row);
      row.data.fatherRef = p?.father ? refId(p.father) : null;
      row.data.motherRef = p?.mother ? refId(p.mother) : null;
      if (p?.father && p.mother && refExternal(p.father) && refExternal(p.mother)) row.warnings.push('父母均为外姓');
    }
    const live = rows.filter((r) => r.action === 'create');
    const summary: ImportSummary = {
      totalRows: rows.length,
      toCreate: live.length,
      skipped: rows.length - live.length,
      errorRows: rows.filter((r) => r.errors.length).length,
      warningRows: rows.filter((r) => r.warnings.length).length,
      parentLinks: live.reduce((n, r) => n + (r.data.fatherRef ? 1 : 0) + (r.data.motherRef ? 1 : 0), 0),
      marriages: marriages.size,
    };
    (summary as any).marriagePairs = [...marriages];
    return { rows, summary };
  }

  private async loadBatch(user: AuthUser, id: string) {
    if (!isUuid(id)) throw new NotFoundException('导入批次不存在');
    const b = await this.ds.getRepository(ImportBatchEntity).findOne({ where: { id } });
    if (!b) throw new NotFoundException('导入批次不存在');
    await this.access.clanAccess(user, b.clanId, 'admin');
    return b;
  }

  async getBatch(user: AuthUser, id: string) {
    return this.toPreview(await this.loadBatch(user, id));
  }

  async discard(user: AuthUser, id: string) {
    const b = await this.loadBatch(user, id);
    if (b.status === 'preview') await this.ds.getRepository(ImportBatchEntity).update(id, { status: 'discarded' });
  }

  async commit(user: AuthUser, id: string): Promise<ImportCommitResult> {
    const b = await this.loadBatch(user, id);
    if (b.status !== 'preview') throw new BadRequestException(b.status === 'committed' ? '该批次已导入' : '该批次已放弃');
    if (b.rows.some((r) => r.errors.length)) throw new BadRequestException('存在错误行，请修改 Excel 后重新上传预览');
    const clanId = b.clanId;
    const result = await this.ds
      .transaction(async (em) => {
        const locked = await em.query(`UPDATE import_batch SET status = 'committed', committed_at = now() WHERE id = $1 AND status = 'preview' RETURNING id`, [id]);
        if (!returningRows(locked).length) throw new BadRequestException('该批次已处理');
        const ids = new Map<string, string>();
        const toId = (ref: unknown) => {
          if (typeof ref !== 'string') return null;
          if (ref.startsWith('db:')) return ref.slice(3);
          return ids.get(ref.slice(4)) ?? null;
        };
        const repo = em.getRepository(PersonEntity);
        const live = b.rows.filter((r) => r.action === 'create');
        for (const r of live) {
          const d = r.data as Record<string, any>;
          const saved = await repo.save(
            repo.create({
              clanId,
              surname: d.surname,
              givenName: d.givenName,
              gender: d.gender,
              generation: d.generation,
              generationChar: d.generationChar,
              rankInSiblings: d.rankInSiblings,
              courtesyName: d.courtesyName,
              artName: d.artName,
              nickname: d.nickname,
              birthText: d.birthText,
              birthDate: d.birthDate,
              birthPrecision: d.birthPrecision,
              deathText: d.deathText,
              deathDate: d.deathDate,
              deathPrecision: d.deathPrecision,
              isLiving: d.isLiving,
              isExternal: d.isExternal,
              ancestralHome: d.ancestralHome,
              birthPlace: d.birthPlace,
              burialPlace: d.burialPlace,
              occupation: d.occupation,
              biography: d.biography,
              privacyLevel: d.privacyLevel,
            }),
          );
          ids.set(r.key, saved.id);
        }
        let parentLinks = 0;
        for (const r of live) {
          const d = r.data as Record<string, any>;
          for (const ref of [d.fatherRef, d.motherRef]) {
            const pid = toId(ref);
            if (!pid) continue;
            const ins = await em.query(
              `INSERT INTO parent_child (clan_id, parent_id, child_id, relation_type, is_main_line, sort_order)
               VALUES ($1,$2,$3,$4,true,$5) ON CONFLICT (parent_id, child_id) DO NOTHING RETURNING id`,
              [clanId, pid, ids.get(r.key), d.relationType ?? 'biological', d.rankInSiblings ?? 0],
            );
            parentLinks += ins.length;
          }
        }
        let marriages = 0;
        for (const pair of ((b.summary as any).marriagePairs ?? []) as string[]) {
          const [h, w] = pair.split('|').map(toId);
          if (!h || !w) continue;
          const ins = await em.query(
            `INSERT INTO marriage (clan_id, husband_id, wife_id, type, "order")
             VALUES ($1,$2,$3,'principal',
                     (SELECT count(*) + 1 FROM marriage WHERE husband_id = $2))
             ON CONFLICT (husband_id, wife_id) DO NOTHING RETURNING id`,
            [clanId, h, w],
          );
          marriages += ins.length;
        }
        const res: ImportCommitResult = { created: live.length, parentLinks, marriages };
        await this.audit.log(
          { clanId, userId: user.id, entity: 'import_batch', entityId: id, action: 'import-commit', after: { fileName: b.fileName, ...res, personIds: [...ids.values()] } },
          em,
        );
        return res;
      })
      .catch((e) => {
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException(`导入失败：谱中数据可能已变更，请重新上传预览（${(e as Error).message}）`);
      });
    this.kinship.invalidate(clanId);
    return result;
  }

  // ---------- 导出 ----------
  private async gather(em: EntityManager | DataSource, clanId: string) {
    const q = (sql: string) => em.query(sql, [clanId]);
    // 同一事务连接上须顺序执行
    const persons = await q(`SELECT * FROM person WHERE clan_id = $1 ORDER BY generation NULLS LAST, rank_in_siblings NULLS LAST, created_at`);
    const parentChild = await q(`SELECT * FROM parent_child WHERE clan_id = $1`);
    const marriages = await q(`SELECT * FROM marriage WHERE clan_id = $1`);
    const events = await q(`SELECT * FROM life_event WHERE clan_id = $1 ORDER BY person_id, sort_order, event_date`);
    const media = await q(`SELECT id, person_id, type, category, storage_key, mime_type, size, caption, taken_text, description, duration, width, height, created_at FROM media WHERE clan_id = $1`);
    const oralHistories = await q(`SELECT * FROM oral_history WHERE clan_id = $1`);
    const documents = await q(`SELECT * FROM clan_document WHERE clan_id = $1 ORDER BY sort_order`);
    const memorialMessages = await q(`SELECT m.id, m.person_id, m.content, m.created_at, u.display_name AS author FROM memorial_message m LEFT JOIN app_user u ON u.id = m.user_id WHERE m.clan_id = $1`);
    return { persons, parentChild, marriages, events, media, oralHistories, documents, memorialMessages };
  }

  async export(user: AuthUser, clanId: string, format: string, res: Response) {
    const { clan } = await this.access.clanAccess(user, clanId, 'admin');
    if (format !== 'xlsx' && format !== 'json') throw new BadRequestException('格式应为 xlsx 或 json');
    const data = await this.ds.transaction('REPEATABLE READ', (em) => this.gather(em, clanId));
    const stamp = new Date().toISOString().slice(0, 10);
    await this.audit.log({ clanId, userId: user.id, entity: 'clan', entityId: clanId, action: 'export', after: { format, persons: data.persons.length } });
    if (format === 'json') {
      const { createdBy, ...clanInfo } = clan as any;
      void createdBy;
      const body = JSON.stringify({ format: 'zupu-export', version: 1, exportedAt: new Date().toISOString(), clan: clanInfo, ...data }, null, 2);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', contentDisposition(`${clan.name}-全量数据-${stamp}.json`));
      res.end(body);
      return;
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = '族谱系统';
    const name = new Map<string, string>(data.persons.map((p: any) => [p.id, p.full_name]));
    const ws = this.memberSheet(wb);
    const mainParents = new Map<string, { father?: string; mother?: string; relationType?: string }>();
    const genderOf = new Map<string, string>(data.persons.map((p: any) => [p.id, p.gender]));
    for (const pc of data.parentChild.filter((x: any) => x.is_main_line)) {
      const e = mainParents.get(pc.child_id) ?? {};
      if (genderOf.get(pc.parent_id) === 'female') e.mother ??= pc.parent_id;
      else e.father ??= pc.parent_id;
      e.relationType = pc.relation_type;
      mainParents.set(pc.child_id, e);
    }
    const spouses = new Map<string, string[]>();
    for (const m of data.marriages) spouses.set(m.husband_id, [...(spouses.get(m.husband_id) ?? []), m.wife_id]);
    const yn = (b: boolean) => (b ? '是' : '否');
    for (const p of data.persons) {
      const mp = mainParents.get(p.id);
      ws.addRow({
        key: p.id,
        surname: p.surname,
        givenName: p.given_name,
        gender: GENDER_LABELS[p.gender as Gender],
        generation: p.generation,
        generationChar: p.generation_char,
        rankInSiblings: p.rank_in_siblings,
        fatherKey: mp?.father ?? null,
        motherKey: mp?.mother ?? null,
        spouseKeys: (spouses.get(p.id) ?? []).join('、') || null,
        relationType: mp?.relationType ? RELATION_TYPE_LABELS[mp.relationType as RelationType] : null,
        courtesyName: p.courtesy_name,
        artName: p.art_name,
        nickname: p.nickname,
        birthText: p.birth_text,
        birthDate: p.birth_date,
        deathText: p.death_text,
        deathDate: p.death_date,
        isLiving: yn(p.is_living),
        ancestralHome: p.ancestral_home,
        birthPlace: p.birth_place,
        burialPlace: p.burial_place,
        occupation: p.occupation,
        isExternal: yn(p.is_external),
        biography: p.biography ? String(p.biography).replace(/<[^>]+>/g, '') : null,
      });
    }
    const sheet = (title: string, cols: [string, number][], rows: unknown[][]) => {
      const s = wb.addWorksheet(title);
      s.columns = cols.map(([header, width]) => ({ header, width }));
      s.getRow(1).font = { bold: true };
      rows.forEach((r) => s.addRow(r));
    };
    sheet(
      '亲子关系',
      [['父/母', 14], ['子女', 14], ['关系', 10], ['宗法主线', 10], ['父/母 ID', 38], ['子女 ID', 38]],
      data.parentChild.map((x: any) => [name.get(x.parent_id), name.get(x.child_id), RELATION_TYPE_LABELS[x.relation_type as RelationType], yn(x.is_main_line), x.parent_id, x.child_id]),
    );
    sheet(
      '婚姻',
      [['夫', 14], ['妻', 14], ['类型', 10], ['次序', 8], ['夫 ID', 38], ['妻 ID', 38]],
      data.marriages.map((x: any) => [name.get(x.husband_id), name.get(x.wife_id), MARRIAGE_TYPE_LABELS[x.type as keyof typeof MARRIAGE_TYPE_LABELS], x.order, x.husband_id, x.wife_id]),
    );
    sheet(
      '生平事迹',
      [['人物', 14], ['类型', 10], ['事件', 24], ['时间', 16], ['日期', 12], ['地点', 20], ['描述', 50]],
      data.events.map((x: any) => [name.get(x.person_id), x.type, x.title, x.event_text, x.event_date, x.place, x.description]),
    );
    sheet(
      '口述历史',
      [['人物', 14], ['标题', 24], ['讲述人', 12], ['录制时间', 14], ['文字整理稿', 80]],
      data.oralHistories.map((x: any) => [name.get(x.person_id), x.title, x.narrator, x.recorded_text, x.transcript]),
    );
    sheet(
      '家族文献',
      [['类别', 10], ['标题', 24], ['内容', 100]],
      data.documents.map((x: any) => [CLAN_DOCUMENT_KIND_LABELS[x.kind as keyof typeof CLAN_DOCUMENT_KIND_LABELS], x.title, x.content ? String(x.content).replace(/<[^>]+>/g, '') : '']),
    );
    sheet(
      '多媒体清单',
      [['人物', 14], ['类型', 8], ['说明', 24], ['大小(字节)', 12], ['存储路径', 70]],
      data.media.map((x: any) => [name.get(x.person_id), x.type, x.caption, Number(x.size) || null, x.storage_key]),
    );
    await this.send(res, wb, `${clan.name}-全量数据-${stamp}.xlsx`);
  }
}

@Controller()
export class ImportExportController {
  constructor(private readonly svc: ImportExportService) {}

  @Get('clans/:clanId/import/template')
  @LoginRequired()
  template(@CurrentUser() u: AuthUser, @Param('clanId') clanId: string, @Res() res: Response) {
    return this.svc.template(u, clanId, res);
  }

  @Post('clans/:clanId/import/preview')
  @LoginRequired()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: heritageConfig.import.maxFileMb * 1024 * 1024 } }))
  preview(@CurrentUser() u: AuthUser, @Param('clanId') clanId: string, @UploadedFile() file: Express.Multer.File) {
    return this.svc.preview(u, clanId, file);
  }

  @Get('import-batches/:id')
  @LoginRequired()
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.getBatch(u, id);
  }

  @Post('import-batches/:id/commit')
  @LoginRequired()
  commit(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.commit(u, id);
  }

  @Delete('import-batches/:id')
  @LoginRequired()
  discard(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.discard(u, id);
  }

  @Get('clans/:clanId/export')
  @LoginRequired()
  export(@CurrentUser() u: AuthUser, @Param('clanId') clanId: string, @Query('format') format: string, @Res() res: Response) {
    return this.svc.export(u, clanId, format ?? 'xlsx', res);
  }
}
