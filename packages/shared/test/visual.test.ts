import { describe, expect, it } from 'vitest';
import { eraLabel, ganzhiOf, reignOf } from '../src/history-data';
import { lookupPlace } from '../src/gazetteer';
import { layoutPedigree, paginateChart, toChineseDigits } from '../src/pedigree-layout';
import type { PedigreePerson, PedigreeResponse } from '../src/visual';

const person = (id: string, parentId: string | null, generation: number, rank: number, extra: Partial<PedigreePerson> = {}): PedigreePerson => ({
  id,
  parentId,
  surname: '李',
  givenName: id,
  gender: 'male',
  generation,
  generationChar: null,
  rankInSiblings: rank,
  courtesyName: null,
  artName: null,
  birthText: null,
  deathText: null,
  burialPlace: null,
  spouses: [],
  relationType: null,
  isLiving: false,
  sortOrder: rank,
  ...extra,
});

function chain(gens: number): PedigreeResponse {
  // 每代两子，取长子继续：A → A1,A2 → A11,A12 ...
  const persons = [person('甲', null, 1, 1)];
  let cur = '甲';
  for (let g = 2; g <= gens; g++) {
    persons.push(person(`${cur}长`, cur, g, 1), person(`${cur}次`, cur, g, 2));
    cur = `${cur}长`;
  }
  return { clan: { id: 'c', name: '李氏', surname: '李', hallName: null }, rootId: '甲', generations: gens, persons, truncated: false };
}

describe('朝代与纪年', () => {
  it('年号、干支', () => {
    expect(reignOf(1684)).toBe('康熙二十三年');
    expect(reignOf(1662)).toBe('康熙元年');
    expect(reignOf(1644)).toBe('顺治元年');
    expect(reignOf(1930)).toBe('民国十九年');
    expect(ganzhiOf(1684)).toBe('甲子');
    expect(ganzhiOf(2024)).toBe('甲辰');
    expect(eraLabel(1684)).toBe('清 康熙二十三年（甲子，1684年）');
  });
  it('内置地名', () => {
    expect(lookupPlace('湖南湘潭县白石铺')?.name).toBe('湘潭县白石铺');
    expect(lookupPlace('江西吉安府泰和县')?.name).toBe('泰和');
    expect(lookupPlace('火星')).toBeNull();
  });
});

describe('吊线谱布局', () => {
  it('欧式五世一表，第五世为下一表之首', () => {
    const charts = layoutPedigree(chain(9), { style: 'ou' });
    expect(charts).toHaveLength(2);
    expect(charts[0].bands.map((b) => b.generation)).toEqual([1, 2, 3, 4, 5]);
    expect(charts[1].bands[0].generation).toBe(5);
    expect(charts[0].nodes.filter((n) => n.continues)).toHaveLength(1);
  });

  it('苏式一图到底；竖排自右向左，长子居右', () => {
    const [chart] = layoutPedigree(chain(6), { style: 'su' });
    expect(chart.bands).toHaveLength(6);
    const elder = chart.nodes.find((n) => n.id === '甲长')!;
    const younger = chart.nodes.find((n) => n.id === '甲次')!;
    expect(elder.anchorX).toBeGreaterThan(younger.anchorX);
    // 父亲居于诸子之上，吊线落在子女名字列中心
    const root = chart.nodes.find((n) => n.id === '甲')!;
    expect(root.anchorX).toBeLessThanOrEqual(elder.anchorX);
    expect(root.anchorX).toBeGreaterThanOrEqual(younger.anchorX);
    // 人物不重叠
    const gen2 = chart.nodes.filter((n) => n.person.generation === 2).sort((a, b) => a.x0 - b.x0);
    for (let i = 1; i < gen2.length; i++) expect(gen2[i].x0).toBeGreaterThanOrEqual(gen2[i - 1].x1);
  });

  it('欧式名旁小注含字号、生卒、配偶，数字改为汉字', () => {
    const data = chain(2);
    data.persons[1] = { ...data.persons[1], courtesyName: '子敬', birthText: '1985年3月2日', spouses: ['配王氏'] };
    const [chart] = layoutPedigree(data, { style: 'ou' });
    const note = chart.nodes.find((n) => n.id === '甲长')!.columns.filter((c) => c.kind === 'note').map((c) => c.text).join('');
    expect(note).toContain('长子');
    expect(note).toContain('字子敬');
    expect(note).toContain('生一九八五年三月二日');
    expect(note).toContain('配王氏');
    expect(toChineseDigits('民国12年')).toBe('民国十二年');
  });

  it('横向分页覆盖全部内容且从右侧开始', () => {
    const data = chain(4);
    for (let i = 0; i < 30; i++) data.persons.push(person(`旁${i}`, '甲', 2, 3 + i));
    const [chart] = layoutPedigree(data, { style: 'su' });
    const pages = paginateChart(chart, 300);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0][1]).toBe(chart.width - chart.labelWidth);
    expect(pages[pages.length - 1][0]).toBe(0);
    for (let i = 1; i < pages.length; i++) expect(pages[i][1]).toBe(pages[i - 1][0]);
  });
});
