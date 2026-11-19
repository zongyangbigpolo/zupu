// 示例数据生成器（虚构家族，仅用于演示）。
// 陇西堂李氏·湘潭支：13 代、约 400 人，含配偶、继配、过继、兼祧、女儿后代、在世成员与重名。

export interface SeedPerson {
  key: string;
  surname: string;
  givenName: string;
  gender: 'male' | 'female';
  generation: number | null;
  generationChar: string | null;
  rankInSiblings: number | null;
  birthYear: number;
  deathYear: number | null;
  isLiving: boolean;
  isExternal: boolean;
  courtesyName?: string;
  artName?: string;
  nickname?: string;
  occupation?: string;
  biography?: string;
  ancestralHome?: string;
  birthPlace?: string;
  burialPlace?: string;
  privacyLevel?: 'public' | 'members' | 'admins';
}

export interface SeedParent {
  parent: string;
  child: string;
  relationType: 'biological' | 'adopted' | 'heir' | 'jiantiao';
  isMainLine: boolean;
  sortOrder: number;
}

export interface SeedMarriage {
  husband: string;
  wife: string;
  type: 'principal' | 'successor' | 'concubine' | 'other';
  order: number;
}

export interface SeedEvent {
  person: string;
  title: string;
  type: string;
  year: number;
  place?: string;
  description?: string;
}

export const LI_POEM = '文德光宗祖，诗书振家声。忠孝传世远，仁义继芳名。';

const REIGNS: [string, number, number][] = [
  ['顺治', 1644, 1661],
  ['康熙', 1662, 1722],
  ['雍正', 1723, 1735],
  ['乾隆', 1736, 1795],
  ['嘉庆', 1796, 1820],
  ['道光', 1821, 1850],
  ['咸丰', 1851, 1861],
  ['同治', 1862, 1874],
  ['光绪', 1875, 1908],
  ['宣统', 1909, 1911],
];

const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
function cnYear(n: number) {
  if (n === 1) return '元';
  if (n < 10) return CN[n];
  if (n < 20) return '十' + CN[n - 10];
  return CN[Math.floor(n / 10)] + '十' + CN[n % 10];
}

/** 公历年 → 年号纪年原文，如 1691 → 康熙三十年 */
export function reignText(year: number): string {
  for (const [name, s, e] of REIGNS) if (year >= s && year <= e) return `${name}${cnYear(year - s + 1)}年`;
  if (year >= 1912 && year <= 1948) return `民国${cnYear(year - 1911)}年`;
  return `${year}年`;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const NAME2 = '华明德昌荣贵安康寿福禄祥瑞泰和平清远亮宏俊杰辉耀林森涛海峰山松柏文武斌彬'.split('');
const FEMALE = '秀英兰芳梅桂珍玉凤娟淑贞琴霞丽婉'.split('');
const WIFE_SURNAMES = '王张刘陈杨黄赵周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯'.split('');
const PLACES = ['湘潭县白石铺', '湘潭县花石镇', '长沙府善化县', '湘乡县', '衡山县', '湘潭县易俗河'];
const JOBS_OLD = ['务农', '私塾先生', '经商', '郎中', '木匠', '县学生员'];
const JOBS_NEW = ['教师', '工程师', '医生', '公务员', '个体经营', '工人', '软件工程师', '学生'];

export function generateLiClan() {
  const r = rng(20241119);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const persons: SeedPerson[] = [];
  const parents: SeedParent[] = [];
  const marriages: SeedMarriage[] = [];
  const events: SeedEvent[] = [];
  const poem = Array.from(LI_POEM.replace(/[，。]/g, ''));
  let seq = 0;
  const usedNames = new Map<string, number>();

  const add = (p: Omit<SeedPerson, 'key'>): SeedPerson => {
    const sp = { ...p, key: `p${++seq}` };
    persons.push(sp);
    return sp;
  };
  const link = (parent: SeedPerson, child: SeedPerson, sortOrder: number, relationType: SeedParent['relationType'] = 'biological', isMainLine = true) =>
    parents.push({ parent: parent.key, child: child.key, relationType, isMainLine, sortOrder });

  const living = (birthYear: number) => birthYear >= 1938;
  const lifespan = (birthYear: number) => {
    if (living(birthYear)) return null;
    const d = birthYear + 45 + Math.floor(r() * 40);
    return Math.min(d, 2023);
  };

  const maleName = (gen: number) => {
    const ch = poem[gen - 1] ?? null;
    for (let i = 0; i < 20; i++) {
      const g = (ch ?? '') + pick(NAME2);
      if (g[0] === g[1]) continue;
      if (!usedNames.has(g)) {
        usedNames.set(g, 1);
        return { givenName: g, generationChar: ch };
      }
    }
    return { givenName: (ch ?? '') + pick(NAME2), generationChar: ch };
  };

  const addWife = (husband: SeedPerson, type: SeedMarriage['type'] = 'principal', order = 1) => {
    const by = husband.birthYear + Math.floor(r() * 5) - 1;
    const modern = by >= 1920;
    const w = add({
      surname: pick(WIFE_SURNAMES),
      givenName: modern ? pick(FEMALE) + pick(FEMALE) : '氏',
      gender: 'female',
      generation: null,
      generationChar: null,
      rankInSiblings: null,
      birthYear: by,
      deathYear: lifespan(by),
      isLiving: living(by),
      isExternal: true,
      birthPlace: pick(PLACES),
    });
    marriages.push({ husband: husband.key, wife: w.key, type, order });
    return w;
  };

  const addChildren = (
    father: SeedPerson,
    mother: SeedPerson | null,
    sons: number,
    daughters: number,
    startRank = 1,
  ): SeedPerson[] => {
    const gen = (father.generation ?? 0) + 1;
    const out: SeedPerson[] = [];
    const total = sons + daughters;
    const kids = Array.from({ length: total }, (_, i) => (i < sons ? 'm' : 'f'));
    kids.sort(() => r() - 0.5);
    let sr = startRank;
    let dr = 1;
    let y = father.birthYear + 22 + Math.floor(r() * 6);
    for (const k of kids) {
      const by = y;
      y += 2 + Math.floor(r() * 3);
      const isMale = k === 'm';
      const nm = isMale ? maleName(gen) : { givenName: pick(FEMALE) + (gen < 9 ? '姑' : pick(FEMALE)), generationChar: null };
      const c = add({
        surname: '李',
        ...nm,
        gender: isMale ? 'male' : 'female',
        generation: gen,
        rankInSiblings: isMale ? sr++ : dr++,
        birthYear: by,
        deathYear: lifespan(by),
        isLiving: living(by),
        isExternal: false,
        birthPlace: gen <= 2 ? '江西吉安府' : pick(PLACES),
        occupation: by >= 1940 ? pick(JOBS_NEW) : isMale ? pick(JOBS_OLD) : undefined,
      });
      link(father, c, c.rankInSiblings ?? 0);
      if (mother) link(mother, c, c.rankInSiblings ?? 0);
      out.push(c);
    }
    return out;
  };

  // ---------- 第 1 世：始祖 ----------
  const founder = add({
    surname: '李',
    givenName: '文远',
    gender: 'male',
    generation: 1,
    generationChar: '文',
    rankInSiblings: 1,
    birthYear: 1652,
    deathYear: 1721,
    isLiving: false,
    isExternal: false,
    courtesyName: '致和',
    artName: '湘野',
    ancestralHome: '江西吉安府泰和县',
    birthPlace: '江西吉安府泰和县',
    burialPlace: '湘潭县白石铺狮形山',
    occupation: '垦殖',
    privacyLevel: 'public',
    biography:
      '<p>文远公，字致和，号湘野。原籍江西吉安府泰和县，<strong>康熙二十三年</strong>随"江西填湖广"之迁徙潮携家人入湘，择湘潭白石铺而居，垦荒置田，为本支始迁祖。</p><p>公勤俭持家，教子以耕读，晚年手订家训十条，族人世守之。</p>',
  });
  usedNames.set('文远', 1);
  events.push(
    { person: founder.key, title: '自江西泰和迁居湘潭', type: '迁徙', year: 1684, place: '湘潭县白石铺', description: '江西填湖广，携妻儿入湘。' },
    { person: founder.key, title: '手订家训十条', type: '家训', year: 1715, place: '湘潭县白石铺' },
  );
  const founderWife = addWife(founder);

  const target = [1, 2, 3, 4, 6, 8, 9, 10, 10, 10, 10, 9, 7];
  let active: { p: SeedPerson; wife: SeedPerson }[] = [{ p: founder, wife: founderWife }];
  const special: Record<string, SeedPerson> = {};

  for (let gen = 1; gen <= 12; gen++) {
    const nextMales: SeedPerson[] = [];
    for (const [idx, { p, wife }] of active.entries()) {
      if (p.key === special.heirFather?.key || p.key === special.jtUncle?.key) continue; // 无子
      let sons = 1 + Math.floor(r() * 2.2);
      const daughters = Math.floor(r() * 2.2);
      if (gen === 1) sons = 2;
      if (gen === 4 && idx === 0) sons = 2; // 为过继准备兄弟
      if (gen === 7 && idx === 1) sons = 2; // 为兼祧准备兄弟
      if (gen === 7 && idx === 0) {
        // 继配：元配早逝，继配续生
        const kids1 = addChildren(p, wife, 1, 1);
        const w2 = addWife(p, 'successor', 2);
        const kids2 = addChildren(p, w2, 1, 0, 2);
        special.twoWives = p;
        nextMales.push(...[...kids1, ...kids2].filter((k) => k.gender === 'male'));
        continue;
      }
      const kids = addChildren(p, wife, sons, daughters);
      nextMales.push(...kids.filter((k) => k.gender === 'male'));
      // 女儿后代入谱：第 9 世一位女儿外嫁张氏，其子孙有资料则入谱
      if (gen === 8 && !special.daughter) {
        const d = kids.find((k) => k.gender === 'female');
        if (d) special.daughter = d;
      }
    }

    // 第 5 世：两兄弟，兄无子，弟之次子过继给兄（出继）
    if (gen === 4) {
      const [elder, younger] = nextMales;
      special.heirFather = elder;
      special.heirBioFather = younger;
    }
    // 第 8 世：兼祧——兄有独子，弟无子，独子一人承两房
    if (gen === 7) {
      const brothers = nextMales.filter((m) => parents.some((x) => x.child === m.key && x.parent === active[1]?.p.key));
      if (brothers.length >= 2) {
        special.jtFather = brothers[0];
        special.jtUncle = brothers[1];
      }
    }

    // 选出下一代继续繁衍的支系
    const next = nextMales.slice(0, target[gen] ?? 8);
    // 保证过继、兼祧相关人物都在活跃支系中
    for (const k of ['heirFather', 'heirBioFather', 'jtFather', 'jtUncle'] as const) {
      const s = special[k];
      if (s && s.generation === gen + 1 && !next.includes(s)) next.push(s);
    }
    active = next.map((p) => ({ p, wife: addWife(p) }));

    // 过继处理：弟弟至少两个儿子，次子过继给兄
    if (gen === 5 && special.heirBioFather && special.heirFather) {
      const bio = special.heirBioFather;
      const bioKids = parents.filter((x) => x.parent === bio.key).map((x) => persons.find((p) => p.key === x.child)!);
      let sons = bioKids.filter((k) => k.gender === 'male');
      if (sons.length < 2) {
        const bioWife = marriages.find((m) => m.husband === bio.key)!;
        const extra = addChildren(bio, persons.find((p) => p.key === bioWife.wife)!, 1, 0, sons.length + 1);
        sons = [...sons, ...extra];
        active.push({ p: extra[0], wife: addWife(extra[0]) });
      }
      const heir = sons[1];
      // 生父一支改为非主线（出继），嗣父一支为主线（过继）
      for (const pc of parents) if (pc.child === heir.key) pc.isMainLine = false;
      link(special.heirFather, heir, 1, 'heir', true);
      const hfWife = marriages.find((m) => m.husband === special.heirFather.key);
      if (hfWife) parents.push({ parent: hfWife.wife, child: heir.key, relationType: 'heir', isMainLine: true, sortOrder: 1 });
      heir.biography = `<p>本生父${bio.surname}${bio.givenName}，出继伯父${special.heirFather.surname}${special.heirFather.givenName}为嗣，承其宗祧。</p>`;
      special.heir = heir;
      events.push({ person: heir.key, title: `出继伯父${special.heirFather.givenName}公为嗣`, type: '过继', year: heir.birthYear + 3 });
    }
    if (gen === 8 && special.jtFather && special.jtUncle) {
      const son = parents
        .filter((x) => x.parent === special.jtFather.key)
        .map((x) => persons.find((p) => p.key === x.child)!)
        .find((p) => p.gender === 'male');
      if (son) {
        link(special.jtUncle, son, 1, 'jiantiao', true);
        son.biography = `<p>以一子兼祧两房：承父${special.jtFather.givenName}公与叔父${special.jtUncle.givenName}公之祀。</p>`;
        special.jiantiao = son;
      }
    }
  }

  // ---------- 女儿后代：外嫁张氏，子孙入谱 ----------
  const d = special.daughter;
  if (d) {
    const h = add({
      surname: '张',
      givenName: '国栋',
      gender: 'male',
      generation: null,
      generationChar: null,
      rankInSiblings: null,
      birthYear: d.birthYear - 2,
      deathYear: lifespan(d.birthYear - 2),
      isLiving: living(d.birthYear - 2),
      isExternal: true,
      birthPlace: '湘潭县花石镇',
    });
    marriages.push({ husband: h.key, wife: d.key, type: 'principal', order: 1 });
    d.biography = `<p>适同邑张国栋，生子女三人，其后人有资料者附录于谱。</p>`;
    let prev = [h, d];
    let y = d.birthYear + 24;
    for (let g = 1; g <= 3; g++) {
      const n = g === 1 ? 2 : 1;
      const kids: SeedPerson[] = [];
      for (let i = 0; i < n; i++) {
        const by = y + i * 3;
        const c = add({
          surname: '张',
          givenName: pick(NAME2) + pick(NAME2),
          gender: i === 1 ? 'female' : 'male',
          generation: (d.generation ?? 0) + g,
          generationChar: null,
          rankInSiblings: i + 1,
          birthYear: by,
          deathYear: lifespan(by),
          isLiving: living(by),
          isExternal: true,
          birthPlace: '湘潭县花石镇',
        });
        for (const p of prev) link(p, c, i + 1);
        kids.push(c);
      }
      const son = kids[0];
      const w = addWife(son);
      prev = [son, w];
      y += 26;
    }
  }

  // ---------- 重名：不同支系两位"李光明" ----------
  const gen3 = persons.filter((p) => p.generation === 3 && p.gender === 'male' && !p.isExternal);
  if (gen3.length >= 2) {
    gen3[0].givenName = '光明';
    gen3[gen3.length - 1].givenName = '光明';
  }

  // ---------- 名人事迹 ----------
  const g4 = persons.find((p) => p.generation === 4 && p.gender === 'male')!;
  g4.courtesyName = '子敬';
  g4.occupation = '县学生员';
  g4.biography = '<p>公少颖悟，乾隆年间入县学为生员，设馆授徒三十余年，乡人称"宗先生"。</p>';
  events.push({ person: g4.key, title: '入县学为生员', type: '科举', year: g4.birthYear + 19, place: '湘潭县学' });
  const g9 = persons.find((p) => p.generation === 9 && p.gender === 'male' && !p.isExternal)!;
  g9.occupation = '商人';
  g9.biography = '<p>光绪末年往汉口经营茶叶，家道中兴，捐资重修宗祠。</p>';
  events.push(
    { person: g9.key, title: '赴汉口经营茶叶', type: '迁徙', year: g9.birthYear + 20, place: '汉口' },
    { person: g9.key, title: '捐资重修李氏宗祠', type: '公益', year: g9.birthYear + 35, place: '湘潭县白石铺' },
  );

  // 已故者葬地
  for (const p of persons) if (!p.isLiving && !p.isExternal && !p.burialPlace && r() < 0.4) p.burialPlace = `${pick(PLACES)}祖山`;

  return { persons, parents, marriages, events, special };
}

/** 第二个家族（演示多租户隔离）：太原堂王氏，私密 */
export function generateWangClan() {
  const persons: SeedPerson[] = [];
  const parents: SeedParent[] = [];
  const marriages: SeedMarriage[] = [];
  const mk = (key: string, givenName: string, generation: number, by: number, gender: 'male' | 'female' = 'male', ext = false, surname = '王'): SeedPerson => {
    const p: SeedPerson = {
      key,
      surname,
      givenName,
      gender,
      generation: ext ? null : generation,
      generationChar: ext ? null : '仁义礼智信'[generation - 1] ?? null,
      rankInSiblings: ext ? null : 1,
      birthYear: by,
      deathYear: by < 1938 ? by + 70 : null,
      isLiving: by >= 1938,
      isExternal: ext,
    };
    persons.push(p);
    return p;
  };
  const a = mk('w1', '仁山', 1, 1880);
  const aw = mk('w1w', '氏', 0, 1882, 'female', true, '陈');
  const b = mk('w2', '义和', 2, 1905);
  const bw = mk('w2w', '氏', 0, 1907, 'female', true, '刘');
  const c = mk('w3', '礼平', 3, 1932);
  const cw = mk('w3w', '桂兰', 0, 1934, 'female', true, '周');
  const d = mk('w4', '智勇', 4, 1960);
  marriages.push({ husband: a.key, wife: aw.key, type: 'principal', order: 1 });
  marriages.push({ husband: b.key, wife: bw.key, type: 'principal', order: 1 });
  marriages.push({ husband: c.key, wife: cw.key, type: 'principal', order: 1 });
  for (const [p, ch] of [
    [a, b],
    [aw, b],
    [b, c],
    [bw, c],
    [c, d],
    [cw, d],
  ] as const)
    parents.push({ parent: p.key, child: ch.key, relationType: 'biological', isMainLine: true, sortOrder: 1 });
  return { persons, parents, marriages, events: [] as SeedEvent[] };
}
