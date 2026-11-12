/* Password-only owner access, explicitly requested by the shop owner. */
function authFailure_(code,message){const e=Error(message);e.code=code;throw e;}
function adminConfig_(){const p=properties_();let salt=p.getProperty('ADMIN_PASSWORD_SALT');if(!salt){salt=Utilities.getUuid()+Utilities.getUuid();p.setProperty('ADMIN_PASSWORD_SALT',salt);}return{salt:salt,iterations:600000,configured:!!p.getProperty('ADMIN_PASSWORD_HASH'),revision:p.getProperty('ADMIN_PASSWORD_REVISION')||''};}
function validAdminSession_(req,actor){if(!actor||!/^[a-f0-9]{64}$/.test(req.adminSessionHash||''))return false;const cached=CacheService.getScriptCache().get('admin-session:'+req.adminSessionHash);if(!cached)return false;try{const session=JSON.parse(cached);return session.email===actor.email&&session.revision===properties_().getProperty('ADMIN_PASSWORD_REVISION')&&session.expiresAt>Date.now();}catch{return false;}}
function requireAdminSession_(req,actor){if(!validAdminSession_(req,actor))authFailure_('ADMIN_LOCKED','Введіть пароль для доступу до адмінпанелі.');}
function passwordActor_(req,db){const email=properties_().getProperty('OWNER_EMAIL'),owner=db.Users.find(u=>u.active!==false&&u.role==='owner'&&u.email===email);return validAdminSession_(req,owner)?owner:null;}
function adminAuth_(req,actor,db){const p=properties_(),cfg=adminConfig_(),now=Date.now();
 if(req.action==='adminAuthStatus')return{configured:cfg.configured,unlocked:validAdminSession_(req,actor),role:actor?actor.role:'guest',salt:cfg.salt,iterations:cfg.iterations};
 if(req.action==='adminLogout'){if(req.adminSessionHash)CacheService.getScriptCache().remove('admin-session:'+req.adminSessionHash);return{locked:true};}
 const attemptKey='ADMIN_ATTEMPTS_'+hash_(req.rateKey||'shared'),attempt=JSON.parse(p.getProperty(attemptKey)||'{"count":0,"until":0}');
 if(attempt.until>now&&attempt.count>=5)authFailure_('RATE_LIMIT','Забагато спроб. Повторіть через 15 хвилин.');
 const input=req.params||{};
 if(req.action==='adminSetPassword'){
  RoyalCore.authorize(actor,['owner']);if(cfg.configured)requireAdminSession_(req,actor);
  if(!/^[a-f0-9]{64}$/.test(input.passwordProof||'')||input.salt!==cfg.salt)authFailure_('VALIDATION','Не вдалося встановити пароль. Оновіть сторінку.');
  p.setProperties({ADMIN_PASSWORD_HASH:input.passwordProof,ADMIN_PASSWORD_REVISION:Utilities.getUuid()});
  commit_([{table:'Audit',record:{id:Utilities.getUuid(),version:1,action:'admin.password.changed',actorId:actor.email,result:'success',createdAt:new Date(now).toISOString()}}]);
 }else if(req.action==='adminUnlock'){
  actor=db?db.Users.find(u=>u.active!==false&&u.role==='owner'&&u.email===p.getProperty('OWNER_EMAIL')):actor;RoyalCore.authorize(actor,['owner']);
  if(!cfg.configured)authFailure_('ADMIN_SETUP','Власник має спочатку задати пароль.');
  if(!equal_(input.passwordProof,p.getProperty('ADMIN_PASSWORD_HASH'))){const count=attempt.until>now?attempt.count+1:1;p.setProperty(attemptKey,JSON.stringify({count:count,until:now+900000}));authFailure_('ADMIN_PASSWORD','Невірний пароль.');}
 }else authFailure_('NOT_FOUND','Невідома операція.');
 if(!/^[a-f0-9]{64}$/.test(input.newSessionHash||''))authFailure_('VALIDATION','Не вдалося створити сесію.');
 p.deleteProperty(attemptKey);CacheService.getScriptCache().put('admin-session:'+input.newSessionHash,JSON.stringify({email:actor.email,revision:p.getProperty('ADMIN_PASSWORD_REVISION'),expiresAt:now+3600000}),3600);
 return{unlocked:true};
}
