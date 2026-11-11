/* Owner-run integration check. All test records stay in a disposable private copy. */
function runIntegrationTest(){
 const copy=DriveApp.getFileById(dbId_()).makeCopy('Royal isolated integration test'),testId=copy.getId();
 const check=(ok,label)=>{if(!ok)throw Error('TEST FAILED: '+label);};
 try{
  const book=SpreadsheetApp.openById(testId);
  ['Bookings','Payments','Expenses','Requests','Audit','Notifications','Technical','Analytics','Periods'].forEach(t=>{const s=book.getSheetByName(t);if(s.getLastRow()>1)s.getRange(2,1,s.getLastRow()-1,4).clearContent();});
  let db=load_(testId),now=Date.now(),actor={email:'integration-test',role:'owner'};
  const cfg={...db.Settings[0],online:true};commit_([{table:'Settings',record:cfg}],testId);db=load_(testId);
  const service=db.Services.find(s=>s.active!==false);let slot;
  for(let i=1;i<=7&&!slot;i++){const date=RoyalCore.local(new Date(now+i*86400000).toISOString()).date;slot=RoyalCore.slots(db,{serviceId:service.id,date},now).find(s=>!s.late);}
  check(slot,'available slot');
  const ctx={now,id:()=>Utilities.getUuid(),tokenHash:hash_('isolated-test-token')},params={name:'ISOLATED TEST',phone:'+380000000000',comment:'Disposable test copy only',serviceId:service.id,barberId:slot.barberId,start:slot.start,offerId:slot.offerId,offerVersion:slot.offerVersion};
  let result=RoyalCore.prepare(db,'book',params,null,ctx);commit_(result.changes,testId);db=load_(testId);
  check(db.Bookings.length===1&&db.Notifications.length===1&&db.Audit.length===1,'atomic booking bundle');
  let duplicate=false;try{RoyalCore.prepare(db,'book',params,null,ctx);}catch(e){duplicate=true;}check(duplicate,'double booking rejection');
  const booking=db.Bookings[0],price=booking.priceMinor;
  const futureOffer={...db.Offers.find(x=>x.id===slot.offerId),id:Utilities.getUuid(),version:2,priceMinor:price+5000,effectiveFrom:new Date(now+1000).toISOString()};commit_([{table:'Offers',record:futureOffer}],testId);db=load_(testId);check(db.Bookings[0].priceMinor===price,'historical agreed price');
  let badToken=false;try{RoyalCore.prepare(db,'bookingChange',{id:booking.id,expectedVersion:booking.version,status:'cancelled'},null,{...ctx,tokenHash:'wrong'});}catch(e){badToken=true;}check(badToken,'invalid token rejection');
  result=RoyalCore.prepare(db,'bookingChange',{id:booking.id,expectedVersion:booking.version,status:'completed'},actor,{...ctx,now:Date.parse(booking.start)+60000});commit_(result.changes,testId);db=load_(testId);
  result=RoyalCore.prepare(db,'payment',{id:booking.id,amountMinor:price,tipMinor:5000,method:'card'},actor,ctx);commit_(result.changes,testId);db=load_(testId);check(db.Payments.length===1&&db.Payments[0].amountMinor===price,'payment persistence');
  const date=RoyalCore.local(new Date(now).toISOString()).date,f=RoyalCore.finances(db,date,date);check(f.actualMinor===price&&f.tipsMinor===5000,'financial reconciliation');
  const audit=db.Audit[0],unsigned={...audit};delete unsigned.signature;check(equal_(audit.signature,mac_(JSON.stringify(unsigned))),'audit HMAC');
  const exportResult=exportXlsx_('Payments',db.Payments);check(exportResult.base64.length>100,'XLSX export');
  console.log('PASS: isolated Google Sheets write/read, atomic booking, conflict rejection, historical price, token check, payment, finance, audit signature and XLSX export. Production records unchanged.');
 }finally{copy.setTrashed(true);}
}
