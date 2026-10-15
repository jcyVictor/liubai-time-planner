import {emptyState,validState} from './core.js';
export const PLANNER_KEY='liubai-planner-v1';
export const ORIGINAL_URL='https://liubai-time-planner.lilacmars128.chatgpt.site/';
export const GITHUB_URL='https://jcyvictor.github.io/liubai-time-planner/';
export const IMPORT_HASH='liubai-transfer=';
export function cleanPlanner(value) {
  let valid=false;try{valid=validState(value);}catch{}
  if(!valid)throw new Error('这不是有效的留白备份文件。');
  return {version:1,wake:value.wake,sleep:value.sleep,configured:value.configured,
    blocks:value.blocks.map(b=>({id:b.id,title:b.title,start:b.start,end:b.end,days:[...b.days]})),
    tasks:value.tasks.map(t=>({id:t.id,title:t.title,duration:t.duration,date:t.date,start:t.start,done:t.done})),
    sessions:(value.sessions||[]).map(s=>({id:s.id,taskId:s.taskId,title:s.title,startedAt:s.startedAt,endedAt:s.endedAt,activeMs:s.activeMs,reason:s.reason,estimatedStart:!!s.estimatedStart}))};
}
export function encodeTransfer(state) {
  const bytes=new TextEncoder().encode(JSON.stringify(cleanPlanner(state)));
  let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function decodeTransfer(encoded) {
  if(typeof encoded!=='string'||encoded.length>3000000||!/^[A-Za-z0-9_-]+$/.test(encoded))throw new Error('迁移内容不完整，请从旧网站重新迁移。');
  const binary=atob(encoded.replaceAll('-','+').replaceAll('_','/'));
  const json=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));
  return cleanPlanner(JSON.parse(json));
}
export function mergePlanners(existing,incoming,useIncomingSettings=false) {
  const target=cleanPlanner(existing||emptyState()),source=cleanPlanner(incoming);
  const result={...target,blocks:[...target.blocks],tasks:[...target.tasks],sessions:[...target.sessions]};
  if(useIncomingSettings||!target.configured){result.wake=source.wake;result.sleep=source.sleep;result.configured=source.configured;}
  const used=new Set([...result.blocks,...result.tasks].map(x=>x.id)),taskIds=new Map();
  const safeId=(id,type)=>{let base=`import-${type}-${id}`.slice(0,92),candidate=base,n=1;while(used.has(candidate))candidate=`${base}-${n++}`;return candidate;};
  for(const b of source.blocks){
    if(result.blocks.some(x=>x.id===b.id))continue;
    const same=result.blocks.find(x=>x.id.startsWith(`import-block-${b.id}`.slice(0,92))&&x.title===b.title&&x.start===b.start&&x.end===b.end&&JSON.stringify(x.days)===JSON.stringify(b.days));
    if(same)continue;
    const id=used.has(b.id)?safeId(b.id,'block'):b.id;used.add(id);result.blocks.push({...b,id});
  }
  for(const t of source.tasks){
    const same=result.tasks.find(x=>x.id===t.id)||result.tasks.find(x=>x.id.startsWith(`import-task-${t.id}`.slice(0,92))&&x.title===t.title&&x.duration===t.duration);
    if(same){taskIds.set(t.id,same.id);continue;}
    const id=used.has(t.id)?safeId(t.id,'task'):t.id;used.add(id);taskIds.set(t.id,id);result.tasks.push({...t,id});
  }
  const sessionIds=new Set(result.sessions.map(s=>s.id));
  for(const s of source.sessions){if(sessionIds.has(s.id))continue;result.sessions.push({...s,taskId:taskIds.get(s.taskId)||s.taskId});sessionIds.add(s.id);}
  if(!validState(result))throw new Error('合并后的数据超出支持范围，请先导出备份。');
  return {state:result,added:{tasks:result.tasks.length-target.tasks.length,blocks:result.blocks.length-target.blocks.length,sessions:result.sessions.length-target.sessions.length}};
}
