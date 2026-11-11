export const ZONE='Europe/Kyiv';
export const GRID_START=7*60,GRID_END=21*60;
export const dayNames=['Неділя','Понеділок','Вівторок','Середа','Четвер','П’ятниця','Субота'];
export function parts(value){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));}
export function dateKey(value=new Date()){const p=parts(value);return `${p.year}-${p.month}-${p.day}`;}
export const addDays=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export const dayIndex=date=>new Date(date+'T12:00:00Z').getUTCDay();
export const monday=date=>addDays(date,-((dayIndex(date)+6)%7));
export function rangeDays(date,view){const start=view==='week'?monday(date):date;return Array.from({length:view==='week'?7:view==='three'?3:1},(_,i)=>addDays(start,i));}
export const toMinute=time=>+time.slice(0,2)*60 + +time.slice(3,5);
export const toTime=minute=>String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
export function minuteAt(value){const p=parts(value);return +p.hour*60 + +p.minute;}
export function toUtc(date,time){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Перевірте дату та час.');const desired=Date.parse(date+'T'+time+':00Z');for(const offset of [2,3]){const t=new Date(desired-offset*3600000);if(dateKey(t)===date&&toTime(minuteAt(t))===time)return t.toISOString();}throw Error('Цього часу немає через перехід на літній час.');}
export function localInput(value){return dateKey(value)+'T'+toTime(minuteAt(value));}
export const inputToUtc=value=>{const [date,time]=value.split('T');return toUtc(date,time);};
function latest(rows,at){const value=rows.filter(r=>r.effectiveFrom<=at).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||b.version-a.version)[0];return value?.active===false?null:value;}
export function scheduleFor(db,barberId,date){const at=toUtc(date,'12:00'),version=latest(db.Schedules.filter(r=>r.barberId===barberId),at),exceptions=(db.Exceptions||[]).filter(e=>e.active!==false&&e.barberId===barberId&&e.date===date);const closed=exceptions.some(e=>e.closed);const override=exceptions.find(e=>e.intervals);return {version,closed,intervals:closed?[]:(override?.intervals||version?.days[dayIndex(date)]?.intervals||[]),blocks:exceptions.filter(e=>e.start&&e.end).map(e=>[minuteAt(e.start),minuteAt(e.end)]),exceptions};}
export function workingRanges(db,barberId,date){const s=scheduleFor(db,barberId,date);let ranges=s.intervals.map(([a,b])=>[toMinute(a),toMinute(b)]);for(const [a,b]of s.blocks){ranges=ranges.flatMap(([start,end])=>b<=start||a>=end?[[start,end]]:[[start,Math.max(start,a)],[Math.min(end,b),end]].filter(([x,y])=>y>x));}return ranges;}
export function eventLayout(bookings){
 const items=bookings.map(b=>({booking:b,start:minuteAt(b.start),end:minuteAt(b.end),lane:0,lanes:1})).sort((a,b)=>a.start-b.start||a.end-b.end);let group=[],groupEnd=-1;
 const finish=()=>{const ends=[];for(const e of group){let lane=ends.findIndex(end=>end<=e.start);if(lane<0)lane=ends.length;ends[lane]=e.end;e.lane=lane;}group.forEach(e=>e.lanes=ends.length);};
 for(const item of items){if(item.start>=groupEnd){finish();group=[];groupEnd=-1;}group.push(item);groupEnd=Math.max(groupEnd,item.end);}finish();return items;
}
export function errorText(error){try{const details=JSON.parse(error.message);if(details.conflicts)return details.message+' Конфліктів: '+details.conflicts.length+'. '+details.conflicts.slice(0,4).map(c=>new Intl.DateTimeFormat('uk-UA',{timeZone:ZONE,dateStyle:'short',timeStyle:'short'}).format(new Date(c.start))).join('; ');}catch{}return error.message||'Не вдалося зберегти зміни.';}
