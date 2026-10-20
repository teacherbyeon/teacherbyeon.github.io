import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as core from './core.mjs';
const data=JSON.parse(await readFile(new URL('./data/board.json',import.meta.url),'utf8'));
class Element{constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.value='';this.classList={add(){},toggle(){}};}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}set innerHTML(v){throw new Error('Unsafe HTML insertion');}}
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
let fail=false;const context=vm.createContext({...core,console,Intl,Date,AbortController,setTimeout,clearTimeout,setInterval(){},fetch:async url=>{assert.equal(url,'./data/board.json');if(fail)throw Error('offline');return {ok:true,json:async()=>structuredClone(data)};},document:{getElementById:get,createElement:t=>new Element(t),addEventListener(){},hidden:false}});
const source=(await readFile(new URL('./app.mjs',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');
vm.runInContext(source,context);await new Promise(resolve=>setTimeout(resolve,30));
get('date').value='2026-10-20';get('date').onchange();
assert.equal(get('lessons').children.length,7);assert.equal(get('menu').children.length,6);assert.equal(get('sample').hidden,false);assert.equal(get('weekBody').children.length,7);
assert.equal(get('lessons').children[1].children[1].children[2].textContent,'변경');
get('classNumber').value='4';get('classNumber').onchange();assert.equal(get('classLabel').textContent,'3학년 4반');
get('date').value='2026-10-25';get('date').onchange();assert.match(get('lessons').children[0].textContent,/자료가 없습니다/);assert.match(get('menu').children[0].textContent,/자료가 없습니다/);
get('previousWeek').onclick();assert.equal(get('date').value,'2026-10-18');
fail=true;await get('refresh').onclick();assert.match(get('message').textContent,/이전에 받은 자료/);
console.log('PASS: real app startup, daily/weekly render, meal, class selection, changed lesson, missing day, navigation, offline retained-data warning; no innerHTML.');

