import { formatGedDate, parseGedcom, parseGedDate, writeGedcom, type GedData, type GedPerson } from '../src/modules/gedcom/gedcom.codec';

const base: Omit<GedPerson, 'id' | 'surname' | 'givenName' | 'gender'> = {
  courtesyName: null,
  artName: null,
  nickname: null,
  generation: null,
  generationChar: null,
  rankInSiblings: null,
  birthDate: null,
  birthPrecision: null,
  birthText: null,
  deathDate: null,
  deathPrecision: null,
  deathText: null,
  isLiving: false,
  ancestralHome: null,
  birthPlace: null,
  burialPlace: null,
  biography: null,
  occupation: null,
  isExternal: false,
  privacyLevel: 'public',
};

function sample(): GedData {
  const P = (id: string, surname: string, givenName: string, gender: GedPerson['gender'], extra: Partial<GedPerson> = {}): GedPerson => ({
    ...base,
    id,
    surname,
    givenName,
    gender,
    ...extra,
  });
  return {
    persons: [
      P('a', '李', '文远', 'male', {
        courtesyName: '宏道',
        artName: '白石山人',
        generation: 1,
        generationChar: '文',
        rankInSiblings: 1,
        birthDate: '1650-01-01',
        birthPrecision: 'year',
        birthText: '顺治七年',
        deathDate: '1720-03-15',
        deathPrecision: 'day',
        deathText: '康熙五十九年二月',
        ancestralHome: '江西吉安府泰和县',
        burialPlace: '白石铺后山',
        biography: '<p>康熙二十三年迁湘潭。</p>\n<p>邮箱 a@b.c，' + '长'.repeat(300) + '</p>',
        occupation: '耕读',
      }),
      P('aw', '王', '氏', 'female', { isExternal: true }),
      P('aw2', '陈', '氏', 'female', { isExternal: true }),
      P('b', '李', '德茂', 'male', { generation: 2, generationChar: '德', rankInSiblings: 1, birthDate: '1680-01-01', birthPrecision: 'approx', birthText: '约康熙十九年' }),
      P('c', '李', '德盛', 'male', { generation: 2, generationChar: '德', rankInSiblings: 2, nickname: '二郎' }),
      P('d', '李', '光宗', 'male', { generation: 3, generationChar: '光', rankInSiblings: 1 }),
      P('e', '李', '秀英', 'female', { generation: 2, rankInSiblings: 1 }),
      P('f', '李', '诗涵', 'female', {
        generation: 12,
        isLiving: true,
        privacyLevel: 'members',
        birthDate: '1990-05-06',
        birthPrecision: 'day',
        birthText: '1990年5月6日',
      }),
    ],
    parents: [
      { parentId: 'a', childId: 'b', relationType: 'biological', isMainLine: true, sortOrder: 0 },
      { parentId: 'aw', childId: 'b', relationType: 'biological', isMainLine: true, sortOrder: 0 },
      { parentId: 'a', childId: 'c', relationType: 'biological', isMainLine: true, sortOrder: 1 },
      { parentId: 'aw2', childId: 'c', relationType: 'biological', isMainLine: true, sortOrder: 1 },
      { parentId: 'a', childId: 'e', relationType: 'biological', isMainLine: true, sortOrder: 2 },
      // 光宗：德盛所生，过继给德茂承嗣
      { parentId: 'c', childId: 'd', relationType: 'biological', isMainLine: false, sortOrder: 0 },
      { parentId: 'b', childId: 'd', relationType: 'heir', isMainLine: true, sortOrder: 0 },
    ],
    marriages: [
      { husbandId: 'a', wifeId: 'aw', type: 'principal', order: 1, startText: null, endText: null, note: null },
      { husbandId: 'a', wifeId: 'aw2', type: 'successor', order: 2, startText: '康熙三十年', endText: null, note: '继配' },
    ],
  };
}

const norm = (d: GedData) => {
  const name = new Map(d.persons.map((p) => [p.id, p.surname + p.givenName]));
  return {
    persons: d.persons.map(({ id: _id, ...p }) => p).sort((x, y) => (x.surname + x.givenName).localeCompare(y.surname + y.givenName)),
    parents: d.parents
      .map((l) => `${name.get(l.parentId)}>${name.get(l.childId)}:${l.relationType}:${l.isMainLine}`)
      .sort(),
    marriages: d.marriages.map((m) => `${name.get(m.husbandId)}+${name.get(m.wifeId)}:${m.type}:${m.order}:${m.startText}:${m.note}`).sort(),
  };
};

describe('GEDCOM 编解码', () => {
  it('往返无损：字/号/字辈/世代/排行/过继/继配/原文日期/长文本', () => {
    const src = sample();
    const text = writeGedcom(src, { clanName: '测试李氏' });
    expect(text).toContain('1 CHAR UTF-8');
    expect(text).toContain('2 VERS 5.5.1');
    expect(text).toContain('1 _ZI 宏道');
    expect(text).toContain('2 DATE INT 1650 (顺治七年)');
    expect(text).toContain('2 _ZPREL heir');
    expect(text).toContain('a@@b.c');
    expect(text.split('\r\n').every((l) => Array.from(l).length <= 255)).toBe(true);
    const back = parseGedcom(text);
    expect(back.errors).toEqual([]);
    expect(norm(back)).toEqual(norm(src));
  });

  it('日期格式', () => {
    expect(formatGedDate('1720-03-15', 'day', null)).toBe('15 MAR 1720');
    expect(formatGedDate('1720-03-01', 'month', null)).toBe('MAR 1720');
    expect(formatGedDate('1680-01-01', 'approx', '约康熙十九年')).toBe('ABT 1680');
    expect(formatGedDate(null, null, '民国初年')).toBe('(民国初年)');
    expect(parseGedDate('INT 1650 (顺治七年)')).toEqual({ date: '1650-01-01', precision: 'year', text: '顺治七年' });
    expect(parseGedDate('BEF 1900').precision).toBe('approx');
    expect(parseGedDate('31 FEB 1900').date).toBeNull();
    expect(parseGedDate('12 MAY 950').date).toBe('0950-05-12');
  });

  it('兼容其他软件导出的标准 GEDCOM，并给出校验信息', () => {
    const text = [
      '0 HEAD',
      '1 SOUR OtherApp',
      '1 GEDC',
      '2 VERS 5.5.1',
      '1 CHAR UTF-8',
      '0 @P1@ INDI',
      '1 NAME John /Smith/',
      '1 SEX M',
      '1 BIRT',
      '2 DATE ABT 1800',
      '1 NOTE @N1@',
      '1 FAMS @F1@',
      '0 @P2@ INDI',
      '1 NAME Mary',
      '1 SEX F',
      '1 FAMS @F1@',
      '0 @P3@ INDI',
      '1 NAME Tom /Smith/',
      '1 FAMC @F1@',
      '2 PEDI adopted',
      '0 @F1@ FAM',
      '1 HUSB @P1@',
      '1 WIFE @P2@',
      '1 CHIL @P3@',
      '1 CHIL @P9@',
      '0 @N1@ NOTE A farmer',
      '1 CONT and a teacher',
      '0 TRLR',
    ].join('\n');
    const r = parseGedcom(text, { defaultSurname: '李' });
    expect(r.errors).toEqual([]);
    expect(r.persons).toHaveLength(3);
    expect(r.persons[0].biography).toBe('A farmer\nand a teacher');
    expect(r.persons[0].birthPrecision).toBe('approx');
    expect(r.persons[1].surname).toBe('李');
    expect(r.parents.filter((l) => l.childId === '@P3@').every((l) => l.relationType === 'adopted')).toBe(true);
    expect(r.marriages).toHaveLength(1);
    expect(r.warnings.map((w) => w.message).join()).toMatch(/缺少姓氏/);
    expect(r.warnings.map((w) => w.message).join()).toMatch(/@P9@/);
  });

  it('错误：非 GEDCOM、循环关系', () => {
    expect(parseGedcom('hello world').errors.length).toBeGreaterThan(0);
    const cyc = [
      '0 HEAD',
      '0 @A@ INDI',
      '1 NAME 甲 /李/',
      '1 FAMC @F2@',
      '0 @B@ INDI',
      '1 NAME 乙 /李/',
      '1 FAMC @F1@',
      '0 @F1@ FAM',
      '1 HUSB @A@',
      '1 CHIL @B@',
      '0 @F2@ FAM',
      '1 HUSB @B@',
      '1 CHIL @A@',
      '0 TRLR',
    ].join('\n');
    expect(parseGedcom(cyc).errors.map((e) => e.message).join()).toMatch(/循环/);
  });
});
