export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

export const asBool = (v) => {
  const t = String(v ?? '').trim().toLowerCase();
  return ['1', 'y', 'yes', 'true', 't', 'o', 'on', '예', '네'].includes(t);
};

export const normalizeGender = (v) => {
  const t = String(v ?? '').trim().toLowerCase();
  if (['남', '남자', 'm', 'male'].includes(t)) return 'M';
  if (['여', '여자', 'f', 'female'].includes(t)) return 'F';
  return 'U';
};

export const normalizeNo = (v) => {
  const raw = String(v ?? '').trim();
  if (!raw) return '';
  const n = Number(raw);
  return Number.isFinite(n) && /^-?\d+(\.0+)?$/.test(raw) ? String(Math.trunc(n)) : raw;
};

export const parseRefList = (v) => String(v ?? '')
  .split(/[;,/|\s]+/)
  .map((x) => normalizeNo(x))
  .filter(Boolean);

export const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const downloadText = (filename, text, type = 'application/json') => {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1200);
};
