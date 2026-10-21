import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as core from './core.mjs';
const data=JSON.parse(await readFile(new URL('./data/board.json',import.meta.url),'utf8'));
class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.value='';this.dataset={};this.style={setProperty(){}};this.attributes={};this.className='';this.classList={add(){},toggle(){}};}
  append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
  setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}
  querySelector(selector){return this.walk().find(n=>n.className===selector.slice(1));}
  walk(){return this.children.flatMap(n=>[n,...n.walk()]);}
  showModal(){this.open=true;}close(){this.open=false;}
  set innerHTML(v){throw new Error('Unsafe HTML insertion');}
}
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},store=new Map();
let fail=false;
const document={body:new Element(),getElementById:get,createElement:t=>new Element(t),addEventListener(){},hidden:false,querySelectorAll(selector){if(selector==='#lessons .lesson')return get('lessons').children.filter(n=>n.dataset.period);return [];}};
const context=vm.createContext({...core,console,Intl,Date,AbortController,setTimeout,clearTimeout,setInterval(){},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},fetch:async url=>{assert.equal(url,'./data/board.json');if(fail)throw Error('offline');return {ok:true,json:async()=>structuredClone(data)};},document});
const source=(await readFile(new URL('./app.mjs',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');
vm.runInContext(source,context);await new Promise(resolve=>setTimeout(resolve,30));
assert.equal(document.body.dataset.mode,'classroom');assert.equal(get('classLabel').textContent,data.defaults.grade+'학년 '+data.defaults.classNumber+'반');assert.equal(get('sample').hidden,!data.isSample);
for(const c of data.timetable.classes){
  get('grade').value=String(c.grade);get('grade').onchange();get('classNumber').value=String(c.classNumber);get('classNumber').onchange();
  const day=c.days.find(d=>d.lessons.length)||c.days[0];if(!day)continue;get('date').value=day.date;get('date').onchange();
  assert.equal(get('lessons').children.length,day.lessons.length||1);assert.equal(get('classLabel').textContent,c.grade+'학년 '+c.classNumber+'반');
}
get('detailMode').onclick();assert.equal(document.body.dataset.mode,'detail');assert.equal(get('weeklyPanel').hidden,false);
const prefs=JSON.parse(store.get('bbb-classroom-board-ui-v2'));assert.equal(prefs.mode,'detail');
get('classroomMode').onclick();assert.equal(get('weeklyPanel').hidden,true);
get('date').value=core.addDays(data.timetable.validTo,7);get('date').onchange();assert.match(get('lessons').children[0].textContent,/자료가 없습니다/);assert.match(get('weekBody').children[0].children[0].textContent,/자료가 없습니다/);
fail=true;await get('refresh').onclick();assert.match(get('message').textContent,/이전 자료/);
console.log('PASS: live JSON, all classes, JSON defaults, modes/persistence, missing next-week data, network error, safe text rendering.');

