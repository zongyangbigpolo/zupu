// 生日 / 忌日的公历、农历换算（基于 lunar-javascript，MIT）
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Lunar, LunarYear, Solar } = require('lunar-javascript');

export type Calendar = 'solar' | 'lunar';

export interface AnnualDate {
  calendar: Calendar;
  month: number;
  day: number;
  isLeapMonth?: boolean;
  year?: number | null;
}

const LUNAR_MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const DAY_TENS = ['初', '十', '廿', '三'];
const DAY_UNITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export function lunarDayText(d: number) {
  if (d === 10) return '初十';
  if (d === 20) return '二十';
  if (d === 30) return '三十';
  return DAY_TENS[Math.floor(d / 10)] + DAY_UNITS[(d % 10) - 1];
}

export function annualDateText(a: AnnualDate) {
  if (a.calendar === 'lunar') return `农历${a.isLeapMonth ? '闰' : ''}${LUNAR_MONTHS[a.month - 1]}月${lunarDayText(a.day)}`;
  return `公历${a.month}月${a.day}日`;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** 北京时间的今天 YYYY-MM-DD */
export function cnToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function cnHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false }).format(now)) % 24;
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400_000);
}

export function addDays(date: string, n: number) {
  const d = new Date(Date.parse(date + 'T00:00:00Z') + n * 86400_000);
  return d.toISOString().slice(0, 10);
}

export function isValidAnnualDate(a: AnnualDate) {
  if (!Number.isInteger(a.month) || a.month < 1 || a.month > 12 || !Number.isInteger(a.day) || a.day < 1) return false;
  if (a.calendar === 'lunar') return a.day <= 30;
  if (a.isLeapMonth) return false;
  return a.day <= new Date(Date.UTC(2000, a.month, 0)).getUTCDate(); // 2000 为闰年，允许 2 月 29 日
}

function solarInYear(a: AnnualDate, y: number) {
  const max = new Date(Date.UTC(y, a.month, 0)).getUTCDate();
  return ymd(y, a.month, Math.min(a.day, max)); // 2 月 29 日在平年按 2 月 28 日
}

/**
 * 农历某年的该日对应的公历日期：
 * - 闰月出生：当年有该闰月则过闰月，否则过正常月份（民间通行做法）；
 * - 小月没有三十：按该月最后一天（廿九）。
 */
function lunarInYear(a: AnnualDate, ly: number): string {
  const year = LunarYear.fromYear(ly);
  const useLeap = !!a.isLeapMonth && year.getLeapMonth() === a.month;
  const m = useLeap ? -a.month : a.month;
  const lm = year.getMonth(m);
  const day = Math.min(a.day, lm.getDayCount());
  return Lunar.fromYmd(ly, m, day).getSolar().toYmd();
}

/** 从 from（含）开始的下一次公历日期，以及对应的（公历或农历）年份 */
export function nextOccurrence(a: AnnualDate, from: string): { date: string; year: number } {
  const [fy] = from.split('-').map(Number);
  if (a.calendar === 'solar') {
    for (const y of [fy, fy + 1]) {
      const d = solarInYear(a, y);
      if (d >= from) return { date: d, year: y };
    }
  } else {
    const [y, m, d] = from.split('-').map(Number);
    const ly = Solar.fromYmd(y, m, d).getLunar().getYear();
    for (const year of [ly - 1, ly, ly + 1]) {
      const date = lunarInYear(a, year);
      if (date >= from) return { date, year };
    }
  }
  throw new Error('无法计算下一次日期');
}
