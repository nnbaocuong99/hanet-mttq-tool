'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const {JSDOM} = require(process.env.HANET_JSDOM_PATH || 'jsdom');
const Core = require('../video-core.js'), DOM = require('../video-dom.js');
const {createController} = require('../video-content.js');
const ROOT = path.resolve(__dirname,'..');
const URL = 'https://connect.hanet.ai/997606/person/face/3307947148540116992?dayFrom=1790182801000&dayTo=1790269199999&month=2026-09';
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = fn(); if (value) return value; await delay(15); }
  throw new Error('Timeout: ' + fn.toString());
}
// Structure observed on HANET Connect 4.1.1: date drawer outside main,
// a role=button DIV containing a UL, and the timestamp in a LI.
const rowHTML = (id,time,extra='') => `<div class="event" data-event-id="${id}" ${extra}><div role="button" tabindex="0"><ul class="flex items-center gap-5 text-foreground text-body-normal py-2 px-4 hover:bg-muted/70 cursor-pointer"><li class="text-description-normal">${time}</li><div><li class="w-4 h-4 border-2 border-[#0A84FF] rounded-full"></li></div><li class="max-w-15 max-h-15"><div class="relative w-15 h-15 rounded-full overflow-hidden"><img src="https://cdn.invalid/snapshot-${id}.jpg"></div></li><div class="flex flex-col"><li class="text-description-normal line-clamp-1">Camera ${id}</li><li></li></div></ul></div></div>`;
function fixture(rows = rowHTML('a','07:30:01') + rowHTML('b','17:05:02'), adapter = {}) {
  const dom = new JSDOM(`<main aria-hidden="true"><h1>Chi tiết FaceID</h1><table><tbody><tr role="button"><td>24/09/2026</td><td>07:53</td><td>17:15</td></tr></tbody></table></main><div role="dialog" data-state="open" data-slot="sheet-content"><div data-slot="sheet-header"><h2 id="date">24/09/2026</h2></div><div class="flex-1 relative overflow-hidden"><section id="events">${rows}</section></div><button id="close-sheet">Close</button></div>`,{url:URL,pretendToBeVisual:true});
  const {window:w} = dom;
  const starts = [], calls = [];
  const send = adapter.send || (async message => {
    calls.push(message);
    if (message.action === 'start') { starts.push(message); return {ok:true,id:'job-'+starts.length}; }
    if (message.action === 'status') return {ok:true,state:'complete',status:'Đã lưu ZIP',results:starts.at(-1).items.map(item=>({...item,kind:'ok'}))};
    return {ok:true};
  });
  const ctl = createController(w,{send,timings:{poll:15,...adapter.timings}});
  const cleanup = () => { ctl.destroy(); w.close(); };
  return {dom,w,doc:w.document,ctl,starts,calls,cleanup};
}
function panel(doc) { return doc.getElementById('hanet-mttq-video-helper')?.shadowRoot; }
function controls(doc) { return Array.from(doc.querySelectorAll('[data-hanet-video-tools="row"]'),host=>host.shadowRoot); }
const Job=require('../video-job.js');
const Engine=require('../video-engine.js');
const Zip=require('../video-zip.js');
const {createResolver}=require('../video-source.js');
test('FaceID is preserved as a string; timestamps use Vietnam day; unsafe paths are rejected',() => {
  const ctx = Core.context(URL);
  assert.equal(ctx.faceId,'3307947148540116992'); assert.equal(ctx.date,'2026-09-24');
  assert.equal(Core.context(URL.replace('/997606/','/999999/')),null);
  assert.equal(Core.context(URL.replace('https:','http:')),null);
  assert.equal(Core.clock('24:01:02'),''); assert.equal(Core.clock('7:09:02'),'07:09:02');
  const filename = Core.filename(ctx,{time:'07:30:01',key:'a'},'mp4');
  assert.ok(Core.validFilename(filename)); assert.ok(filename.includes('07-30-01'));
  assert.equal(Core.validFilename(filename.replace('HANET/','HANET/../')),false);
  assert.equal(Core.mediaURL('file:///etc/passwd'),'');
  assert.equal(Core.mediaURL('https://user:secret@example.com/v.mp4'),'');
  assert.equal(Core.mediaURL('blob:https://other.invalid/id'),'');
  assert.equal(Core.mediaKind('https://cdn.invalid/a.m3u8?token=x'),'stream');
});
test('finds repeated timestamps with different cameras; skips unrelated clocks and dialogs',() => {
  const f = fixture(rowHTML('a','07:30:01') + rowHTML('b','07:30:01') + '<p>08:00</p><div role="dialog"><button>12:34:56</button></div>');
  try {
    const items = DOM.timeline(f.doc);
    assert.equal(items.length,2); assert.notEqual(items[0].key,items[1].key);
    assert.deepEqual(items.map(item=>item.time),['07:30:01','07:30:01']);
  } finally { f.cleanup(); }
});
test('checkbox does not open native player; selection survives React replacement and clears on day change',async() => {
  const f = fixture();
  try {
    let native = 0;
    f.doc.querySelectorAll('[role="button"]').forEach(row=>row.onclick=()=>native++);
    f.ctl.start();
    controls(f.doc)[0].querySelector('input').click();
    assert.equal(native,0); assert.match(panel(f.doc).querySelector('#count').textContent,/Đã chọn 1/);
    const event = f.doc.querySelector('.event'); event.replaceWith(event.cloneNode(true)); f.ctl.scan();
    assert.equal(controls(f.doc)[0].querySelector('input').checked,true);
    assert.equal(f.doc.querySelectorAll('[data-hanet-video-tools="row"]').length,2);
    f.doc.querySelector('#date').textContent = '25/09/2026'; f.ctl.scan();
    assert.equal(controls(f.doc)[0].querySelector('input').checked,false);
    assert.equal(panel(f.doc).querySelector('#download').disabled,true);
  } finally { f.cleanup(); }
});
test('toolbar and 13 checkboxes appear inside the native drawer; main table times are excluded',() => {
  const rows = Array.from({length:13},(_,i)=>rowHTML(String(i),`17:${String(i).padStart(2,'0')}:44`)).join('');
  const f = fixture(rows);
  try {
    f.ctl.start();
    const drawer = f.doc.querySelector('[data-slot="sheet-content"]');
    assert.ok(drawer.querySelector('#hanet-mttq-video-helper'));
    assert.equal(f.doc.querySelector('main #hanet-mttq-video-helper'),null);
    assert.equal(controls(f.doc).length,13);
    assert.ok(Array.from(f.doc.querySelectorAll('[data-hanet-video-tools="row"]')).every(host=>host.parentElement.tagName==='LI'));
    panel(f.doc).querySelector('#all').click();
    assert.match(panel(f.doc).querySelector('#count').textContent,/13 mốc.*Đã chọn 13/);
    assert.equal(DOM.panelDate(drawer),'24/09/2026');
  } finally { f.cleanup(); }
});
test('no video UI on main page when the native day drawer is closed',() => {
  const f = fixture();
  try {
    f.doc.querySelector('[data-slot="sheet-content"]').remove();
    f.ctl.start(); assert.equal(panel(f.doc),undefined); assert.equal(controls(f.doc).length,0);
  } finally { f.cleanup(); }
});
test('select-all includes later-inserted rows without duplicating controls',() => {
  const f = fixture(rowHTML('a','07:30:01'));
  try {
    f.ctl.start(); panel(f.doc).querySelector('#all').click();
    f.doc.querySelector('#events').insertAdjacentHTML('beforeend',rowHTML('b','17:05:02')); f.ctl.scan(); f.ctl.scan();
    assert.equal(controls(f.doc).length,2); assert.equal(controls(f.doc)[0].querySelector('input').checked,true);
    assert.equal(controls(f.doc)[1].querySelector('input').checked,true);
    panel(f.doc).querySelector('#all').click(); assert.match(panel(f.doc).querySelector('#count').textContent,/Đã chọn 2/);
  } finally { f.cleanup(); }
});
test('bulk sends one ZIP job and never clicks a native player in the visible tab',async()=>{
 const f=fixture();let clicks=0;try{f.doc.querySelectorAll('[role="button"]').forEach(n=>n.onclick=()=>clicks++);f.ctl.start();const p=panel(f.doc);p.querySelector('#all').click();p.querySelector('#download').click();await until(()=>p.querySelector('#status').textContent.includes('Đã lưu ZIP'));assert.equal(clicks,0);assert.equal(f.starts.length,1);assert.equal(f.starts[0].output,'zip');assert.equal(f.starts[0].items.length,2);assert.match(p.querySelector('#count').textContent,/Đã chọn 0/);}finally{f.cleanup();}
});
test('single MP4 uses the new SPA FaceID and drawer date',async()=>{
 const f=fixture();try{f.ctl.start();f.w.history.pushState(null,'','/997606/person/face/3243637664674480128');f.doc.querySelector('#date').textContent='03/09/2026';f.ctl.scan();controls(f.doc)[0].querySelector('button').click();await until(()=>f.starts.length===1);await until(()=>panel(f.doc).querySelector('#stop').hidden);assert.equal(f.starts[0].faceId,'3243637664674480128');assert.equal(f.starts[0].date,'2026-09-03');assert.equal(f.starts[0].output,'mp4');}finally{f.cleanup();}
});
test('Stop during start cancels acknowledged job and retains selection',async()=>{
 let release;const calls=[];const f=fixture(undefined,{send:async m=>{calls.push(m);if(m.action==='start')return new Promise(r=>release=()=>r({ok:true,id:'delayed'}));return {ok:true};}});try{f.ctl.start();const p=panel(f.doc);p.querySelector('#all').click();p.querySelector('#download').click();await until(()=>release);p.querySelector('#stop').click();release();await until(()=>p.querySelector('#stop').hidden);assert.ok(calls.some(m=>m.action==='cancel'&&m.id==='delayed'));assert.match(p.querySelector('#count').textContent,/Đã chọn 2/);}finally{f.cleanup();}
});
test('arbitrary FaceIDs, date ZIP naming, Vietnam day, invalid dates and hosts',()=>{
 for(const faceId of ['1','3243637664674480128','3307947148540116993']){const msg={faceId,date:'2026-09-03',output:'zip',items:[{time:'07:42:14',key:'a'}]};const accepted=Job.validateStart(msg,`https://connect.hanet.ai/997606/person/face/${faceId}`);assert.equal(accepted.faceId,faceId);const href=Job.sourcePage(faceId,msg.date,'test-job');assert.equal(Core.context(href).date,msg.date);assert.equal(Job.workerId(href),'test-job');assert.ok(Job.itemName(accepted,msg.items[0]).includes(faceId));}
 assert.equal(Job.zipName('2026-09-03'),'3-9-2026.zip');assert.equal(Job.validDate('2026-02-30'),false);assert.equal(Job.sourceURL('https://hanet.ai.evil.example/v.mp4'),'');assert.equal(Job.sourceURL('https://vcdn-z-video.hanet.ai/a.mp4?sign=keep%2Bme'),'https://vcdn-z-video.hanet.ai/a.mp4?sign=keep%2Bme');
});
test('source worker selects correct camera at identical time and closes only its modal',async()=>{
 const f=fixture(rowHTML('a','07:42:14')+rowHTML('b','07:42:14')),played=[];try{
 for(const row of f.doc.querySelectorAll('.event [role="button"]'))row.onclick=()=>{const id=row.parentElement.dataset.eventId;played.push(id);const d=f.doc.createElement('div');d.dataset.slot='dialog-content';d.setAttribute('role','dialog');d.innerHTML='<h2><span>07:42:14</span><span>Camera</span><button>Xem video</button></h2><button aria-label="Close">Close</button>';d.querySelector('[aria-label]').onclick=()=>d.remove();d.querySelector('h2 button').onclick=()=>{const v=f.doc.createElement('video');v.pause=()=>{};v.src=`https://vcdn-z-video.hanet.ai/${id}.mp4?sign=keep%2Bme`;d.append(v);};f.doc.body.append(d);};
 const rows=DOM.timeline(f.doc),resolver=createResolver(f.w,{poll:10,settle:10,timeout:1000});const job={faceId:Core.context(URL).faceId,date:'2026-09-24'};const result=await resolver.resolve(job,rows[1]);assert.equal(result.url,'https://vcdn-z-video.hanet.ai/b.mp4?sign=keep%2Bme');assert.deepEqual(played,['b']);assert.equal(f.doc.querySelector('[data-slot="dialog-content"]'),null);assert.ok(DOM.timelinePanel(f.doc));await assert.rejects(()=>resolver.resolve(job,{key:'missing',time:'07:42:14'}),/không còn/);
 }finally{f.cleanup();}
});
test('source worker opens requested day from profile',async()=>{
 const f=fixture();try{const drawer=DOM.timelinePanel(f.doc);drawer.remove();let clicked=0;f.doc.querySelector('main tr').onclick=()=>{clicked++;f.doc.body.append(drawer);};const resolver=createResolver(f.w,{poll:10,timeout:500});assert.equal(await resolver.prepare({faceId:Core.context(URL).faceId,date:'2026-09-24'}),drawer);assert.equal(clicked,1);}finally{f.cleanup();}
});
function workerHarness(){
 let listener,stored={};const created=[],removed=[],messages=[],downloads=new Map();let currentURL=URL;const tabs=new Map();
 const chrome={runtime:{id:'ext-test',getURL:p=>'chrome-extension://ext-test/'+p,getContexts:async()=>[],onMessage:{addListener:fn=>listener=fn},sendMessage:async m=>{messages.push(m);return {ok:true};}},storage:{session:{get:async()=>stored,set:async data=>{stored=structuredClone(data);}}},offscreen:{createDocument:async()=>{}},tabs:{get:async id=>id===1?{id,url:currentURL,status:'complete'}:tabs.get(id),create:async opts=>{created.push(opts);const t={id:2,...opts,status:'complete'};tabs.set(2,t);return t;},update:async()=>{},remove:async id=>{removed.push(id);tabs.delete(id);},sendMessage:async(_,m)=>m.action==='list'?{ok:true,items:[{key:'a',time:'07:42:14'},{key:'b',time:'08:00:00'}]}:{ok:true,url:'https://vcdn-z-video.hanet.ai/a.mp4'},onRemoved:{addListener:()=>{}}},downloads:{download:async opts=>{downloads.set(1,{...opts,id:1,state:'in_progress',byExtensionId:'ext-test',bytesReceived:100});return 1;},search:async({id})=>downloads.has(id)?[downloads.get(id)]:[],cancel:async id=>{downloads.get(id).state='interrupted';}}};
 vm.runInNewContext(fs.readFileSync(path.join(ROOT,'background.js'),'utf8'),{self:{HanetMttqVideoCore:Core,HanetVideoJob:Job},chrome,importScripts:()=>{},crypto:require('node:crypto').webcrypto,setTimeout,Date});const sender={id:'ext-test',frameId:0,tab:{id:1},url:URL};const message=(payload,from=sender,type='HANET_MTTQ_VIDEO')=>new Promise(resolve=>listener({type,...payload},from,resolve));const engine=payload=>message(payload,{id:'ext-test',url:'chrome-extension://ext-test/video-offscreen.html'},'HANET_VIDEO_ENGINE');return {message,engine,created,removed,messages,downloads,sender,setURL:u=>currentURL=u};
}
test('background handles stale sender URL, one inactive tab, date ZIP and owner isolation',async()=>{
 const w=workerHarness(),faceId='3243637664674480128';w.setURL(URL.replace('3307947148540116992',faceId));const start=await w.message({action:'start',faceId,date:'2026-09-03',output:'zip',items:[{key:'a',time:'07:42:14'},{key:'b',time:'08:00:00'}]});assert.equal(start.ok,true);assert.equal(w.created.length,1);assert.equal(w.created[0].active,false);assert.ok(w.created[0].url.includes('/'+faceId+'?'));assert.equal((await w.engine({action:'save',id:start.id,url:'blob:chrome-extension://ext-test/a'})).ok,true);assert.equal(w.downloads.get(1).filename,'3-9-2026.zip');assert.equal((await w.message({action:'status',id:start.id})).state,'running');assert.equal((await w.message({action:'status',id:start.id},{...w.sender,tab:{id:99}})).ok,false);await w.engine({action:'done',id:start.id,success:true,status:'Done',results:[]});assert.deepEqual(w.removed,[2]);assert.equal((await w.message({action:'status',id:start.id})).state,'complete');
});
test('background rejects forged sources; stop closes only source tab',async()=>{
 const w=workerHarness(),payload={action:'start',faceId:Core.context(URL).faceId,date:'2026-09-03',output:'mp4',items:[{key:'a',time:'07:42:14'}]};assert.equal((await w.message(payload,{...w.sender,url:'https://evil.example/'})).ok,false);const start=await w.message(payload);assert.equal(start.ok,true);assert.equal((await w.engine({action:'save',id:start.id,url:'blob:https://connect.hanet.ai/x'})).ok,false);await w.message({action:'cancel',id:start.id});assert.deepEqual(w.removed,[2]);assert.equal((await w.message({action:'status',id:start.id})).state,'cancelled');
});
const fakeMP4=()=>{const b=new Uint8Array(2048);b.set([0,0,0,24,102,116,121,112]);return b;};
test('download rejects HTML, truncation and HTTP errors before encoding',async()=>{
 const source='https://vcdn-z-video.hanet.ai/a.mp4',good=fakeMP4();assert.equal((await Engine.fetchVideo(source,undefined,async()=>new Response(good,{headers:{'content-type':'video/mp4','content-length':String(good.length)}}))).length,good.length);await assert.rejects(()=>Engine.fetchVideo(source,undefined,async()=>new Response('<html>sign in</html>',{headers:{'content-type':'text/html'}})),/không phải video/);await assert.rejects(()=>Engine.fetchVideo(source,undefined,async()=>new Response(good,{headers:{'content-length':'3000'}})),/chưa đủ/);await assert.rejects(()=>Engine.fetchVideo(source,undefined,async()=>new Response('No',{status:403})),/403/);
});
function engineEnv(failIndex=-1,saveError=false){
 const actions=[];let blob,conversions=0,released=false,polls=0;return {actions,get blob(){return blob;},get conversions(){return conversions;},get released(){return released;},env:{cancelled:()=>false,load:async()=>{},fetchVideo:async()=>fakeMP4(),convert:async bytes=>{conversions++;return bytes;},onProgress:()=>{},createURL:b=>{blob=b;return 'blob:test';},revokeURL:()=>{},delay:async()=>{},release:()=>released=true,send:async m=>{actions.push(structuredClone(m));if(m.action==='resolve'){if(m.index===failIndex)throw new Error('Không có video.');return {ok:true,url:'https://vcdn-z-video.hanet.ai/a.mp4'};}if(m.action==='download-status'){polls++;return {ok:true,state:saveError?'interrupted':polls>1?'complete':'in_progress',error:'DISK_FULL'};}return {ok:true};}}};
}
test('engine produces one ZIP, waits for saved download, and preserves both clips',async()=>{
 const w=engineEnv();await Engine.run({id:'job',faceId:'123',date:'2026-09-03',output:'zip',items:[{key:'a',time:'07:42:14'},{key:'b',time:'07:42:14'}]},w.env);assert.equal(w.conversions,2);assert.equal(w.actions.filter(m=>m.action==='save').length,1);assert.equal(w.blob.type,'application/zip');assert.equal(w.released,true);const done=w.actions.at(-1);assert.equal(done.success,true);assert.ok(done.results.every(r=>r.kind==='ok'));assert.equal(w.actions.filter(m=>m.action==='download-status').length,2);const bytes=Buffer.from(await w.blob.arrayBuffer());assert.equal(bytes.readUInt16LE(bytes.length-12),2);
});
test('partial ZIP includes errors; failed disk save marks no clip successful',async()=>{
 const job={id:'job',faceId:'123',date:'2026-09-03',output:'zip',items:[{key:'a',time:'07:42:14'},{key:'b',time:'08:00:00'}]},partial=engineEnv(1);await Engine.run(job,partial.env);assert.match(Buffer.from(await partial.blob.arrayBuffer()).toString(),/LOI_TAI.txt/);assert.equal(partial.actions.at(-1).results[1].kind,'error');const failed=engineEnv(-1,true);await Engine.run(job,failed.env);assert.equal(failed.actions.at(-1).success,false);assert.ok(failed.actions.at(-1).results.every(r=>r.kind==='error'));
});
test('ZIP CRC matches standard vector and prevents duplicate or traversal names',()=>{
 assert.equal(Zip.crc32(new TextEncoder().encode('123456789')),0xcbf43926);const z=new Zip.Archive('2026-09-03');assert.throws(()=>z.add('../evil.mp4',fakeMP4()));z.add('07-42-14.mp4',fakeMP4());assert.throws(()=>z.add('07-42-14.mp4',fakeMP4()));
});
test('select-all reads all pages of a virtualized day without skipping rows',async()=>{
 const f=fixture(rowHTML('a','07:42:14'));try{
  const events=f.doc.querySelector('#events'),scroll=f.doc.createElement('div');scroll.setAttribute('data-radix-scroll-area-viewport','');events.replaceWith(scroll);scroll.append(events);let top=0;
  Object.defineProperties(scroll,{clientHeight:{get:()=>100},scrollHeight:{get:()=>300},scrollTop:{get:()=>top,set:value=>{top=Math.max(0,Math.min(200,value));const index=Math.floor(top/100);events.innerHTML=rowHTML(['a','b','c'][index],['07:42:14','08:00:00','09:00:00'][index]);}}});
  const resolver=createResolver(f.w,{poll:10,scroll:10,timeout:500});const items=await resolver.collect({faceId:Core.context(URL).faceId,date:'2026-09-24'});assert.deepEqual(items.map(i=>i.time),['07:42:14','08:00:00','09:00:00']);
 }finally{f.cleanup();}
});
test('select-all updates job to include every item collected by source worker',async()=>{
 const w=workerHarness();const start=await w.message({action:'start',faceId:Core.context(URL).faceId,date:'2026-09-03',output:'zip',all:true,items:[{key:'a',time:'07:42:14'}]});const listed=await w.engine({action:'list',id:start.id});assert.equal(listed.ok,true);assert.equal(listed.items.length,2);assert.equal((await w.message({action:'status',id:start.id})).total,2);await w.message({action:'cancel',id:start.id});
});
test('engine select-all includes newly discovered videos, single MP4 skips ZIP wrapping',async()=>{
 const w=engineEnv(),send=w.env.send;w.env.send=async m=>m.action==='list'?{ok:true,items:[{key:'a',time:'07:42:14'},{key:'b',time:'08:00:00'}]}:send(m);
 await Engine.run({id:'job',faceId:'123',date:'2026-09-03',output:'zip',all:true,items:[{key:'a',time:'07:42:14'}]},w.env);assert.equal(w.conversions,2);assert.equal(w.actions.at(-1).success,true);
 const one=engineEnv();await Engine.run({id:'one',faceId:'123',date:'2026-09-03',output:'mp4',items:[{key:'a',time:'07:42:14'}]},one.env);assert.equal(one.blob.type,'video/mp4');assert.equal(Engine.isMP4(new Uint8Array(await one.blob.arrayBuffer())),true);
});
test('simultaneous starts from multiple tabs create only one source job',async()=>{
 const w=workerHarness(),payload={action:'start',faceId:Core.context(URL).faceId,date:'2026-09-03',output:'mp4',items:[{key:'a',time:'07:42:14'}]};const replies=await Promise.all([w.message(payload),w.message(payload)]);assert.equal(replies.filter(r=>r.ok).length,1);assert.equal(w.created.length,1);await w.message({action:'cancel',id:replies.find(r=>r.ok).id});
});
test('individual selections survive virtual rows unmounting while scrolling',async()=>{
 const f=fixture(rowHTML('a','07:42:14'));try{f.ctl.start();controls(f.doc)[0].querySelector('input').click();f.doc.querySelector('#events').innerHTML=rowHTML('b','08:00:00');f.ctl.scan();controls(f.doc)[0].querySelector('input').click();panel(f.doc).querySelector('#download').click();await until(()=>f.starts.length);assert.equal(f.starts[0].items.length,2);assert.equal(f.starts[0].all,false);await until(()=>panel(f.doc).querySelector('#stop').hidden);}finally{f.cleanup();}
});
