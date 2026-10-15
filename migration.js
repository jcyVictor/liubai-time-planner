import {cleanPlanner,encodeTransfer,decodeTransfer,mergePlanners,PLANNER_KEY,ORIGINAL_URL,GITHUB_URL,IMPORT_HASH} from './migrate-data.js';
const PENDING='liubai-pending-migration-v1',BACKUP='liubai-before-migration-v1',DONE='liubai-migration-done-v1';
const $=s=>document.querySelector(s);
export function setupMigration({getState,acceptState,getTimer}) {
  const source=location.origin===new URL(ORIGINAL_URL).origin;
  const destination=location.origin===new URL(GITHUB_URL).origin&&location.pathname.startsWith(new URL(GITHUB_URL).pathname);
  let pending=null;
  const panel=$('#migration-banner'),dialog=$('#migration-dialog');
  panel.hidden=!(source||destination);
  $('#migration-file-area').hidden=!destination;
  $('#migration-title').textContent=source?'把我的计划迁移到 GitHub 版':'旧网站里的计划，也可以带过来';
  $('#migration-description').textContent=source?'任务、作息和执行记录一起迁移，旧数据仍然保留。':'新旧数据会合并，相同任务保留新版内容，不会重复添加。';
  $('#migration-start').textContent=source?'迁移到 GitHub 版 ↗':'打开旧网站迁移 ↗';
  $('#migration-privacy').hidden=!source;
  function showPending(state) {
    pending=cleanPlanner(state);
    try{sessionStorage.setItem(PENDING,JSON.stringify(pending));}catch{}
    $('#migration-summary').textContent=`收到 ${pending.tasks.length} 个任务（${pending.tasks.filter(t=>t.done).length} 个已完成）、${pending.blocks.length} 条固定安排、${pending.sessions.length} 条执行记录。`;
    $('#migration-use-settings').checked=!getState().configured;
    $('#migration-error').textContent='';
    if(!dialog.open)dialog.showModal();
  }
  function exportMigration(state){
    const blob=new Blob([JSON.stringify(cleanPlanner(state),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='留白迁移备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function sourceState(){
    const timer=getTimer();
    if(timer&&timer.status!=='finished')throw new Error('有任务正在计时。请先点“结束并完成”，让最新执行记录保存后再迁移。');
    const state=cleanPlanner(getState());
    if(!state.configured&&!state.tasks.length&&!state.blocks.length&&!state.sessions.length)throw new Error('当前浏览器没有旧计划。请从原来保存任务的浏览器或手机桌面入口打开旧网站，再点迁移。');
    return state;
  }
  $('#migration-start').onclick=()=>{
    if(!source){location.assign(ORIGINAL_URL+'#migration');return;}
    try{
      const encoded=encodeTransfer(sourceState());
      if(encoded.length>40000){$('#migration-status').textContent='记录较多，请下载迁移文件，然后到新版选择“已有旧版备份？导入并合并”。';$('#migration-large').hidden=false;return;}
      // URL fragments stay in the browser and are immediately removed by the recipient.
      location.assign(GITHUB_URL+'#'+IMPORT_HASH+encoded);
    }catch(error){$('#migration-status').textContent=error.message;}
  };
  $('#migration-download').onclick=()=>{try{exportMigration(sourceState());}catch(error){$('#migration-status').textContent=error.message;}};
  $('#migration-open-new').href=GITHUB_URL;
  $('#migration-file').onchange=async event=>{
    const file=event.target.files[0];if(!file)return;
    try{if(file.size>2e6)throw new Error('备份文件超过 2 MB，请使用较小的备份。');showPending(JSON.parse(await file.text()));}
    catch(error){$('#migration-status').textContent=error.message||'无法读取这份备份。';}
    event.target.value='';
  };
  $('#migration-apply').onclick=()=>{
    if(!pending)return;
    try{
      // Re-read on confirmation so other tabs' edits are retained.
      const raw=localStorage.getItem(PLANNER_KEY),existing=raw?cleanPlanner(JSON.parse(raw)):cleanPlanner(getState());
      const result=mergePlanners(existing,pending,$('#migration-use-settings').checked);
      // A backup must succeed before writing. localStorage.setItem is atomic.
      if(!localStorage.getItem(BACKUP))localStorage.setItem(BACKUP,JSON.stringify(existing));
      localStorage.setItem(PLANNER_KEY,JSON.stringify(result.state));
      acceptState(result.state);
      try{localStorage.setItem(DONE,'1');}catch{}
      try{sessionStorage.removeItem(PENDING);}catch{}
      pending=null;dialog.close();
      $('#migration-title').textContent='迁移完成，计划已经保存';
      $('#migration-description').textContent=`新增 ${result.added.tasks} 个任务、${result.added.blocks} 条固定安排、${result.added.sessions} 条执行记录。已有内容和旧网站数据都已保留。`;
      $('#migration-start').hidden=true;
      $('#migration-status').textContent='以后从这个 GitHub 网址打开即可。添加到手机桌面前，请先确认任务已显示。';
      $('#migration-restore').hidden=false;
    }catch(error){$('#migration-error').textContent='迁移未完成：'+(error.message||'浏览器无法保存数据。请不要清理旧网站。');}
  };
  function cancel(){pending=null;try{sessionStorage.removeItem(PENDING);}catch{};dialog.close();}
  $('#migration-cancel').onclick=cancel;dialog.addEventListener('cancel',cancel);
  $('#migration-restore').onclick=()=>{try{const raw=localStorage.getItem(BACKUP);if(raw)exportMigration(JSON.parse(raw));}catch{$('#migration-status').textContent='暂时无法导出迁移前备份。';}};
  if(destination){
    try{
      if(localStorage.getItem(DONE)==='1'){
        $('#migration-title').textContent='计划已经迁入 GitHub 版';
        $('#migration-description').textContent='任务、作息和执行记录已保存在这个浏览器。旧网站的数据仍然保留。';
        $('#migration-start').textContent='再次从旧网站迁移 ↗';
      }
      if(location.hash.startsWith('#'+IMPORT_HASH)){
        const encoded=location.hash.slice(IMPORT_HASH.length+1);
        history.replaceState(null,'',location.pathname+location.search);
        showPending(decodeTransfer(encoded));
      }else{const raw=sessionStorage.getItem(PENDING);if(raw)showPending(JSON.parse(raw));}
      $('#migration-restore').hidden=!localStorage.getItem(BACKUP);
    }catch{pending=null;try{sessionStorage.removeItem(PENDING);}catch{};$('#migration-status').textContent='迁移内容无法读取，请回旧网站重新点击迁移，或使用备份文件。';}
  }
  if(location.hash==='#migration'){history.replaceState(null,'',location.pathname+location.search);panel.scrollIntoView({block:'start'});}
}
