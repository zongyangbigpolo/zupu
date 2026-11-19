// 字辈推算与校验、重名消歧标签。纯函数，前后端共用。

const POEM_STRIP = /[\s，。、；：！？,.;:!?·\-—（）()《》"'“”‘’\[\]【】]/g;

/** 把字辈诗拆成单字数组（去掉空格与标点） */
export function parseGenerationPoem(poem: string | null | undefined): string[] {
  if (!poem) return [];
  return Array.from(poem.replace(POEM_STRIP, ''));
}

/** 按世代号推算字辈；超出字辈诗范围返回 null */
export function expectedGenerationChar(
  poem: string | null | undefined,
  poemStartGeneration: number,
  generation: number | null | undefined,
): string | null {
  if (generation == null) return null;
  const chars = parseGenerationPoem(poem);
  const idx = generation - (poemStartGeneration || 1);
  return idx >= 0 && idx < chars.length ? chars[idx] : null;
}

/** 由字辈反推世代号（字辈诗中首次出现的位置） */
export function generationFromChar(
  poem: string | null | undefined,
  poemStartGeneration: number,
  ch: string | null | undefined,
): number | null {
  if (!ch) return null;
  const idx = parseGenerationPoem(poem).indexOf(ch);
  return idx < 0 ? null : idx + (poemStartGeneration || 1);
}

export interface GenerationCheckInput {
  generation?: number | null;
  generationChar?: string | null;
  givenName?: string | null;
  isExternal?: boolean;
}

export interface GenerationCheckContext {
  poem: string | null | undefined;
  poemStartGeneration: number;
  /** 宗法主线父母的世代号（外姓配偶的世代可能为空） */
  parentGenerations: (number | null | undefined)[];
  childGenerations?: (number | null | undefined)[];
}

export interface GenerationCheck {
  suggestedGeneration: number | null;
  suggestedGenerationChar: string | null;
  warnings: string[];
}

/** 字辈自动推算 + 世代/字辈/父子世代差一致性校验（只给提示，不阻止保存） */
export function checkGeneration(input: GenerationCheckInput, ctx: GenerationCheckContext): GenerationCheck {
  const warnings: string[] = [];
  const parentGens = ctx.parentGenerations.filter((g): g is number => typeof g === 'number');
  const fromParent = parentGens.length ? Math.max(...parentGens) + 1 : null;
  const childGens = (ctx.childGenerations ?? []).filter((g): g is number => typeof g === 'number');
  const fromChild = childGens.length ? Math.min(...childGens) - 1 : null;
  const fromChar = input.isExternal
    ? null
    : generationFromChar(ctx.poem, ctx.poemStartGeneration, input.generationChar ?? null);

  const suggestedGeneration = input.generation ?? fromParent ?? fromChild ?? fromChar ?? null;
  const gen = input.generation ?? suggestedGeneration;

  if (input.generation != null && fromParent != null && input.generation !== fromParent) {
    warnings.push(`世代与父母不一致：父母为第${fromParent - 1}世，本人应为第${fromParent}世，当前填写第${input.generation}世`);
  }
  if (input.generation != null && fromChild != null && input.generation !== fromChild) {
    warnings.push(`世代与子女不一致：子女为第${fromChild + 1}世，本人应为第${fromChild}世`);
  }

  let suggestedGenerationChar: string | null = null;
  if (!input.isExternal) {
    const expected = expectedGenerationChar(ctx.poem, ctx.poemStartGeneration, gen);
    suggestedGenerationChar = input.generationChar || expected;
    if (expected && input.generationChar && input.generationChar !== expected) {
      warnings.push(`字辈不符：按字辈诗第${gen}世应为"${expected}"字辈，当前填写"${input.generationChar}"`);
    }
    const ch = input.generationChar || expected;
    if (ch && input.givenName && !input.givenName.includes(ch)) {
      warnings.push(`名字"${input.givenName}"中不含字辈"${ch}"（如属正常可忽略）`);
    }
  }
  return { suggestedGeneration, suggestedGenerationChar, warnings };
}

const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export function toChineseNumber(n: number): string {
  if (n <= 10) return CN_NUM[n] ?? String(n);
  if (n < 20) return '十' + CN_NUM[n - 10];
  if (n < 100) return CN_NUM[Math.floor(n / 10)] + '十' + (n % 10 ? CN_NUM[n % 10] : '');
  return String(n);
}

/** 排行显示：1 → 行一（长） */
export function rankLabel(rank: number | null | undefined): string | null {
  if (!rank) return null;
  return rank === 1 ? '行一' : `行${toChineseNumber(rank)}`;
}

/** 重名消歧标签："第12世·父李承德·行二" */
export function disambiguationLabel(p: {
  generation?: number | null;
  fatherName?: string | null;
  rankInSiblings?: number | null;
  birthText?: string | null;
}): string {
  const parts: string[] = [];
  if (p.generation) parts.push(`第${p.generation}世`);
  if (p.fatherName) parts.push(`父${p.fatherName}`);
  const r = rankLabel(p.rankInSiblings);
  if (r) parts.push(r);
  if (!p.fatherName && p.birthText) parts.push(`生于${p.birthText}`);
  return parts.join('·');
}

/** 生卒简写：康熙三十年—乾隆五年 */
export function lifespanText(p: {
  birthText?: string | null;
  deathText?: string | null;
  isLiving?: boolean;
}): string {
  const b = p.birthText || '?';
  if (p.isLiving) return p.birthText ? `${b}生` : '在世';
  return `${b}—${p.deathText || '?'}`;
}
