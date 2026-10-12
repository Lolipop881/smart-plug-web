import {dashboard} from './dashboard.js';
const encoder = new TextEncoder();
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const bad = (message,status=400) => json({error:message},status);
async function same(a,b){const hash=async x=>new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(x||'')));const [x,y]=await Promise.all([hash(a),hash(b)]);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;}
function b64(bytes){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
async function signature(body,secret){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(body))));}
async function issue(env){const body=b64(encoder.encode(JSON.stringify({exp:Date.now()+12*3600000,nonce:crypto.randomUUID()})));return body+'.'+await signature(body,env.SESSION_SECRET);}
async function session(token,env){try{const [body,sig,...rest]=token.split('.');if(rest.length||!body||!sig||!await same(sig,await signature(body,env.SESSION_SECRET)))return false;const decoded=JSON.parse(atob(body.replaceAll('-','+').replaceAll('_','/')));return Number.isFinite(decoded.exp)&&decoded.exp>Date.now();}catch{return false;}}
export function validState(state){return !!state&&typeof state.clockValid==='boolean'&&Array.isArray(state.channels)&&state.channels.length===4&&state.channels.every(c=>c&&typeof c.on==='boolean'&&typeof c.name==='string'&&encoder.encode(c.name).length<=80&&typeof c.emoji==='string'&&encoder.encode(c.emoji).length<=32&&typeof c.daily==='boolean'&&Number.isInteger(c.onMinute)&&c.onMinute>=0&&c.onMinute<1440&&Number.isInteger(c.offMinute)&&c.offMinute>=0&&c.offMinute<1440&&Number.isFinite(c.remaining)&&c.remaining>=0&&c.remaining<=604801&&typeof c.target==='boolean');}
export function validCommand(action,p){if(action==='all-off')return p&&Object.keys(p).length===0;if(!p||!Number.isInteger(p.channel)||p.channel<0||p.channel>3)return false;if(action==='relay')return p.on===0||p.on===1;if(action!=='config')return false;return typeof p.name==='string'&&p.name.trim().length>0&&encoder.encode(p.name).length<=80&&typeof p.emoji==='string'&&encoder.encode(p.emoji).length<=32&&[0,1].includes(p.daily)&&Number.isInteger(p.onMinute)&&p.onMinute>=0&&p.onMinute<1440&&Number.isInteger(p.offMinute)&&p.offMinute>=0&&p.offMinute<1440&&(!p.daily||p.onMinute!==p.offMinute)&&Number.isInteger(p.minutes)&&p.minutes>=0&&p.minutes<=10080&&[0,1].includes(p.target);}
export function normalizeBoardState(d,now=Date.now()){const at=d.lastSeenAt??d.confirmedAt??null;return {...d,online:d.online===true&&Number.isFinite(at)&&now-at<10000,lastSeenAt:at,serverNow:now,offlineAfterMs:10000};}
export default {
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  if(!url.pathname.startsWith('/api/')){
   if(url.pathname==='/'||url.pathname==='/control.html')return new Response(dashboard,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
   return env.ASSETS?env.ASSETS.fetch(request):new Response('Not found',{status:404});
  }
  const allowed=!origin||origin===url.origin||origin===env.DASHBOARD_ORIGIN;
  if(!allowed)return bad('Origin forbidden',403);
  const cors=response=>{const h=new Headers(response.headers);if(origin){h.set('Access-Control-Allow-Origin',origin);h.set('Vary','Origin');}h.set('Access-Control-Allow-Headers','Content-Type, Authorization');h.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');return new Response(response.body,{status:response.status,headers:h});};
  if(request.method==='OPTIONS')return cors(new Response(null,{status:204}));
  const publicControl=true;
  if(url.pathname==='/api/access'&&request.method==='GET')return cors(json({publicControl,version:'realtime-presence-v2'}));
  if(!env.DEVICE_KEY||(!publicControl&&(!env.WEB_PASSWORD||!env.SESSION_SECRET)))return cors(bad('ยังไม่ได้ตั้งค่ากุญแจระบบ',503));
  const stub=env.PLUG.get(env.PLUG.idFromName('primary'));
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
  if(url.pathname==='/api/device/socket'){
   if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket'||!await same(token,env.DEVICE_KEY))return cors(bad('Unauthorized',401));
   // Authenticated device socket is accepted inside the Durable Object.
   return stub.fetch(request);
  }
  if(url.pathname==='/api/login'&&request.method==='POST'){
   if(publicControl)return cors(json({publicControl:true}));
   const limit=await stub.fetch('https://hub/internal/login-limit',{method:'POST',body:JSON.stringify({ip:request.headers.get('CF-Connecting-IP')||'unknown'})});
   if(limit.status!==200)return cors(limit);
   let body;try{body=await request.json();}catch{return cors(bad('Invalid JSON'));}
   if(!await same(body.password,env.WEB_PASSWORD))return cors(bad('รหัสผ่านไม่ถูกต้อง',401));
   return cors(json({token:await issue(env)}));
  }
  if(!publicControl&&!await session(token,env))return cors(bad('กรุณาเข้าสู่ระบบใหม่',401));
  if(url.pathname==='/api/events'&&request.headers.get('Upgrade')?.toLowerCase()==='websocket')return stub.fetch(request);
  if(['/api/state','/api/command','/api/logout'].includes(url.pathname)){
   if(url.pathname==='/api/logout')return cors(json({ok:true}));
   if(url.pathname==='/api/command'){const check=await stub.fetch('https://hub/api/state');if(!check.ok||!normalizeBoardState(await check.json()).online)return cors(bad('บอร์ดออฟไลน์ ยังส่งคำสั่งไม่ได้',503));}
   const response=await stub.fetch(request);
   if(url.pathname==='/api/state'&&response.ok)return cors(json(normalizeBoardState(await response.json())));
   return cors(response);
  }
  return cors(bad('Not found',404));
 }
};
export class PlugHub {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async latest(){return await this.ctx.storage.get('latest')||null;}
 async online(){const s=await this.latest();return this.ctx.getWebSockets('device').some(ws=>ws.readyState===1)&&!!s&&Date.now()-s.at<10000;}
 async snapshot(){const latest=await this.latest();return {receiverVersion:'realtime-presence-v2',online:await this.online(),state:latest?.state||null,confirmedAt:latest?.at||null,lastSeenAt:(await this.ctx.storage.get('lastSeenAt'))||latest?.at||null,serverNow:Date.now(),offlineAfterMs:10000};}
 async broadcast(){const message=JSON.stringify(await this.snapshot());for(const ws of this.ctx.getWebSockets('viewer')){try{ws.send(message);}catch{try{ws.close(1011,'Connection error');}catch{}}}}

 async fetch(request){
  const path=new URL(request.url).pathname;
  if(path==='/api/events'){
   const pair=new WebSocketPair();const [client,server]=Object.values(pair);this.ctx.acceptWebSocket(server,['viewer']);server.send(JSON.stringify(await this.snapshot()));return new Response(null,{status:101,webSocket:client});
  }
  if(path==='/internal/login-limit'){
   const {ip}=await request.json();const key='login:'+b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(ip))));const now=Date.now();let r=await this.ctx.storage.get(key);if(!r||now-r.at>600000)r={at:now,n:0};r.n++;await this.ctx.storage.put(key,r);await this.ensureAlarm();return r.n>10?bad('ลองเข้าสู่ระบบใหม่ในอีก 10 นาที',429):json({ok:true});
  }
  if(path==='/api/device/socket'){
   const previous=this.ctx.getWebSockets('device');for(const ws of previous)ws.close(1000,'Replaced by new connection');await this.ctx.storage.delete('latest');await this.broadcast();
   const pair=new WebSocketPair();const [client,server]=Object.values(pair);this.ctx.acceptWebSocket(server,['device']);server.serializeAttachment({connection:crypto.randomUUID()});server.send(JSON.stringify({type:'hello',protocol:1,heartbeatSeconds:3}));return new Response(null,{status:101,webSocket:client});
  }
  if(path==='/api/state'&&request.method==='GET'){
   const latest=await this.latest();const commandId=new URL(request.url).searchParams.get('command');const command=commandId?await this.ctx.storage.get('cmd:'+commandId):null;return json({...await this.snapshot(),command:command?this.publicCommand(command):null});
  }
  if(path==='/api/command'&&request.method==='POST'){
   const busy=await this.ctx.storage.get('busy');if(busy&&busy.expires>Date.now())return bad('มีคำสั่งกำลังรอยืนยัน กรุณารอสักครู่',409);
   if(!await this.online())return bad('บอร์ดออฟไลน์ ยังส่งคำสั่งไม่ได้',503);
   let body;try{body=await request.json();}catch{return bad('Invalid JSON');}
   if(!validCommand(body.action,body.payload))return bad('ข้อมูลคำสั่งไม่ถูกต้อง');
   const id=crypto.randomUUID(),expires=Date.now()+10000;const record={id,action:body.action,payload:body.payload,status:'pending',created:Date.now(),expires,connection:this.ctx.getWebSockets('device').find(ws=>ws.readyState===1).deserializeAttachment().connection};
   await this.ctx.storage.put({['cmd:'+id]:record,busy:{id,expires}});
   try{this.ctx.getWebSockets('device').find(ws=>ws.readyState===1).send(JSON.stringify({type:'command',protocol:1,id,action:body.action,payload:body.payload,expiresAt:expires}));}catch{record.status='failed';await this.ctx.storage.put('cmd:'+id,record);await this.ctx.storage.delete('busy');return bad('การเชื่อมต่อบอร์ดขาด กรุณาตรวจสถานะ',503);}
   await this.ensureAlarm();return json({id},202);
  }
  return bad('Not found',404);
 }
 publicCommand(c){return {id:c.id,status:c.status==='pending'&&Date.now()>c.expires?'timeout':c.status,error:c.error||null};}
 async ensureAlarm(){const latest=await this.latest();const next=this.ctx.getWebSockets('device').some(ws=>ws.readyState===1)&&latest?Math.min(Date.now()+600000,Math.max(Date.now()+1,latest.at+10000)):Date.now()+600000;const current=await this.ctx.storage.getAlarm();if(current===null||next<current)await this.ctx.storage.setAlarm(next);}
 async webSocketMessage(ws,raw){
  if(typeof raw!=='string'||raw.length>8192){ws.close(1009,'Message too large');return;}
  let m;try{m=JSON.parse(raw);}catch{return;}
  const active=this.ctx.getWebSockets('device').find(ws=>ws.readyState===1);if(ws!==active)return;
  if(m.type==='state'&&validState(m.state)){const at=Date.now();await this.ctx.storage.put({latest:{state:m.state,at},lastSeenAt:at});await this.ensureAlarm();await this.broadcast();return;}
  if(m.type!=='ack'||typeof m.id!=='string')return;
  const c=await this.ctx.storage.get('cmd:'+m.id);
  if(!c||c.status!=='pending'||Date.now()>c.expires||c.connection!==ws.deserializeAttachment().connection)return;
  if(m.ok!==true||!validState(m.state)){c.status='failed';c.error='บอร์ดยืนยันไม่สำเร็จ';}
  else if(!this.matches(c,m.state)){c.status='failed';c.error='สถานะจากบอร์ดไม่ตรงกับคำสั่ง';}
  else{c.status='done';const at=Date.now();await this.ctx.storage.put({latest:{state:m.state,at},lastSeenAt:at});await this.ensureAlarm();await this.broadcast();}
  await this.ctx.storage.put('cmd:'+m.id,c);const busy=await this.ctx.storage.get('busy');if(busy?.id===m.id)await this.ctx.storage.delete('busy');
 }
 matches(c,s){if(c.action==='relay')return s.channels[c.payload.channel].on===!!c.payload.on;if(c.action==='all-off')return s.channels.every(ch=>!ch.on);const ch=s.channels[c.payload.channel],p=c.payload;return ch.name===p.name&&ch.emoji===p.emoji&&ch.daily===!!p.daily&&ch.onMinute===p.onMinute&&ch.offMinute===p.offMinute&&ch.target===!!p.target&&(p.minutes===0?ch.remaining===0:Math.abs(ch.remaining-p.minutes*60)<=10);}
 async webSocketClose(ws){await this.broadcast();}
 async webSocketError(ws){try{ws.close(1011,'Connection error');}catch{}await this.broadcast();}
 async alarm(){const now=Date.now();const latest=await this.latest();if(latest&&now-latest.at>=10000){for(const ws of this.ctx.getWebSockets('device')){try{ws.close(1001,'Heartbeat timeout');}catch{}}}await this.broadcast();for(const [key,c] of await this.ctx.storage.list({prefix:'cmd:'})){if(now-c.created>600000)await this.ctx.storage.delete(key);}for(const [key,r] of await this.ctx.storage.list({prefix:'login:'})){if(now-r.at>600000)await this.ctx.storage.delete(key);}const busy=await this.ctx.storage.get('busy');if(busy&&busy.expires<now)await this.ctx.storage.delete('busy');if(await this.online()||(await this.ctx.storage.list({prefix:'cmd:',limit:1})).size||(await this.ctx.storage.list({prefix:'login:',limit:1})).size)await this.ensureAlarm();}
}

