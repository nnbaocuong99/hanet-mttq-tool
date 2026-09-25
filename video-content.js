(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./video-core.js'), require('./video-dom.js'), require('./video-job.js'));
  else if (root === root.top && !root.HanetVideoJob.workerId(root.location.href)) factory(root.HanetMttqVideoCore, root.HanetMttqVideoDOM, root.HanetVideoJob).createController(root).start();
})(typeof window === 'undefined' ? this : window, function (Core, DOM, Job) {
  'use strict';
  const CSS = `
    :host{display:block;min-width:0;font:13px/1.45 Arial,Helvetica,sans-serif;color:inherit;color-scheme:inherit}*{box-sizing:border-box}[hidden]{display:none!important}
    .panel{margin:8px 0 0;padding:10px;background:var(--muted,#f4f8fd);border:1px solid var(--border,#cbd8e7);border-radius:8px}
    h3{display:flex;justify-content:space-between;gap:6px;font-size:14px;margin:0}p{margin:5px 0} .actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:8px 0 4px}
    button{font:inherit;cursor:pointer;color:inherit;background:var(--background,#fff);border:1px solid var(--border,#a2bbd7);border-radius:5px;padding:6px 9px;line-height:1.4}
    button.primary{background:#175da4;color:#fff;border-color:#175da4}button:disabled,input:disabled{opacity:.55;cursor:default}
    button:focus-visible,input:focus-visible{outline:3px solid #438fda;outline-offset:2px}.note,.status{font-size:12px}.status{min-height:18px}.count{font-size:12px}
    .error{color:#c43c37}.ok{color:#238361}.inline{display:inline-flex;align-items:center;gap:5px;vertical-align:middle;white-space:nowrap}
    .inline button{font-size:12px;padding:3px 6px;min-height:26px}.inline label{display:inline-flex;align-items:center;cursor:pointer;padding:2px}
    .inline button[data-result="ok"]{color:#238361;border-color:#238361}.inline button[data-result="error"]{color:#c43c37;border-color:#c43c37}
    input{appearance:auto;accent-color:#175da4;width:16px;height:16px;margin:0;flex:none}.tag{font-weight:normal;font-size:11px;opacity:.7}
    #download{flex:1 1 100%}ul{padding-left:18px;max-height:100px;overflow:auto;margin:5px 0}li{font-size:12px;margin:3px 0}
  `;
  const setText = (node,value) => { if (node && node.textContent !== value) node.textContent = value; };
  function createController(win, adapters = {}) {
    const doc = win.document;
    const settings = {poll:700,...adapters.timings};
    const delay = ms => new Promise(resolve => win.setTimeout(resolve, ms));
    const state = {ctx:null,host:null,ui:null,items:new Map(),known:new Map(),views:new Map(),selected:new Set(),results:new Map(),all:false,run:null};
    let observer, interval, scheduled = false, alive = false;
    const send = adapters.send || (message => new Promise((resolve,reject) => {
      try {
        if (!win.chrome?.runtime?.id) throw new Error('Load lại tiện ích và tải lại trang HANET.');
        win.chrome.runtime.sendMessage({type:'HANET_MTTQ_VIDEO',...message}, result => {
          const error = win.chrome.runtime.lastError;
          if (error) reject(new Error('Không kết nối được với được tiện ích. Hãy load lại tiện ích và tải lại trang.'));
          else if (!result?.ok) reject(new Error(result?.error || 'Không nhận được kết quả tải.'));
          else resolve(result);
        });
      } catch (error) { reject(error); }
    }));
    function currentContext() {
      const ctx = Core.context(win.location.href);
      if (!ctx) return null;
      const panel = DOM.timelinePanel(doc);
      if (!panel) return null;
      const label = DOM.panelDate(panel);
      ctx.panel = panel;
      ctx.key += '|' + label;
      if (label) ctx.date = label.split('/').reverse().map(v=>v.padStart(2,'0')).join('-');
      return ctx;
    }
    function status(message, kind = '', run = null) {
      if (!state.ui || (run && state.ctx?.key !== run.ctx.key)) return;
      setText(state.ui.status,message); state.ui.status.className = 'status ' + kind;
    }
    function assertActive(run) {
      const ctx = currentContext();
      if (run.cancelled || !alive || ctx?.key !== run.ctx.key || ctx?.panel !== run.ctx.panel) throw new Error('Đã dừng tải.');
    }
    function update() {
      if (!state.ui) return;
      const busy = !!state.run;
      const selectedCount = state.selected.size;
      setText(state.ui.count, `${state.items.size} mốc đang hiển thị · Đã chọn ${selectedCount}`);
      setText(state.ui.download, `Tải ZIP đã chọn (${selectedCount})`);
      state.ui.download.disabled = busy || !selectedCount;
      state.ui.all.disabled = busy || !state.items.size;
      state.ui.clear.disabled = busy || !selectedCount;
      state.ui.stop.hidden = !busy;
      for (const [key,view] of state.views) {
        view.check.checked = state.selected.has(key);
        view.check.disabled = busy;
        view.button.disabled = busy;
        const result = state.results.get(key);
        view.button.dataset.result = result?.kind || '';
        view.button.title = result?.message || 'Tải video tại mốc ' + view.item.time;
      }
    }
    function mount() {
      const panel = state.ctx?.panel;
      if (!panel || state.host?.isConnected) return;
      const host = doc.createElement('div'); host.id = 'hanet-mttq-tool-video'; host.dataset.hanetVideoTools = 'panel';
      const shadow = host.attachShadow({mode:'open'});
      shadow.innerHTML = `<style>${CSS}</style><section class="panel" aria-label="Tải video trong popup"><h3>Tải video trong ngày<span class="tag">v0.4.0</span></h3><p class="note">Video MP4 H.264, Res tối đa 1080p.</p><div class="actions"><button id="all" type="button">Chọn tất cả</button><button id="clear" type="button">Bỏ chọn</button><button id="download" type="button" class="primary" disabled>Tải xuống file .ZIP gồm những tệp đã chọn (0)</button><button id="stop" type="button" hidden>Dừng tải</button></div><p id="count" class="count"></p><p id="status" class="status" role="status" aria-live="polite">Đang đọc các mốc trong popup…</p><ul id="errors" class="error" hidden></ul></section>`;
      state.host = host;
      state.ui = Object.fromEntries(['all','clear','download','stop','count','status','errors'].map(id => [id,shadow.getElementById(id)]));
      state.ui.all.onclick = () => { state.all=true; for (const key of state.items.keys()) state.selected.add(key); update(); };
      state.ui.clear.onclick = () => { state.all=false; state.selected.clear(); update(); };
      state.ui.download.onclick = () => runBatch(Array.from(state.selected),'zip');
      state.ui.stop.onclick = () => stop();
      DOM.panelHeader(panel).append(host);
    }
    function decorate(item) {
      let view = state.views.get(item.key);
      if (view && (view.item.timeNode !== item.timeNode || !view.host.isConnected)) {
        view.host.remove(); state.views.delete(item.key); view = null;
      }
      if (!view) {
        const host = doc.createElement('span'); host.dataset.hanetVideoTools = 'row';
        host.style.cssText = 'display:block;margin-top:4px;min-width:64px;white-space:nowrap';
        const shadow = host.attachShadow({mode:'open'});
        shadow.innerHTML = `<style>${CSS}</style><span class="inline"><label><input type="checkbox"></label><button type="button">Tải</button></span>`;
        const check = shadow.querySelector('input'), button = shadow.querySelector('button');
        check.setAttribute('aria-label','Chọn video lúc ' + item.time);
        check.title = 'Chọn video lúc ' + item.time;
        button.setAttribute('aria-label','Tải video lúc ' + item.time);
        // Prevent native timeline clicks from opening a second player when selecting.
        for (const event of ['click','dblclick','pointerdown','mousedown','keydown','keyup']) host.addEventListener(event,e=>e.stopPropagation());
        check.onchange = () => { state.all=false; if (check.checked) state.selected.add(item.key); else state.selected.delete(item.key); update(); };
        button.onclick = () => runBatch([item.key],'mp4');
        item.timeNode.append(host);
        view = {host,check,button,item}; state.views.set(item.key,view);
      }
      view.item = item;
    }
    function removeUI() {
      state.host?.remove();
      for (const view of state.views.values()) view.host.remove();
      state.views.clear(); state.host = null; state.ui = null;
    }
    function scan() {
      scheduled = false;
      if (!alive) return;
      const ctx = currentContext();
      if (ctx?.key !== state.ctx?.key || ctx?.panel !== state.ctx?.panel) {
        stop(); removeUI(); state.items.clear(); state.known.clear(); state.selected.clear(); state.results.clear(); state.all=false; state.ctx = ctx;
      }
      if (!ctx) return;
      mount();
      const items = DOM.timeline(doc,ctx.panel);
      state.items = new Map(items.map(item=>[item.key,item]));
      for(const item of items)state.known.set(item.key,{key:item.key,time:item.time});
      for (const [key,view] of state.views) {
        if (!state.items.has(key)) { view.host.remove(); state.views.delete(key); }
      }
      items.forEach(decorate); if(state.all&&!state.run) for(const key of state.items.keys()) state.selected.add(key); update();
      const managedHosts = new Set(Array.from(state.views.values(),view=>view.host));
      for (const host of doc.querySelectorAll('[data-hanet-video-tools="row"]')) {
        if (!managedHosts.has(host)) host.remove();
      }
      if (!state.run && !state.results.size && state.ui) {
        status(items.length ? 'Tải nền dùng một tab HANET và giữ danh sách ngày này mở đến khi xong.' : 'Đang chờ HANET hiển thị các mốc của ngày này.');
      }
    }
    function schedule() {
      if (!alive || scheduled) return;
      scheduled = true; win.setTimeout(scan,180);
    }
    async function stop() {
      const run=state.run;if(!run||run.cancelled)return;
      run.cancelled=true;status('Đang dừng tải…','',run);
      if(run.id){try{await send({action:'cancel',id:run.id});}catch(_){}}
    }
    function applyResults(info,run){
      if(!state.ui||state.ctx?.key!==run.ctx.key)return;
      state.ui.errors.replaceChildren();state.ui.errors.hidden=true;
      for(const result of info.results||[]){
        if(result.kind==='ready')continue;
        state.results.set(result.key,result);
        if(result.kind==='ok')state.selected.delete(result.key);
        if(result.kind==='error'){
          const li=doc.createElement('li');li.textContent=`${result.time}: ${result.message}`;
          state.ui.errors.append(li);state.ui.errors.hidden=false;
        }
      }
      update();
    }
    async function runBatch(keys,output='zip') {
      if(state.run||!keys.length||!state.ctx)return;
      const run={ctx:{...state.ctx},cancelled:false,id:null};state.run=run;
      state.ui.errors.replaceChildren();state.ui.errors.hidden=true;update();
      try{
        assertActive(run);
        const items=keys.map(key=>state.known.get(key)).map(item=>{
          if(!item)throw new Error('Mốc đã chọn không còn hiển thị. Hãy chọn lại.');
          return {key:item.key,time:item.time};
        });
        status('Đang chuẩn bị tải nền…','',run);
        const started=await send({action:'start',faceId:run.ctx.faceId,date:run.ctx.date,items,output,all:output==='zip'&&state.all});
        run.id=started.id;
        assertActive(run);
        while(true){
          assertActive(run);
          const info=await send({action:'status',id:run.id});
          assertActive(run);applyResults(info,run);
          status(info.status,info.state==='failed'?'error':info.state==='complete'?'ok':'',run);
          if(info.state!=='running'){state.all=false;break;}
          await delay(settings.poll);
        }
      }catch(error){
        if(run.id){try{await send({action:'cancel',id:run.id});}catch(_){}}
        status(run.cancelled?'Đã dừng tải. Các mốc chưa lưu vẫn được giữ chọn.':error.message,run.cancelled?'':'error',run);
      }finally{if(state.run===run)state.run=null;update();}
    }
    function start() {
      if (alive) return;
      alive = true;
      observer = new win.MutationObserver(records => {
        if (records.some(record => !record.target.closest?.(DOM.OWN))) schedule();
      });
      observer.observe(doc.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['src','href','data-video-url','data-video-src','hidden','aria-hidden','data-state']});
      win.addEventListener('popstate',schedule);
      win.addEventListener('pagehide',stop);
      interval = win.setInterval(schedule,1000);
      scan();
    }
    function destroy() {
      stop(); alive = false; observer?.disconnect(); win.clearInterval(interval);
      win.removeEventListener('popstate',schedule); win.removeEventListener('pagehide',stop); removeUI();
    }
    return {start,destroy,scan};
  }
  return {createController};
});
