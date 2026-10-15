import {minutes,clock,dateKey,dayAt,entriesFor,freeSlots,canSchedule,emptyState,validState} from './core.js';
import {createFocus} from './focus.js';
import {sessionEntries,applySession,timeLabel,elapsedLabel} from './records.js';
const $=s=>document.querySelector(s), KEY='liubai-planner-v1';
let focus=null,lastRunId=null;
let state=emptyState(), selected=dateKey(),view='planner',deferredInstall=null,toastTimer,storageWarning=false;
try {const stored=localStorage.getItem(KEY);if(stored){const parsed=JSON.parse(stored);if(!validState(parsed))throw Error();state=parsed;}}catch{storageWarning=true;}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const duration=value=>{const n=Math.max(0,Math.round(value));return n<60?`${n} 分钟`:n%60?`${Math.floor(n/60)} 小时 ${n%60} 分`:`${n/60} 小时`;};
const compact=n=>n<60?`${n}分`:`${Math.round(n/60*10)/10}时`;
const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function persist(message){try{localStorage.setItem(KEY,JSON.stringify(state));storageWarning=false;}catch{storageWarning=true;}render();toast(storageWarning?'无法保存到浏览器，请在设置中导出备份。':message||'已保存');}
function daily(date){
 const current=focus?.current();let entries=entriesFor(state,date);
 if(current&&current.status!=='finished'){
   entries=entries.filter(e=>!(e.kind==='task'&&e.id===current.taskId));
   const projectedEnd=current.status==='running'?current.endAt:Date.now()+current.remainingMs;
   entries.push(...sessionEntries([{id:current.runId,taskId:current.taskId,title:current.title,startedAt:current.startedAt,endedAt:projectedEnd,live:true,paused:current.status==='paused'}],date));
 }
 entries.sort((a,b)=>a.start-b.start);const free=freeSlots(entries,state.wake,state.sleep);
 return {entries,free,available:free.reduce((n,e)=>n+e.end-e.start,0)};
}
function render(){
 $('#save-status').textContent=storageWarning?'保存不可用，请导出备份':'自动保存在此设备';
 $('#setup-banner').hidden=state.configured;
 const {entries,free,available}=daily(selected), tasks=state.tasks.filter(t=>entries.some(e=>e.id===t.id||e.taskId===t.id)),backlog=state.tasks.filter(t=>!t.date&&!t.done);
 $('#stat-free').textContent=state.configured?duration(available):'待设置';$('#free-caption').textContent=state.configured?`${free.length} 段空闲 · 按你的作息计算`:'设置后计算真实空闲';
 $('#stat-busy').textContent=state.configured?duration(state.sleep-state.wake-available):'—';
 $('#stat-tasks').innerHTML=`${tasks.filter(t=>t.done).length} <em>/ ${tasks.length}</em>`;
 $('#task-count').textContent=state.tasks.filter(t=>!t.done).length;$('#backlog-count').textContent=backlog.length;
 const d=dayAt(selected),start=dayAt(selected,-((d.getDay()+6)%7));
 $('#month-label').textContent=`${d.getFullYear()}年 ${d.getMonth()+1}月`;
 $('#week-strip').innerHTML=Array.from({length:7},(_,i)=>{const date=dateKey(dayAt(dateKey(start),i));return `<button class="day-tab ${date===selected?'selected':''} ${date===dateKey()?'is-today':''}" data-date="${date}" aria-label="${date}${date===dateKey()?' 今天':''}" aria-pressed="${date===selected}"><span>周${'一二三四五六日'[i]}</span><b>${dayAt(date).getDate()}</b><span class="day-mini">${state.configured?`空 ${compact(daily(date).available)}`:'待设置'}</span></button>`;}).join('');
 $('#day-label').textContent=`${selected===dateKey()?'今天 · ':''}${d.getMonth()+1}月${d.getDate()}日`;
 $('#day-hint').textContent=state.configured?`${clock(state.wake)} 开始新的一天`:'先设置作息，开启你的时间计划';
 $('#sleep-label').textContent=state.configured?`${clock(state.sleep)} 休息`:'为自己留出充足睡眠';
 const rows=[...entries,...(state.configured?free.map(f=>({...f,kind:'free'})):[])].sort((a,b)=>a.start-b.start);
 $('#timeline').innerHTML=rows.length?rows.map(timelineRow).join(''):'<div class="empty"><span class="empty-symbol">◷</span>你的时间表，等你来定义。<br>设置作息，或立即开始一项任务。</div>';
 const completed=state.tasks.filter(t=>t.done);
 $('#backlog').innerHTML=(backlog.length?backlog.map(taskCard).join(''):'<div class="empty"><span class="empty-symbol">✧</span>暂时没有待安排的任务</div>')+(completed.length?`<h3 class="task-group-heading">已完成 <span>${completed.length}</span></h3>${completed.map(taskCard).join('')}`:'');
 const pending=state.tasks.filter(t=>!t.done);
 $('#all-tasks').innerHTML=state.tasks.length?`<h3 class="task-group-heading">待完成 <span>${pending.length}</span></h3>${pending.length?pending.map(taskCard).join(''):'<p class="empty">今天想做的事，都完成了。</p>'}${completed.length?`<h3 class="task-group-heading">已完成 <span>${completed.length}</span></h3>${completed.map(taskCard).join('')}`:''}`:'<div class="empty"><span class="empty-symbol">☑</span>清单还是空的，记下一件想做的事吧。</div>';
 $('#planner-view').hidden=view!=='planner';$('#tasks-view').hidden=view!=='tasks';
 document.querySelectorAll('[data-view]').forEach(e=>e.classList.toggle('active',e.dataset.view===view));
 $('#page-title').textContent=view==='planner'?'把时间，留给想做的事。':'想做的事，一件件来。';
}
function timelineRow(e){
 let content;
 if(e.kind==='record'||e.kind==='live'){
   const done=e.kind==='record',title=escape(e.title),times=`${e.startText} — ${e.endText}`;
   const meta=done?`${times} · 实际时段${e.continuesBefore||e.continuesAfter?' · 跨日记录':''}`:`${e.startText} 开始 · 预计 ${e.endText} 结束`;
   content=`<div class="time-block ${done?'execution-record completed':'execution-live'}"><div><h3>${title}</h3><p>${meta}</p><p>${done?`专注 ${elapsedLabel(e.activeMs)}${e.estimatedStart?' · 旧版起点为估算':''}`:e.paused?'已暂停，继续后更新结束时间':'正在执行 · 结束后保存实际时间'}</p></div><span class="block-side">${done?'✓ 已完成':'◷ 进行中'}</span></div>`;
 }else if(e.kind==='free')content=`<button class="time-block free" data-free="${Math.ceil(e.start)}" data-end="${Math.floor(e.end)}" ${Math.floor(e.end)-Math.ceil(e.start)<1?'disabled':''}><div><h3>这段时间，属于你</h3><p>${clock(e.start)} — ${clock(e.end)} · ${duration(e.end-e.start)}空闲</p></div><span class="block-side">${Math.floor(e.end)-Math.ceil(e.start)<1?'短暂空档':'＋ 安排'}</span></button>`;
 else if(e.kind==='fixed')content=`<button class="time-block fixed" data-edit-block="${escape(e.id)}"><div><h3>${escape(e.title)}</h3><p>${clock(e.start)} — ${clock(e.end)} · ${duration(e.end-e.start)}</p></div><span class="block-side">每周重复</span></button>`;
 else content=`<div class="time-block task ${e.done?'completed':''}"><button class="check-task ${e.done?'done':''}" data-done="${escape(e.id)}" aria-label="${e.done?'取消完成':'完成'} ${escape(e.title)}" aria-pressed="${e.done}">${e.done?'✓':''}</button><button class="task-content" data-edit-task="${escape(e.id)}"><h3>${escape(e.title)}</h3><p>${clock(e.start)} — ${clock(e.end)} · ${duration(e.duration)}</p></button><span class="block-side">${e.done?'已完成':'任务'}</span></div>`;
 return `<div class="time-row"><span class="time-label">${clock(e.start)}</span>${content}</div>`;
}
function taskCard(t){
 const records=(state.sessions||[]).filter(r=>r.taskId===t.id).sort((a,b)=>b.startedAt-a.startedAt),current=focus?.current(),running=current?.taskId===t.id&&current.status!=='finished';
 const detail=records.length?`<details class="task-history"><summary>执行记录（${records.length}次）</summary>${records.map(r=>`<p>${dateKey(new Date(r.startedAt))} ${timeLabel(r.startedAt)}<br>至 ${dateKey(new Date(r.endedAt))} ${timeLabel(r.endedAt)}<br>实际 ${elapsedLabel(r.endedAt-r.startedAt)} · 专注 ${elapsedLabel(r.activeMs)}</p>`).join('')}</details>`:'';
 return `<article class="task-card ${t.done?'completed':''}"><div class="task-card-top"><button class="check-task ${t.done?'done':''}" data-done="${escape(t.id)}" aria-label="${t.done?'取消完成':'完成'} ${escape(t.title)}" aria-pressed="${t.done}">${t.done?'✓':''}</button><h3>${escape(t.title)}</h3><button class="task-edit" data-edit-task="${escape(t.id)}" aria-label="编辑 ${escape(t.title)}">⋯</button></div><p>${running?'正在计时，实际时段会自动记录':records.length?`最近完成：${dateKey(new Date(records[0].endedAt))} ${timeLabel(records[0].endedAt)}`:t.date?`${escape(t.date)} · ${clock(t.start)}`:'还没安排时间'}</p><div class="task-card-bottom"><span class="pill">${records.length?`累计专注 ${elapsedLabel(records.reduce((n,r)=>n+r.activeMs,0))}`:`◷ 预计 ${duration(t.duration)}`}</span><div class="task-card-actions">${!t.done&&!running?`<button data-start-task="${escape(t.id)}">▷ 立即开始</button>`:''}${!t.date&&!t.done&&!running?`<button data-schedule="${escape(t.id)}">安排时间 ↗</button>`:t.done?'<span class="muted" style="font-size:11px">✓ 已完成</span>':''}</div></div>${detail}</article>`;
}
function recordExecution(record){
 // Merge with the latest device state before appending: other tabs may have saved edits.
 try{const saved=JSON.parse(localStorage.getItem(KEY));if(saved&&validState(saved))state=saved;}catch{}
 state=applySession(state,record);
 try{localStorage.setItem(KEY,JSON.stringify(state));storageWarning=false;return true;}
 catch{storageWarning=true;return false;}
}
function focusChanged(){setTimeout(()=>{
 const current=focus?.current();
 if(current&&current.runId!==lastRunId){lastRunId=current.runId;selected=dateKey(new Date(current.startedAt));view='planner';}
 render();
},0);}
function openSettings(){$('#wake-input').value=clock(state.wake);$('#sleep-input').value=clock(state.sleep%1440);$('#settings-error').textContent='';$('#settings').showModal();}
function openEditor(kind,entry=null,slot=null){const form=$('#edit-form');form.reset();$('#edit-error').textContent='';$('#edit-id').value=entry?.id||'';$('#edit-kind').value=kind;$('#title-input').value=entry?.title||'';$('#edit-title').textContent=`${entry?'编辑':'添加'}${kind==='fixed'?'固定安排':'任务'}`;$('#fixed-fields').hidden=kind!=='fixed';$('#task-fields').hidden=kind!=='task';$('#delete-entry').hidden=!entry;$('#unschedule').hidden=!(kind==='task'&&entry?.date);$('#title-input').required=true;
 $('#timer-start-section').hidden=kind!=='task';
 $('#block-start').required=kind==='fixed';$('#block-end').required=kind==='fixed';$('#duration-input').required=kind==='task';
 if(kind==='fixed'){$('#block-start').value=clock(entry?.start??540);$('#block-end').value=clock((entry?.end??1080)%1440);$('#repeat-days').innerHTML=[1,2,3,4,5,6,0].map((day,i)=>`<label><input type="checkbox" name="repeat" value="${day}" ${(entry?.days||[1,2,3,4,5]).includes(day)?'checked':''}><span>${'一二三四五六日'[i]}</span></label>`).join('');}
 else{$('#duration-input').value=entry?.duration||(slot?Math.min(30,slot.end-slot.start):30);$('#schedule-check').checked=!!entry?.date||!!slot;$('#task-date').value=entry?.date||selected;$('#task-start').value=clock(entry?.start??slot?.start??Math.ceil(daily(selected).free[0]?.start??state.wake));}
 syncSchedule();$('#editor').showModal();}
function syncSchedule(){const active=$('#edit-kind').value==='task'&&$('#schedule-check').checked;$('#schedule-fields').hidden=!active;$('#task-date').required=active;$('#task-start').required=active;}
function findSlot(){const date=$('#task-date').value,len=Number($('#duration-input').value);if(!date||!Number.isInteger(len)||len<=0){$('#edit-error').textContent='请先填写日期和任务时长。';return;}const free=freeSlots(entriesFor(state,date).filter(e=>e.id!==$('#edit-id').value),state.wake,state.sleep).map(e=>({start:Math.ceil(e.start),end:Math.floor(e.end)})),slot=free.find(e=>e.end-e.start>=len);if(slot){$('#task-start').value=clock(slot.start);$('#edit-error').textContent='';}else $('#edit-error').textContent='这天没有足够长的连续空档，试试缩短任务或更换日期。';}
function saveEditor(e){e.preventDefault();const startNow=e.submitter?.id==='start-now';const kind=$('#edit-kind').value,id=$('#edit-id').value||uid(),title=$('#title-input').value.trim();if(!title){$('#edit-error').textContent='请填写名称。';return;}if(kind==='fixed'){const start=minutes($('#block-start').value),end=minutes($('#block-end').value)||1440,days=[...document.querySelectorAll('[name=repeat]:checked')].map(el=>Number(el.value));if(start>=end||!days.length){$('#edit-error').textContent='请选择重复的星期，结束时间需要晚于开始时间。';return;}const block={id,title,start,end,days};const conflict=state.blocks.some(b=>b.id!==id&&b.days.some(d=>days.includes(d))&&start<b.end&&end>b.start)||state.tasks.some(t=>t.date&&days.includes(dayAt(t.date).getDay())&&start<t.start+t.duration&&end>t.start);if(conflict){$('#edit-error').textContent='这段时间与已有安排重叠，请调整时间或星期。';return;}state.blocks=state.blocks.filter(b=>b.id!==id).concat(block);}else{const len=Number($('#duration-input').value),scheduled=$('#schedule-check').checked;let date=null,start=null;if(scheduled){if(!state.configured){$('#edit-error').textContent='请先保存到待安排清单，再到作息设置中设置一天的起止时间。';return;}date=$('#task-date').value;start=minutes($('#task-start').value);if(!canSchedule(state,date,start,len,id)){$('#edit-error').textContent='这段时间已被占用，或超出作息范围。试试“找到空档”。';return;}}
 if(startNow&&!focus.allowStart())return;
 const task={id,title,duration:len,date,start,done:startNow?false:state.tasks.find(t=>t.id===id)?.done||false};state.tasks=state.tasks.filter(t=>t.id!==id).concat(task);}
 $('#editor').close();persist(startNow?'倒计时已开始':'安排已保存');if(startNow)focus.start(state.tasks.find(t=>t.id===id));}
$('#edit-form').addEventListener('submit',saveEditor);
$('#start-now').onclick=()=>{if($('#edit-form').reportValidity())saveEditor({preventDefault(){},submitter:$('#start-now')});};
$('#settings-form').addEventListener('submit',e=>{e.preventDefault();const wake=minutes($('#wake-input').value),sleep=minutes($('#sleep-input').value)||1440;if(wake>=sleep){$('#settings-error').textContent='睡觉时间需要晚于起床时间；午夜请填写 00:00。';return;}if(state.tasks.some(t=>t.date&&(t.start<wake||t.start+t.duration>sleep))){$('#settings-error').textContent='已有任务超出这个作息范围，请先调整任务的时间。';return;}state.wake=wake;state.sleep=sleep;state.configured=true;$('#settings').close();persist('作息已保存，可以添加固定安排了');});
$('#delete-entry').onclick=()=>{const id=$('#edit-id').value;if(!confirm('确定删除这条安排？固定安排删除后，将不再每周重复。'))return;if($('#edit-kind').value==='fixed')state.blocks=state.blocks.filter(b=>b.id!==id);else state.tasks=state.tasks.filter(t=>t.id!==id);$('#editor').close();persist('已删除');focus.taskChanged(id);};
$('#unschedule').onclick=()=>{const task=state.tasks.find(t=>t.id===$('#edit-id').value);if(task){task.start=null;task.date=null;$('#editor').close();persist('已移回待安排清单');}};
$('#schedule-check').onchange=syncSchedule;$('#find-slot').onclick=findSlot;
$('#new-task').onclick=$('#backlog-add').onclick=()=>openEditor('task');$('#new-block').onclick=()=>openEditor('fixed');$('#settings-nav').onclick=$('#setup-btn').onclick=openSettings;
$('#prev-week').onclick=()=>{selected=dateKey(dayAt(selected,-7));render();};$('#next-week').onclick=()=>{selected=dateKey(dayAt(selected,7));render();};$('#today-btn').onclick=()=>{selected=dateKey();render();};
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const data=b.dataset;if(data.view){view=data.view;render();}if(data.date){selected=data.date;render();}if(data.free)openEditor('task',null,{start:Number(data.free),end:Number(data.end)});if(data.editBlock)openEditor('fixed',state.blocks.find(b=>b.id===data.editBlock));if(data.editTask)openEditor('task',state.tasks.find(t=>t.id===data.editTask));if(data.startTask){const task=state.tasks.find(t=>t.id===data.startTask);if(task&&focus.allowStart()){const current=state.tasks.find(t=>t.id===data.startTask);if(current){current.done=false;persist('已开始执行，将自动记录实际时段');focus.start(current);}}}if(data.done){const t=state.tasks.find(t=>t.id===data.done);t.done=!t.done;focus.taskChanged(t.id);persist(t.done?'又完成了一件事，做得好。':'已取消完成');}if(data.schedule){if(!state.configured){openSettings();return;}openEditor('task',state.tasks.find(t=>t.id===data.schedule));$('#schedule-check').checked=true;syncSchedule();findSlot();}if(b.classList.contains('close-dialog'))b.closest('dialog').close();});
$('#export-btn').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`留白备份-${dateKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#backup-message').textContent='备份已导出，请妥善保存。';};
$('#import-btn').onclick=()=>$('#import-file').click();$('#import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2e6)throw Error();const imported=JSON.parse(await file.text());if(!validState(imported))throw Error();if(confirm(`导入 ${imported.blocks.length} 条固定安排和 ${imported.tasks.length} 条任务？这会替换此设备当前的计划。`)){focus.clear();state=imported;$('#settings').close();persist('备份已导入');}}catch{$('#backup-message').textContent='无法导入：请选择有效的留白 JSON 备份文件（不超过 2 MB）。';}e.target.value='';};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;});
async function install(){if(deferredInstall){deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;}else $('#install-dialog').showModal();}
$('#install-btn').onclick=install;
// Installation stays easy to find on narrow screens too.
const mobileInstall=document.createElement('button');mobileInstall.className='text-button';mobileInstall.textContent='↗ 添加到手机桌面';mobileInstall.onclick=install;$('.local-status').after(mobileInstall);mobileInstall.style.cssText='display:block;margin:12px auto 0';
window.addEventListener('appinstalled',()=>toast('已添加到桌面'));
window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue){try{const s=JSON.parse(e.newValue);if(validState(s)){state=s;render();focus.reconcile();toast('已同步另一个页面的修改');}}catch{}}});
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>toast('离线功能暂时不可用，联网时仍可使用。'));
focus=createFocus({getTask:id=>state.tasks.find(t=>t.id===id),recordExecution,onChange:focusChanged,toast});
render();if(storageWarning)setTimeout(()=>toast('读取本地计划失败，请勿清理浏览器，可尝试导入备份。'),500);
