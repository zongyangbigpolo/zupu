import { describe, expect, it } from 'vitest';
import { KinshipGraph, computeKinship, clanTerm, type KinPerson, type KinParentEdge, type KinMarriage } from '../src/kinship/index';
import { checkGeneration, disambiguationLabel, expectedGenerationChar, parseGenerationPoem } from '../src/genealogy';

let seq = 0;
function P(id: string, gender: 'male' | 'female', generation: number | null, extra: Partial<KinPerson> = {}): KinPerson {
  seq++;
  return {
    id,
    fullName: id,
    gender,
    generation,
    generationChar: null,
    rankInSiblings: null,
    isLiving: false,
    isExternal: false,
    birthText: null,
    deathText: null,
    birthDate: null,
    ...extra,
  };
}

/*
 始祖(1) ── 长子 二房祖(2)…
 G1 ─┬─ G2a(长) ─┬─ G3a(长) ─ G4a ─ G5a ─ G6a ─ G7a
     │           └─ G3b(次) ─ G4b
     │                └─ 女 F3 (G2a之女) ─ (嫁外姓 H) ─ 子 X4
     └─ G2b(次) ─ G3c ─ G4c ─ G5c ─ G6c ─ G7c
 G3a 妻 W3a（外姓），G3a 女 D4（G4a 之妹）
 G4b 过继给 G3c 之兄弟？ 用 adopt：Ad4 生父 G3b，过继给 G3c（主线）
*/
const persons: KinPerson[] = [
  P('G1', 'male', 1),
  P('G2a', 'male', 2, { rankInSiblings: 1 }),
  P('G2b', 'male', 2, { rankInSiblings: 2 }),
  P('G3a', 'male', 3, { rankInSiblings: 1, birthDate: '1900-01-01' }),
  P('G3b', 'male', 3, { rankInSiblings: 2, birthDate: '1905-01-01' }),
  P('F3', 'female', 3, { rankInSiblings: 1, birthDate: '1902-01-01' }),
  P('H', 'male', null, { isExternal: true }),
  P('X4', 'male', null, { isExternal: true }),
  P('W3a', 'female', null, { isExternal: true }),
  P('G4a', 'male', 4, { rankInSiblings: 1, birthDate: '1925-01-01' }),
  P('D4', 'female', 4, { rankInSiblings: 1, birthDate: '1928-01-01' }),
  P('G4b', 'male', 4, { rankInSiblings: 1, birthDate: '1930-01-01' }),
  P('G5a', 'male', 5),
  P('G6a', 'male', 6),
  P('G7a', 'male', 7, { birthDate: '1990-01-01' }),
  P('G3c', 'male', 3),
  P('G4c', 'male', 4),
  P('G5c', 'male', 5),
  P('G6c', 'male', 6),
  P('G7c', 'male', 7, { birthDate: '1985-01-01' }),
  P('G8c', 'male', 8),
  P('Ad4', 'male', 4),
];
const pc = (parentId: string, childId: string, relationType: KinParentEdge['relationType'] = 'biological', isMainLine = true): KinParentEdge => ({
  parentId,
  childId,
  relationType,
  isMainLine,
});
const edges: KinParentEdge[] = [
  pc('G1', 'G2a'),
  pc('G1', 'G2b'),
  pc('G2a', 'G3a'),
  pc('G2a', 'G3b'),
  pc('G2a', 'F3'),
  pc('F3', 'X4'),
  pc('H', 'X4'),
  pc('G3a', 'G4a'),
  pc('W3a', 'G4a'),
  pc('G3a', 'D4'),
  pc('W3a', 'D4'),
  pc('G3b', 'G4b'),
  pc('G4a', 'G5a'),
  pc('G5a', 'G6a'),
  pc('G6a', 'G7a'),
  pc('G2b', 'G3c'),
  pc('G3c', 'G4c'),
  pc('G4c', 'G5c'),
  pc('G5c', 'G6c'),
  pc('G6c', 'G7c'),
  pc('G7c', 'G8c'),
  pc('G3b', 'Ad4', 'biological', false),
  pc('G3c', 'Ad4', 'heir', true),
];
const marriages: KinMarriage[] = [
  { husbandId: 'G3a', wifeId: 'W3a' },
  { husbandId: 'H', wifeId: 'F3' },
];
const g = new KinshipGraph(persons, edges, marriages);
const k = (a: string, b: string) => computeKinship(g, a, b);

describe('kinship', () => {
  it('父子', () => {
    const r = k('G4a', 'G3a');
    expect(r.termAtoB).toBe('爸爸');
    expect(r.termBtoA).toBe('儿子');
    expect(r.generationDiff).toBe(1);
    expect(r.chainText).toBe('父亲');
    expect(r.source).toBe('relationship.js');
  });

  it('叔侄：按排行区分伯/叔', () => {
    const r = k('G4a', 'G3b');
    expect(r.chainText).toBe('父亲的弟弟');
    expect(r.termAtoB).toBe('叔叔');
    expect(r.termBtoA).toBe('侄子');
    expect(r.commonAncestor?.id).toBe('G2a');
  });

  it('共同祖先优先取本族人而非外姓配偶', () => {
    const r = k('G4a', 'D4');
    expect(r.commonAncestor?.id).toBe('G3a');
  });

  it('堂兄弟：按出生日期区分兄/弟', () => {
    const r = k('G4b', 'G4a');
    expect(r.termAtoB).toBe('堂哥');
    expect(r.termBtoA).toBe('堂弟');
    expect(r.generationDiff).toBe(0);
    expect(r.generationDiffText).toBe('同辈');
    expect(r.stepsUpFromA).toBe(2);
    expect(r.stepsUpFromB).toBe(2);
  });

  it('女儿的后代可以入谱：表亲', () => {
    const r = k('G4a', 'X4');
    expect(r.chainText).toBe('父亲的妹妹的儿子');
    expect(r.termAtoB).toMatch(/表/);
    expect(r.source).toBe('relationship.js');
  });

  it('姻亲：儿媳、母亲', () => {
    expect(k('G2a', 'W3a').termAtoB).toBe('儿媳');
    const r = k('G4a', 'W3a');
    expect(r.termAtoB).toBe('妈妈');
    expect(r.steps).toHaveLength(1);
  });

  it('再从堂亲：兄/弟按出生日期取舍', () => {
    const extra = new KinshipGraph(
      [...persons, P('G5x', 'male', 5, { birthDate: '1950-01-01' }), P('G5y', 'female', 5, { birthDate: '1955-01-01' }), P('G4z', 'male', 4)],
      [...edges, pc('G4a', 'G5x'), pc('G3a', 'G4z'), pc('G4z', 'G5y')],
      marriages,
    );
    const r = computeKinship(extra, 'G5y', 'G5x');
    expect(r.termsAtoB).toHaveLength(1);
    expect(r.termAtoB).toMatch(/哥|兄/);
  });

  it('兄妹', () => {
    const r = k('G4a', 'D4');
    expect(r.termAtoB).toBe('妹妹');
    expect(r.termBtoA).toBe('哥哥');
  });

  it('过继：默认按宗法主线', () => {
    const r = k('Ad4', 'G3c');
    expect(r.termAtoB).toBe('爸爸');
    // 与生父仍有关系
    const bio = k('Ad4', 'G3b');
    expect(bio.connected).toBe(true);
  });

  it('出五服族亲：使用族亲规则', () => {
    const r = k('G7a', 'G7c');
    expect(r.stepsUpFromA).toBe(6);
    expect(r.source).toBe('clan-rule');
    expect(r.termAtoB).toBe('族兄');
    expect(r.termBtoA).toBe('族弟');
    expect(r.note).toContain('第1世祖G1');
    const r2 = k('G7a', 'G8c');
    expect(r2.termAtoB).toBe('族侄');
    expect(r2.generationDiff).toBe(-1);
    expect(r2.generationDiffText).toBe('相差一代（G7a长一辈）');
  });

  it('远代直系：N世祖', () => {
    const r = k('G7a', 'G1');
    expect(r.generationDiff).toBe(6);
    expect(r.termAtoB).toBeTruthy();
  });

  it('本人与不连通', () => {
    expect(k('G1', 'G1').termAtoB).toBe('本人');
    const lone = new KinshipGraph([P('a', 'male', 1), P('b', 'male', 3)], [], []);
    const r = computeKinship(lone, 'a', 'b');
    expect(r.connected).toBe(false);
    expect(r.generationDiff).toBe(-2);
  });

  it('族亲称谓规则表', () => {
    expect(clanTerm(1, 'male', -1)).toBe('族伯');
    expect(clanTerm(1, 'male', 1)).toBe('族叔');
    expect(clanTerm(2, 'male', 1)).toBe('族叔祖');
    expect(clanTerm(-2, 'female', 0)).toBe('族侄孙女');
    expect(clanTerm(0, 'female', 0)).toBe('族姐妹');
    expect(clanTerm(6, 'male', 0)).toBe('族中长辈（长六辈）');
  });
});

describe('字辈与消歧', () => {
  const poem = '文章华国，诗礼传家。';
  it('拆字与推算', () => {
    expect(parseGenerationPoem(poem)).toEqual(['文', '章', '华', '国', '诗', '礼', '传', '家']);
    expect(expectedGenerationChar(poem, 3, 5)).toBe('华');
    expect(expectedGenerationChar(poem, 3, 2)).toBeNull();
  });
  it('由父母推算世代与字辈', () => {
    const r = checkGeneration({ givenName: '华强' }, { poem, poemStartGeneration: 3, parentGenerations: [4, null] });
    expect(r.suggestedGeneration).toBe(5);
    expect(r.suggestedGenerationChar).toBe('华');
    expect(r.warnings).toEqual([]);
  });
  it('不一致时给出提示', () => {
    const r = checkGeneration(
      { generation: 6, generationChar: '华', givenName: '国强' },
      { poem, poemStartGeneration: 3, parentGenerations: [4] },
    );
    expect(r.warnings.length).toBe(3);
  });
  it('外姓配偶不校验字辈', () => {
    const r = checkGeneration({ givenName: '秀英', isExternal: true }, { poem, poemStartGeneration: 1, parentGenerations: [] });
    expect(r.warnings).toEqual([]);
  });
  it('重名消歧标签', () => {
    expect(disambiguationLabel({ generation: 12, fatherName: '李承德', rankInSiblings: 2 })).toBe('第12世·父李承德·行二');
  });
});

describe('五代树布局', () => {
  it('祖先层节点不重叠（一方有上代、另一方无上代）', async () => {
    const { layoutFamilyTree } = await import('../src/tree-layout');
    const n = (id: string, gender: 'male' | 'female', depth: number, role: 'center' | 'ancestor' = 'ancestor') => ({
      id, fullName: id, gender, generation: null, generationChar: null, rankInSiblings: null, isLiving: false, isExternal: false,
      birthText: null, deathText: null, role, depth, hasMoreUp: false, hasMoreDown: false,
    });
    const e = (s: string, t: string) => ({ source: s, target: t, type: 'parent' as const });
    const tree = {
      centerId: 'C', line: 'main' as const, up: 5, down: 0, truncated: false,
      nodes: [n('C', 'male', 0, 'center'), n('F', 'male', -1), n('M', 'female', -1), n('GF', 'male', -2), n('GM', 'female', -2), n('GGF', 'male', -3), n('MF', 'male', -2)],
      edges: [e('F', 'C'), e('M', 'C'), e('GF', 'F'), e('GM', 'F'), e('GGF', 'GF'), e('MF', 'M')],
    };
    const W = 110;
    const { positions } = layoutFamilyTree(tree, { nodeWidth: W });
    const rows = new Map<number, number[]>();
    for (const p of Object.values(positions)) rows.set(p.y, [...(rows.get(p.y) ?? []), p.x]);
    for (const xs of rows.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(W);
    }
  });
});
