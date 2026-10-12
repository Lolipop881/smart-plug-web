import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
function env(publicControl='true') {return {PUBLIC_CONTROL:publicControl,DEVICE_KEY:'board-secret',PLUG:{idFromName(){return 'primary'},get(){return {fetch(){return Response.json({online:false,state:null})}}}}};}
test('public dashboard state works without web password or session secret',async()=>{const r=await worker.fetch(new Request('https://plug/api/state'),env());assert.equal(r.status,200);assert.equal((await r.json()).online,false);});
test('public access discovery is available before secrets are configured',async()=>{const r=await worker.fetch(new Request('https://plug/api/access'),{PUBLIC_CONTROL:'true'});assert.deepEqual(await r.json(),{publicControl:true,version:'realtime-presence-v2'});});
test('public mode rejects unauthorized device sockets and foreign origins',async()=>{const r=await worker.fetch(new Request('https://plug/api/device/socket',{headers:{Upgrade:'websocket'}}),env());assert.equal(r.status,401);const foreign=await worker.fetch(new Request('https://plug/api/command',{method:'POST',headers:{Origin:'https://other'}}),env());assert.equal(foreign.status,403);});

test('root serves dashboard ready to wait for board, without asset binding',async()=>{const r=await worker.fetch(new Request('https://plug/'),{});assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');const html=await r.text();assert.match(html,/ได้รับสัญญาณจากบอร์ดล่าสุด/);assert.match(html,/<section id="setup" hidden>/);assert.match(html,/serverOrigin=location.origin/);});

// Run the shipped countdown formatter with a controlled monotonic clock.
import {runInNewContext} from 'node:vm';
import {dashboard} from '../src/dashboard.js';
function timerUI({tick=0,serverNow=100000,confirmedAt=100000,online=true}={}) {
 const script=dashboard.slice(dashboard.indexOf('<script type="module">')+22,dashboard.lastIndexOf('</script>'));
 const context={data:{serverNow,confirmedAt},online,lastSnapshotTick:0,performance:{now:()=>tick}};
 const helpers=script.slice(script.indexOf('function remainingSeconds('),script.indexOf('function updateTimerDisplays('));
 return runInNewContext(script.match(/function timeText\(m\)\{[^\n]+/)[0]+'\n'+helpers+'\n({scheduleText,remainingSeconds})',context);
}
const timedChannel={name:'ช่อง 1',emoji:'🔌',on:false,daily:false,onMinute:480,offMinute:1080,remaining:65,target:false};
test('inactive schedules hide stored time; active schedules show daily range',()=>{
 const ui=timerUI();assert.equal(ui.scheduleText({...timedChannel,remaining:0}),'ไม่ได้ตั้งเวลา');
 assert.equal(ui.scheduleText({...timedChannel,remaining:0,daily:true}),'08:00–18:00 · ทุกวัน');
});
test('countdown accounts for snapshot age and seconds between polls',()=>{
 assert.equal(timerUI().scheduleText(timedChannel),'ปิดใน\n00:01:05');
 assert.equal(timerUI({tick:1000}).scheduleText(timedChannel),'ปิดใน\n00:01:04');
 assert.equal(timerUI({tick:2000,serverNow:103000}).scheduleText({...timedChannel,target:true}),'เปิดใน\n00:01:00');
 assert.equal(timerUI({tick:70000}).scheduleText(timedChannel),'ครบเวลา · รอยืนยันจากบอร์ด');
 assert.equal(timerUI({online:false}).scheduleText(timedChannel),'นับถอยหลัง · รอสัญญาณจากบอร์ด');
});
test('clear schedule sends selected channel config with daily timing disabled',()=>{
 const control={};let sent;
 const code=dashboard.match(/\$\('\.clear-daily'\)\.onclick=[^\n]+/)[0];
 runInNewContext(code,{$:()=>control,configBase:()=>({channel:2,name:'ปลา',emoji:'🐟',minutes:0,target:0}),command:(...args)=>{sent=args;}});
 control.onclick();assert.equal(sent[0],'config');assert.equal(sent[1].channel,2);assert.equal(sent[1].daily,0);assert.equal(sent[1].onMinute,0);assert.equal(sent[1].offMinute,0);assert.equal(sent[1].name,'ปลา');
});
