import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

const TIANGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DIZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const KE = ['初', '一', '二', '三', '四', '五', '六', '七'];
const CN_NUM = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 干支纪年: 2024→甲辰, 2025→乙巳, 2026→丙午, ... */
function ganzhiYear(year: number): string {
  const g = ((year - 4) % 10 + 10) % 10;
  const z = ((year - 4) % 12 + 12) % 12;
  return TIANGAN[g] + DIZHI[z];
}

/**
 * 时辰 + 刻: 子时 23–01, 丑 01–03, …, 亥 21–23.
 * Each 时辰 = 2 hours = 8 刻 (15 min/刻). Returns e.g. { shichen: '卯时', ke: '一刻' }.
 */
function shichenAndKe(hour: number, minute: number) {
  // Shift the day so 子时 starts at 0 minutes-of-day, simplifying division.
  const minutesOfDay = hour * 60 + minute;
  const shifted = (minutesOfDay + 60) % (24 * 60);
  const s = Math.floor(shifted / 120);
  const m = shifted % 120;
  const k = Math.floor(m / 15);
  return { shichen: SHICHEN[s] + '时', ke: KE[k] + '刻' };
}

/** 十八 / 二十一 / 三十: proper numeral form for day-of-month (1–31). */
function toCnDay(n: number): string {
  if (n < 1 || n > 31) return String(n);
  if (n < 10) return CN_NUM[n];
  if (n === 10) return '十';
  if (n < 20) return '十' + CN_NUM[n - 10];
  if (n === 20) return '二十';
  if (n < 30) return '二十' + CN_NUM[n - 20];
  if (n === 30) return '三十';
  return '三十' + CN_NUM[n - 30];
}

/** Lunar month name for a Gregorian month — not real 农历, just elegant naming. */
const MONTH_ALIAS = [
  '正月', '杏月', '桃月', '槐月', '榴月', '荷月',
  '兰月', '桂月', '菊月', '阳月', '葭月', '腊月',
];

/** A ticking 干支 / 时辰 / 刻 clock — replaces YYYY-MM-DD HH:mm:ss with classical Chinese. */
export default function LiveClock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    // 刻 only changes every 15 minutes, but ticking every 20 s keeps the title
    // tooltip fresh and lets us roll over to a new 刻 without a perceptible lag.
    const id = window.setInterval(() => setNow(dayjs()), 20_000);
    return () => window.clearInterval(id);
  }, []);

  const year = ganzhiYear(now.year());
  const month = MONTH_ALIAS[now.month()];
  const { shichen, ke } = shichenAndKe(now.hour(), now.minute());
  const dayCn = toCnDay(now.date());
  const isoTooltip = now.format('YYYY-MM-DD HH:mm');

  return (
    <span
      className="jz-live-clock jz-clock"
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 6,
        fontFamily: "'Noto Serif SC', 'Songti SC', serif",
        fontSize: compact ? 13 : 13.5,
        letterSpacing: 1,
      }}
      title={`${year}年 ${month}${dayCn}日 · ${shichen}${ke} （${isoTooltip}）`}
    >
      {!compact && (
        <>
          <span style={{ color: 'var(--jz-text-muted)' }}>{year}年</span>
          <span style={{ opacity: 0.4 }}>·</span>
        </>
      )}
      <span style={{ color: 'var(--jz-text)', fontWeight: 600 }}>{shichen}</span>
      <span style={{ color: 'var(--jz-gold)' }}>{ke}</span>
    </span>
  );
}
