import { Logger } from '@nestjs/common';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { DataSource } from 'typeorm';
import {
  cnNumber,
  ganzhiOf,
  layoutPedigree,
  paginateChart,
  parseGenerationPoem,
  PEDIGREE_STYLE_LABELS,
  toChineseDigits,
  type PedigreeChart,
  type PedigreeResponse,
  type PedigreeStyle,
} from '@zupu/shared';
import type { ClanEntity } from '../../entities';

const logger = new Logger('PedigreePdf');

export interface CjkFont {
  path: string;
  family?: string;
}

const KNOWN_FAMILIES = [
  'NotoSerifCJKsc-Regular',
  'SourceHanSerifSC-Regular',
  'NotoSansCJKsc-Regular',
  'SourceHanSansSC-Regular',
  'STSongti-SC-Regular',
  'SimSun',
  'WenQuanYiZenHei',
  'WenQuanYiMicroHei',
];
const FONT_FILE = /(NotoSerifCJK|SourceHanSerif|NotoSansCJK|SourceHanSans|Songti|simsun|wqy-zenhei|wqy-microhei|NotoSerifSC|NotoSansSC)[^/]*\.(ttc|otf|ttf)$/i;
const FONT_DIRS = ['/usr/share/fonts', '/usr/local/share/fonts', '/System/Library/Fonts', '/Library/Fonts', 'C:/Windows/Fonts'];

function findFontFiles(dir: string, depth = 0, out: string[] = []): string[] {
  if (depth > 4 || !existsSync(dir)) return out;
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    try {
      if (statSync(p).isDirectory()) findFontFiles(p, depth + 1, out);
      else if (FONT_FILE.test(p)) out.push(p);
    } catch {
      /* 忽略无权限文件 */
    }
  }
  return out;
}

/** 字体能否被 pdfkit 加载（TTC 需给出字体名） */
function usable(path: string, family?: string): CjkFont | null {
  const tryOne = (fam?: string) => {
    try {
      const doc = new PDFDocument({ autoFirstPage: false });
      doc.registerFont('t', path, fam as any);
      doc.font('t');
      return { path, family: fam };
    } catch {
      return null;
    }
  };
  if (family) return tryOne(family);
  if (!/\.ttc$/i.test(path)) return tryOne();
  for (const f of KNOWN_FAMILIES) {
    const r = tryOne(f);
    if (r) return r;
  }
  return null;
}

let cached: CjkFont | null | undefined;

/** 中文字体：PDF_FONT_PATH（+ PDF_FONT_FAMILY）优先，否则在常见字体目录查找思源/Noto CJK、宋体等 */
export function resolveCjkFont(): CjkFont | null {
  if (cached !== undefined) return cached;
  const env = process.env.PDF_FONT_PATH;
  if (env) {
    cached = existsSync(env) ? usable(env, process.env.PDF_FONT_FAMILY || undefined) : null;
    if (!cached) logger.warn(`PDF_FONT_PATH 不可用：${env}`);
    return cached;
  }
  const files = FONT_DIRS.flatMap((d) => findFontFiles(d)).sort((a, b) => rank(a) - rank(b));
  for (const f of files) {
    const r = usable(f);
    if (r) {
      logger.log(`PDF 中文字体：${f}${r.family ? `（${r.family}）` : ''}`);
      return (cached = r);
    }
  }
  logger.warn('未找到中文字体，吊线谱 PDF 不可用');
  return (cached = null);
}

function rank(p: string) {
  const order = [/Serif/i, /Songti|simsun/i, /Sans/i, /wqy/i];
  const i = order.findIndex((r) => r.test(p));
  return i < 0 ? 99 : i;
}

export interface FrontMatter {
  title: string;
  paragraphs: string[];
}

function htmlToParagraphs(html: string): string[] {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h\d|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 卷首：谱序、凡例、家训、族规（M2 的 clan_document 表），再附字辈诗。
 * 按列名自适应读取，表不存在时跳过。
 */
export async function loadFrontMatter(ds: DataSource, clan: ClanEntity): Promise<FrontMatter[]> {
  const out: FrontMatter[] = [];
  try {
    const [{ t }] = await ds.query(`SELECT to_regclass('public.clan_document') AS t`);
    if (t) {
      const cols: string[] = (await ds.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'clan_document'`)).map((r: any) => r.column_name);
      const pickCol = (names: string[]) => names.find((n) => cols.includes(n));
      const titleCol = pickCol(['title', 'name']);
      const bodyCol = pickCol(['content', 'body', 'html', 'text']);
      const typeCol = pickCol(['type', 'category', 'kind', 'doc_type']);
      const orderCol = pickCol(['sort_order', 'order', 'created_at']);
      if (titleCol && bodyCol && cols.includes('clan_id')) {
        const rows: { title: string; body: string; type: string | null }[] = await ds.query(
          `SELECT "${titleCol}" AS title, "${bodyCol}" AS body, ${typeCol ? `"${typeCol}"` : 'NULL'} AS type
             FROM clan_document WHERE clan_id = $1 ${orderCol ? `ORDER BY "${orderCol}"` : ''}`,
          [clan.id],
        );
        // M2 的 kind：preface 谱序 / conventions 凡例 / family_rules 家训 / clan_rules 族规
        const KIND_ORDER: Record<string, number> = { preface: 0, conventions: 1, family_rules: 2, clan_rules: 3 };
        const weight = (r: { title: string; type: string | null }) => {
          if (r.type && r.type in KIND_ORDER) return KIND_ORDER[r.type];
          const s = r.title ?? '';
          if (/谱序|序/.test(s)) return 0;
          if (/凡例/.test(s)) return 1;
          if (/家训|祖训/.test(s)) return 2;
          if (/家规|族规|宗规/.test(s)) return 3;
          return 9;
        };
        for (const r of rows.filter((x) => weight(x) < 9).sort((a, b) => weight(a) - weight(b)))
          out.push({ title: r.title, paragraphs: htmlToParagraphs(String(r.body ?? '')) });
      }
    }
  } catch (e) {
    logger.warn(`读取家族文献失败：${(e as Error).message}`);
  }
  const poem = parseGenerationPoem(clan.generationPoem);
  if (poem.length) {
    const lines: string[] = [];
    for (let i = 0; i < poem.length; i += 10) lines.push(poem.slice(i, i + 10).join(''));
    out.push({
      title: '字辈',
      paragraphs: [...lines, `自第${cnNumber(clan.poemStartGeneration)}世起，依次取用。`],
    });
  }
  return out;
}

const PAPER = { A4: [841.89, 595.28], A3: [1190.55, 841.89] } as const;
const RED = '#8b1e1e';
const INK = '#1a1a1a';

interface RenderInput {
  data: PedigreeResponse;
  clan: ClanEntity;
  style: PedigreeStyle;
  paper: 'A4' | 'A3';
  font: CjkFont;
  front: FrontMatter[];
  cover: boolean;
}

/** 生成可印刷的谱书 PDF：封面 → 卷首（谱序/凡例/家训/族规/字辈）→ 世系图（横向自右向左分页） */
export function renderPedigreePdf(input: RenderInput): Promise<Buffer> {
  const { data, clan, style, paper, font, front } = input;
  const [W, H] = PAPER[paper];
  const doc = new PDFDocument({
    autoFirstPage: false,
    margin: 0,
    info: { Title: `${clan.name}·吊线谱`, Author: clan.name, Subject: PEDIGREE_STYLE_LABELS[style], Creator: '族谱' },
  });
  doc.registerFont('cjk', font.path, font.family as any);
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const M = 34; // 版框外边距
  const frame = { x0: M, y0: M, x1: W - M, y1: H - M };
  let pageNo = 0;

  const vtext = (text: string, cx: number, top: number, size: number, color = INK, gap = 1.0) => {
    doc.font('cjk').fontSize(size).fillColor(color);
    let y = top;
    for (const ch of [...text]) {
      // 以字母基线定位（与 Web 端 SVG 一致），避免不同字体行高导致的偏移
      if (ch.trim()) doc.text(ch, cx - size / 2, y + size * 0.86, { width: size, align: 'center', lineBreak: false, baseline: 'alphabetic' });
      y += size * gap;
    }
  };

  const newPage = (label: string, numbered = true) => {
    doc.addPage({ size: [W, H], margin: 0 });
    pageNo++;
    doc.lineWidth(2.2).strokeColor(RED).rect(frame.x0, frame.y0, frame.x1 - frame.x0, frame.y1 - frame.y0).stroke();
    doc.lineWidth(0.6).rect(frame.x0 + 4, frame.y0 + 4, frame.x1 - frame.x0 - 8, frame.y1 - frame.y0 - 8).stroke();
    // 版心（右侧）：书名 + 篇名
    const bx = frame.x1 - 26;
    doc.lineWidth(0.6).moveTo(frame.x1 - 48, frame.y0 + 4).lineTo(frame.x1 - 48, frame.y1 - 4).stroke();
    vtext(clan.name, bx, frame.y0 + 18, 12, RED);
    vtext(label, bx, frame.y1 - 20 - [...label].length * 12, 12, RED);
    if (numbered) {
      doc.font('cjk').fontSize(9).fillColor('#666');
      const s = `第${toChineseDigits(String(pageNo))}页`;
      doc.text(s, 0, H - M + 10, { width: W, align: 'center', lineBreak: false });
    }
    return { x0: frame.x0 + 16, y0: frame.y0 + 18, x1: frame.x1 - 60, y1: frame.y1 - 18 };
  };

  // ---------- 封面 ----------
  if (input.cover) {
    doc.addPage({ size: [W, H], margin: 0 });
    pageNo++;
    doc.lineWidth(3).strokeColor(RED).rect(M, M, W - 2 * M, H - 2 * M).stroke();
    doc.lineWidth(1).rect(M + 6, M + 6, W - 2 * M - 12, H - 2 * M - 12).stroke();
    const title = `${clan.name.replace(/·/g, '')}族谱`;
    const size = Math.min(48, (H - 2 * M - 120) / [...title].length);
    // 题签
    const tx = W / 2;
    const th = [...title].length * size + 40;
    doc.lineWidth(1.5).rect(tx - size / 2 - 16, (H - th) / 2, size + 32, th).stroke();
    vtext(title, tx, (H - th) / 2 + 20, size, INK);
    if (clan.hallName) vtext(clan.hallName, tx + size + 60, (H - th) / 2 + 20, 26, RED);
    const root = data.persons.find((p) => p.id === data.rootId);
    const sub = `${PEDIGREE_STYLE_LABELS[style].replace(/（.*）/, '')}吊线世系图　自${root ? root.surname + root.givenName : ''}公以下${cnNumber(data.generations)}世`;
    vtext(sub, tx - size - 50, (H - th) / 2 + 20, 14, INK);
    const now = new Date().getFullYear();
    vtext(`公元${toChineseDigits(String(now))}年岁次${ganzhiOf(now)}　敬修`, tx - size - 80, (H - th) / 2 + 20, 12, '#555');
  }

  // ---------- 卷首 ----------
  for (const fm of front) {
    let r = newPage(fm.title);
    const titleSize = 20;
    const bodySize = paper === 'A3' ? 16 : 13;
    const colW = bodySize * 1.9;
    const perCol = Math.floor((r.y1 - r.y0) / bodySize);
    let x = r.x1 - titleSize;
    vtext(fm.title, x, r.y0 + 10, titleSize, RED);
    x -= titleSize * 2.2;
    for (const para of fm.paragraphs) {
      const chars = ['　', '　', ...toChineseDigits(para)];
      for (let i = 0; i < chars.length; i += perCol) {
        if (x < r.x0 + colW / 2) {
          r = newPage(fm.title);
          x = r.x1 - bodySize;
        }
        vtext(chars.slice(i, i + perCol).join(''), x, r.y0, bodySize, INK);
        doc.lineWidth(0.3).strokeColor('#d8b4b4').moveTo(x - colW / 2, r.y0 - 6).lineTo(x - colW / 2, r.y1 + 6).stroke();
        x -= colW;
      }
    }
  }

  // ---------- 世系图 ----------
  const sample = newPageRegion();
  let charts = layoutPedigree(data, { style });
  // 苏式一图到底时若缩得过小，按纸张高度分表
  const fitScale = (cs: PedigreeChart[]) => Math.min(...cs.map((c) => (sample.y1 - sample.y0) / c.height));
  if (style === 'su') {
    for (let per = data.generations; per >= 3 && fitScale(charts) < 0.6; per--) charts = layoutPedigree(data, { style, gensPerChart: per });
  }
  charts.forEach((chart, ci) => {
    const labelW = style === 'ou' ? 30 : 0;
    const regionH = sample.y1 - sample.y0;
    const regionW = sample.x1 - sample.x0 - labelW;
    const s = Math.min(1, regionH / chart.height);
    const pages = paginateChart(chart, regionW / s);
    pages.forEach(([cx0, cx1], pi) => {
      const label = `世系${charts.length > 1 ? cnNumber(ci + 1) : ''}`;
      const r = newPage(label);
      const right = r.x1 - labelW;
      const ox = right - cx1 * s;
      const oy = r.y0 + (regionH - chart.height * s) / 2;
      // 表题
      if (pi === 0) {
        doc.font('cjk').fontSize(10).fillColor('#555');
        doc.text(chart.title, r.x0, r.y0 - 14, { width: right - r.x0, align: 'right', lineBreak: false });
      }
      // 世代分栏（欧式）
      if (style === 'ou') {
        doc.lineWidth(0.5).strokeColor('#c9a45c');
        for (const b of chart.bands) {
          const y = oy + b.y * s;
          doc.moveTo(r.x0, y).lineTo(r.x1, y).stroke();
          vtext(b.label, right + labelW / 2, y + (b.height * s) / 2 - ([...b.label].length * 11) / 2, 11, RED);
        }
        const last = chart.bands[chart.bands.length - 1];
        if (last) {
          const y = oy + (last.y + last.height) * s;
          doc.moveTo(r.x0, y).lineTo(r.x1, y).stroke();
        }
        doc.moveTo(right, oy + (chart.bands[0]?.y ?? 0) * s).lineTo(right, last ? oy + (last.y + last.height) * s : r.y1).stroke();
      }
      doc.save();
      doc.rect(r.x0, r.y0 - 2, right - r.x0, regionH + 4).clip();
      doc.lineWidth(0.8).strokeColor(INK);
      for (const line of chart.lines) {
        const [a, ...rest] = line;
        doc.moveTo(ox + a[0] * s, oy + a[1] * s);
        for (const p of rest) doc.lineTo(ox + p[0] * s, oy + p[1] * s);
        doc.stroke();
      }
      for (const n of chart.nodes) {
        if (n.x1 < cx0 - 1 || n.x0 > cx1 + 1) continue;
        for (const c of n.columns) vtext(c.text, ox + c.x * s, oy + c.y * s, c.size * s, c.kind === 'name' ? INK : '#444');
        if (n.continues) vtext('下接', ox + n.anchorX * s, oy + (n.nameBottom + 4) * s, 7 * s + 2, RED);
      }
      doc.restore();
    });
  });

  if (!data.persons.length) {
    const r = newPage('世系');
    vtext('无世系资料', (r.x0 + r.x1) / 2, r.y0 + 40, 20);
  }

  doc.end();
  return done;

  function newPageRegion() {
    return { x0: frame.x0 + 16, y0: frame.y0 + 18, x1: frame.x1 - 60, y1: frame.y1 - 18 };
  }
}
