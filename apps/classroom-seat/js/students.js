import { asBool, normalizeGender, normalizeNo, parseRefList } from './utils.js';
import { usableSeats } from './state.js';

const headerAlias = {
  번호: '번호', no: '번호', 학번: '번호',
  이름: '이름', name: '이름',
  성별: '성별', gender: '성별',
  고정좌석: '고정좌석', fixedseat: '고정좌석',
  앞자리우선: '앞자리우선',
  뒤자리우선: '뒤자리우선',
  교탁근처우선: '교탁근처우선',
  시력배려: '시력배려',
  키큼: '키큼',
  분리대상: '분리대상',
  같은줄금지: '같은줄금지',
  같은열금지: '같은열금지',
  인접금지: '인접금지',
  메모: '메모',
};

const normHeader = (h) => String(h ?? '').trim().toLowerCase().replace(/\s+/g, '');

export const parseRows = (rows) => {
  const headers = (rows[0] || []).map((h) => headerAlias[normHeader(h)] || String(h ?? '').trim());
  const idx = (name) => headers.indexOf(name);
  if (idx('번호') < 0 || idx('이름') < 0) throw new Error('필수 헤더(번호, 이름)가 필요합니다.');

  return rows.slice(1).map((r) => ({
    번호: normalizeNo(r[idx('번호')]),
    이름: String(r[idx('이름')] ?? '').trim(),
    성별: normalizeGender(idx('성별') >= 0 ? r[idx('성별')] : ''),
    고정좌석: idx('고정좌석') >= 0 ? String(r[idx('고정좌석')] ?? '').trim() || null : null,
    앞자리우선: asBool(idx('앞자리우선') >= 0 ? r[idx('앞자리우선')] : ''),
    뒤자리우선: asBool(idx('뒤자리우선') >= 0 ? r[idx('뒤자리우선')] : ''),
    교탁근처우선: asBool(idx('교탁근처우선') >= 0 ? r[idx('교탁근처우선')] : ''),
    시력배려: asBool(idx('시력배려') >= 0 ? r[idx('시력배려')] : ''),
    키큼: asBool(idx('키큼') >= 0 ? r[idx('키큼')] : ''),
    분리대상: parseRefList(idx('분리대상') >= 0 ? r[idx('분리대상')] : ''),
    같은줄금지: parseRefList(idx('같은줄금지') >= 0 ? r[idx('같은줄금지')] : ''),
    같은열금지: parseRefList(idx('같은열금지') >= 0 ? r[idx('같은열금지')] : ''),
    인접금지: parseRefList(idx('인접금지') >= 0 ? r[idx('인접금지')] : ''),
    메모: String(idx('메모') >= 0 ? r[idx('메모')] ?? '' : '').trim(),
  })).filter((s) => s.번호 || s.이름);
};

export const validateStudents = (state) => {
  const errors = [];
  const warnings = [];
  const nos = new Set();
  const allNos = new Set(state.students.map((s) => s.번호));

  state.students.forEach((s, i) => {
    if (!s.번호) errors.push(`행 ${i + 2}: 번호 없음`);
    if (!s.이름) errors.push(`행 ${i + 2}: 이름 없음`);
    if (s.번호 && nos.has(s.번호)) errors.push(`번호 중복: ${s.번호}`);
    nos.add(s.번호);
    if (s.고정좌석) {
      const seat = state.seats.find((x) => x.id === s.고정좌석 && !x.deleted);
      if (!seat) errors.push(`${s.번호} ${s.이름}: 고정좌석(${s.고정좌석}) 없음`);
    }
    ['분리대상', '같은줄금지', '같은열금지', '인접금지'].forEach((k) => {
      s[k].forEach((ref) => {
        if (!allNos.has(ref)) warnings.push(`${s.번호}: ${k} 참조(${ref}) 학생 없음`);
      });
    });
  });

  if (state.students.length > usableSeats(state).length) {
    errors.push(`학생 수(${state.students.length})가 사용 가능 좌석 수(${usableSeats(state).length})보다 많습니다.`);
  }

  state.messages.errors = errors;
  state.messages.warnings = warnings;
  return { errors, warnings };
};
