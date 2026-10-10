import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
function env(publicControl='true') {return {PUBLIC_CONTROL:publicControl,DEVICE_KEY:'board-secret',PLUG:{idFromName(){return 'primary'},get(){return {fetch(){return Response.json({online:false,state:null})}}}}};}
test('public dashboard state works without web password or session secret',async()=>{const r=await worker.fetch(new Request('https://plug/api/state'),env());assert.equal(r.status,200);assert.equal((await r.json()).online,false);});
test('private mode still requires authentication',async()=>{const e={...env('false'),WEB_PASSWORD:'password',SESSION_SECRET:'secret'};const r=await worker.fetch(new Request('https://plug/api/state'),e);assert.equal(r.status,401);});
test('public access discovery is available before secrets are configured',async()=>{const r=await worker.fetch(new Request('https://plug/api/access'),{PUBLIC_CONTROL:'true'});assert.deepEqual(await r.json(),{publicControl:true});});
test('public mode rejects unauthorized device sockets and foreign origins',async()=>{const r=await worker.fetch(new Request('https://plug/api/device/socket',{headers:{Upgrade:'websocket'}}),env());assert.equal(r.status,401);const foreign=await worker.fetch(new Request('https://plug/api/command',{method:'POST',headers:{Origin:'https://other'}}),env());assert.equal(foreign.status,403);});
