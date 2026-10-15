export const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const timeLabel = timestamp => new Date(timestamp).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
export function elapsedLabel(ms) {
  const seconds = Math.max(0, Math.floor(ms/1000));
  if (!seconds) return '不到 1 秒';
  const h = Math.floor(seconds/3600), m = Math.floor(seconds%3600/60), s = seconds%60;
  return [h ? `${h} 小时` : '', m ? `${m} 分` : '', s ? `${s} 秒` : ''].filter(Boolean).join(' ');
}
export function validSessions(sessions) {
  if (sessions === undefined) return true; // Existing v1 backups remain readable.
  const text = x => typeof x === 'string' && x.length > 0 && x.length <= 100;
  const timestamp = x => Number.isSafeInteger(x) && x >= 0 && x < 8640000000000000;
  return Array.isArray(sessions) && sessions.length <= 20000 && sessions.every(s =>
    s && text(s.id) && text(s.taskId) && text(s.title) && timestamp(s.startedAt) && timestamp(s.endedAt) &&
    s.endedAt >= s.startedAt && s.endedAt-s.startedAt <= 366*86400000 &&
    Number.isFinite(s.activeMs) && s.activeMs >= 0 && s.activeMs <= s.endedAt-s.startedAt &&
    ['manual','elapsed','completed','replaced'].includes(s.reason) &&
    (s.estimatedStart === undefined || typeof s.estimatedStart === 'boolean')) &&
    new Set(sessions.map(s=>s.id)).size === sessions.length;
}
export function sessionEntries(sessions, date) {
  const [y,m,d] = date.split('-').map(Number);
  const dayStart = new Date(y,m-1,d).getTime(), dayEnd = new Date(y,m-1,d+1).getTime();
  return (sessions || []).filter(s => s.startedAt < dayEnd && s.endedAt >= dayStart &&
    (s.endedAt > dayStart || s.startedAt === s.endedAt)).map(s => {
    const from=Math.max(s.startedAt,dayStart), to=Math.min(s.endedAt,dayEnd);
    const minuteAt=t=>{const x=new Date(t);return x.getHours()*60+x.getMinutes()+x.getSeconds()/60+x.getMilliseconds()/60000;};
    return {...s,id:`session:${s.id}:${date}`,sessionId:s.id,kind:s.live?'live':'record',
      start:minuteAt(from),end:to===dayEnd?1440:minuteAt(to),
      from,to,startText:timeLabel(from),endText:to===dayEnd?'24:00:00':timeLabel(to),
      continuesBefore:s.startedAt<dayStart,continuesAfter:s.endedAt>dayEnd};
  });
}
export function applySession(state, session) {
  // Retrying a finish after reload must never add the same interval twice.
  const sessions=state.sessions || [];
  if (sessions.some(s=>s.id===session.id)) return state;
  return {...state,sessions:[...sessions,session],tasks:state.tasks.map(t=>t.id===session.taskId?{...t,done:true}:t)};
}
