import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
function env(publicControl='true') {return {PUBLIC_CONTROL:publicControl,DEVICE_KEY:'board-secret',PLUG:{idFromName(){return 'primary'},get(){return {fetch(){return Response.json({online:false,state:null})}}}}};}
test('public dashboard state works without web password or session secret',async()=>{const r=await worker.fetch(new Request('https://plug/api/state'),env());assert.equal(r.status,200);assert.equal((await r.json()).online,false);});
test('public access discovery is available before secrets are configured',async()=>{const r=await worker.fetch(new Request('https://plug/api/access'),{PUBLIC_CONTROL:'true'});assert.deepEqual(await r.json(),{publicControl:true,version:'realtime-presence-v2'});});
test('public mode rejects unauthorized device sockets and foreign origins',async()=>{const r=await worker.fetch(new Request('https://plug/api/device/socket',{headers:{Upgrade:'websocket'}}),env());assert.equal(r.status,401);const foreign=await worker.fetch(new Request('https://plug/api/command',{method:'POST',headers:{Origin:'https://other'}}),env());assert.equal(foreign.status,403);});

test('root serves dashboard ready to wait for board, without asset binding',async()=>{const r=await worker.fetch(new Request('https://plug/'),{});assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');const html=await r.text();assert.match(html,/ได้รับสัญญาณจากบอร์ดล่าสุด/);assert.match(html,/<section id="setup" hidden>/);assert.match(html,/serverOrigin=location.origin/);});
