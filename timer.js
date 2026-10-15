// Use an absolute deadline so throttled tabs and reloads cannot slow the timer.
export function remainingMs(timer, now = Date.now()) {
  if (!timer || timer.status === 'finished') return 0;
  return Math.max(0, timer.status === 'paused' ? timer.remainingMs : timer.endAt - now);
}
export function formatCountdown(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return (h ? `${String(h).padStart(2,'0')}:` : '') + `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
export function createTimer(task, now = Date.now()) {
  const durationMs = task.duration * 60000;
  return {version:1, runId:globalThis.crypto?.randomUUID?.()||`run-${now}-${Math.random().toString(36).slice(2)}`, startedAt:now, taskId:task.id, title:task.title, durationMs, remainingMs:durationMs, endAt:now+durationMs, status:'running'};
}
export function pauseTimer(timer, now = Date.now()) {
  if (timer.status !== 'running') return timer;
  const left = remainingMs(timer, now);
  return {...timer, status:left > 0 ? 'paused' : 'finished', remainingMs:left, endAt:null};
}
export function resumeTimer(timer, now = Date.now()) {
  return timer.status === 'paused' ? {...timer, status:'running', endAt:now+timer.remainingMs} : timer;
}
export function validTimer(t) {
  return !!t && t.version === 1 && typeof t.taskId === 'string' && t.taskId.length > 0 &&
    typeof t.title === 'string' && t.title.length > 0 && t.title.length <= 100 &&
    Number.isSafeInteger(t.durationMs) && t.durationMs > 0 && t.durationMs <= 86400000 &&
    Number.isFinite(t.remainingMs) && t.remainingMs >= 0 && t.remainingMs <= t.durationMs &&
    (t.runId === undefined || typeof t.runId === 'string' && t.runId.length>0 && t.runId.length<=100) &&
    (t.startedAt === undefined || Number.isSafeInteger(t.startedAt) && t.startedAt>=0) &&
    (t.endedAt === undefined || Number.isSafeInteger(t.endedAt) && t.endedAt>=0) &&
    ['running','paused','finished'].includes(t.status) &&
    (t.status === 'running' ? Number.isSafeInteger(t.endAt) && t.endAt > 0 : t.endAt === null);
}

// Older active timers did not store their start. Keep them usable and label estimates.
export function normalizeTimer(timer, now = Date.now()) {
  if (timer.runId && Number.isSafeInteger(timer.startedAt)) return timer;
  const startedAt = Math.max(0, timer.status === 'running' ? timer.endAt-timer.durationMs : now-(timer.durationMs-timer.remainingMs));
  return {...timer,runId:`legacy-${timer.taskId}-${startedAt}`,startedAt,estimatedStart:true};
}
export function executionRecord(timer, endedAt = Date.now(), reason = 'manual') {
  const t = normalizeTimer(timer, endedAt);
  const end = Math.max(t.startedAt, endedAt);
  return {id:t.runId,taskId:t.taskId,title:t.title,startedAt:t.startedAt,endedAt:end,
    activeMs:Math.min(end-t.startedAt,Math.max(0,t.durationMs-remainingMs(t,end))),reason,estimatedStart:!!t.estimatedStart};
}
