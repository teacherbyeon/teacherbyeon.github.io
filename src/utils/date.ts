const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

export const formatDateIso = (date: Date): string => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const formatDateKorean = (isoDate: string): string => {
  if (!isoDate) return '____년 __월 __일';
  const [y, m, d] = isoDate.split('-');
  return `${Number(y)}년 ${Number(m)}월 ${Number(d)}일`;
};

export const getDayOfWeekKo = (isoDate: string): string => {
  if (!isoDate) return '__';
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '__';
  return DAYS_KO[date.getDay()];
};

export const getInclusiveDayCount = (startDate: string, endDate: string): number => {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = end.getTime() - start.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
};

export const splitDateParts = (isoDate: string): { year: string; month: string; day: string } => {
  if (!isoDate) return { year: '', month: '', day: '' };
  const [year, month, day] = isoDate.split('-');
  return {
    year: year || '',
    month: month ? String(Number(month)) : '',
    day: day ? String(Number(day)) : '',
  };
};
