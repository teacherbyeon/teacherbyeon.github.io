export const ZONE='Asia/Seoul';
export function koreaDate(now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function addDays(date,n){const d=new Date(date+'T00:00:00+09:00');d.setUTCDate(d.getUTCDate()+n);return koreaDate(d);}
export function weekDates(date){const weekday=new Date(date+'T00:00:00+09:00').getUTCDay();const koreanDay=(weekday+1)%7;const monday=addDays(date,-((koreanDay+6)%7));return Array.from({length:5},(_,i)=>addDays(monday,i));}
export function isDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00+09:00'))&&koreaDate(new Date(s+'T00:00:00+09:00'))===s;}
function need(ok,message){if(!ok)throw new Error(message);}
function timestamp(v){return typeof v==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));}
export function validateData(d){
  need(d&&d.schemaVersion===1,'지원하지 않는 데이터 규격입니다.');
  need(typeof d.isSample==='boolean'&&d.timezone===ZONE,'예시 여부 또는 시간대가 올바르지 않습니다.');
  need(d.school&&typeof d.school.name==='string'&&timestamp(d.generatedAt),'학교명 또는 생성 시각이 없습니다.');
  need(d.defaults&&Number.isInteger(d.defaults.grade)&&Number.isInteger(d.defaults.classNumber),'기본 학급이 없습니다.');
  need(d.staleAfterMinutes&&['timetable','meals'].every(k=>Number.isFinite(d.staleAfterMinutes[k])&&d.staleAfterMinutes[k]>0),'갱신 경고 기준이 올바르지 않습니다.');
  need(d.timetable&&timestamp(d.timetable.updatedAt)&&isDate(d.timetable.validFrom)&&isDate(d.timetable.validTo)&&d.timetable.validFrom<=d.timetable.validTo&&Array.isArray(d.timetable.classes)&&d.timetable.classes.length>0,'시간표 범위 또는 학급 자료가 올바르지 않습니다.');
  const keys=new Set();
  for(const c of d.timetable.classes){
    const key=c.grade+'-'+c.classNumber;need(Number.isInteger(c.grade)&&c.grade>0&&Number.isInteger(c.classNumber)&&c.classNumber>0&&!keys.has(key)&&Array.isArray(c.days),'학급 정보가 중복되거나 올바르지 않습니다.');keys.add(key);
    const dates=new Set();
    for(const day of c.days){
      need(isDate(day.date)&&day.date>=d.timetable.validFrom&&day.date<=d.timetable.validTo&&!dates.has(day.date)&&['scheduled','no-school'].includes(day.status)&&Array.isArray(day.lessons),'시간표 날짜나 상태가 올바르지 않습니다.');dates.add(day.date);
      need(day.status!=='no-school'||day.lessons.length===0,'휴업일에 수업이 들어 있습니다.');
      const periods=new Set();for(const l of day.lessons){need(Number.isInteger(l.period)&&l.period>0&&l.period<=20&&!periods.has(l.period)&&typeof l.subject==='string'&&typeof l.teacher==='string'&&typeof l.changed==='boolean','교시·과목·교사 정보가 올바르지 않습니다.');periods.add(l.period);for(const k of ['start','end'])need(l[k]===undefined||/^([01]\d|2[0-3]):[0-5]\d$/.test(l[k]),'수업 시간이 올바르지 않습니다.');if(l.changed)need(l.original&&typeof l.original.subject==='string'&&typeof l.original.teacher==='string','변경 전 수업 정보가 없습니다.');}
    }
  }
  need(keys.has(d.defaults.grade+'-'+d.defaults.classNumber),'기본 학급의 시간표가 없습니다.');
  need(d.meals&&timestamp(d.meals.updatedAt)&&Array.isArray(d.meals.days),'급식 정보가 올바르지 않습니다.');
  const mealDates=new Set();for(const day of d.meals.days){need(isDate(day.date)&&!mealDates.has(day.date)&&['available','no-meal'].includes(day.status)&&Array.isArray(day.menu)&&day.menu.every(x=>typeof x==='string')&&(day.status!=='no-meal'||day.menu.length===0),'급식 날짜·상태·메뉴가 올바르지 않습니다.');mealDates.add(day.date);}
  return d;
}
export function freshness(updatedAt,minutes,now=Date.now()){const age=now-Date.parse(updatedAt);return age < -300000?'future':age>minutes*60000?'stale':'fresh';}

