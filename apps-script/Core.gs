/* Pure business rules. UTC instants; wall-clock schedules use Europe/Kyiv. */
var RoyalCore = (() => {
  const TABLES = ['Settings','Services','Barbers','Offers','Schedules','Exceptions','Bookings','Payments','Expenses','Users','Versions','Audit','Analytics','Technical','Requests','Notifications','Periods'];
  const activeStatuses = ['pending','confirmed'];
  const fail = (code, message) => { const e = new Error(message); e.code = code; throw e; };
  const requireValue = (ok, message) => { if (!ok) fail('VALIDATION',message); };
  const num = (x,min,max) => Number.isFinite(x) && x >= min && x <= max;
  const text = (x,max=200) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
  const iso = x => typeof x === 'string' && Number.isFinite(Date.parse(x)) && /Z$/.test(x);
  const clone = x => JSON.parse(JSON.stringify(x));
  const overlaps = (a,b) => a.start < b.end && b.start < a.end;
  const defaults = {name:'The Royal Barbershop',address:'вулиця Гунська, 32, Кам’янець-Подільський',phone:'0686770770',telegram:'kodi2403',hoursLabel:'Понеділок–субота: 08:00–20:00. Неділя — вихідний.',timezone:'Europe/Kyiv',minNoticeMinutes:120,horizonDays:30,bufferMinutes:0,cancelNoticeMinutes:120,online:false,slotMinutes:15,analyticsRetentionDays:90,technicalRetentionDays:30,backupRetentionDays:30};
  function local(instant) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(new Date(instant)).map(x=>[x.type,x.value]));
    return {date:`${p.year}-${p.month}-${p.day}`,minute:+p.hour*60 + +p.minute,weekday:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday)};
  }
  const minute = s => { requireValue(/^([01]\d|2[0-3]):[0-5]\d$/.test(s),'Некоректний час'); return +s.slice(0,2)*60 + +s.slice(3); };
  const settings = db => ({...defaults,...db.Settings.find(x=>x.id==='shop')});
  const latest = (list,at) => {const value=list.filter(x=>x.effectiveFrom<=at).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||b.version-a.version)[0];return value?.active===false?undefined:value;};
  function offer(db,serviceId,barberId,at) { return latest(db.Offers.filter(x=>x.serviceId===serviceId&&x.barberId===barberId),at); }
  function windowFor(db,barberId,at) {
    const l=local(at), ex=db.Exceptions.filter(x=>x.active!==false&&x.barberId===barberId&&x.date===l.date);
    if(ex.some(x=>x.closed)) return null;
    const schedule=latest(db.Schedules.filter(x=>x.barberId===barberId),at);
    const day=ex.find(x=>x.intervals) || (schedule&&schedule.days[l.weekday]);
    return day ? {intervals:day.intervals||[],blocks:ex.filter(x=>x.start&&x.end).map(x=>({start:Date.parse(x.start),end:Date.parse(x.end)}))} : null;
  }
  function eligible(db,serviceId,barberId,start,now,manual=false,excludeId=null,snapshot=null) {
    const cfg=settings(db), instant=Date.parse(start);
    requireValue(iso(start),'Вкажіть час у форматі UTC');
    requireValue(db.Services.some(x=>x.id===serviceId&&x.active!==false),'Послуга недоступна');
    requireValue(db.Barbers.some(x=>x.id===barberId&&x.active!==false),'Майстер недоступний');
    const o=offer(db,serviceId,barberId,start); requireValue(!!o,'Послуга недоступна для цього майстра');
    const duration=snapshot?.durationMinutes??o.durationMinutes, buffer=snapshot?.bufferMinutes??cfg.bufferMinutes;
    const end=instant+(duration+buffer)*60000, loc=local(start), endLoc=local(new Date(end).toISOString());
    requireValue(instant>now,'Цей час уже минув');
    requireValue(instant<=now+cfg.horizonDays*86400000,'Дата поза горизонтом запису');
    if(!manual) requireValue(cfg.online,'Онлайн-запис ще не відкрито');
    const win=windowFor(db,barberId,start);
    requireValue(win && loc.date===endLoc.date && win.intervals.some(i=>loc.minute>=minute(i[0]) && endLoc.minute<=minute(i[1])),'Майстер не працює у цей час');
    requireValue(!win.blocks.some(b=>overlaps({start:instant,end},b)),'Час заблоковано');
    if(db.Bookings.some(b=>b.id!==excludeId&&b.barberId===barberId&&activeStatuses.includes(b.status)&&overlaps({start:instant,end},{start:Date.parse(b.start),end:Date.parse(b.end)+b.bufferMinutes*60000}))) fail('CONFLICT','Цей час уже зайнято. Оберіть інший.');
    return {offer:o,end:new Date(instant+duration*60000).toISOString(),bufferMinutes:buffer,late:instant<now+cfg.minNoticeMinutes*60000};
  }
  function catalogue(db,now) {
    const at=new Date(now).toISOString();
    return {settings:settings(db),services:db.Services.filter(x=>x.active!==false).map(({id,name,description,order})=>({id,name,description,order})).sort((a,b)=>(a.order||0)-(b.order||0)),barbers:db.Barbers.filter(x=>x.active!==false).map(({id,name,description,photo})=>({id,name,description,photo})),offers:db.Barbers.flatMap(b=>db.Services.map(s=>offer(db,s.id,b.id,at))).filter(Boolean).map(({id,version,serviceId,barberId,priceMinor,durationMinutes})=>({id,version,serviceId,barberId,priceMinor,durationMinutes}))};
  }
  function slots(db,p,now) {
    requireValue(/^\d{4}-\d{2}-\d{2}$/.test(p.date),'Некоректна дата');
    const start=Date.parse(p.date+'T00:00:00Z')-4*3600000, result=[];
    for(let t=start;t<start+28*3600000;t+=settings(db).slotMinutes*60000){
      const at=new Date(t).toISOString(); if(local(at).date!==p.date)continue;
      for(const b of db.Barbers.filter(b=>!p.barberId||p.barberId===b.id)) {
        try { const v=eligible(db,p.serviceId,b.id,at,now); result.push({start:at,barberId:b.id,offerId:v.offer.id,offerVersion:v.offer.version,priceMinor:v.offer.priceMinor,durationMinutes:v.offer.durationMinutes,late:v.late}); } catch(e){if(!['VALIDATION','CONFLICT'].includes(e.code))throw e;}
      }
    }
    return result;
  }
  function authorize(actor,roles) { if(!actor||!roles.includes(actor.role)) fail('FORBIDDEN','Недостатньо прав'); }
  function validateEntity(table,p) {
    if(['Services','Barbers'].includes(table)) {requireValue(text(p.name,100),'Вкажіть назву');requireValue(!p.photo||/^https:\/\//.test(p.photo),'Фото має бути HTTPS-посиланням');}
    if(table==='Offers') {requireValue(text(p.serviceId)&&text(p.barberId)&&num(p.priceMinor,0,10000000)&&Number.isInteger(p.priceMinor)&&num(p.durationMinutes,5,480)&&Number.isInteger(p.durationMinutes)&&iso(p.effectiveFrom),'Перевірте ціну, тривалість і дату');}
    if(table==='Schedules') {requireValue(text(p.barberId)&&iso(p.effectiveFrom)&&Array.isArray(p.days)&&p.days.length===7,'Потрібно 7 днів графіка');p.days.forEach(d=>{requireValue(Array.isArray(d.intervals),'Некоректний графік');d.intervals.forEach(i=>requireValue(Array.isArray(i)&&minute(i[0])<minute(i[1]),'Некоректний інтервал'));});}
    if(table==='Exceptions') {requireValue(text(p.barberId)&&/^\d{4}-\d{2}-\d{2}$/.test(p.date),'Некоректний виняток графіка');if(!p.closed&&!p.intervals)requireValue(iso(p.start)&&iso(p.end)&&p.end>p.start&&local(p.start).date===p.date&&local(p.end).date===p.date,'Перевірте час блокування');if(p.intervals)p.intervals.forEach(i=>requireValue(minute(i[0])<minute(i[1]),'Некоректний інтервал'));}
    if(table==='Users')requireValue(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)&&['owner','admin','barber'].includes(p.role)&&(p.role!=='barber'||text(p.barberId)),'Перевірте email і роль');
    if(table==='Settings') {['minNoticeMinutes','bufferMinutes','cancelNoticeMinutes'].forEach(k=>requireValue(num(p[k],0,1440)&&Number.isInteger(p[k]),'Некоректні правила запису'));['analyticsRetentionDays','technicalRetentionDays','backupRetentionDays'].forEach(k=>requireValue(num(p[k],1,3650)&&Number.isInteger(p[k]),'Некоректний строк зберігання'));requireValue(num(p.horizonDays,1,365)&&Number.isInteger(p.horizonDays)&&[5,10,15,20,30,60].includes(p.slotMinutes),'Некоректний горизонт або крок');requireValue(typeof p.online==='boolean'&&text(p.name,100)&&text(p.phone,30)&&text(p.address,300)&&text(p.hoursLabel,300)&&/^[a-zA-Z0-9_]{5,32}$/.test(p.telegram),'Перевірте контакти');requireValue(p.timezone==='Europe/Kyiv','Підтримується часовий пояс Europe/Kyiv');}
  }
  function prepare(db,action,p,actor,ctx) {
    const now=ctx.now, at=new Date(now).toISOString(), changes=[], response={};
    const write=(table,record) => {changes.push({table,record});return record;};
    const getBooking=()=>{const b=db.Bookings.find(x=>x.id===p.id);requireValue(b,'Запис не знайдено');return b;};
    const ownBooking=()=>{const b=getBooking();if(!actor)requireValue(ctx.tokenHash&&b.tokenHash===ctx.tokenHash,'Невірний ключ запису');else {authorize(actor,['owner','admin','barber']);if(actor.role==='barber')requireValue(b.barberId===actor.barberId,'Недостатньо прав');}return b;};
    if(action==='book') {
      if(actor)authorize(actor,['owner','admin']);
      requireValue(text(p.name,100)&&/^\+380\d{9}$/.test(p.phone)&&(!p.comment||p.comment.length<=500),'Перевірте ім’я та телефон');
      const candidates=p.barberId?[p.barberId]:db.Barbers.filter(x=>x.active!==false).map(x=>x.id);
      let selected; for(const barberId of candidates){try{const q=eligible(db,p.serviceId,barberId,p.start,now,!!actor);if(!q.late||actor){selected={barberId,...q};break;}}catch(e){if(!['VALIDATION','CONFLICT'].includes(e.code))throw e;}}
      requireValue(selected,'Час недоступний для онлайн-запису. Оберіть інший або зв’яжіться з нами.');
      const q=selected;requireValue(q.offer.id===p.offerId&&q.offer.version===p.offerVersion,'Ціна або тривалість змінилася. Оновіть вибір та підтвердьте нові умови.');
      const record={id:ctx.id(),version:1,serviceId:p.serviceId,barberId:q.barberId,serviceName:db.Services.find(x=>x.id===p.serviceId).name,barberName:db.Barbers.find(x=>x.id===q.barberId).name,start:p.start,end:q.end,priceMinor:q.offer.priceMinor,durationMinutes:q.offer.durationMinutes,bufferMinutes:q.bufferMinutes,offerId:q.offer.id,offerVersion:q.offer.version,status:'pending',name:p.name.trim(),phone:p.phone,comment:p.comment||'',tokenHash:ctx.tokenHash,createdAt:at,updatedAt:at};
      write('Bookings',record);write('Notifications',{id:ctx.id(),version:1,type:'booking.created',bookingId:record.id,read:false,createdAt:at});response.booking=publicBooking(record);
    } else if(action==='bookingChange') {
      if(actor)authorize(actor,['owner','admin']);
      const old=ownBooking();requireValue(p.expectedVersion===old.version,'Запис змінився. Оновіть сторінку.');requireValue(activeStatuses.includes(old.status),'Закритий запис не можна змінити');
      if(!actor)requireValue(Date.parse(old.start)-now>=settings(db).cancelNoticeMinutes*60000,'Для зміни цього запису зв’яжіться з нами');
      const b={...old,version:old.version+1,updatedAt:at};
      if(p.start){const nextBarber=actor&&p.barberId?p.barberId:b.barberId;const q=eligible(db,b.serviceId,nextBarber,p.start,now,!!actor,b.id,b);requireValue(actor||!q.late,'Для цього часу зв’яжіться з нами');b.start=p.start;b.end=q.end;b.barberId=nextBarber;b.barberName=db.Barbers.find(x=>x.id===nextBarber).name;}
      if(p.status){const allowed=actor?['confirmed','cancelled','completed','no_show']:['cancelled'];requireValue(allowed.includes(p.status),'Недозволений статус');if(p.status==='completed')requireValue(Date.parse(b.start)<=now,'Майбутній запис не можна завершити');b.status=p.status;}
      if(actor){if(p.name!==undefined){requireValue(text(p.name,100),'Некоректне ім’я');b.name=p.name.trim();}if(p.phone!==undefined){requireValue(/^\+380\d{9}$/.test(p.phone),'Некоректний телефон');b.phone=p.phone;}if(p.comment!==undefined){requireValue(typeof p.comment==='string'&&p.comment.length<=500,'Коментар завеликий');b.comment=p.comment;}}
      write('Bookings',b);write('Notifications',{id:ctx.id(),version:1,type:'booking.changed',bookingId:b.id,read:false,createdAt:at});response.booking=publicBooking(b);
    } else if(action==='saveEntity') {
      authorize(actor,p.table==='Users'?['owner']:['owner','admin']);requireValue(['Services','Barbers','Offers','Schedules','Exceptions','Settings','Users'].includes(p.table),'Недозволена таблиця');
      const allowed={Services:['name','description','order','active'],Barbers:['name','description','photo','active','commissionPercent','fixedPayMinor'],Offers:['serviceId','barberId','priceMinor','durationMinutes','effectiveFrom','active'],Schedules:['barberId','days','effectiveFrom','active'],Exceptions:['barberId','date','closed','intervals','start','end','active'],Settings:Object.keys(defaults),Users:['email','role','barberId','active']};
      const old=db[p.table].find(x=>x.id===p.record.id);requireValue(!old||p.expectedVersion===old.version,'Дані змінилися. Оновіть сторінку.');
      const record=Object.fromEntries(Object.entries(p.record).filter(([k])=>allowed[p.table].includes(k)));record.id=p.table==='Settings'?'shop':(old?.id||ctx.id());record.version=(old?.version||0)+1;record.updatedAt=at;
      validateEntity(p.table,record);
      if(['Offers','Schedules','Exceptions'].includes(p.table))requireValue(db.Barbers.some(b=>b.id===record.barberId&&b.active!==false),'Майстра не знайдено');
      if(p.table==='Offers')requireValue(db.Services.some(s=>s.id===record.serviceId&&s.active!==false),'Послугу не знайдено');
      if(p.table==='Barbers')requireValue((record.commissionPercent===undefined||num(record.commissionPercent,0,100))&&(record.fixedPayMinor===undefined||num(record.fixedPayMinor,0,100000000)),'Некоректна зарплата');
      if(p.table==='Users'){requireValue(!db.Users.some(u=>u.id!==record.id&&u.email.toLowerCase()===record.email.toLowerCase()),'Цей email уже має доступ');if(old?.role==='owner'&&(record.role!=='owner'||record.active===false))requireValue(db.Users.some(u=>u.id!==old.id&&u.role==='owner'&&u.active!==false),'Не можна видалити останнього власника');}
      if(p.table==='Settings'&&record.online)requireValue(db.Services.some(s=>s.active!==false)&&db.Barbers.some(b=>b.active!==false)&&db.Offers.length&&db.Schedules.length,'Спочатку додайте послуги, майстрів, ціни та графіки');
      // Price/schedule revisions are immutable distinct records. Changing an existing version creates a successor.
      if(['Offers','Schedules'].includes(p.table)&&old){record.id=ctx.id();record.effectiveFrom=p.record.effectiveFrom;requireValue(iso(record.effectiveFrom)&&record.effectiveFrom>=at,'Зміна має діяти з поточного або майбутнього часу');}
      if(['Offers','Schedules'].includes(p.table))requireValue(record.effectiveFrom>=at,'Нову версію можна застосувати лише на майбутнє');
      const copy=clone(db);copy[p.table]=copy[p.table].filter(x=>x.id!==record.id).concat(record);
      const conflicts=[];
      if(['Schedules','Exceptions','Barbers','Services'].includes(p.table))for(const b of db.Bookings.filter(b=>activeStatuses.includes(b.status)&&b.start>=at)){try{eligible(copy,b.serviceId,b.barberId,b.start,now,true,b.id,b);}catch(e){conflicts.push({id:b.id,start:b.start,reason:e.message});}}
      if(conflicts.length)fail('SCHEDULE_CONFLICT',JSON.stringify({message:'Зміна конфліктує з чинними записами. Спочатку перенесіть або скасуйте їх.',conflicts}));
      if(old)write('Versions',{id:ctx.id(),version:1,table:p.table,entityId:old.id,snapshot:old,createdAt:at});
      write(p.table,record);response.record=record;
    } else if(action==='payment') {
      authorize(actor,['owner','admin']);const b=getBooking();requireValue(b.status==='completed','Оплату можна внести лише після виконання');requireValue(!db.Payments.some(x=>x.bookingId===b.id),'Оплату вже внесено');
      requireValue(num(p.amountMinor,0,10000000)&&Number.isInteger(p.amountMinor)&&num(p.tipMinor,0,10000000)&&Number.isInteger(p.tipMinor)&&['cash','card'].includes(p.method),'Некоректна оплата');
      requireValue(!db.Periods.some(x=>x.closed&&local(at).date>=x.from&&local(at).date<=x.to),'Фінансовий період закрито');
      const barber=db.Barbers.find(x=>x.id===b.barberId);write('Payments',{id:ctx.id(),version:1,bookingId:b.id,barberId:b.barberId,serviceId:b.serviceId,amountMinor:p.amountMinor,tipMinor:p.tipMinor,method:p.method,commissionMinor:Math.round(p.amountMinor*(barber?.commissionPercent||0)/100),createdAt:at});
    } else if(action==='expense') {
      authorize(actor,['owner','admin']);requireValue(text(p.description,300)&&num(p.amountMinor,1,100000000)&&Number.isInteger(p.amountMinor),'Перевірте витрату');requireValue(!db.Periods.some(x=>x.closed&&local(at).date>=x.from&&local(at).date<=x.to),'Фінансовий період закрито');write('Expenses',{id:ctx.id(),version:1,description:p.description,amountMinor:p.amountMinor,createdAt:at});
    } else if(action==='closePeriod') {
      authorize(actor,['owner']);requireValue(/^\d{4}-\d{2}-\d{2}$/.test(p.from)&&/^\d{4}-\d{2}-\d{2}$/.test(p.to)&&p.from<=p.to&&p.to<local(at).date,'Закрити можна лише минулий період');write('Periods',{id:ctx.id(),version:1,from:p.from,to:p.to,closed:true,createdAt:at});
    } else if(action==='repricePreview'||action==='reprice') {
      authorize(actor,['owner','admin']);const list=db.Bookings.filter(b=>activeStatuses.includes(b.status)&&b.start>at&&(!p.barberId||b.barberId===p.barberId)&&(!p.serviceId||b.serviceId===p.serviceId));
      const candidates=list.map(b=>({b,o:offer(db,b.serviceId,b.barberId,b.start)})).filter(x=>x.o&&x.o.priceMinor!==x.b.priceMinor);
      response.preview=candidates.map(({b,o})=>({id:b.id,expectedVersion:b.version,oldPriceMinor:b.priceMinor,newPriceMinor:o.priceMinor,differenceMinor:o.priceMinor-b.priceMinor}));
      if(action==='reprice'){requireValue(p.consentNote&&text(p.consentNote,500),'Зафіксуйте погодження клієнтів');requireValue(JSON.stringify(p.approvedPreview)===JSON.stringify(response.preview),'Розрахунок змінився. Перегляньте його повторно');for(const {b,o}of candidates)write('Bookings',{...b,priceMinor:o.priceMinor,offerId:o.id,offerVersion:o.version,version:b.version+1,priceConsentNote:p.consentNote,updatedAt:at});}
    } else if(action==='readNotifications') {authorize(actor,['owner','admin']);db.Notifications.filter(x=>!x.read).forEach(x=>write('Notifications',{...x,read:true,version:x.version+1}));
    } else fail('NOT_FOUND','Невідома операція');
    if(changes.length){const safe=x=>x?Object.fromEntries(Object.entries(x).filter(([k])=>!['tokenHash','name','phone','comment','email','snapshot','priceConsentNote'].includes(k))):null;
      write('Audit',{id:ctx.id(),version:1,action,actorId:actor?.email||'client',objectId:changes[0].record.id,before:safe(db[changes[0].table]?.find(x=>x.id===changes[0].record.id)),after:safe(changes[0].record),result:'success',createdAt:at});}
    return {changes,response};
  }
  function publicBooking(b){const {tokenHash,...v}=b;return v;}
  function adminData(db,actor,p={}) {
    authorize(actor,['owner','admin','barber']);const visible=clone(db);delete visible.Requests;
    visible.Bookings=visible.Bookings.filter(b=>actor.role!=='barber'||b.barberId===actor.barberId).map(publicBooking);
    if(actor.role==='barber'){for(const k of ['Users','Payments','Expenses','Versions','Audit','Analytics','Technical','Periods'])visible[k]=[];visible.Bookings=visible.Bookings.map(({phone,comment,...b})=>b);visible.Barbers=visible.Barbers.filter(b=>b.id===actor.barberId);visible.Notifications=[];}
    else if(actor.role!=='owner'){visible.Users=[];visible.Versions=visible.Versions.filter(v=>v.table!=='Users');}
    visible.Settings=[settings(db)];return {actor,data:visible};
  }
  function finances(db,from,to){const inRange=x=>{const d=local(x.createdAt).date;return d>=from&&d<=to;};const pay=db.Payments.filter(inRange),expenses=db.Expenses.filter(inRange),sum=(xs,k)=>xs.reduce((n,x)=>n+(x[k]||0),0);return{actualMinor:sum(pay,'amountMinor'),tipsMinor:sum(pay,'tipMinor'),expensesMinor:sum(expenses,'amountMinor'),commissionMinor:sum(pay,'commissionMinor'),profitMinor:sum(pay,'amountMinor')-sum(expenses,'amountMinor')-sum(pay,'commissionMinor'),cashMinor:sum(pay.filter(x=>x.method==='cash'),'amountMinor'),cardMinor:sum(pay.filter(x=>x.method==='card'),'amountMinor'),plannedMinor:sum(db.Bookings.filter(x=>activeStatuses.includes(x.status)&&local(x.start).date>=from&&local(x.start).date<=to),'priceMinor')};}
  return {TABLES,defaults,settings,local,minute,overlaps,offer,eligible,catalogue,slots,prepare,adminData,finances,publicBooking,authorize,validateEntity};
})();
if(typeof module!=='undefined')module.exports=RoyalCore;
