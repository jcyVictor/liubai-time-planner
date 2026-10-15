import test from 'node:test';
import assert from 'node:assert/strict';
import {createTimer,pauseTimer,resumeTimer,executionRecord} from '../timer.js';
import {applySession,sessionEntries,validSessions} from '../records.js';
import {emptyState,validState,entriesFor,freeSlots} from '../core.js';
const task={id:'t',title:'背单词',duration:80,date:null,start:null,done:false};
test('手动结束保存实际起止、保留已完成任务，重试不重复记录',()=>{
 const start=new Date(2026,9,15,14,10).getTime();const timer=createTimer(task,start);
 const record=executionRecord(timer,start+25*60000,'manual');const state=applySession({...emptyState(),tasks:[task]},record);
 assert.equal(record.activeMs,25*60000);assert.equal(state.tasks.length,1);assert.equal(state.tasks[0].done,true);
 assert.equal(validState(state),true);assert.equal(applySession(state,record).sessions.length,1);
 const entry=entriesFor(state,'2026-10-15')[0];assert.equal(entry.start,850);assert.equal(entry.end,875);assert.equal(entry.kind,'record');
});
test('暂停计入起止区间，但专注时长排除暂停',()=>{
 const start=100000;let t=createTimer(task,start);t=pauseTimer(t,start+10*60000);t=resumeTimer(t,start+15*60000);
 const record=executionRecord(t,start+25*60000);assert.equal(record.endedAt-record.startedAt,25*60000);assert.equal(record.activeMs,20*60000);
});
test('跨午夜按两天展示，不多出零点的第三段',()=>{
 const start=new Date(2026,9,15,23,50).getTime();const record=executionRecord(createTimer(task,start),start+30*60000);
 const first=sessionEntries([record],'2026-10-15')[0],second=sessionEntries([record],'2026-10-16')[0];
 assert.equal(first.start,1430);assert.equal(first.end,1440);assert.equal(second.start,0);assert.equal(second.end,20);
 const midnight={...record,endedAt:new Date(2026,9,16).getTime()};assert.equal(sessionEntries([midnight],'2026-10-16').length,0);
});
test('立即开始后的实际记录取代原计划占用，重叠固定安排不会重复扣时间',()=>{
 const start=new Date(2026,9,15,14,10).getTime();const record=executionRecord(createTimer(task,start),start+25*60000);
 const state=applySession({...emptyState(),blocks:[{id:'b',title:'工作',start:840,end:900,days:[4]}],tasks:[{...task,date:'2026-10-15',start:660}]},record);
 assert.equal(entriesFor(state,'2026-10-15').filter(e=>e.kind==='task').length,0);
 const free=freeSlots(entriesFor(state,'2026-10-15'),420,1380);assert.equal(free.reduce((n,e)=>n+e.end-e.start,0),900);
});
test('旧备份兼容，带记录的新备份校验并拒绝损坏的数据',()=>{
 const old=emptyState();delete old.sessions;assert.equal(validState(old),true);
 const r=executionRecord(createTimer(task,1000),21000);assert.equal(validSessions([r]),true);
 assert.equal(validSessions([r,r]),false);assert.equal(validSessions([{...r,endedAt:0}]),false);
 assert.equal(validSessions([{...r,activeMs:999999}]),false);assert.equal(validSessions([null]),false);
});
test('实际统计保留秒级精度，不把 25 分钟多算成 26 分钟',()=>{
 const start=new Date(2026,9,15,14,10,0,0).getTime();const record=executionRecord(createTimer(task,start),start+25*60000+1);
 const entry=sessionEntries([record],'2026-10-15')[0];assert.ok(Math.abs(entry.end-entry.start-25)<.001);
});
