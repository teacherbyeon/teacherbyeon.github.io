import {ZONE,koreaDate,addDays,weekDates,isDate,validateData,freshness,lessonTiming,validateSchedule} from './core.mjs?v=2';
const $=id=>document.getElementById(id),PREFS='bbb-classroom-board-ui-v2';
function readPreferences(){try{const p=JSON.parse(localStorage.getItem(PREFS)||'{}');return p&&typeof p==='object'?p:{};}catch{return {};}}
const saved=readPreferences(),state={data:null,date:koreaDate(),grade:null,classNumber:null,mode:saved.mode==='detail'?'detail':'classroom',schedule:[],loading:false,error:'',warning:''};
const dateText=date=>new Intl.DateTimeFormat('ko-KR',{timeZone:ZONE,month:'long',day:'numeric',weekday:'long'}).format(new Date(date+'T00:00:00+09:00'));
const stamp=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:ZONE,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
function node(tag,text,cls){const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;}
function persist(){try{localStorage.setItem(PREFS,JSON.stringify({mode:state.mode,school:state.data?.school.name||saved.school,grade:state.grade,classNumber:state.classNumber,schedule:state.schedule}));}catch{}}
function setMode(mode){state.mode=mode;document.body.dataset.mode=mode;$('classroomMode').setAttribute('aria-pressed',String(mode==='classroom'));$('detailMode').setAttribute('aria-pressed',String(mode==='detail'));$('weeklyPanel').hidden=mode!=='detail';}
function option(select,value,label){const n=node('option',label);n.value=value;select.append(n);}
function selectors(){
  const classes=state.data.timetable.classes;$('grade').replaceChildren();
  [...new Set(classes.map(c=>c.grade))].sort((a,b)=>a-b).forEach(n=>option($('grade'),n,n+'학년'));$('grade').value=state.grade;
  $('classNumber').replaceChildren();classes.filter(c=>c.grade===state.grade).sort((a,b)=>a.classNumber-b.classNumber).forEach(c=>option($('classNumber'),c.classNumber,c.classNumber+'반'));$('classNumber').value=state.classNumber;
  $('grade').disabled=false;$('classNumber').disabled=false;
}
function showChange(l){
  $('lessonDialogTitle').textContent=l.period+'교시 변경 수업';
  $('lessonDialogBody').replaceChildren(node('p','현재: '+l.subject+' · '+(l.teacher||'담당교사 미정')),node('p','변경 전: '+l.original.subject+' · '+(l.original.teacher||'담당교사 미정')));
  if(l.note)$('lessonDialogBody').append(node('p',l.note));$('lessonDialog').showModal();
}
function lessonContent(parent,l){
  const heading=node('div','','subject-line');heading.append(node('div',l.subject||'수업명 미정','subject'));
  if(l.changed){const change=node('button','변경','changed');change.type='button';change.setAttribute('aria-label',l.period+'교시 변경 전 과목·교사 확인');change.onclick=()=>showChange(l);heading.append(change);}
  parent.append(heading,node('div',l.teacher||'담당교사 정보 없음','teacher'));
}
function selectedDay(){return state.data?.timetable.classes.find(c=>c.grade===state.grade&&c.classNumber===state.classNumber)?.days.find(x=>x.date===state.date);}
function warnings(){
  if(!state.data)return;
  const d=state.data,messages=[];
  for(const [key,label] of [['timetable','시간표'],['meals','급식']]){const f=freshness(d[key].updatedAt,d.staleAfterMinutes[key]);if(f==='stale')messages.push(label+' 자료가 오래되었습니다. 최종 갱신 시각을 확인하세요.');if(f==='future')messages.push(label+' 갱신 시각이 현재보다 앞섭니다.');}
  if(state.error)messages.push(state.error);if(state.warning)messages.push(state.warning);
  $('message').classList.toggle('warning',messages.length>0);$('message').textContent=messages.join(' ')||'한국 시간 기준 · 5분마다 새 자료를 확인합니다.';
}
function updateTiming(now=new Date()){
  if(!state.data)return;
  const day=selectedDay(),lessons=day?.lessons||[],timing=lessonTiming(lessons,state.date,now,state.schedule);
  document.querySelectorAll('#lessons .lesson').forEach(li=>{
    const p=Number(li.dataset.period),current=timing.current===p,next=timing.next===p;
    li.classList.toggle('is-current',current);li.classList.toggle('is-next',next);
    if(current)li.setAttribute('aria-current','true');else li.removeAttribute('aria-current');
    const badge=li.querySelector('.live-badge');badge.textContent=current?'지금 수업':next?'다음 수업':'';
  });
  let text;
  if(!lessons.length)text=day?.status==='no-school'?'오늘은 수업이 없습니다.':'';
  else if(timing.reason==='other-date')text='선택 날짜의 시간표 · 현재 교시 표시는 오늘만 적용';
  else if(!timing.available)text='수업 시간 설정 후 현재·다음 교시 자동 표시';
  else text=(timing.current?timing.current+'교시 수업 중':'수업 사이 시간')+(timing.next?' · 다음 '+timing.next+'교시':timing.current?' · 오늘 마지막 수업':' · 오늘 수업 종료')+(timing.partial?' · 일부 교시 시간 미설정':'');
  $('sessionStatus').textContent=text;
}
function renderWeek(c){
  const dates=weekDates(state.date);$('weekLabel').textContent=dates[0]+' ~ '+dates[4];
  const head=node('tr','');head.append(node('th','교시'));dates.forEach(date=>{const th=node('th',dateText(date),date===state.date?'selected':'');th.scope='col';head.append(th);});$('weekHead').replaceChildren(head);$('weekBody').replaceChildren();
  const days=dates.map(date=>c.days.find(x=>x.date===date)),periods=[...new Set(days.flatMap(day=>(day?.lessons||[]).map(l=>l.period)))].sort((a,b)=>a-b);
  for(const p of periods){const row=node('tr',''),th=node('th',p+'교시');th.scope='row';row.append(th);days.forEach(day=>{const cell=node('td',''),l=day?.lessons.find(x=>x.period===p);if(l)lessonContent(cell,l);else cell.textContent=!day?'자료 없음':day.status==='no-school'?'수업 없음':'—';row.append(cell);});$('weekBody').append(row);}
  if(!periods.length){const row=node('tr',''),cell=node('td','선택한 주의 시간표 자료가 없습니다. 현재 제공 기간을 확인하세요.','empty');cell.colSpan=6;row.append(cell);$('weekBody').append(row);}
}
function render(){
  const d=state.data;if(!d)return;
  const c=d.timetable.classes.find(c=>c.grade===state.grade&&c.classNumber===state.classNumber),day=selectedDay(),meal=d.meals.days.find(x=>x.date===state.date);
  $('date').value=state.date;$('sample').hidden=!d.isSample;$('school').textContent=d.school.name+' · '+state.grade+'학년 '+state.classNumber+'반';$('classLabel').textContent=state.grade+'학년 '+state.classNumber+'반';$('dayTitle').textContent=(state.date===koreaDate()?'오늘':'선택일')+' 시간표';$('dayNote').textContent=dateText(state.date)+(day?.note?' · '+day.note:'');$('lessons').replaceChildren();
  const lessons=day?.status==='scheduled'?[...day.lessons].sort((a,b)=>a.period-b.period):[];
  $('lessons').style.setProperty('--lesson-count',Math.max(lessons.length,1));
  for(const l of lessons){
    const li=node('li','','lesson'+(l.changed?' has-change':'')),body=node('div','','lesson-main'),period=node('span',l.period+'교시','period'),meta=node('div','','lesson-meta');
    li.dataset.period=l.period;lessonContent(body,l);
    const custom=state.schedule.find(s=>s.period===l.period),start=l.start&&l.end?l.start:custom?.start,end=l.start&&l.end?l.end:custom?.end;
    meta.append(node('span','','live-badge'));if(start&&end)meta.append(node('time',start+'–'+end));else meta.append(node('span','시간 미설정','time-unset'));
    li.append(period,body,meta);$('lessons').append(li);
  }
  if(!lessons.length)$('lessons').append(node('li',day?.status==='no-school'?'수업이 없는 날입니다.':day?'등록된 수업이 없습니다.':'이 날짜의 시간표 자료가 없습니다.','empty'));
  $('mealTitle').textContent=(state.date===koreaDate()?'오늘의':'선택일')+' 중식';$('mealDate').textContent=dateText(state.date);$('menu').replaceChildren();
  if(meal?.status==='available'&&meal.menu.length)meal.menu.forEach(x=>$('menu').append(node('li',x)));
  else $('menu').append(node('li',meal?.status==='no-meal'?'중식이 없는 날입니다.':'이 날짜의 중식 자료가 없습니다.','empty'));$('mealNote').textContent=meal?.note||'';
  $('timetableUpdated').textContent='시간표 갱신 '+stamp(d.timetable.updatedAt);$('mealUpdated').textContent='급식 갱신 '+stamp(d.meals.updatedAt);
  $('generated').textContent='제공 기간 '+d.timetable.validFrom+' ~ '+d.timetable.validTo+' · 자료 생성 '+stamp(d.generatedAt);
  renderWeek(c);updateTiming();warnings();
}
async function load(){
  if(state.loading)return;state.loading=true;$('refresh').disabled=true;$('refresh').textContent='확인 중…';
  try{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch('./data/board.json',{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error('자료 응답 '+response.status);
      const d=validateData(await response.json()),firstLoad=!state.data,oldSchool=state.data?.school.name;
      if(firstLoad){
        const remembered=saved.school===d.school.name&&d.timetable.classes.some(c=>c.grade===saved.grade&&c.classNumber===saved.classNumber);
        state.grade=remembered?saved.grade:d.defaults.grade;state.classNumber=remembered?saved.classNumber:d.defaults.classNumber;
        try{state.schedule=saved.school===d.school.name?validateSchedule(saved.schedule||[]):[];}catch{state.schedule=[];}
      }else if(oldSchool!==d.school.name){state.grade=d.defaults.grade;state.classNumber=d.defaults.classNumber;state.schedule=[];}
      if(!d.timetable.classes.some(c=>c.grade===state.grade&&c.classNumber===state.classNumber)){state.grade=d.defaults.grade;state.classNumber=d.defaults.classNumber;}
      state.data=d;state.error='';selectors();render();persist();
    }finally{clearTimeout(timer);}
  }catch{
    state.error=state.data?'새 자료를 불러오지 못해 이전 자료를 표시합니다.':'자료를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
    if(state.data)warnings();else{$('message').textContent=state.error;$('message').classList.add('warning');}
  }finally{state.loading=false;$('refresh').disabled=false;$('refresh').textContent='새로고침';}
}
function openSchedule(){
  $('scheduleInputs').replaceChildren();$('scheduleError').textContent='';
  const count=Math.max(7,...(selectedDay()?.lessons||[]).map(l=>l.period));
  for(let p=1;p<=count;p++){const row=node('div','','schedule-row');row.append(node('strong',p+'교시'));const saved=state.schedule.find(s=>s.period===p);
    for(const field of ['start','end']){const label=node('label',field==='start'?'시작':'종료'),input=node('input','');input.type='time';input.id='schedule-'+p+'-'+field;input.dataset.period=p;input.dataset.field=field;input.value=saved?.[field]||'';input.setAttribute('aria-label',p+'교시 '+(field==='start'?'시작':'종료'));label.append(input);row.append(label);}
    $('scheduleInputs').append(row);
  }$('scheduleDialog').showModal();
}
$('scheduleForm').onsubmit=e=>{
  e.preventDefault();try{
    const starts=[...document.querySelectorAll('#scheduleInputs input[data-field="start"]')],rows=starts.map(input=>({period:Number(input.dataset.period),start:input.value,end:$('schedule-'+input.dataset.period+'-end').value}));
    state.schedule=validateSchedule(rows);persist();render();$('scheduleDialog').close();
  }catch(e){$('scheduleError').textContent=e.message;}
};
$('clearSchedule').onclick=()=>{state.schedule=[];persist();render();$('scheduleDialog').close();};$('cancelSchedule').onclick=()=>$('scheduleDialog').close();$('editSchedule').onclick=openSchedule;$('closeLessonDialog').onclick=()=>$('lessonDialog').close();
$('classroomMode').onclick=()=>{setMode('classroom');persist();};$('detailMode').onclick=()=>{setMode('detail');persist();};setMode(state.mode);
$('date').value=state.date;$('date').onchange=()=>{if(isDate($('date').value)){state.date=$('date').value;render();}};
$('goToday').onclick=()=>{state.date=koreaDate();render();};
$('grade').onchange=()=>{state.grade=Number($('grade').value);state.classNumber=state.data.timetable.classes.filter(c=>c.grade===state.grade).sort((a,b)=>a.classNumber-b.classNumber)[0].classNumber;selectors();render();persist();};
$('classNumber').onchange=()=>{state.classNumber=Number($('classNumber').value);render();persist();};$('refresh').onclick=load;
for(const [id,n]of [['previousWeek',-7],['nextWeek',7]])$(id).onclick=()=>{state.date=addDays(state.date,n);render();};
$('fullscreen').onclick=async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();state.warning='';}
  catch{state.warning='전체화면을 지원하지 않는 환경입니다. 브라우저 화면 확대를 이용해 주세요.';}warnings();
};
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'전체화면 종료':'전체화면';});
let lastToday=koreaDate();
function tick(){
  const today=koreaDate();$('clock').textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());$('todayLabel').textContent=dateText(today);
  if(today!==lastToday){if(state.date===lastToday)state.date=today;lastToday=today;render();load();}updateTiming();warnings();
}
tick();setInterval(tick,15000);setInterval(load,300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){tick();load();}});load();

