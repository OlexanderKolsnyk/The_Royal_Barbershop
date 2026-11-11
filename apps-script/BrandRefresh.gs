/* Owner-run migration: retains barber ID, offers, schedules and all booking rules. */
function applyBrandRefresh(){
 const lock=LockService.getScriptLock();lock.waitLock(25000);
 try{let db=load_();const actor=actor_(properties_().getProperty('OWNER_EMAIL'),db);RoyalCore.authorize(actor,['owner']);const changes=[];
 const targets=[['Barbers','royal-barber',{name:ROYAL_INITIAL.barber.name,photo:ROYAL_INITIAL.barber.photo,description:ROYAL_INITIAL.barber.description}],['Services','royal',{description:ROYAL_INITIAL.services.filter(s=>s.id==='royal')[0].description}]];
 targets.forEach(function(item){const table=item[0],id=item[1],patch=item[2],old=db[table].filter(r=>r.id===id)[0];if(!old)throw Error('Missing '+table+' '+id);if(Object.keys(patch).every(k=>old[k]===patch[k]))return;const result=RoyalCore.prepare(db,'saveEntity',{table:table,record:Object.assign({},old,patch),expectedVersion:old.version},actor,{now:Date.now(),id:()=>Utilities.getUuid(),tokenHash:null});changes.push.apply(changes,result.changes);});
 commit_(changes);const after=load_();Logger.log(JSON.stringify({updated:changes.filter(c=>c.table==='Barbers'||c.table==='Services').map(c=>({table:c.table,id:c.record.id,version:c.record.version})),barber:after.Barbers.filter(b=>b.id==='royal-barber').map(b=>({id:b.id,name:b.name,photo:b.photo})),offers:after.Offers.length,schedules:after.Schedules.length}));
 }finally{lock.releaseLock();}
}
