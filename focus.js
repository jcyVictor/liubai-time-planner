import {remainingMs, formatCountdown, createTimer, pauseTimer, resumeTimer, validTimer, normalizeTimer, executionRecord} from './timer.js';

const KEY = 'liubai-focus-v1';
const $ = selector => document.querySelector(selector);

export function createFocus({getTask, recordExecution, onChange, toast}) {
  let timer = null, audio = null, wakeLock = null, wakePending = false, finishing = false;
  let volatile = false;
  const baseTitle = document.title;
  const panel = $('#focus-panel'), alert = $('#timer-alert');

  function read() {
    try { const value = JSON.parse(localStorage.getItem(KEY)); return validTimer(value) ? normalizeTimer(value) : null; }
    catch { return null; }
  }
  function save() {
    try {
      if (timer) localStorage.setItem(KEY, JSON.stringify(timer));
      else localStorage.removeItem(KEY);
      volatile = false;
    } catch { volatile = true; toast('计时仍在运行，但无法保存。请保持此页面打开。'); }
  }
  function unlockSound() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audio ||= new Audio();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch { /* Visual reminders work without audio. */ }
  }
  function playSound() {
    if (!audio || audio.state !== 'running') return;
    try {
      for (let i = 0; i < 3; i++) {
        const oscillator = audio.createOscillator(), gain = audio.createGain();
        const at = audio.currentTime + i * .45;
        oscillator.frequency.value = i === 1 ? 880 : 660;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(.15, at + .025);
        gain.gain.exponentialRampToValueAtTime(.001, at + .32);
        oscillator.connect(gain); gain.connect(audio.destination);
        oscillator.start(at); oscillator.stop(at + .34);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      }
    } catch { /* Keep the visual reminder even when audio is blocked. */ }
  }
  async function keepAwake() {
    const needed = timer?.status === 'running' && document.visibilityState === 'visible';
    if (!needed) { const lock = wakeLock; wakeLock = null; if (lock) await lock.release().catch(() => {}); return; }
    if (!('wakeLock' in navigator) || wakeLock || wakePending) return;
    wakePending = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (timer?.status !== 'running' || document.visibilityState !== 'visible') await lock.release();
      else { wakeLock = lock; lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; }); }
    } catch { /* Screen wake lock is optional on this device. */ }
    finally { wakePending = false; }
  }
  function notificationButton() {
    const available = 'Notification' in window && 'serviceWorker' in navigator;
    $('#enable-timer-notifications').hidden = !available || Notification.permission === 'granted';
    $('#enable-timer-notifications').textContent = available && Notification.permission === 'denied' ? '通知已关闭' : '开启系统通知';
  }
  function render() {
    panel.hidden = !timer;
    document.body.classList.toggle('has-focus-timer', !!timer);
    if (!timer) { document.title = baseTitle; if (alert.open) alert.close(); return; }
    const left = remainingMs(timer);
    $('#focus-title').textContent = timer.title;
    $('#focus-clock').textContent = formatCountdown(left);
    $('#focus-state').textContent = timer.status === 'finished' ? '时间到了' : timer.status === 'paused' ? '已暂停 · 剩余' : '正在专注 · 剩余';
    $('#focus-progress').value = Math.min(1, Math.max(0, 1-left/timer.durationMs));
    $('#focus-pause').hidden = timer.status === 'finished';
    $('#focus-pause').textContent = timer.status === 'paused' ? '继续' : '暂停';
    $('#focus-complete').hidden = timer.status !== 'finished';
    $('#focus-stop').textContent = timer.status === 'finished' ? '收起' : '结束并完成';
    panel.classList.toggle('timer-finished', timer.status === 'finished');
    const end = timer.endAt ? new Date(timer.endAt) : null;
    $('#focus-end').textContent = end ? `预计 ${end.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})} 结束${end.toDateString() !== new Date().toDateString() ? '（次日）' : ''}` : timer.status === 'paused' ? '按继续后恢复计时' : '辛苦了，休息一下吧';
    $('#focus-note').textContent = volatile ? '计时未保存，请保持此页面打开。' : '到时弹窗并尝试响铃；锁屏或切到后台可能无法准时提醒。';
    document.title = `${timer.status === 'finished' ? '时间到了' : formatCountdown(left)} · ${timer.title} · 留白`;
    notificationButton();
  }
  function showAlert() {
    if (!timer || timer.status !== 'finished') return;
    $('#timer-alert-task').textContent = timer.title;
    $('#timer-alert-duration').textContent = `已到 ${timer.durationMs/60000} 分钟，实际时段已记入日程，任务已标记完成。`;
    if (!alert.open) alert.showModal();
  }
  async function sendNotification(snapshot) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) await registration.showNotification('时间到了 · 留白', {
        body:`「${snapshot.title}」的计时结束了，休息一下吧。`,
        icon:new URL('./icons/icon-192.png',location.href).href,
        tag:`liubai-timer-${snapshot.taskId}`, data:{url:new URL('./',location.href).href}
      });
    } catch { /* A notification failure must not prevent the in-page reminder. */ }
  }
  async function finish() {
    if (finishing) return;
    finishing = true;
    const claim = () => {
      // Re-read inside the cross-tab lock so only one tab sounds the alarm.
      if (!volatile) timer = read();
      if (!timer) { render(); return; }
      if (timer.status === 'finished') { render(); showAlert(); return; }
      if (timer.status !== 'running' || remainingMs(timer) > 0) { render(); return; }
      if (!settle('elapsed',timer.endAt)) return;
      render(); showAlert(); playSound();
      try { navigator.vibrate?.([200,100,200]); } catch {}
      void sendNotification({...timer}); void keepAwake();
    };
    try { if (navigator.locks) { try { await navigator.locks.request(KEY, claim); } catch { claim(); } } else claim(); }
    finally { finishing = false; }
  }
  function settle(reason = 'manual', at = Date.now()) {
    if (!timer) return true;
    const record = timer.finalRecord || executionRecord(timer, at, reason);
    // The record ID makes retries and two open tabs safe.
    if (!recordExecution(record)) { timer.finalRecord = record; save(); toast('记录暂未保存，请保留页面并导出备份后重试。'); return false; }
    timer = {...timer,status:'finished',remainingMs:0,endAt:null,endedAt:record.endedAt,finalRecord:record};
    save(); onChange(); return true;
  }
  function tick() {
    render();
    if (timer?.status === 'running' && remainingMs(timer) <= 0) void finish();
  }
  function sync() { if (!volatile) timer = read(); tick(); onChange(); void keepAwake(); }
  function clear() { timer = null; save(); render(); onChange(); void keepAwake(); }
  function complete() {
    if (!volatile) timer = read();
    if (!timer) return;
    if (!settle(timer.status==='running' && remainingMs(timer)===0?'elapsed':'manual', timer.status==='running' && remainingMs(timer)===0?timer.endAt:Date.now())) return;
    clear(); toast('已记录实际时段，任务已完成');
  }
  function allowStart() {
    if (!volatile) timer = read();
    if (!timer) return true;
    if (timer.status !== 'finished' && !confirm('结束当前任务并保存实际时段，再开始新的计时吗？')) return false;
    if (!settle('replaced',timer.status==='running' && remainingMs(timer)===0?timer.endAt:Date.now())) return false;
    clear(); return true;
  }
  function start(task) {
    unlockSound();
    if (alert.open) alert.close();
    timer = createTimer(task); save(); render(); onChange(); void keepAwake();
  }
  $('#focus-pause').onclick = () => {
    if (!volatile) timer = read();
    if (!timer || timer.status === 'finished') { render(); return; }
    if (timer.status === 'running' && remainingMs(timer) === 0) { void finish(); return; }
    unlockSound(); timer = timer.status === 'paused' ? resumeTimer(timer) : pauseTimer(timer);
    save(); render(); onChange(); void keepAwake();
  };
  $('#focus-stop').onclick = () => {
    if (!volatile) timer = read();
    if (timer?.status === 'finished') { clear(); return; }
    complete();
  };
  $('#focus-complete').onclick = $('#timer-alert-complete').onclick = complete;
  $('#timer-alert-dismiss').onclick = () => { if (!timer || settle('elapsed',timer.endedAt||Date.now())) clear(); };
  $('#enable-timer-notifications').onclick = async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'denied') { toast('请在浏览器或系统设置中允许本站通知。'); return; }
    try {
      const permission = await Notification.requestPermission(); notificationButton();
      toast(permission === 'granted' ? '已允许通知。锁屏或后台提醒仍受手机系统限制。' : '未开启系统通知，页面内仍会显示到时提醒。');
    } catch { toast('此浏览器暂不支持系统通知；iPhone 可先添加到主屏幕。'); }
  };
  document.addEventListener('pointerdown', () => { if (timer) unlockSound(); }, {passive:true});
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pageshow', sync);
  window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) { timer = read(); tick(); onChange(); if (timer?.status === 'finished') showAlert(); void keepAwake(); } });
  if ('ResizeObserver' in window) new ResizeObserver(() => {
    document.body.style.setProperty('--focus-panel-height', `${panel.hidden ? 0 : panel.getBoundingClientRect().height+20}px`);
  }).observe(panel);
  timer = read(); tick(); if (timer?.status === 'finished') showAlert(); void keepAwake();
  setInterval(tick, 250);
  setInterval(() => { if(timer && timer.status!=='finished')onChange(); },15000);
  return {allowStart,start,current:()=>timer,taskChanged(id){
    if (timer?.taskId === id) { const task=getTask(id); if (!task || task.done) { if(settle('completed'))clear(); } }
  },reconcile(){if(timer){const task=getTask(timer.taskId);if(!task||task.done){if(timer.status!=='finished'&&settle('completed'))clear();}}},clear};
}
