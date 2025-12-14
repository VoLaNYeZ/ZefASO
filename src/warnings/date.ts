const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const clampInt = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.trunc(value);
};

const toUtcDayNumber = (dateStr: string): number | null => {
  if (typeof dateStr !== 'string' || !DATE_RE.test(dateStr)) return null;
  const parts = dateStr.split('-').map((v) => Number.parseInt(v, 10));
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};

export const parseDate = (dateStr: string): Date => {
  if (typeof dateStr !== 'string' || !DATE_RE.test(dateStr)) return new Date(Number.NaN);
  return new Date(`${dateStr}T00:00:00`);
};

export const formatDate = (d: Date): string => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const addDays = (dateStr: string, delta: number): string => {
  const d = parseDate(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const days = clampInt(delta, 0);
  d.setDate(d.getDate() + days);
  return formatDate(d) || dateStr;
};

export const diffDays = (aStr: string, bStr: string): number => {
  const aDay = toUtcDayNumber(aStr);
  const bDay = toUtcDayNumber(bStr);
  if (aDay === null || bDay === null) return 0;
  return aDay - bDay;
};
