/* Only signed server-to-server POST requests are accepted. Never put GATEWAY_SECRET in source. */
function properties_(){return PropertiesService.getScriptProperties();}
function dbId_(){const id=properties_().getProperty('SPREADSHEET_ID');if(!id)throw Error('SPREADSHEET_ID missing');return id;}
function rows_(name,spreadsheetId){const sheet=SpreadsheetApp.openById(spreadsheetId||dbId_()).getSheetByName(name);if(!sheet)throw Error('Missing table '+name);const n=sheet.getLastRow();return n<2?[]:sheet.getRange(2,1,n-1,4).getValues().filter(r=>r[0]).map(r=>JSON.parse(r[2]));}
function load_(spreadsheetId){const result=Sheets.Spreadsheets.Values.batchGet(spreadsheetId||dbId_(),{ranges:RoyalCore.TABLES.map(t=>t+'!A2:D'),valueRenderOption:'UNFORMATTED_VALUE'}),db={};RoyalCore.TABLES.forEach((t,i)=>db[t]=(result.valueRanges[i].values||[]).filter(r=>r[0]).map(r=>JSON.parse(r[2])));return db;}
function hash_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function mac_(s){return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s,properties_().getProperty('GATEWAY_SECRET'),Utilities.Charset.UTF_8)).replace(/=+$/,'');}
function equal_(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
function json_(v){return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON);}
function actor_(identity,db){if(!identity)return null;const u=db.Users.find(x=>x.active!==false&&x.email.toLowerCase()===identity.toLowerCase());if(!u){const e=Error('Недостатньо прав');e.code='FORBIDDEN';throw e;}return u;}
function commit_(changes,spreadsheetId){
 if(!changes.length)return;const target=spreadsheetId||dbId_(),requests=[],tables=Array.from(new Set(changes.map(c=>c.table)));
 const metadata=Sheets.Spreadsheets.get(target,{fields:'sheets(properties(sheetId,title))'}),ids={};metadata.sheets.forEach(s=>ids[s.properties.title]=s.properties.sheetId);
 const ranges=Sheets.Spreadsheets.Values.batchGet(target,{ranges:tables.map(t=>t+'!A2:C'),valueRenderOption:'UNFORMATTED_VALUE'}),existing={};tables.forEach((t,i)=>existing[t]=(ranges.valueRanges[i].values||[]));
 changes.forEach(({table,record})=>{const values=existing[table],index=values.findIndex(r=>r[0]===record.id);if(table==='Audit'){record.previousHash=values.length?JSON.parse(values[values.length-1][2]).signature||'genesis':'genesis';record.signature=mac_(JSON.stringify(record));}const row=[record.id,record.version,JSON.stringify(record),record.updatedAt||record.createdAt||new Date().toISOString()],cells=row.map(v=>({userEnteredValue:{stringValue:String(v)}}));
 if(index<0){requests.push({appendCells:{sheetId:ids[table],rows:[{values:cells}],fields:'userEnteredValue'}});values.push(row);}else {requests.push({updateCells:{start:{sheetId:ids[table],rowIndex:index+1,columnIndex:0},rows:[{values:cells}],fields:'userEnteredValue'}});values[index]=row;}});
 if(requests.length)Sheets.Spreadsheets.batchUpdate({requests},target);
}
function doGet(){return json_({ok:false,error:{code:'METHOD',message:'POST required'}});}
function doPost(e){
 let lock;
 try{
  if(!e||!e.postData||e.postData.contents.length>80000)throw Error('Invalid request');
  const envelope=JSON.parse(e.postData.contents), raw=envelope.payload;
  if(!properties_().getProperty('GATEWAY_SECRET')||typeof raw!=='string'||!equal_(envelope.signature,mac_(raw)))throw Error('Invalid signature');
  const req=JSON.parse(raw);if(Math.abs(Date.now()-req.timestamp)>60000)throw Error('Expired request');
  lock=LockService.getScriptLock();if(!lock.tryLock(25000))return json_({ok:false,error:{code:'BUSY',message:'Система зайнята. Спробуйте повторно.'}});
  const nonceCache=CacheService.getScriptCache();if(nonceCache.get('nonce:'+req.nonce))throw Error('Replayed request');nonceCache.put('nonce:'+req.nonce,'1',120);
  if(!req.rateKey)throw Error('Missing rate key');
  const rateKey='rate:'+req.rateKey+':'+Math.floor(Date.now()/60000),attempts=Number(nonceCache.get(rateKey)||0),limit=req.action==='analytics'?12:req.action==='book'?10:120;
  if(attempts>=limit)return json_({ok:false,error:{code:'RATE_LIMIT',message:'Забагато запитів. Зачекайте хвилину.'}});nonceCache.put(rateKey,String(attempts+1),120);
  const db=load_(), actor=passwordActor_(req,db),nativeActor=req.identity?db.Users.find(u=>u.active!==false&&u.email.toLowerCase()===req.identity.toLowerCase()):null,p=req.params||{},now=Date.now();
  if(['adminAuthStatus','adminUnlock','adminSetPassword','adminLogout'].indexOf(req.action)>=0)return json_({ok:true,data:adminAuth_(req,actor||nativeActor,db)});
  if(['catalogue','slots','myBooking','analytics','book','bookingChange'].indexOf(req.action)<0)requireAdminSession_(req,actor);
  if(actor&&['book','bookingChange'].indexOf(req.action)>=0)requireAdminSession_(req,actor);
  if(req.action==='catalogue')return json_({ok:true,data:RoyalCore.catalogue(db,now)});
  if(req.action==='slots')return json_({ok:true,data:RoyalCore.slots(db,p,now)});
  if(req.action==='myBooking'){const b=db.Bookings.find(b=>b.id===p.id&&b.tokenHash===req.tokenHash);if(!b)return json_({ok:false,error:{code:'NOT_FOUND',message:'Запис не знайдено. Перевірте ключ.'}});return json_({ok:true,data:RoyalCore.publicBooking(b)});}
  if(req.action==='adminData'){const data=RoyalCore.adminData(db,actor,p);const loginKey='login:'+hash_(actor.email);if(!nonceCache.get(loginKey)){commit_([{table:'Audit',record:{id:Utilities.getUuid(),version:1,action:'admin.login',actorId:actor.email,result:'success',createdAt:new Date(now).toISOString()}}]);nonceCache.put(loginKey,'1',1800);}return json_({ok:true,data});}
  if(req.action==='exportXlsx'){RoyalCore.authorize(actor,['owner','admin']);if(!['Bookings','Payments','Expenses','Audit','Analytics','Technical','Versions'].includes(p.table))throw Error('Invalid export table');return json_({ok:true,data:exportXlsx_(p.table,db[p.table])});}
  if(req.action==='finances'){RoyalCore.authorize(actor,['owner','admin']);return json_({ok:true,data:RoyalCore.finances(db,p.from,p.to)});}
  if(req.action==='analytics'){const allowed=['page_open','book_start','service_select','barber_select','date_select','booking_attempt','booking_success','booking_failure','telegram_click','phone_click','map_click','step_abandoned'];const events=(p.events||[]).slice(0,20).filter(x=>allowed.includes(x.type));commit_(events.map(x=>({table:'Analytics',record:{id:Utilities.getUuid(),version:1,type:x.type,createdAt:new Date(now).toISOString()}})));return json_({ok:true,data:{accepted:events.length}});}
  if(!req.requestId||!req.requestHash)throw Error('Missing idempotency key');
  const previous=db.Requests.find(x=>x.id===req.requestId);
  if(previous){if(previous.requestHash!==req.requestHash||previous.identity!==(req.identity||''))throw Error('Idempotency mismatch');return json_({ok:true,data:previous.response});}
  const result=RoyalCore.prepare(db,req.action,p,actor,{now,id:()=>Utilities.getUuid(),tokenHash:req.tokenHash});
  if(result.changes.length)result.changes.push({table:'Requests',record:{id:req.requestId,version:1,requestHash:req.requestHash,identity:req.identity||'',response:result.response,createdAt:new Date(now).toISOString()}});
  commit_(result.changes);return json_({ok:true,data:result.response});
 }catch(err){try{if(lock&&lock.hasLock())commit_([{table:'Technical',record:{id:Utilities.getUuid(),version:1,type:'request.failed',code:err.code||'SERVER',createdAt:new Date().toISOString()}}]);}catch(ignored){}return json_({ok:false,error:{code:err.code||'SERVER',message:err.code?err.message:'Сервіс тимчасово недоступний. Спробуйте пізніше.'}});}finally{if(lock)lock.releaseLock();}
}
function exportXlsx_(table,rows){
 const allowed=rows.map(r=>{const copy=Object.assign({},r);delete copy.tokenHash;return copy;}),keys=Array.from(new Set(allowed.reduce((a,r)=>a.concat(Object.keys(r)),[])));if(!keys.length)keys.push('id');
 const temporary=SpreadsheetApp.create('Royal export '+table);try{const sheet=temporary.getSheets()[0];sheet.setName(table);const clean=v=>typeof v==='string'&&/^[=+@-]/.test(v)?"'"+v:v;const values=[keys].concat(allowed.map(r=>keys.map(k=>clean(r[k]===undefined?'':typeof r[k]==='object'?JSON.stringify(r[k]):r[k]))));sheet.getRange(1,1,values.length,keys.length).setValues(values);sheet.setFrozenRows(1);sheet.getRange(1,1,1,keys.length).setBackground('#19392c').setFontColor('#ffffff');SpreadsheetApp.flush();const response=UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/'+temporary.getId()+'/export?format=xlsx',{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()}});return {filename:'royal-'+table+'.xlsx',base64:Utilities.base64Encode(response.getContent())};}finally{DriveApp.getFileById(temporary.getId()).setTrashed(true);}
}
function initialize(){
 const book=SpreadsheetApp.openById(dbId_());RoyalCore.TABLES.forEach(t=>{let s=book.getSheetByName(t);if(!s)s=book.insertSheet(t);if(!s.getLastRow())s.getRange(1,1,1,4).setValues([['id','version','data_json','updated_at']]);s.setFrozenRows(1);s.getRange(1,1,1,4).setBackground('#172b26').setFontColor('#ffffff').setFontWeight('bold');s.setColumnWidths(1,2,180);s.setColumnWidth(3,700);s.setColumnWidth(4,200);});
 const db=load_(),changes=[];if(!db.Settings.length)changes.push({table:'Settings',record:{id:'shop',version:1,...RoyalCore.defaults}});
 const owner=properties_().getProperty('OWNER_EMAIL');if(!owner)throw Error('OWNER_EMAIL missing');if(!db.Users.some(x=>x.email===owner))changes.push({table:'Users',record:{id:Utilities.getUuid(),version:1,email:owner,role:'owner',active:true}});
 if(!db.Services.length&&typeof ROYAL_INITIAL!=='undefined'){
 const at=new Date().toISOString(),initial=ROYAL_INITIAL,b={...initial.barber,version:1,updatedAt:at};changes.push({table:'Barbers',record:b});
 initial.services.forEach((s,i)=>{changes.push({table:'Services',record:{id:s.id,version:1,name:s.name,description:s.description,order:i,active:true,updatedAt:at}});changes.push({table:'Offers',record:{id:Utilities.getUuid(),version:1,serviceId:s.id,barberId:b.id,priceMinor:s.priceMinor,durationMinutes:s.durationMinutes,effectiveFrom:at,active:true,updatedAt:at}});});changes.push({table:'Schedules',record:{id:Utilities.getUuid(),version:1,barberId:b.id,days:initial.days,effectiveFrom:at,active:true,updatedAt:at}});
 }commit_(changes);
}
function dailyMaintenance(){
 const lock=LockService.getScriptLock();lock.waitLock(25000);try{
 const source=DriveApp.getFileById(dbId_()),folderId=properties_().getProperty('BACKUP_FOLDER_ID');if(!folderId)throw Error('BACKUP_FOLDER_ID missing');const folder=DriveApp.getFolderById(folderId);source.makeCopy('Royal backup '+new Date().toISOString(),folder);
 const db=load_(),cfg=RoyalCore.settings(db),book=SpreadsheetApp.openById(dbId_());[['Analytics',cfg.analyticsRetentionDays],['Technical',cfg.technicalRetentionDays],['Requests',30]].forEach(([t,days])=>{const rows=db[t];for(let i=rows.length-1;i>=0;i--)if(Date.parse(rows[i].createdAt)<Date.now()-days*86400000)book.getSheetByName(t).deleteRow(i+2);});
 const copies=folder.getFiles(),cutoff=Date.now()-cfg.backupRetentionDays*86400000;while(copies.hasNext()){const file=copies.next();if(file.getName().indexOf('Royal backup ')===0&&file.getDateCreated().getTime()<cutoff)file.setTrashed(true);}
 // Business audit is retained. Backup deletion is recoverable through Drive Trash.
 }finally{lock.releaseLock();}
}
function installMaintenance(){if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='dailyMaintenance'))ScriptApp.newTrigger('dailyMaintenance').timeBased().everyDays(1).atHour(3).create();}
