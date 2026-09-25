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
    if (message.action === 'start') { starts.push(message); return {ok:true,id:starts.length}; }
    if (message.action === 'status') return {ok:true,state:'complete',bytes:1024};
    return {ok:true};
  });
  const ctl = createController(w,{send,timings:{poll:15,settle:35,resolveTimeout:750,downloadTimeout:4000,...adapter.timings}});
  const cleanup = () => { ctl.destroy(); w.close(); };
  return {dom,w,doc:w.document,ctl,starts,calls,cleanup};
}
function panel(doc) { return doc.getElementById('hanet-mttq-video-helper')?.shadowRoot; }
function controls(doc) { return Array.from(doc.querySelectorAll('[data-hanet-video-tools="row"]'),host=>host.shadowRoot); }
function fakePlayers(f) {
  const active = [];
  for (const node of f.doc.querySelectorAll('.event [role="button"]')) node.onclick = () => {
    const key = node.parentElement.dataset.eventId;
    active.push(key);
    const dialog = f.doc.createElement('div'); dialog.setAttribute('role','dialog');
    const drawer = f.doc.querySelector('[data-slot="sheet-content"]');
    drawer.setAttribute('aria-hidden','true');
    dialog.dataset.slot = 'dialog-content';
    dialog.innerHTML = `<h2><span>Người thử nghiệm</span><span>${node.querySelector('li').textContent}</span><span>107 Camera thử nghiệm</span><button>Xem video</button></h2><img alt="Ảnh thử nghiệm"><button aria-label="Close">Close</button>`;
    dialog.querySelector('[aria-label="Close"]').onclick = () => { dialog.remove(); active.pop(); drawer.removeAttribute('aria-hidden'); };
    dialog.querySelector('h2 button').onclick = () => {
      dialog.querySelector('h2 button').textContent = 'Xem ảnh';
      const video = f.doc.createElement('video'); dialog.append(video);
      f.w.setTimeout(()=>video.src = `https://cdn.invalid/${key}.mp4?signature=keep%2Bthis`,45);
    };
    f.doc.body.append(dialog);
  };
  return active;
}
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
test('batch opens each selected timestamp in order, retains signed URL, waits for completion, closes only its dialogs',async() => {
  const f = fixture();
  try {
    const active = fakePlayers(f); f.ctl.start();
    const p = panel(f.doc); p.querySelector('#all').click(); p.querySelector('#download').click();
    await until(()=>p.querySelector('#status').textContent.includes('Đã tải xong 2/2'));
    assert.deepEqual(f.starts.map(message=>message.url),['https://cdn.invalid/a.mp4?signature=keep%2Bthis','https://cdn.invalid/b.mp4?signature=keep%2Bthis']);
    assert.equal(active.length,0); assert.equal(f.doc.querySelector('[data-slot="dialog-content"]'),null);
    assert.ok(f.doc.querySelector('[data-slot="sheet-content"]'));
    assert.match(p.querySelector('#count').textContent,/Đã chọn 0/);
    assert.ok(f.starts.every(message=>message.filename.includes('3307947148540116992_2026-09-24')));
    assert.deepEqual(f.calls.map(message=>message.action),['start','status','start','status']);
  } finally { f.cleanup(); }
});
test('an old source in a reused player is never downloaded while the requested clip loads',async() => {
  const f = fixture(rowHTML('a','07:30:01'));
  try {
    const video = f.doc.createElement('video'); video.src = 'https://cdn.invalid/old.mp4'; f.doc.body.append(video);
    f.doc.querySelector('.event [role="button"]').onclick = () => {
      const dialog = f.doc.createElement('div'); dialog.setAttribute('role','dialog');
      dialog.innerHTML = '<h2>Video 07:30:01</h2><button>Close</button>'; dialog.append(video); f.doc.body.append(dialog);
      dialog.querySelector('button').onclick = () => dialog.remove();
      f.w.setTimeout(()=>video.src='https://cdn.invalid/requested.mp4',180);
    };
    f.ctl.start(); controls(f.doc)[0].querySelector('button').click();
    await until(()=>panel(f.doc).querySelector('#status').textContent.includes('Đã tải xong 1/1'));
    assert.equal(f.starts.length,1); assert.equal(f.starts[0].url,'https://cdn.invalid/requested.mp4');
  } finally { f.cleanup(); }
});
test('clicking the native Video tab resolves lazy video; a failed row does not block other selected rows',async() => {
  const f = fixture();
  try {
    f.doc.querySelectorAll('.event [role="button"]').forEach((row,index)=>row.onclick = () => {
      const dialog = f.doc.createElement('div'); dialog.setAttribute('role','dialog');
      dialog.innerHTML = '<button role="tab">Video</button><button aria-label="Close">Close</button>';
      dialog.querySelector('[aria-label]').onclick = () => dialog.remove();
      dialog.querySelector('[role="tab"]').onclick = () => {
        const video = f.doc.createElement('video'); video.src = index ? 'https://cdn.invalid/good.mp4' : 'https://cdn.invalid/live.m3u8'; dialog.append(video);
      };
      f.doc.body.append(dialog);
    });
    f.ctl.start(); const p = panel(f.doc); p.querySelector('#all').click(); p.querySelector('#download').click();
    await until(()=>p.querySelector('#status').textContent.includes('Đã tải xong 1/2'));
    assert.equal(f.starts.length,1); assert.match(p.querySelector('#errors').textContent,/HLS\/DASH/);
    assert.equal(controls(f.doc)[0].querySelector('input').checked,true);
    assert.equal(controls(f.doc)[1].querySelector('input').checked,false);
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
test('Radix aria-hidden on the drawer while viewing a clip preserves all selections and the batch context',async() => {
  let releaseStatus;
  const f = fixture(undefined,{send:async message=> {
    if (message.action==='start') return {ok:true,id:4};
    if (message.action==='status') return new Promise(resolve=>releaseStatus=()=>resolve({ok:true,state:'complete'}));
    return {ok:true};
  }});
  try {
    fakePlayers(f); f.ctl.start(); const p=panel(f.doc); p.querySelector('#all').click();
    controls(f.doc)[0].querySelector('button').click();
    await until(()=>releaseStatus);
    assert.equal(f.doc.querySelector('[data-slot="sheet-content"]').getAttribute('aria-hidden'),'true');
    f.ctl.scan(); assert.equal(panel(f.doc),p); assert.equal(controls(f.doc).length,2);
    assert.match(p.querySelector('#count').textContent,/Đã chọn 2/);
    releaseStatus(); await until(()=>p.querySelector('#stop').hidden);
    assert.match(p.querySelector('#count').textContent,/Đã chọn 1/);
    assert.equal(f.doc.querySelector('[data-slot="sheet-content"]').getAttribute('aria-hidden'),null);
  } finally { f.cleanup(); }
});
test('closing the native drawer stops resolution and removes UI instead of mounting it on main',async() => {
  const f = fixture();
  try {
    f.ctl.start(); panel(f.doc).querySelector('#all').click(); panel(f.doc).querySelector('#download').click();
    const drawer=f.doc.querySelector('[data-slot="sheet-content"]'); drawer.dataset.state='closed'; f.ctl.scan();
    await delay(80);
    assert.equal(f.starts.length,0); assert.equal(panel(f.doc),undefined); assert.equal(controls(f.doc).length,0);
  } finally { f.cleanup(); }
});
test('selection of later-inserted rows works without duplicating controls',() => {
  const f = fixture(rowHTML('a','07:30:01'));
  try {
    f.ctl.start(); panel(f.doc).querySelector('#all').click();
    f.doc.querySelector('#events').insertAdjacentHTML('beforeend',rowHTML('b','17:05:02')); f.ctl.scan(); f.ctl.scan();
    assert.equal(controls(f.doc).length,2); assert.equal(controls(f.doc)[0].querySelector('input').checked,true);
    assert.equal(controls(f.doc)[1].querySelector('input').checked,false);
    panel(f.doc).querySelector('#all').click(); assert.match(panel(f.doc).querySelector('#count').textContent,/Đã chọn 2/);
  } finally { f.cleanup(); }
});
test('download interruption is reported, selection is retained, and a start acknowledgement is not completion',async() => {
  const actions = [];
  const f = fixture(rowHTML('a','07:30:01'),{send:async message => {
    actions.push(message.action);
    if (message.action === 'start') return {ok:true,id:44};
    if (message.action === 'status') return {ok:true,state:'interrupted',error:'SERVER_FORBIDDEN'};
    return {ok:true};
  }});
  try {
    fakePlayers(f); f.ctl.start(); const p = panel(f.doc); p.querySelector('#all').click(); p.querySelector('#download').click();
    await until(()=>p.querySelector('#status').textContent.includes('Đã tải xong 0/1'));
    assert.match(p.querySelector('#errors').textContent,/SERVER_FORBIDDEN/); assert.match(p.querySelector('#count').textContent,/Đã chọn 1/);
    assert.deepEqual(actions,['start','status','cancel']);
  } finally { f.cleanup(); }
});
test('Stop during a pending start cancels the new download and never starts the next row',async() => {
  const calls = []; let release, requested = false;
  const f = fixture(undefined,{send:async message => {
    calls.push(message);
    if (message.action === 'start') { requested = true; return new Promise(resolve=>release=()=>resolve({ok:true,id:77})); }
    return {ok:true,state:'complete'};
  }});
  try {
    fakePlayers(f); f.ctl.start(); const p = panel(f.doc); p.querySelector('#all').click(); p.querySelector('#download').click();
    await until(()=>requested); p.querySelector('#stop').click(); release();
    await until(()=>p.querySelector('#stop').hidden);
    assert.equal(calls.filter(message=>message.action==='start').length,1);
    assert.deepEqual(calls.find(message=>message.action==='cancel'),{action:'cancel',id:77});
    assert.match(p.querySelector('#status').textContent,/Đã dừng/); assert.match(p.querySelector('#count').textContent,/Đã chọn 2/);
  } finally { f.cleanup(); }
});
test('navigation to a different FaceID cancels resolution and clears selection',async() => {
  const f = fixture();
  try {
    f.ctl.start(); const p = panel(f.doc); p.querySelector('#all').click(); p.querySelector('#download').click();
    f.w.history.pushState(null,'',URL.replace('3307947148540116992','3307947148540116993')); f.ctl.scan();
    await until(()=>panel(f.doc).querySelector('#stop').hidden);
    assert.equal(f.starts.length,0); assert.match(panel(f.doc).querySelector('#count').textContent,/Đã chọn 0/);
  } finally { f.cleanup(); }
});
function workerHarness() {
  let listener;
  const downloads = new Map(), recorded = [];
  const chrome = {runtime:{id:'extension-test',lastError:null,onMessage:{addListener:fn=>listener=fn}},downloads:{
    download:(options,cb)=>{recorded.push(options); const id=recorded.length; downloads.set(id,{id,byExtensionId:'extension-test',state:'in_progress',mime:'video/mp4',bytesReceived:0,totalBytes:1000});cb(id);},
    search:({id},cb)=>cb(downloads.has(id)?[downloads.get(id)]:[]),
    cancel:(id,cb)=>{if(downloads.has(id))downloads.get(id).state='interrupted';cb();}
  }};
  const sandbox = {self:{HanetMttqVideoCore:Core},chrome,importScripts:()=>{}};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'background.js'),'utf8'),sandbox);
  const sender = {id:'extension-test',frameId:0,tab:{id:1},url:URL};
  const message = (payload,from=sender) => new Promise(resolve=>listener({type:'HANET_MTTQ_VIDEO',...payload},from,resolve));
  return {message,sender,recorded,downloads};
}
test('worker restricts source pages and filenames, uses browser cookies implicitly, and checks actual download status',async() => {
  const w = workerHarness(), ctx = Core.context(URL);
  const payload = {action:'start',url:'https://cdn.invalid/clip.mp4?sign=x%2By',filename:Core.filename(ctx,{time:'07:30:01',key:'a'},'mp4')};
  assert.equal((await w.message(payload,{...w.sender,url:'https://other.invalid/'})).ok,false);
  assert.equal((await w.message({...payload,filename:'../unsafe.mp4'})).ok,false);
  assert.equal((await w.message({...payload,url:'javascript:alert(1)'})).ok,false);
  assert.equal((await w.message({...payload,url:'https://cdn.invalid/clip.m3u8'})).ok,false);
  assert.equal((await w.message(payload)).ok,true);
  assert.equal(w.recorded[0].url,payload.url); assert.equal(w.recorded[0].saveAs,false); assert.equal(w.recorded[0].conflictAction,'uniquify');
  assert.equal((await w.message({action:'status',id:1})).state,'in_progress');
  w.downloads.get(1).state='complete'; w.downloads.get(1).bytesReceived=1000;
  assert.equal((await w.message({action:'status',id:1})).state,'complete');
  w.downloads.get(1).mime='text/html';
  assert.equal((await w.message({action:'status',id:1})).ok,false);
  w.downloads.get(1).byExtensionId='other-extension';
  assert.equal((await w.message({action:'cancel',id:1})).ok,false);
});
