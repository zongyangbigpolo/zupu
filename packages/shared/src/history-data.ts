// 内置历史数据：中国朝代、明清年号、历史大事（家族时间轴对照用）。公元前年份用负数表示（无公元 0 年）。

export interface Dynasty {
  name: string;
  start: number;
  /** null 表示至今 */
  end: number | null;
  color: string;
}

export const DYNASTIES: Dynasty[] = [
  { name: '夏', start: -2070, end: -1600, color: '#8c6d46' },
  { name: '商', start: -1600, end: -1046, color: '#a0522d' },
  { name: '西周', start: -1046, end: -771, color: '#b5651d' },
  { name: '春秋', start: -770, end: -476, color: '#c48a3f' },
  { name: '战国', start: -475, end: -221, color: '#9c6b30' },
  { name: '秦', start: -221, end: -207, color: '#3b3b3b' },
  { name: '西汉', start: -202, end: 8, color: '#a52a2a' },
  { name: '新', start: 9, end: 23, color: '#777' },
  { name: '东汉', start: 25, end: 220, color: '#b23a3a' },
  { name: '三国', start: 220, end: 280, color: '#6b4c9a' },
  { name: '西晋', start: 266, end: 316, color: '#4a6fa5' },
  { name: '东晋', start: 317, end: 420, color: '#5b7fb5' },
  { name: '南北朝', start: 420, end: 589, color: '#6d8b74' },
  { name: '隋', start: 581, end: 618, color: '#8f7a3a' },
  { name: '唐', start: 618, end: 907, color: '#c0392b' },
  { name: '五代十国', start: 907, end: 979, color: '#7f8c8d' },
  { name: '北宋', start: 960, end: 1127, color: '#2e86ab' },
  { name: '南宋', start: 1127, end: 1279, color: '#3d9fc4' },
  { name: '元', start: 1271, end: 1368, color: '#5d6d7e' },
  { name: '明', start: 1368, end: 1644, color: '#d35400' },
  { name: '清', start: 1644, end: 1911, color: '#b7950b' },
  { name: '中华民国', start: 1912, end: 1949, color: '#2c3e50' },
  { name: '中华人民共和国', start: 1949, end: null, color: '#c0392b' },
];

/** 明清年号（元年所在公历年）；下一年号元年的前一年为本年号末年 */
const ERAS: { dynasty: string; name: string; start: number; end: number }[] = (() => {
  const raw: [string, string, number][] = [
    ['明', '洪武', 1368], ['明', '建文', 1399], ['明', '永乐', 1403], ['明', '洪熙', 1425], ['明', '宣德', 1426],
    ['明', '正统', 1436], ['明', '景泰', 1450], ['明', '天顺', 1457], ['明', '成化', 1465], ['明', '弘治', 1488],
    ['明', '正德', 1506], ['明', '嘉靖', 1522], ['明', '隆庆', 1567], ['明', '万历', 1573], ['明', '泰昌', 1620],
    ['明', '天启', 1621], ['明', '崇祯', 1628],
    ['清', '顺治', 1644], ['清', '康熙', 1662], ['清', '雍正', 1723], ['清', '乾隆', 1736], ['清', '嘉庆', 1796],
    ['清', '道光', 1821], ['清', '咸丰', 1851], ['清', '同治', 1862], ['清', '光绪', 1875], ['清', '宣统', 1909],
  ];
  return raw.map(([dynasty, name, start], i) => {
    const next = raw[i + 1];
    // 泰昌仅一年；崇祯末年与顺治元年同为 1644，按清纪年
    const end = name === '泰昌' ? 1620 : next ? next[2] - 1 : 1911;
    return { dynasty, name, start, end };
  });
})();

export const ERA_LIST = ERAS;

export interface HistoricalEvent {
  year: number;
  title: string;
  /** 与家族迁徙相关的移民潮等 */
  tag?: 'migration' | 'war' | 'politics' | 'culture';
}

export const HISTORICAL_EVENTS: HistoricalEvent[] = [
  { year: -221, title: '秦统一六国', tag: 'politics' },
  { year: -202, title: '西汉建立', tag: 'politics' },
  { year: 105, title: '蔡伦改进造纸术', tag: 'culture' },
  { year: 220, title: '东汉灭亡，三国鼎立', tag: 'politics' },
  { year: 311, title: '永嘉之乱，衣冠南渡', tag: 'migration' },
  { year: 589, title: '隋统一南北', tag: 'politics' },
  { year: 605, title: '隋炀帝设进士科，科举制度确立', tag: 'culture' },
  { year: 618, title: '唐朝建立', tag: 'politics' },
  { year: 755, title: '安史之乱，北方士民大量南迁', tag: 'migration' },
  { year: 880, title: '黄巢入长安，唐末士族南迁', tag: 'migration' },
  { year: 960, title: '北宋建立', tag: 'politics' },
  { year: 1127, title: '靖康之变，宋室南渡', tag: 'migration' },
  { year: 1271, title: '元朝建立', tag: 'politics' },
  { year: 1368, title: '明朝建立', tag: 'politics' },
  { year: 1370, title: '明初大移民（"江西填湖广"、山西洪洞大槐树移民）', tag: 'migration' },
  { year: 1405, title: '郑和首次下西洋', tag: 'culture' },
  { year: 1644, title: '清军入关，清朝定都北京', tag: 'politics' },
  { year: 1671, title: '清廷招民垦荒，"湖广填四川"', tag: 'migration' },
  { year: 1683, title: '台湾归入清朝版图', tag: 'politics' },
  { year: 1712, title: '"盛世滋丁，永不加赋"', tag: 'politics' },
  { year: 1723, title: '雍正推行"摊丁入亩"', tag: 'politics' },
  { year: 1840, title: '鸦片战争爆发', tag: 'war' },
  { year: 1851, title: '太平天国运动兴起', tag: 'war' },
  { year: 1860, title: '东北逐步开禁，"闯关东"兴起', tag: 'migration' },
  { year: 1861, title: '洋务运动兴起', tag: 'politics' },
  { year: 1894, title: '甲午战争', tag: 'war' },
  { year: 1898, title: '戊戌变法', tag: 'politics' },
  { year: 1905, title: '清廷废除科举', tag: 'culture' },
  { year: 1911, title: '辛亥革命', tag: 'politics' },
  { year: 1912, title: '中华民国成立', tag: 'politics' },
  { year: 1919, title: '五四运动', tag: 'culture' },
  { year: 1937, title: '全面抗日战争爆发', tag: 'war' },
  { year: 1945, title: '抗日战争胜利', tag: 'war' },
  { year: 1949, title: '中华人民共和国成立', tag: 'politics' },
  { year: 1978, title: '改革开放', tag: 'politics' },
  { year: 1980, title: '设立深圳等经济特区', tag: 'migration' },
  { year: 2008, title: '北京奥运会', tag: 'culture' },
];

const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 年号序数：1 → 元，23 → 二十三 */
export function eraYearText(n: number): string {
  if (n === 1) return '元';
  if (n < 10) return DIGITS[n];
  if (n < 20) return '十' + (n % 10 ? DIGITS[n % 10] : '');
  return DIGITS[Math.floor(n / 10)] + '十' + (n % 10 ? DIGITS[n % 10] : '');
}

const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';

/** 干支纪年，如 1684 → 甲子 */
export function ganzhiOf(year: number): string {
  const y = year < 0 ? year + 1 : year; // 公元前 1 年 = 天文 0 年
  const i = (((y - 4) % 60) + 60) % 60;
  return STEMS[i % 10] + BRANCHES[i % 12];
}

/** 年份所属朝代（重叠时取较晚建立者） */
export function dynastyOf(year: number): Dynasty | null {
  let best: Dynasty | null = null;
  for (const d of DYNASTIES) if (year >= d.start && (d.end == null || year <= d.end) && (!best || d.start >= best.start)) best = d;
  return best;
}

/** 年号纪年：明清用年号，民国用民国纪年；其他返回 null */
export function reignOf(year: number): string | null {
  for (const e of ERAS) if (year >= e.start && year <= e.end) return `${e.name}${eraYearText(year - e.start + 1)}年`;
  if (year >= 1912 && year <= 1949) return `民国${year === 1912 ? '元' : eraYearText(year - 1911)}年`;
  return null;
}

/** 公历年显示，如 -221 → 公元前221年 */
export function ceYearText(year: number): string {
  return year < 0 ? `公元前${-year}年` : `${year}年`;
}

/** 完整纪年说明，如 1684 → 清 康熙二十三年（甲子，1684年） */
export function eraLabel(year: number): string {
  const d = dynastyOf(year);
  const r = reignOf(year);
  const parts = [d?.name, r].filter(Boolean).join(' ');
  return `${parts ? parts + '（' : ''}${ganzhiOf(year)}，${ceYearText(year)}${parts ? '）' : ''}`;
}
