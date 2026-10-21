import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {koreaDate,weekDates,isDate,validateData,freshness} from './core.mjs';
const data=JSON.parse(await readFile(new URL('./data/board.json',import.meta.url),'utf8'));
validateData(data);
assert.equal(koreaDate(new Date('2026-10-19T15:01:00Z')),'2026-10-20');
assert.deepEqual(weekDates('2026-10-25'),['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23']);
assert.equal(weekDates('2027-01-01')[0],'2026-12-28');
assert.equal(isDate('2026-02-30'),false);assert.equal(isDate('2028-02-29'),true);
const now=Date.parse('2026-10-20T12:00:00+09:00');
assert.equal(freshness('2026-10-20T08:00:00+09:00',180,now),'stale');
assert.equal(freshness('2026-10-20T11:00:00+09:00',180,now),'fresh');
assert.equal(freshness('2026-10-21T11:00:00+09:00',180,now),'future');
const invalid=structuredClone(data),invalidLesson=invalid.timetable.classes.flatMap(c=>c.days.flatMap(d=>d.lessons))[0];invalidLesson.changed=true;delete invalidLesson.original;assert.throws(()=>validateData(invalid),/변경 전/);
const duplicate=structuredClone(data);duplicate.meals.days.push(duplicate.meals.days[0]);assert.throws(()=>validateData(duplicate),/급식/);
const empty=structuredClone(data);empty.meals.days[0]={date:empty.meals.days[0].date,status:'no-meal',menu:[]};empty.timetable.classes[0].days[0]={date:empty.timetable.classes[0].days[0].date,status:'no-school',lessons:[]};validateData(empty);
console.log('PASS: live JSON, Korean midnight, weekends/year boundary, dates, stale/future warnings, malformed changes, duplicate days, no-school/no-meal.');

