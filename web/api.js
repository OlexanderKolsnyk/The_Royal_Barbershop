import {API} from './config.js';
export const endpoint=location.pathname.startsWith('/admin')?'/api':API;
export async function api(action,params={},options={}) {
 const response=await fetch(endpoint,{method:'POST',mode:'cors',credentials:location.pathname.startsWith('/admin')?'same-origin':'omit',headers:{'Content-Type':'application/json','Idempotency-Key':options.key||crypto.randomUUID()},body:JSON.stringify({action,params,...(options.token?{token:options.token}:{})}),signal:AbortSignal.timeout(35000)});
 let result;try{result=await response.json();}catch{throw Error('Сервіс тимчасово недоступний. Спробуйте пізніше.');}
 if(!result.ok){const e=Error(result.error?.message||'Не вдалося виконати запит');e.code=result.error?.code;throw e;}return result.data;
}
export const money=n=>new Intl.NumberFormat('uk-UA',{style:'currency',currency:'UAH',minimumFractionDigits:0,maximumFractionDigits:2}).format(n/100);
export const dateTime=s=>new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',dateStyle:'medium',timeStyle:'short'}).format(new Date(s));
export const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function el(tag,attrs={},children=[]){const e=document.createElement(tag);for(const [k,v]of Object.entries(attrs)){if(k==='text')e.textContent=v;else e.setAttribute(k,v);}for(const c of children)e.append(c);return e;}
export function download(name,content,type='text/plain'){const url=URL.createObjectURL(new Blob([content],{type}));const a=el('a',{href:url,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
