import test from 'node:test';
import assert from 'node:assert/strict';
import {createTimer,remainingMs,formatCountdown,pauseTimer,resumeTimer,validTimer} from '../timer.js';
const task={id:'t',title:'背单词',duration:80};
test('80 分钟从点击时开始，可跨午夜，后台跳时后仍按实际截止时间计算',()=>{
 const now=new Date('2026-10-13T23:50:00Z').getTime(),t=createTimer(task,now);
 assert.equal(t.endAt,now+4800000);assert.equal(formatCountdown(remainingMs(t,now)),'01:20:00');
 assert.equal(formatCountdown(remainingMs(t,now+31*60000)),'49:00');
 assert.equal(remainingMs(t,now+81*60000),0);
});
test('刷新恢复同一截止时间，不重新开始，不显示负数',()=>{
 const t=JSON.parse(JSON.stringify(createTimer(task,1000)));
 assert.equal(validTimer(t),true);assert.equal(remainingMs(t,61000),79*60000);
 assert.equal(formatCountdown(remainingMs(t,1e9)),'00:00');
 assert.equal(formatCountdown(1),'00:01');assert.equal(formatCountdown(59999),'01:00');
});
test('暂停冻结剩余时间，继续时从剩余时间恢复',()=>{
 const paused=pauseTimer(createTimer(task,1000),61000);
 assert.equal(paused.status,'paused');assert.equal(remainingMs(paused,1e9),79*60000);
 const resumed=resumeTimer(paused,200000);assert.equal(resumed.endAt,200000+79*60000);
 assert.equal(remainingMs(resumed,230000),78.5*60000);
 assert.equal(pauseTimer(createTimer({id:'t',title:'t',duration:1},1000),61000).status,'finished');
});
test('计时备份拒绝非法状态与时长，兼容暂停和结束状态',()=>{
 const t=createTimer(task,1000);assert.equal(validTimer(t),true);
 assert.equal(validTimer({...t,durationMs:-1}),false);assert.equal(validTimer({...t,endAt:null}),false);
 assert.equal(validTimer({...t,status:'paused',endAt:null}),true);
 assert.equal(validTimer({...t,status:'finished',remainingMs:0,endAt:null}),true);
 assert.equal(validTimer({...t,status:'paused',remainingMs:Infinity,endAt:null}),false);
 assert.equal(validTimer(null),false);assert.equal(validTimer({}),false);
});
