// Optional real-browser UI check. PLAYWRIGHT_MODULE may point to a local Playwright installation.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
(async()=>{
 const live=JSON.parse(await fs.readFile(path.join(root,'data/board.json'),'utf8'));
 const chosen=live.timetable.classes.find(c=>c.days.some(d=>d.lessons.length===7));assert(chosen,'Need one seven-period class to measure');
 const day=chosen.days.find(d=>d.lessons.length===7),date=day.date;
 const server=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end('Not found');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})}).catch(error=>{server.close();throw error;});
 try{
 const context=await browser.newContext({viewport:{width:1920,height:1080},timezoneId:'Asia/Seoul'});
 await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
 await context.addInitScript(({date})=>{const RealDate=Date,at=new RealDate(date+'T10:00:00+09:00').getTime();class TestDate extends RealDate{constructor(...args){super(...(args.length?args:[at]));}static now(){return at;}}window.Date=TestDate;},{date});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:'+server.address().port;await page.goto(url);await page.waitForFunction(()=>!document.getElementById('grade').disabled);
 assert.equal(await page.locator('#grade').inputValue(),String(live.defaults.grade));assert.equal(await page.locator('#classNumber').inputValue(),String(live.defaults.classNumber));
 for(const c of live.timetable.classes){await page.locator('#grade').selectOption(String(c.grade));await page.locator('#classNumber').selectOption(String(c.classNumber));assert.equal(await page.locator('#classLabel').textContent(),c.grade+'학년 '+c.classNumber+'반');}
 await page.locator('#grade').selectOption(String(chosen.grade));await page.locator('#classNumber').selectOption(String(chosen.classNumber));await page.locator('#date').fill(date);await page.locator('#date').dispatchEvent('change');
 async function fits(){return page.evaluate(()=>{const lessons=[...document.querySelectorAll('#lessons .lesson')],last=lessons.at(-1).getBoundingClientRect(),list=document.querySelector('#lessons'),menu=document.querySelector('#menu');return {count:lessons.length,lastBottom:last.bottom,viewport:innerHeight,listScroll:list.scrollHeight,listHeight:list.clientHeight,menuScroll:menu.scrollHeight,menuHeight:menu.clientHeight,pageHeight:document.documentElement.scrollHeight,pageWidth:document.documentElement.scrollWidth,width:innerWidth};});}
 const metrics=await fits();assert.equal(metrics.count,7);assert(metrics.lastBottom<=1080,JSON.stringify(metrics));assert(metrics.listScroll<=metrics.listHeight+2,JSON.stringify(metrics));assert(metrics.pageHeight<=1082,JSON.stringify(metrics));assert(metrics.menuScroll<=metrics.menuHeight+2,JSON.stringify(metrics));
 await page.locator('#editSchedule').click();
 const times=[['08:50','09:35'],['09:45','10:30'],['10:40','11:25'],['11:35','12:20'],['13:20','14:05'],['14:15','15:00'],['15:10','15:55']];
 for(let i=0;i<7;i++){await page.locator('#schedule-'+(i+1)+'-start').fill(times[i][0]);await page.locator('#schedule-'+(i+1)+'-end').fill(times[i][1]);}await page.getByRole('button',{name:'저장',exact:true}).click();
 assert.equal(await page.locator('.is-current').count(),1);assert.equal(await page.locator('.is-current').getAttribute('data-period'),'2');assert.equal(await page.locator('.is-next').getAttribute('data-period'),'3');
 await page.locator('#detailMode').click();assert(await page.locator('#weeklyPanel').isVisible());await page.reload();await page.waitForFunction(()=>!document.getElementById('grade').disabled);assert.equal(await page.locator('#detailMode').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#classNumber').inputValue(),String(chosen.classNumber));
 await page.locator('#date').fill(live.timetable.validTo);await page.locator('#date').dispatchEvent('change');await page.locator('#nextWeek').click();assert.match(await page.locator('#lessons').textContent(),/자료가 없습니다/);assert.match(await page.locator('#weekBody').textContent(),/자료가 없습니다/);
 await page.locator('#classroomMode').click();await page.locator('#goToday').click();
 await page.locator('#fullscreen').click();assert(await page.evaluate(()=>!!document.fullscreenElement));const fullMetrics=await fits();assert(fullMetrics.listScroll<=fullMetrics.listHeight+2,JSON.stringify(fullMetrics));await page.locator('#fullscreen').click();
 for(const viewport of [{width:1024,height:768},{width:390,height:844}]){await page.setViewportSize(viewport);assert(await page.locator('#classroomMode').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal page overflow');}
 await page.setViewportSize({width:1920,height:1080});
 // Screenshot uses sanitized fixture only. Never publish/render the live teacher or school names in preview files.
 const sample=structuredClone(live);sample.isSample=true;sample.school.name='가상 중학교';sample.generatedAt=date+'T10:00:00+09:00';sample.timetable.updatedAt=sample.generatedAt;sample.meals.updatedAt=sample.generatedAt;
 for(const c of sample.timetable.classes)for(const d of c.days){if(d.note)d.note='화면 확인용 예시';for(const l of d.lessons){l.subject=['국어','수학','영어','과학','사회','체육','창체'][(l.period-1)%7];l.teacher='담당교사 A';if(l.original){l.original.subject='미술';l.original.teacher='담당교사 B';}if(l.note)l.note='변경 안내 예시';}}
 for(const d of sample.meals.days){d.menu=['잡곡밥 (예시)','맑은 채소국','닭고기 구이','나물 무침','배추김치','제철 과일','요구르트'];d.note='실제 메뉴가 아닌 화면 확인용 예시입니다.';}
 const target=sample.timetable.classes.find(c=>c.grade===chosen.grade&&c.classNumber===chosen.classNumber).days.find(d=>d.date===date);target.lessons[1].changed=true;target.lessons[1].original={subject:'미술',teacher:'담당교사 B'};
 await page.route('**/data/board.json',r=>r.fulfill({json:sample}));await page.reload();await page.waitForFunction(()=>!document.getElementById('grade').disabled);await page.locator('#grade').selectOption(String(chosen.grade));await page.locator('#classNumber').selectOption(String(chosen.classNumber));await page.locator('#date').fill(date);await page.locator('#date').dispatchEvent('change');
 await page.locator('#editSchedule').click();for(let i=0;i<7;i++){await page.locator('#schedule-'+(i+1)+'-start').fill(times[i][0]);await page.locator('#schedule-'+(i+1)+'-end').fill(times[i][1]);}await page.getByRole('button',{name:'저장',exact:true}).click();
 const output=process.env.PREVIEW_DIR||path.join(root,'preview');await fs.mkdir(output,{recursive:true});
 await page.screenshot({path:path.join(output,'classroom-board-classroom-preview.png')});
 await page.locator('#lessons .changed').first().click();assert.match(await page.locator('#lessonDialogBody').textContent(),/변경 전/);await page.locator('#closeLessonDialog').click();
 await page.locator('#detailMode').click();await page.screenshot({path:path.join(output,'classroom-board-detail-preview.png'),fullPage:true});
 assert.equal(errors.length,0,errors.join('\n'));
 console.log(JSON.stringify({result:'PASS',classes:live.timetable.classes.length,metrics,fullMetrics,checks:'class/defaults, real data, seven rows fit, timing settings, highlight, remembered mode/class, missing next week, fullscreen, tablet/mobile widths, changed lesson dialog, no JS errors',previews:output}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

