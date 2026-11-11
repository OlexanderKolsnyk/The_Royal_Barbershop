const enc=new TextEncoder();
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const sha=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const sign=async(s,key)=>{const k=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(s))))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const publicActions=['catalogue','slots','book','myBooking','bookingChange','analytics'];
const mutations=['book','bookingChange','saveEntity','payment','expense','closePeriod','reprice','readNotifications'];
// Keep the signed wire text ASCII; Google may otherwise reinterpret non-ASCII POST bytes.
export const serializeWire=value=>JSON.stringify(value).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
const json=(data,status,headers)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
export function createHandler(assets){return {async fetch(request,env){
 const url=new URL(request.url),origin=request.headers.get('Origin'),sameOrigin=origin===url.origin;
 const allowedOrigin=sameOrigin||origin===env.PUBLIC_ORIGIN;
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Vary':'Origin'};
 if(allowedOrigin){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Methods']='POST, OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type, Idempotency-Key';}
 if(request.method==='OPTIONS')return new Response(null,{status:allowedOrigin?204:403,headers});
 if(url.pathname==='/health')return json({ok:!!(env.GAS_URL&&env.GATEWAY_SECRET),configured:!!(env.GAS_URL&&env.GATEWAY_SECRET)},200,headers);
 if(url.pathname==='/api'){
  if(request.method!=='POST'||!allowedOrigin||!(request.headers.get('content-type')||'').startsWith('application/json'))return json({ok:false,error:{code:'FORBIDDEN',message:'Запит відхилено'}},403,headers);
  if(!env.GAS_URL||!env.GATEWAY_SECRET)return json({ok:false,error:{code:'NOT_CONFIGURED',message:'Онлайн-запис готується до відкриття. Зателефонуйте або напишіть нам.'}},503,headers);
  try{
   const raw=await request.text();if(raw.length>60000)return json({ok:false,error:{message:'Запит завеликий'}},413,headers);
   const input=JSON.parse(raw);if(typeof input.action!=='string'||!input.params||typeof input.params!=='object')throw Error('Invalid request');
   const identity=sameOrigin?request.headers.get('oai-authenticated-user-email'):null;
   if(!publicActions.includes(input.action)&&!identity)return json({ok:false,error:{code:'UNAUTHORIZED',message:'Увійдіть у систему'}},401,headers);
   if(input.action==='bookingChange'&&!identity&&!input.token)return json({ok:false,error:{code:'UNAUTHORIZED',message:'Потрібен ключ запису'}},401,headers);
   if((input.action==='book'||input.action==='myBooking'||(input.action==='bookingChange'&&!identity))&&!/^[a-f0-9]{64}$/.test(input.token||''))throw Error('Invalid booking key');
   const requestId=request.headers.get('Idempotency-Key');if(mutations.includes(input.action)&&!/^[a-f0-9-]{36}$/.test(requestId||''))throw Error('Invalid idempotency key');
   const cookie=/__Host-royal_admin=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('Cookie')||'');
   const adminSessionHash=identity&&cookie?await sha(cookie[1]):null;
   async function backend(action,params){const payload=serializeWire({action,params,identity:identity||null,adminSessionHash,tokenHash:input.token?await sha(input.token):null,requestId,requestHash:await sha(raw),timestamp:Date.now(),nonce:crypto.randomUUID(),rateKey:await sign(request.headers.get('CF-Connecting-IP')||'anonymous',env.GATEWAY_SECRET)});const upstream=await fetch(env.GAS_URL,{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({payload,signature:await sign(payload,env.GATEWAY_SECRET)}),signal:AbortSignal.timeout(30000)});const result=await upstream.json();if(typeof result.ok!=='boolean')throw Error('Invalid upstream response');return result;}
   let response;
   if(['adminUnlock','adminSetPassword'].includes(input.action)){
    const clientProof=input.params.clientProof;if(!/^[a-f0-9]{64}$/.test(clientProof||''))return json({ok:false,error:{code:'VALIDATION',message:'Не вдалося перевірити пароль.'}},400,headers);
    const cfg=await backend('adminAuthStatus',{});if(!cfg.ok)return json(cfg,403,headers);
    if(cfg.data.iterations!==600000||typeof cfg.data.salt!=='string')throw Error('Invalid password configuration');
    const key=await crypto.subtle.importKey('raw',enc.encode(clientProof),'PBKDF2',false,['deriveBits']);
    const passwordProof=hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(await sign(cfg.data.salt,env.GATEWAY_SECRET)),iterations:100000,hash:'SHA-256'},key,256));
    const session=hex(crypto.getRandomValues(new Uint8Array(32)));
    response=await backend(input.action,{passwordProof,salt:cfg.data.salt,newSessionHash:await sha(session)});
    if(response.ok)headers['Set-Cookie']='__Host-royal_admin='+session+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=3600';
   }else response=await backend(input.action,input.params);
   if(input.action==='adminLogout'&&response.ok)headers['Set-Cookie']='__Host-royal_admin=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0';
   return json(response,response.ok?200:response.error?.code==='FORBIDDEN'?403:response.error?.code==='RATE_LIMIT'?429:409,headers);
  }catch(error){return json({ok:false,error:{code:'UNAVAILABLE',message:'Не вдалося отримати підтвердження. Повторіть запит: система перевірить, чи його вже виконано.'}},502,headers);}
 }
 if(url.pathname==='/admin'||url.pathname==='/admin/'){
  if(!request.headers.get('oai-authenticated-user-email'))return Response.redirect(url.origin+'/signin-with-chatgpt?return_to=%2Fadmin',302);
 }
 const path=url.pathname==='/'?'/index.html':url.pathname==='/admin'||url.pathname==='/admin/'?'/admin.html':url.pathname;
 const item=assets[path];if(!item)return new Response('Сторінку не знайдено',{status:404,headers});
 if(item.redirect)return Response.redirect(item.redirect,302);
 headers['Content-Type']=item.type;headers['Content-Security-Policy']="default-src 'self'; connect-src 'self' https://royal-barbershop-api.moltenheron4.chatgpt.site; img-src 'self' https: data:; style-src 'self'; script-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'";
 return new Response(item.encoding==='base64'?Uint8Array.from(atob(item.content),c=>c.charCodeAt(0)):item.content,{headers});
}};}
