(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./video-core.js'), require('./video-dom.js'));
  else if (root === root.top) factory(root.HanetMttqVideoCore, root.HanetMttqVideoDOM).createController(root).start();
})(typeof window === 'undefined' ? this : window, function (Core, DOM) {
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
    const settings = {poll:120,settle:500,resolveTimeout:20000,downloadTimeout:180000,...adapters.timings};
    const delay = ms => new Promise(resolve => win.setTimeout(resolve, ms));
    const state = {ctx:null,host:null,ui:null,items:new Map(),views:new Map(),selected:new Set(),results:new Map(),run:null};
    let observer, interval, scheduled = false, alive = false;
    const send = adapters.send || (message => new Promise((resolve,reject) => {
      try {
        if (!win.chrome?.runtime?.id) throw new Error('Hãy nạp lại tiện ích và nhấn F5 trên trang HANET.');
        win.chrome.runtime.sendMessage({type:'HANET_MTTQ_VIDEO',...message}, result => {
          const error = win.chrome.runtime.lastError;
          if (error) reject(new Error('Không liên lạc được tiện ích. Hãy nạp lại tiện ích rồi nhấn F5.'));
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
      setText(state.ui.download, `Tải đã chọn (${selectedCount})`);
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
      const host = doc.createElement('div'); host.id = 'hanet-mttq-video-helper'; host.dataset.hanetVideoTools = 'panel';
      const shadow = host.attachShadow({mode:'open'});
      shadow.innerHTML = `<style>${CSS}</style><section class="panel" aria-label="Tải video trong popup"><h3>Tải video trong ngày<span class="tag">v0.3.1</span></h3><p class="note">Tích ô cạnh giờ, rồi tải các video đã chọn.</p><div class="actions"><button id="all" type="button">Chọn tất cả</button><button id="clear" type="button">Bỏ chọn</button><button id="download" type="button" class="primary" disabled>Tải đã chọn (0)</button><button id="stop" type="button" hidden>Dừng tải</button></div><p id="count" class="count"></p><p id="status" class="status" role="status" aria-live="polite">Đang đọc các mốc trong popup…</p><ul id="errors" class="error" hidden></ul></section>`;
      state.host = host;
      state.ui = Object.fromEntries(['all','clear','download','stop','count','status','errors'].map(id => [id,shadow.getElementById(id)]));
      state.ui.all.onclick = () => { for (const key of state.items.keys()) state.selected.add(key); update(); };
      state.ui.clear.onclick = () => { state.selected.clear(); update(); };
      state.ui.download.onclick = () => runBatch(Array.from(state.selected));
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
        check.onchange = () => { if (check.checked) state.selected.add(item.key); else state.selected.delete(item.key); update(); };
        button.onclick = () => runBatch([item.key]);
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
        stop(); removeUI(); state.items.clear(); state.selected.clear(); state.results.clear(); state.ctx = ctx;
      }
      if (!ctx) return;
      mount();
      const items = DOM.timeline(doc,ctx.panel);
      state.items = new Map(items.map(item=>[item.key,item]));
      for (const [key,view] of state.views) {
        if (!state.items.has(key)) { view.host.remove(); state.views.delete(key); }
      }
      items.forEach(decorate); update();
      const managedHosts = new Set(Array.from(state.views.values(),view=>view.host));
      for (const host of doc.querySelectorAll('[data-hanet-video-tools="row"]')) {
        if (!managedHosts.has(host)) host.remove();
      }
      if (!state.run && !state.results.size && state.ui) {
        status(items.length ? 'Bấm Tải cạnh giờ để tải riêng từng video.' : 'Đang chờ HANET hiển thị các mốc của ngày này.');
      }
    }
    function schedule() {
      if (!alive || scheduled) return;
      scheduled = true; win.setTimeout(scan,180);
    }
    async function stop() {
      const run = state.run;
      if (!run || run.cancelled) return;
      run.cancelled = true;
      status('Đang dừng tải…','',run);
      if (run.downloadId !== null) {
        try { await send({action:'cancel',id:run.downloadId}); } catch (_) {}
      }
    }
    function snapshotPlayers() {
      const map = new Map();
      for (const video of doc.querySelectorAll('video')) {
        const source = DOM.source(video);
        map.set(video,source?.url || '');
      }
      return map;
    }
    async function resolveSource(item,run) {
      const direct = DOM.source(item.row);
      if (direct) return direct;
      const baseline = new Set(DOM.dialogs(doc,true));
      if (Array.from(baseline).some(dialog => dialog !== run.ctx.panel && !dialog.contains(run.ctx.panel))) throw new Error('Hãy đóng cửa sổ xem ảnh/video, giữ popup danh sách mốc mở rồi tải lại.');
      const before = snapshotPlayers();
      const oldURLs = new Set(Array.from(before.values()).filter(Boolean));
      const opened = new Set(), activated = new Set();
      let stableURL = '', stableAt = 0;
      run.opened = opened;
      item.target.click();
      const deadline = Date.now() + settings.resolveTimeout;
      while (Date.now() < deadline) {
        assertActive(run);
        for (const dialog of DOM.dialogs(doc,true)) if (!baseline.has(dialog)) opened.add(dialog);
        const candidates = [];
        for (const dialog of opened) {
          const heading = dialog.querySelector('h2');
          // Adjacent native spans have no text separator (time + camera name).
          // Read the time leaf rather than applying a regex to concatenated text.
          const headingTimes = Array.from(heading?.querySelectorAll('time,span,p,div,li') || [])
            .map(node => Core.clock(DOM.text(node))).filter(Boolean);
          if (headingTimes.length && !headingTimes.includes(item.time)) continue;
          const candidate = DOM.source(dialog);
          if (candidate && !oldURLs.has(candidate.url) && !candidates.some(c=>c.url===candidate.url)) candidates.push(candidate);
          if (!candidate) {
            const play = DOM.playControl(dialog);
            if (play && !activated.has(play)) { activated.add(play); play.click(); }
          }
        }
        const urls = new Set(candidates.map(candidate=>candidate.url));
        if (urls.size > 1) throw new Error('Có nhiều video cùng mở. Đóng các trình phát rồi tải riêng mốc này.');
        const candidate = candidates[0];
        if (candidate) {
          if (candidate.url !== stableURL) { stableURL = candidate.url; stableAt = Date.now(); }
          if (Date.now() - stableAt >= settings.settle) return candidate;
        } else { stableURL = ''; stableAt = 0; }
        await delay(settings.poll);
      }
      throw new Error('HANET chưa cung cấp video cho mốc này. Hãy thử mở mốc trên HANET để kiểm tra, rồi tải lại.');
    }
    async function validateSource(source,run) {
      let kind = Core.mediaKind(source.url,source.mime);
      if (kind === 'stream') throw new Error('Mốc này dùng luồng HLS/DASH. Bản này chưa ghép luồng thành file video.');
      if (kind === 'blob') {
        // Fetching a real Blob succeeds; MediaSource object URLs are not files.
        // Read only the headers here, not the video into extension memory.
        const controller = new win.AbortController();
        const timeout = win.setTimeout(()=>controller.abort(),12000);
        try {
          const response = await win.fetch(source.url,{signal:controller.signal});
          const mime = response.headers.get('Content-Type') || '';
          if (!response.ok || !/^video\//i.test(mime)) throw new Error('not-a-file');
          kind = Core.mediaKind(source.url,mime);
          if (kind === 'blob') kind = 'mp4';
          await response.body?.cancel();
        } catch (_) { throw new Error('Trình phát đang dùng luồng blob không tải trực tiếp được. Bản này cần nguồn file video.'); }
        finally { win.clearTimeout(timeout); }
      }
      assertActive(run);
      return kind;
    }
    async function waitDownload(id,run) {
      const deadline = Date.now() + settings.downloadTimeout;
      while (Date.now() < deadline) {
        assertActive(run);
        const info = await send({action:'status',id});
        if (info.state === 'complete') return;
        if (info.state === 'interrupted') throw new Error('Tải bị gián đoạn' + (info.error ? ' (' + info.error + ')' : '') + '. Hãy mở lại mốc rồi thử tải lại.');
        await delay(Math.max(settings.poll,350));
      }
      throw new Error('Tải quá thời gian chờ. Hãy kiểm tra kết nối rồi tải lại mốc này.');
    }
    async function closeOpened(run) {
      for (const dialog of Array.from(run.opened || []).reverse()) {
        if (!dialog.isConnected || !DOM.rendered(dialog)) continue;
        const close = DOM.closeControl(dialog);
        if (close) close.click();
        else if (dialog.matches('dialog') && typeof dialog.close === 'function') dialog.close();
      }
      // Allow closing animations to unmount before opening the next video.
      const deadline = Date.now() + 1500;
      while (Date.now() < deadline && Array.from(run.opened || []).some(dialog => DOM.rendered(dialog))) await delay(settings.poll);
      run.opened = null;
    }
    async function runBatch(keys) {
      if (state.run || !keys.length || !state.ctx) return;
      const run = {ctx:{...state.ctx},cancelled:false,downloadId:null,opened:null};
      state.run = run;
      state.ui.errors.replaceChildren(); state.ui.errors.hidden = true;
      update();
      let done = 0, failed = 0;
      try {
        for (let index = 0; index < keys.length; index++) {
          assertActive(run);
          const key = keys[index];
          const item = DOM.timeline(doc,run.ctx.panel).find(candidate=>candidate.key===key);
          const time = item?.time || 'Mốc đã chọn';
          try {
            if (!item) throw new Error('Mốc đã chọn không còn hiển thị. Cuộn đến mốc hoặc chọn lại rồi tải lại.');
            status(`Đang lấy video ${index + 1}/${keys.length} · ${time}…`,'',run);
            const source = await resolveSource(item,run);
            const kind = await validateSource(source,run);
            assertActive(run);
            const result = await send({action:'start',url:source.url,filename:Core.filename(run.ctx,item,kind)});
            run.downloadId = result.id;
            // A click on Stop while the background was starting must cancel the
            // newly created download too, before proceeding to any next item.
            assertActive(run);
            status(`Đang tải video ${index + 1}/${keys.length} · ${time}…`,'',run);
            await waitDownload(result.id,run);
            assertActive(run);
            run.downloadId = null;
            done++;
            state.results.set(key,{kind:'ok',message:'Đã tải xong video lúc ' + time});
            state.selected.delete(key);
          } catch (error) {
            if (run.downloadId !== null) {
              try { await send({action:'cancel',id:run.downloadId}); } catch (_) {}
              run.downloadId = null;
            }
            if (run.cancelled || currentContext()?.key !== run.ctx.key || currentContext()?.panel !== run.ctx.panel) throw new Error('Đã dừng tải.');
            failed++;
            state.results.set(key,{kind:'error',message:error.message});
            if (state.ui && state.ctx?.key === run.ctx.key) {
              const li = doc.createElement('li'); li.textContent = `${time}: ${error.message}`;
              state.ui.errors.append(li); state.ui.errors.hidden = false;
            }
          } finally { await closeOpened(run); update(); }
        }
        status(`Đã tải xong ${done}/${keys.length} video.${failed ? ` ${failed} mốc chưa tải được; xem chi tiết bên dưới.` : ''}`,failed ? 'error' : 'ok',run);
      } catch (_) {
        status(`Đã dừng. Tải xong ${done}/${keys.length} video. Các mốc chưa tải vẫn được giữ chọn.`,'',run);
      } finally {
        state.run = null; update();
      }
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
