import {el,escape as esc,money} from './api.js?v=41d00086e2b5';
import {GRID_START,GRID_END,dayNames,dayIndex,dateKey,addDays,rangeDays,toTime,toMinute,minuteAt,toUtc,scheduleFor,workingRanges,eventLayout,localInput,inputToUtc,errorText} from './calendar-model.js?v=41d00086e2b5';
const shortDate=date=>new Intl.DateTimeFormat('uk-UA',{month:'short',day:'numeric'}).format(new Date(date+'T12:00:00Z'));
function btn(text,callback,className='soft-button'){const b=el('button',{type:'button',class:className,text});b.addEventListener('click',callback);return b;}
function select(label,choices,value,change){const s=el('select',{'aria-label':label});for(const [id,text]of choices)s.append(el('option',{value:id,text}));s.value=value;s.addEventListener('change',()=>change(s.value));return s;}
function label(text,input){return el('label',{text},[input]);}
function input(type,value,aria){const i=el('input',{type,'aria-label':aria});i.value=value??'';return i;}
function titleRange(days){return days.length===1?new Intl.DateTimeFormat('uk-UA',{dateStyle:'long'}).format(new Date(days[0]+'T12:00:00Z')):shortDate(days[0])+' — '+shortDate(days.at(-1));}
function skeleton(days,mode){
 const wrap=el('div',{class:'calendar-scroll',tabindex:'0','aria-label':'Часова сітка календаря'}),grid=el('div',{class:'time-calendar','data-view':mode});grid.style.setProperty('--days',days.length);grid.style.setProperty('--calendar-height',(GRID_END-GRID_START)+'px');
 const headers=el('div',{class:'calendar-headers'},[el('div',{class:'time-zone',text:'КИЇВ\nGMT+2/3'})]);
 for(const d of days){const head=el('div',{class:'calendar-day-heading'+(d===dateKey()?' is-today':'')});head.append(el('span',{text:new Intl.DateTimeFormat('uk-UA',{weekday:'short'}).format(new Date(d+'T12:00:00Z'))}),el('strong',{text:new Date(d+'T12:00:00Z').getUTCDate()}));headers.append(head);}
 const body=el('div',{class:'calendar-body'}),axis=el('div',{class:'calendar-axis'});
 for(let m=GRID_START;m<=GRID_END;m+=60){const tick=el('span',{text:toTime(m)});tick.style.top=(m-GRID_START)+'px';axis.append(tick);}body.append(axis);
 const columns=days.map(d=>{const col=el('div',{class:'calendar-day-column','data-date':d});for(let m=GRID_START;m<GRID_END;m+=60){const line=el('div',{class:'hour-rule'});line.style.top=(m-GRID_START)+'px';col.append(line);}body.append(col);return col;});
 grid.append(headers,body);wrap.append(grid);return {wrap,columns};
}
function workBands(col,ranges){for(const [a,b]of ranges){const start=Math.max(a,GRID_START),end=Math.min(b,GRID_END);if(end<=start)continue;const band=el('div',{class:'work-band'});band.style.top=(start-GRID_START)+'px';band.style.height=(end-start)+'px';col.append(band);}}
export function renderCalendar(container,ctx){
 const {db,date,view,barberId,role}=ctx,days=rangeDays(date,view),today=dateKey(),active=db.Barbers.filter(b=>b.active!==false),selected=barberId?active.filter(b=>b.id===barberId):active;
 const heading=el('div',{class:'calendar-page-heading'},[el('div',{},[el('p',{class:'eyebrow',text:'ВАШ РОБОЧИЙ РИТМ'}),el('h2',{text:'Календар'}),el('p',{class:'calendar-period',text:titleRange(days)})])]);
 if(role!=='barber')heading.append(btn('+ Новий запис',()=>ctx.onCreate({date,barberId:barberId||active[0]?.id}),'button gold'));
 container.append(heading);
 const navigation=el('div',{class:'calendar-nav'},[btn('Сьогодні',()=>ctx.onDate(today)),btn('‹',()=>ctx.onDate(addDays(date,-days.length)),'icon-button'),btn('›',()=>ctx.onDate(addDays(date,days.length)),'icon-button')]);
 navigation.querySelectorAll('.icon-button').forEach((b,i)=>b.setAttribute('aria-label',i?'Наступний період':'Попередній період'));
 const pick=input('date',date,'Перейти до дати');pick.addEventListener('change',()=>{if(pick.value)ctx.onDate(pick.value);});navigation.append(pick);
 const segmented=el('div',{class:'segmented-control',role:'group','aria-label':'Період календаря'});for(const [v,text]of [['day','День'],['three','3 дні'],['week','Тиждень']]){const b=btn(text,()=>ctx.onView(v));b.setAttribute('aria-pressed',String(v===view));segmented.append(b);}
 const toolbar=el('div',{class:'calendar-toolbar'},[navigation,segmented,select('Майстер',[['','Усі майстри'],...active.map(b=>[b.id,b.name])],barberId,ctx.onBarber),btn('↻',ctx.onRefresh,'icon-button')]);toolbar.lastChild.setAttribute('aria-label','Оновити календар');container.append(toolbar);
 const legend=el('div',{class:'calendar-legend'},[el('span',{class:'legend-work',text:'Робочий час'}),el('span',{class:'legend-booked',text:'Запис'}),el('span',{class:'legend-off',text:'Поза графіком'})]);container.append(legend);
 const {wrap,columns}=skeleton(days,view);container.append(wrap);
 days.forEach((d,index)=>{const col=columns[index],ranges=selected.flatMap(b=>workingRanges(db,b.id,d));workBands(col,ranges);
  if(role!=='barber')for(let m=GRID_START;m<GRID_END;m+=30){if(!ranges.some(([a,b])=>m>=a&&m<b))continue;const slot=btn('',()=>ctx.onCreate({date:d,time:toTime(m),barberId:barberId||active[0]?.id}),'calendar-empty-slot');slot.style.top=(m-GRID_START)+'px';slot.setAttribute('aria-label','Створити запис '+shortDate(d)+' о '+toTime(m));slot.title='Новий запис · '+toTime(m);col.append(slot);}
  const bookings=db.Bookings.filter(b=>dateKey(b.start)===d&&(!barberId||b.barberId===barberId)&&b.status!=='cancelled');
  for(const e of eventLayout(bookings)){const b=e.booking,profileIndex=Math.max(0,active.findIndex(x=>x.id===b.barberId)),event=el('button',{type:'button',class:'calendar-event status-'+b.status+' tone-'+profileIndex%3,draggable:role==='barber'?'false':'true','aria-label':`${b.name}, ${b.serviceName}, ${toTime(e.start)}–${toTime(e.end)}`});event.style.top=(Math.max(e.start,GRID_START)-GRID_START)+'px';event.style.height=Math.max(29,Math.min(e.end,GRID_END)-Math.max(e.start,GRID_START)-3)+'px';event.style.width=`calc(${100/e.lanes}% - 5px)`;event.style.left=`calc(${e.lane*100/e.lanes}% + 3px)`;event.innerHTML=`<span class="event-time">${toTime(e.start)}–${toTime(e.end)}</span><strong>${esc(b.name)}</strong><span>${esc(b.serviceName)}</span><small>${esc(b.barberName)} · ${money(b.priceMinor)}</small>`;event.addEventListener('click',()=>ctx.onOpen(b));event.addEventListener('dragstart',ev=>{ev.dataTransfer.setData('text/plain',b.id);event.classList.add('is-dragging');});event.addEventListener('dragend',()=>event.classList.remove('is-dragging'));col.append(event);}
  if(d===today){const m=minuteAt(new Date());if(m>=GRID_START&&m<=GRID_END){const now=el('div',{class:'current-time-line'});now.style.top=(m-GRID_START)+'px';col.append(now);}}
  if(!ranges.length)col.append(el('span',{class:'day-closed-label',text:'Вихідний'}));
  if(role!=='barber'){col.addEventListener('dragover',ev=>{ev.preventDefault();col.classList.add('drop-target');});col.addEventListener('dragleave',()=>col.classList.remove('drop-target'));col.addEventListener('drop',async ev=>{ev.preventDefault();col.classList.remove('drop-target');const b=db.Bookings.find(x=>x.id===ev.dataTransfer.getData('text/plain'));if(!b)return;const m=Math.max(GRID_START,Math.min(GRID_END-15,GRID_START+Math.round((ev.clientY-col.getBoundingClientRect().top)/15)*15));try{const next=toUtc(d,toTime(m));if(next===b.start)return;if(!confirm(`Перенести «${b.serviceName}» на ${shortDate(d)}, ${toTime(m)}?`))return;await ctx.onMove(b,{start:next,barberId:barberId||b.barberId});}catch(error){ctx.onError(errorText(error));}});}
 });
 const count=db.Bookings.filter(b=>days.includes(dateKey(b.start))&&b.status!=='cancelled'&&(!barberId||b.barberId===barberId)).length;
 container.append(el('p',{class:'calendar-footnote',text:`${count?`Записів за період: ${count}.`:'За цей період записів ще немає.'} ${role==='barber'?'Ваш календар доступний для перегляду.':'Натисніть на вільне місце, щоб створити запис. Для перенесення перетягніть картку на інший час.'}`}));
 requestAnimationFrame(()=>{wrap.scrollTop=48;});
}
function intervalEditor(initial,changed=()=>{}){
 const list=el('div',{class:'interval-list'}),rows=[];
 function add(a='08:00',b='20:00'){const start=input('time',a,'Початок роботи'),end=input('time',b,'Кінець роботи'),row=el('div',{class:'interval-row'});start.step=end.step='900';const value={start,end,row};const remove=btn('×',()=>{rows.splice(rows.indexOf(value),1);row.remove();changed();},'icon-button');remove.setAttribute('aria-label','Прибрати інтервал');row.append(start,el('span',{text:'—'}),end,remove);list.append(row);rows.push(value);start.addEventListener('change',changed);end.addEventListener('change',changed);changed();}
 for(const pair of initial)add(...pair);
 return{list,add,read:()=>rows.map(({start,end})=>{if(!start.value||!end.value||toMinute(start.value)>=toMinute(end.value))throw Error('Початок інтервалу має бути раніше за кінець.');return[start.value,end.value];})};
}
function saveButton(form,onSave,read,onError){const save=el('button',{class:'button gold',text:'Зберегти графік'});form.append(el('div',{class:'editor-save-row'},[save]));form.onsubmit=async ev=>{ev.preventDefault();save.disabled=true;try{await onSave(read());}catch(error){onError(errorText(error));}finally{save.disabled=false;}};}
export function editSchedule(form,ctx){
 const old=ctx.record||{},barbers=ctx.barbers.filter(b=>b.active!==false),barber=select('Майстер',barbers.map(b=>[b.id,b.name]),old.barberId||barbers[0]?.id,()=>{}),effective=input('datetime-local',localInput(new Date(Date.now()+60000)),'Графік діє з');
 form.classList.add('schedule-editor-form');form.append(el('p',{class:'hint',text:'Задайте робочий тиждень у часі Києва. Кілька інтервалів на день залишають місце для обідньої перерви.'}),el('div',{class:'field-row'},[label('Майстер',barber),label('Діє з (час Києва)',effective)]));
 const rows=[],preview=el('div',{class:'weekly-schedule-preview'}),days=el('div',{class:'schedule-days'});form.append(preview,days);
 const update=()=>{preview.replaceChildren();for(const row of rows){const bar=el('div',{class:'schedule-preview-day'+(row.enabled.checked?' working':'')});bar.append(el('span',{text:dayNames[row.index].slice(0,2)}));if(row.enabled.checked){for(const [a,b]of row.intervals.read()){const band=el('div',{class:'schedule-preview-band'});band.style.top=(toMinute(a)/1440*100)+'%';band.style.height=((toMinute(b)-toMinute(a))/1440*100)+'%';bar.append(band);}}preview.append(bar);}};
 for(const index of [1,2,3,4,5,6,0]){const initial=old.days?.[index]?.intervals||[],enabled=input('checkbox','',dayNames[index]+' — робочий день');enabled.checked=initial.length>0;let row;
 const intervals=intervalEditor(initial,()=>{if(row){try{update();}catch{}}});const content=el('div',{class:'schedule-day-intervals'},[intervals.list,btn('+ Інтервал',()=>{intervals.add('13:00','18:00');update();},'text-button')]);content.hidden=!enabled.checked;
 const item=el('section',{class:'schedule-day-row'},[label(dayNames[index],enabled),content,el('span',{class:'day-off-note',text:'Вихідний'})]);const off=item.lastChild;off.hidden=enabled.checked;
 row={index,enabled,intervals,item};rows.push(row);enabled.addEventListener('change',()=>{content.hidden=!enabled.checked;off.hidden=enabled.checked;if(enabled.checked&&!intervals.list.children.length)intervals.add();update();});days.append(item);}
 update();
 const active=select('Стан графіка',[['true','Активний'],['false','Архів']],String(old.active!==false),()=>{});form.append(label('Стан графіка',active),el('p',{class:'hint',text:'Новий графік набуде чинності з обраного часу. Якщо він суперечить уже створеним записам, система покаже конфлікти й збереже чинний графік.'}));
 saveButton(form,ctx.onSave,()=>({...old,barberId:barber.value,effectiveFrom:inputToUtc(effective.value),active:active.value==='true',days:Array.from({length:7},(_,index)=>{const row=rows.find(r=>r.index===index);return{intervals:row.enabled.checked?row.intervals.read():[]};})}),ctx.onError);
}
export function editException(form,ctx){
 const old=ctx.record||{},barber=select('Майстер',ctx.barbers.filter(b=>b.active!==false).map(b=>[b.id,b.name]),old.barberId||ctx.barbers[0]?.id,()=>{}),date=input('date',old.date||dateKey(),'Дата винятку');
 const mode=select('Тип зміни',[['closed','Вихідний / відпустка'],['hours','Інші години роботи'],['block','Перерва / блокування']],old.closed?'closed':old.intervals?'hours':'block',update);
 const start=input('time',old.start?toTime(minuteAt(old.start)):'12:00','Початок перерви'),end=input('time',old.end?toTime(minuteAt(old.end)):'13:00','Кінець перерви'),intervals=intervalEditor(old.intervals||[['08:00','20:00']]);
 const hours=el('div',{class:'exception-hours'},[intervals.list,btn('+ Інтервал',()=>intervals.add('13:00','18:00'),'text-button')]),block=el('div',{class:'field-row'},[label('Початок',start),label('Кінець',end)]);
 form.append(el('p',{class:'hint',text:'Окрема зміна для конкретної дати. Постійний тижневий графік залишається без змін.'}),label('Майстер',barber),el('div',{class:'field-row'},[label('Дата',date),label('Що змінити',mode)]),hours,block);
 function update(){hours.hidden=mode.value!=='hours';block.hidden=mode.value!=='block';}update();
 saveButton(form,ctx.onSave,()=>{const record={...old,barberId:barber.value,date:date.value,closed:mode.value==='closed'};delete record.intervals;delete record.start;delete record.end;if(mode.value==='hours')record.intervals=intervals.read();if(mode.value==='block'){record.start=toUtc(date.value,start.value);record.end=toUtc(date.value,end.value);}return record;},ctx.onError);
}
export function renderSchedules(container,ctx){
 const db=ctx.db,barbers=db.Barbers.filter(b=>b.active!==false);if(!barbers.length){container.append(el('p',{class:'empty',text:'Спочатку додайте майстра.'}));return;}
 let selected=ctx.barberId&&barbers.some(b=>b.id===ctx.barberId)?ctx.barberId:barbers[0].id,date=ctx.date||dateKey();const target=el('div');
 const tools=el('div',{class:'calendar-toolbar'},[select('Графік майстра',barbers.map(b=>[b.id,b.name]),selected,v=>{selected=v;draw();}),btn('‹',()=>{date=addDays(date,-7);draw();},'icon-button'),btn('Сьогодні',()=>{date=dateKey();draw();}),btn('›',()=>{date=addDays(date,7);draw();},'icon-button'),btn('+ Виняток на дату',()=>ctx.onException({barberId:selected,date})),btn('Редагувати робочий тиждень',()=>ctx.onEdit(scheduleFor(db,selected,date).version||{barberId:selected,days:Array.from({length:7},()=>({intervals:[]}))}),'button gold')]);
 container.append(el('p',{class:'hint',text:'Золотим позначено робочі інтервали. Натисніть на день, щоб додати вихідний, перерву або особливі години.'}),tools,target);
 function draw(){target.replaceChildren();const days=rangeDays(date,'week');target.append(el('p',{class:'calendar-period',text:titleRange(days)}));const {wrap,columns}=skeleton(days,'week');target.append(wrap);
  days.forEach((d,index)=>{const schedule=scheduleFor(db,selected,d),ranges=workingRanges(db,selected,d),col=columns[index];workBands(col,ranges);for(const [a,b]of ranges){const block=btn(toTime(a)+' — '+toTime(b),()=>ctx.onException({barberId:selected,date:d}),'schedule-work-event');block.style.top=(Math.max(a,GRID_START)-GRID_START)+'px';block.style.height=Math.max(30,Math.min(b,GRID_END)-Math.max(a,GRID_START))+'px';col.append(block);}if(!ranges.length)col.append(btn('Вихідний',()=>ctx.onException({barberId:selected,date:d}),'schedule-closed-event'));col.addEventListener('dblclick',()=>ctx.onException({barberId:selected,date:d}));if(schedule.exceptions.length)col.append(el('span',{class:'exception-badge',text:'Особливий день'}));});
  const current=scheduleFor(db,selected,date).version;target.append(el('p',{class:'hint',text:current?'Чинна версія '+current.version+' · діє з '+new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',dateStyle:'short',timeStyle:'short'}).format(new Date(current.effectiveFrom)):'Для цього періоду графік ще не задано.'}));
 }draw();
}
