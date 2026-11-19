// M3 可视化示例数据：迁徙记录、祠堂/祖坟/祖屋、家族大事记（虚构，仅用于演示）。
import { EntityManager } from 'typeorm';
import { ChronicleEntity, MigrationRecordEntity, SiteEntity, SitePersonEntity } from '../entities';
import { reignText, type SeedParent, type SeedPerson } from './seed-data';

interface ClanSeed {
  clanId: string;
  ids: Map<string, string>;
  persons: SeedPerson[];
  parents: SeedParent[];
}

const P = {
  陇西: [104.6345, 35.0035],
  泰和: [114.9083, 26.7905],
  白石铺: [112.7342, 27.6316],
  湘乡: [112.5357, 27.7346],
  衡山: [112.8686, 27.2306],
  汉口: [114.2833, 30.5866],
  长沙: [112.9388, 28.2282],
  广州: [113.2644, 23.1291],
  深圳: [114.0579, 22.5431],
  上海: [121.4737, 31.2304],
  太原: [112.5489, 37.8706],
  济南: [117.1201, 36.6512],
} as const;

export async function seedVisualization(em: EntityManager, li: ClanSeed, wang: ClanSeed) {
  const byKey = new Map(li.persons.map((p) => [p.key, p]));
  const parentOf = new Map<string, string>();
  for (const pc of li.parents) {
    const parent = byKey.get(pc.parent);
    if (pc.isMainLine && parent && !parent.isExternal && !parentOf.has(pc.child)) parentOf.set(pc.child, pc.parent);
  }
  const gen2 = li.persons.filter((p) => p.generation === 2 && p.gender === 'male' && !p.isExternal);
  const BRANCH = ['长房', '二房', '三房', '四房'];
  const branchOf = (p: SeedPerson) => {
    let k: string | undefined = p.key;
    while (k && byKey.get(k)!.generation! > 2) k = parentOf.get(k);
    const i = gen2.findIndex((g) => g.key === k);
    return i >= 0 ? BRANCH[i] : null;
  };
  const males = (gen: number) => li.persons.filter((p) => p.generation === gen && p.gender === 'male' && !p.isExternal);
  const id = (p: SeedPerson) => li.ids.get(p.key)!;
  const founder = li.persons[0];

  const mig = em.getRepository(MigrationRecordEntity);
  const m = (
    p: SeedPerson | null,
    from: keyof typeof P,
    fromName: string,
    to: keyof typeof P,
    toName: string,
    year: number,
    reason: string,
    precision: 'year' | 'approx' = 'year',
  ) => ({
    clanId: li.clanId,
    personId: p ? id(p) : null,
    branchName: p ? branchOf(p) ?? '本支' : '远祖',
    fromPlace: fromName,
    fromLng: P[from][0],
    fromLat: P[from][1],
    toPlace: toName,
    toLng: P[to][0],
    toLat: P[to][1],
    year,
    datePrecision: precision,
    dateText: precision === 'approx' ? `约唐末（${year}年前后）` : reignText(year),
    reason,
  });

  const g6 = males(6)[males(6).length - 1];
  const g9 = males(9)[0];
  const g10 = males(10).find((p) => branchOf(p) !== branchOf(g9)) ?? males(10)[0];
  const g11 = males(11)[1] ?? males(11)[0];
  const g12 = li.persons.filter((p) => p.isLiving && !p.isExternal && p.gender === 'male' && (p.generation ?? 0) >= 12).sort((a, b) => a.birthYear - b.birthYear)[0] ?? males(12)[0];
  const g7 = males(7)[0];
  const records = [
    m(null, '陇西', '陇西郡', '泰和', '江西吉安府泰和县', 880, '唐末黄巢之乱，远祖自陇西南迁入赣', 'approx'),
    m(founder, '泰和', '江西吉安府泰和县', '白石铺', '湖南湘潭县白石铺', 1684, '"江西填湖广"，携妻儿入湘垦荒'),
    m(g6, '白石铺', '湘潭县白石铺', '湘乡', '湘乡县', g6.birthYear + 24, '分房置业，迁居湘乡'),
    m(g7, '白石铺', '湘潭县白石铺', '衡山', '衡山县', g7.birthYear + 26, '咸同兵燹，避乱衡山'),
    m(g9, '白石铺', '湘潭县白石铺', '汉口', '湖北汉口', g9.birthYear + 20, '往汉口经营茶叶'),
    m(g10, '白石铺', '湘潭县白石铺', '长沙', '长沙', g10.birthYear + 22, '求学任教，定居长沙'),
    m(g11, '长沙', '长沙', '广州', '广州', g11.birthYear + 25, '工作调动'),
    m(g12, '广州', '广州', '深圳', '深圳', Math.max(g12.birthYear + 23, 1985), '改革开放后赴深圳创业'),
  ];
  await mig.insert(records.map((r, i) => ({ ...r, sortOrder: i })));
  await mig.insert({
    clanId: wang.clanId,
    personId: wang.ids.get('w3') ?? null,
    branchName: '本支',
    fromPlace: '山西太原',
    fromLng: P.太原[0],
    fromLat: P.太原[1],
    toPlace: '山东济南',
    toLng: P.济南[0],
    toLat: P.济南[1],
    year: 1955,
    datePrecision: 'year',
    dateText: '1955年',
    reason: '工作调动',
  });

  const sites = em.getRepository(SiteEntity);
  const links = em.getRepository(SitePersonEntity);
  const founderWife = li.persons.find((p) => p.isExternal && p.gender === 'female');
  const mk = async (s: Partial<SiteEntity>, personIds: string[], clanId = li.clanId) => {
    const saved = await sites.save(sites.create({ ...s, clanId }));
    if (personIds.length) await links.insert(personIds.map((personId) => ({ siteId: saved.id, personId, clanId })));
    return saved;
  };
  await mk(
    {
      type: 'ancestral_hall',
      name: '陇西堂李氏宗祠',
      address: '湖南省湘潭县白石镇白石铺',
      lng: P.白石铺[0],
      lat: P.白石铺[1],
      builtText: '乾隆五十五年始建，光绪三十一年重修，二〇一九年修缮',
      intro: '<p>宗祠坐北朝南，三进两廊，正厅悬"陇西堂"匾。每年清明、冬至合族于此祭祖。</p><p>光绪末年九世孙捐资重修，二〇一九年族人集资修缮。</p>',
      sortOrder: 1,
    },
    [id(founder), id(g9)],
  );
  await mk(
    {
      type: 'tomb',
      name: '始迁祖文远公墓',
      address: '湖南省湘潭县白石镇狮形山',
      lng: 112.7455,
      lat: 27.6402,
      builtText: '康熙六十年葬',
      intro: '<p>文远公与元配合葬于狮形山南麓，坐北向南。墓碑为道光年间重立。</p>',
      sortOrder: 2,
    },
    [id(founder), ...(founderWife ? [li.ids.get(founderWife.key)!] : [])],
  );
  await mk(
    {
      type: 'ancestral_house',
      name: '白石铺老屋场',
      address: '湖南省湘潭县白石镇老屋场组',
      lng: 112.7281,
      lat: 27.6252,
      builtText: '康熙年间',
      intro: '<p>始迁祖入湘后所建祖屋，土木结构，现存正屋五间。</p>',
      sortOrder: 3,
    },
    [id(founder)],
  );
  await mk(
    {
      type: 'other',
      name: '江西泰和祖籍地',
      address: '江西省吉安市泰和县',
      lng: P.泰和[0],
      lat: P.泰和[1],
      builtText: null,
      intro: '<p>本支祖籍，始迁祖文远公由此迁湘。</p>',
      sortOrder: 4,
    },
    [],
  );
  await mk(
    { type: 'ancestral_hall', name: '太原堂王氏祠堂', address: '山西省太原市', lng: P.太原[0], lat: P.太原[1], intro: null, builtText: null },
    [],
    wang.clanId,
  );

  const chron = em.getRepository(ChronicleEntity);
  const c = (year: number, title: string, place: string | null, description: string | null, personId: string | null = null) => ({
    clanId: li.clanId,
    year,
    datePrecision: 'year' as const,
    dateText: reignText(year),
    title,
    place,
    description,
    personId,
  });
  await chron.insert([
    c(1684, '始迁祖文远公自江西泰和迁居湘潭白石铺', '湘潭县白石铺', '是为本支入湘之始。', id(founder)),
    c(1790, '首修族谱，始建李氏宗祠', '湘潭县白石铺', '合族公议，创修《陇西堂李氏族谱》四卷。'),
    c(1848, '二修族谱', '湘潭县白石铺', null),
    c(1905, '重修李氏宗祠', '湘潭县白石铺', '九世孙自汉口捐资，宗祠焕然一新。'),
    c(1947, '四修族谱', '湘潭县白石铺', null),
    c(2019, '五修族谱，宗祠修缮落成', '湘潭县白石铺', '首次编纂电子族谱。'),
  ]);
  await chron.insert({ clanId: wang.clanId, year: 1930, title: '王氏创修家谱', dateText: '民国十九年', datePrecision: 'year', place: '太原', description: null, personId: null });
}
