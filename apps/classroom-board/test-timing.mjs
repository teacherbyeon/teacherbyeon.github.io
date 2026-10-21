import assert from 'node:assert/strict';
import {lessonTiming,validateSchedule} from './core.mjs';
const date='2026-10-21',lessons=[{period:1},{period:2},{period:3}];
const schedule=validateSchedule([{period:1,start:'09:00',end:'09:45'},{period:2,start:'09:55',end:'10:40'},{period:3,start:'10:50',end:'11:35'}]);
const at=t=>lessonTiming(lessons,date,new Date(date+'T'+t+':00+09:00'),schedule);
assert.equal(at('09:00').current,1);assert.equal(at('09:44').current,1);assert.equal(at('09:45').current,null);assert.equal(at('09:45').next,2);assert.equal(at('09:55').current,2);assert.equal(at('11:35').current,null);assert.equal(at('11:35').next,null);
assert.equal(lessonTiming(lessons,date,new Date('2026-10-22T09:00:00+09:00'),schedule).reason,'other-date');
assert.equal(lessonTiming(lessons,date,new Date(date+'T09:00:00+09:00')).available,false);
assert.equal(lessonTiming([{period:1,start:'10:00',end:'11:00'}],date,new Date(date+'T10:30:00+09:00'),schedule).current,1);
assert.throws(()=>validateSchedule([{period:1,start:'09:00',end:'09:45'},{period:2,start:'09:30',end:'10:00'}]));
assert.throws(()=>validateSchedule([{period:1,start:'09:00',end:''}]));assert.deepEqual(validateSchedule([{period:1,start:'',end:''}]),[]);
console.log('PASS: current/next lesson, exact boundaries, breaks, end of day, other dates, no guessed times, JSON time precedence, schedule validation.');

