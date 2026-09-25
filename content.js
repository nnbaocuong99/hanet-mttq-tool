(function () {
  'use strict';
  const Core = window.HanetMttqCore, DOM = window.HanetMttqDOM;
  if (!Core || !DOM || window !== window.top) return;
  const PLACE = '997606', PREFIX = `/${PLACE}/`;
  const state = {route: '', host: null, ui: null, data: null, early: null, busy: false, cancel: false, direction: 'desc', cardView: null, dialogView: null};
  const styleMemo = new Map();
  let scheduled = false, lastEarlySignature = '', lastEarlyUnits = [];
  const styles = `
    :host{display:block;flex:none;width:100%;font-family:Arial,Helvetica,sans-serif;color:#18324f;box-sizing:border-box;color-scheme:light}
    *{box-sizing:border-box} [hidden]{display:none!important} .panel{margin:0 0 16px;padding:18px 20px;border:1px solid #afc9e6;border-left:4px solid #2366ad;border-radius:10px;background:#f4f8fd}
    h2{margin:0;font-size:18px;line-height:1.4;font-weight:700} .head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .tag{font-size:12px;color:#536980}p{font-size:14px;line-height:1.6;margin:8px 0 0}.actions{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-top:14px}
    label{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:600;min-width:190px;max-width:100%}
    button,select{font:inherit;font-size:14px;line-height:1.4;border-radius:6px;padding:9px 12px;border:1px solid #a2bbd7;min-height:40px;color:#18324f;background:#fff;max-width:100%}
    select{min-width:210px;max-width:min(460px,100%)}button{cursor:pointer;font-weight:600}button.primary{background:#175da4;color:white;border-color:#175da4}
    button:hover:enabled{filter:brightness(.94)}button:disabled,select:disabled{opacity:.55;cursor:default}button:focus-visible,select:focus-visible{outline:3px solid #438fda;outline-offset:2px}
    .status{min-height:23px;color:#355d82}.status.error{color:#a72c29}.status.ok{color:#1c634c}.preview{margin-top:12px;overflow:auto;max-height:260px;border-radius:6px}
    table{border-collapse:collapse;width:100%;font-size:14px;background:white}th,td{padding:9px 12px;border:1px solid #d5e0ec;text-align:left;line-height:1.45}th{background:#e7eff9;font-weight:600;white-space:nowrap}
    .foot{color:#536980;font-size:13px}.compact{display:flex;align-items:center;gap:8px;font-size:14px;margin:0 0 12px}.compact label{display:block;min-width:auto}.compact select{min-width:0;padding:6px 8px;min-height:34px}
    .arrival{display:flex;align-items:center;gap:12px;min-height:53px;border-bottom:1px solid #d8e3f0;font-size:14px;line-height:1.45}.arrival:last-child{border-bottom:0}.arrival time{font-variant-numeric:tabular-nums;font-weight:700;color:#175da4;flex:none}.arrival span{min-width:0;overflow-wrap:anywhere}.caption{margin:0 0 8px;color:#355d82;font-size:13px}
    @media(prefers-color-scheme:dark){.panel{background:#18273a;border-color:#3f6386}:host{color:#e5eef9}.tag,.foot,.status,.caption{color:#b3cae4}button,select,table{background:#213349;color:#e5eef9;border-color:#52708e}th{background:#2b4261}td,th{border-color:#46607c}.arrival{border-color:#3c5775}.arrival time{color:#91c8ff}.status.error{color:#ffadab}.status.ok{color:#9ddbbb}}
    @media(max-width:600px){.panel{padding:14px}.actions{align-items:stretch}.actions label{width:100%;max-width:100%}select{width:100%;max-width:100%;min-width:0}.actions button{flex:1}th,td{padding:8px}}
  `;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const routeName = () => location.pathname === `${PREFIX}person/checkin` ? 'report' : location.pathname === `${PREFIX}dashboard` ? 'dashboard' : '';
  const vnTime = date => new Intl.DateTimeFormat('vi-VN', {timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'medium'}).format(date);
  function status(message, kind = '') {
    if (!state.ui) return;
    state.ui.status.textContent = message;
    state.ui.status.className = `status ${kind}`;
  }
  function rememberStyle(node, property, value) {
    if (!styleMemo.has(node)) styleMemo.set(node, new Map());
    const saved = styleMemo.get(node);
    if (!saved.has(property)) saved.set(property, {value: node.style.getPropertyValue(property), priority: node.style.getPropertyPriority(property)});
    if (node.style.getPropertyValue(property) !== value) node.style.setProperty(property, value, 'important');
  }
  function restoreStyles() {
    styleMemo.forEach((saved, node) => saved.forEach((old, property) => {
      if (old.value) node.style.setProperty(property, old.value, old.priority); else node.style.removeProperty(property);
    }));
    styleMemo.clear();
  }
  function forgetDisconnectedStyles() {
    for (const node of styleMemo.keys()) if (!node.isConnected) styleMemo.delete(node);
  }
  function removeCardView() {
    state.cardView?.remove(); state.cardView = null;
    for (const [node, saved] of styleMemo) {
      if (saved.has('display') && !node.closest('[role="dialog"]')) {
        const old = saved.get('display');
        if (old.value) node.style.setProperty('display', old.value, old.priority); else node.style.removeProperty('display');
        saved.delete('display');
        if (!saved.size) styleMemo.delete(node);
      }
    }
  }
  function resetData(message) {
    state.data = null;
    if (state.route !== 'report' || !state.ui) return;
    state.ui.department.replaceChildren(new Option('Chọn phòng ban sau khi đọc dữ liệu', ''));
    state.ui.department.disabled = true;
    state.ui.export.disabled = true;
    state.ui.preview.replaceChildren();
    state.ui.foot.textContent = '';
    if (message) status(message);
  }
  function busy(value) {
    state.busy = value;
    if (!state.ui) return;
    state.ui.read.disabled = value;
    state.ui.cancel.hidden = !value;
    if (state.ui.department) state.ui.department.disabled = value || !state.data;
    if (state.ui.export) state.ui.export.disabled = value || !selectedDepartment();
    if (state.ui.direction) state.ui.direction.disabled = value;
  }
  function mount() {
    const route = routeName();
    if (route !== state.route || (state.host && !state.host.isConnected)) {
      state.cancel = true;
      state.host?.remove(); state.dialogView?.remove(); removeCardView(); restoreStyles();
      state.host = null; state.ui = null; state.data = null; state.early = null; state.dialogView = null;
      state.route = route; lastEarlySignature = ''; lastEarlyUnits = [];
    }
    if (!route || state.host || state.busy) return;
    const source = route === 'report' ? DOM.findTable(document) : DOM.earlyCard(document);
    const main = source?.closest('main');
    if (!main) return;
    const host = document.createElement('div'); host.id = 'hanet-mttq-helper';
    const shadow = host.attachShadow({mode:'open'});
    shadow.innerHTML = `<style>${styles}</style><section class="panel" aria-label="Tiện ích điểm danh MTTQ"><div class="head"><h2>${route === 'report' ? 'Xuất điểm danh theo ban' : 'Sắp xếp FaceID đi sớm'}</h2><span class="tag">MTTQ · v0.3.1</span></div><p>${route === 'report' ? 'Chọn khoảng thời gian trong HANET, sau đó đọc danh sách và chọn phòng ban cần xuất.' : 'Giờ đến mới nhất đứng trước trong nhóm đi sớm của ngày đang xem.'}</p><div class="actions"><button class="primary" id="read">${route === 'report' ? '1. Đọc đủ các trang' : 'Cập nhật đi sớm'}</button>${route === 'report' ? '<label>2. Phòng ban<select id="department" disabled><option>Chọn phòng ban sau khi đọc dữ liệu</option></select></label><button id="export" disabled>3. Xuất Excel</button>' : '<label>Thứ tự giờ đến<select id="direction"><option value="desc">Mới nhất trước</option><option value="asc">Sớm nhất trước</option></select></label>'}<button id="cancel" hidden>Hủy</button></div><p id="status" class="status" role="status" aria-live="polite"></p><div id="preview" class="preview"></div><p id="foot" class="foot"></p></section>`;
    state.host = host;
    state.ui = Object.fromEntries(['read','department','export','direction','cancel','status','preview','foot'].map(id => [id,shadow.getElementById(id)]));
    main.prepend(host);
    state.ui.cancel.addEventListener('click', () => {state.cancel = true; status('Đang hủy…');});
    state.ui.read.addEventListener('click', route === 'report' ? collectReport : refreshEarly);
    if (route === 'report') {
      state.ui.department.addEventListener('change', showDepartment);
      state.ui.export.addEventListener('click', exportDepartment);
      status('Đọc toàn bộ các trang để lập danh sách phòng ban đầy đủ.');
    } else {
      state.ui.direction.value = state.direction;
      state.ui.direction.addEventListener('change', () => setDirection(state.ui.direction.value));
      status('Bấm “Cập nhật đi sớm” hoặc mở “Xem thêm” trong thẻ đi sớm.');
    }
  }
  function requireContext(route) {
    if (state.cancel) throw new Error('Đã hủy. Chưa tạo file xuất.');
    if (routeName() !== route || !state.host?.isConnected) throw new Error('Đã chuyển màn hình. Vui lòng thực hiện lại.');
    if (route === 'report') {
      const search = document.querySelector('input[placeholder="Tìm Face"]');
      if (search && search.value.trim()) throw new Error('Hãy xóa nội dung ô “Tìm Face” của HANET rồi đọc lại để lấy đủ danh sách.');
    }
  }
  function idsOf(page) {return page.records.map(r => r.id).join('|');}
  async function stablePage(pageNumber, previousIds = null, headerKey = null, totalPages = null) {
    const deadline = Date.now() + 20000;
    let previous = '', stableSince = 0, lastError = '';
    while (Date.now() < deadline) {
      requireContext('report');
      let page;
      try {page = DOM.readPage(document, PLACE);} catch (error) {lastError = error.message;}
      if (page) {
        if (headerKey && JSON.stringify(page.headers) !== headerKey) throw new Error('Khoảng ngày đã thay đổi. Hãy đọc lại dữ liệu.');
        if (totalPages !== null && page.totalPages !== totalPages) throw new Error('Số trang đã thay đổi. Hãy đọc lại dữ liệu.');
        const valid = page.page === pageNumber && page.records.length > 0 && (page.page === page.totalPages || page.records.length === page.pageSize) && (previousIds === null || idsOf(page) !== previousIds);
        const signature = valid ? JSON.stringify(page) : '';
        if (signature && signature === previous) {
          if (Date.now() - stableSince >= 650) return page;
        } else {previous = signature; stableSince = Date.now();}
      }
      await sleep(180);
    }
    throw new Error(`HANET chưa tải xong trang ${pageNumber}. ${lastError || 'Hãy thử đọc lại.'}`);
  }
  async function collectReport() {
    if (state.busy) return;
    state.cancel = false;
    resetData(); busy(true);
    try {
      requireContext('report');
      if (document.querySelector('[role="dialog"]')) throw new Error('Hãy đóng bảng chi tiết đang mở rồi đọc lại.');
      const expected = DOM.rosterCount(document, PLACE);
      let pager = DOM.pager(document), oldIds = null;
      if (pager.page !== 1) {
        oldIds = idsOf(DOM.readPage(document, PLACE));
        if (!pager.first || pager.first.disabled) throw new Error('Không thể chuyển về trang đầu.');
        pager.first.click();
      }
      status('Đang đọc trang 1… Giữ nguyên khoảng thời gian và bộ lọc trong lúc đọc.');
      const first = await stablePage(1, oldIds);
      const headerKey = JSON.stringify(first.headers), pages = [first], count = first.totalPages;
      if (count > 250) throw new Error('Báo cáo có quá nhiều trang cho bản tiện ích này. Hãy tăng số hàng trên mỗi trang.');
      for (let n = 2; n <= count; n++) {
        requireContext('report');
        pager = DOM.pager(document);
        if (pager.page !== n - 1 || !pager.next || pager.next.disabled) throw new Error('Không tìm thấy trang kế tiếp. Hãy đọc lại.');
        const previousIds = idsOf(pages[pages.length - 1]);
        pager.next.click(); status(`Đang đọc trang ${n}/${count}…`);
        pages.push(await stablePage(n, previousIds, headerKey, count));
      }
      requireContext('report');
      const countNow = DOM.rosterCount(document, PLACE);
      if (countNow !== expected) throw new Error('Danh sách FaceID đã thay đổi trong lúc đọc. Hãy đọc lại.');
      const data = Core.assemblePages(pages, expected);
      data.collectedAt = new Date(); data.headerKey = headerKey;
      const finalPager = DOM.pager(document);
      if (finalPager.page > 1 && finalPager.first && !finalPager.first.disabled) {
        finalPager.first.click();
        await stablePage(1, idsOf(pages[pages.length - 1]), headerKey, count);
      }
      requireContext('report');
      state.data = data;
      state.ui.department.replaceChildren(new Option('Chọn phòng ban cần xuất', ''));
      Core.departmentOptions(data).forEach((item, i) => {
        const option = new Option(`${item.label} (${item.count} FaceID)`, String(i + 1));
        option.dataset.department = item.value; state.ui.department.append(option);
      });
      status(`Đã đọc đủ ${data.records.length} FaceID · ${count} trang · ${Core.departmentOptions(data).length} phòng ban/nhóm.`, 'ok');
      state.ui.foot.textContent = `Dữ liệu lúc ${vnTime(data.collectedAt)}. File giữ nguyên cặp giờ của từng ngày trong bảng Vào ra.`;
    } catch (error) {
      resetData(); status(error.message, 'error');
    } finally {busy(false);}
  }
  function selectedDepartment() {
    const option = state.ui?.department?.selectedOptions?.[0];
    return option?.hasAttribute('data-department') ? {value: option.dataset.department} : null;
  }
  function showDepartment() {
    const selected = selectedDepartment();
    state.ui.preview.replaceChildren();
    state.ui.export.disabled = state.busy || !selected;
    if (!selected || !state.data) return;
    const rows = Core.filterDepartment(state.data, selected.value);
    const data = state.data;
    const indices = [data.headers.indexOf('Họ tên'), data.headers.indexOf('MSNV'), data.headers.indexOf('Phòng ban'), data.headers.length - 1];
    const table = document.createElement('table'), head = document.createElement('thead'), body = document.createElement('tbody');
    const hrow = document.createElement('tr');
    indices.forEach(i => {const th = document.createElement('th'); th.textContent = data.headers[i]; th.scope = 'col'; hrow.append(th);}); head.append(hrow);
    rows.slice(0, 6).forEach(row => {const tr = document.createElement('tr'); indices.forEach(i => {const td = document.createElement('td'); td.textContent = row.values[i]; tr.append(td);}); body.append(tr);});
    table.append(head, body); state.ui.preview.append(table);
    status(`${selected.value || 'Chưa phân phòng ban'}: ${rows.length} FaceID. Xem trước ${Math.min(6, rows.length)} người; file Excel gồm đủ ${rows.length} người và tất cả các cột ngày.`, 'ok');
  }
  function exportDepartment() {
    try {
      requireContext('report');
      if (state.busy || !state.data) throw new Error('Hãy đọc dữ liệu trước khi xuất.');
      const selected = selectedDepartment();
      if (!selected) throw new Error('Hãy chọn phòng ban cần xuất.');
      const current = DOM.readPage(document, PLACE), data = state.data;
      const currentCount = DOM.rosterCount(document, PLACE);
      if (JSON.stringify(current.headers) !== data.headerKey || (Number.isInteger(currentCount) && currentCount !== data.records.length)) throw new Error('Dữ liệu hoặc khoảng thời gian đã đổi. Hãy đọc lại trước khi xuất.');
      const records = Core.filterDepartment(data, selected.value);
      if (!records.length) throw new Error('Phòng ban này không có dữ liệu để xuất.');
      const dates = data.headers.filter(h => /^\d{2}-\d{2}$/.test(h));
      const bytes = Core.makeXlsx([
        {name:'Điểm danh theo ban', widths:[24,30,18,48,38,...dates.map(() => 19)], rows:[['FaceID',...data.headers],...records.map(r => [r.id,...r.values])]},
        {name:'Thông tin báo cáo', filter:false, widths:[30,110], rows:[['Nội dung','Giá trị'],['Phòng ban',selected.value || 'Chưa phân phòng ban'],['Số FaceID',String(records.length)],['Nguồn','HANET Connect · địa điểm 997606 · bảng Vào ra'],['Các cột ngày',dates.join(', ')],['Thời điểm đọc',vnTime(data.collectedAt)],['Múi giờ hiển thị','Theo HANET; thời điểm đọc ghi theo giờ Việt Nam'],['Phạm vi dữ liệu','Giữ nguyên các cặp giờ trong bảng Vào ra, không phải nhật ký tất cả các lượt nhận diện.'],['Cột ngày','Giữ nguyên nhãn ngày-tháng của HANET, không tự suy diễn năm.'],['Lưu ý','Dữ liệu trong ngày có thể tiếp tục thay đổi. Cặp giờ trên màn hình không xác nhận một người đã kết thúc ngày làm việc.']]}
      ]);
      const blob = new Blob([bytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `Diem_danh_${Core.filenamePart(selected.value)}_${dates[0]}_${dates[dates.length - 1]}.xlsx`;
      state.ui.preview.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      status(`Đã tạo file Excel gồm ${records.length} FaceID của ${selected.value || 'nhóm chưa phân phòng ban'}.`, 'ok');
    } catch (error) {status(error.message, 'error');}
  }
  function setDirection(direction) {
    state.direction = direction === 'asc' ? 'asc' : 'desc';
    if (state.ui?.direction) state.ui.direction.value = state.direction;
    const dialogSelect = state.dialogView?.shadowRoot?.querySelector('select');
    if (dialogSelect) dialogSelect.value = state.direction;
    lastEarlySignature = ''; lastEarlyUnits = [];
    updateEarly();
    if (state.early) drawEarlyCard();
  }
  function drawEarlyCard() {
    const card = DOM.earlyCard(document), data = state.early;
    if (!card || !data || !data.rows.length) {removeCardView(); return;}
    const key = DOM.dashboardKey(document);
    if (key.date !== data.date || key.count !== data.count) {state.early = null; removeCardView(); return;}
    const nativeList = Array.from(card.children).find(el => Array.from(el.querySelectorAll('p')).some(p => Core.timeSeconds(DOM.text(p)) !== null));
    if (!nativeList) return;
    rememberStyle(nativeList, 'display', 'none');
    if (!state.cardView?.isConnected || state.cardView.parentElement !== card) {
      state.cardView?.remove();
      state.cardView = document.createElement('div');
      state.cardView.attachShadow({mode:'open'});
      card.insertBefore(state.cardView, nativeList);
    }
    const shadow = state.cardView.shadowRoot;
    shadow.innerHTML = `<style>${styles}</style><p class="caption"></p><div class="list"></div>`;
    shadow.querySelector('.caption').textContent = state.direction === 'desc' ? 'Giờ đến mới nhất trước' : 'Giờ đến sớm nhất trước';
    Core.sortArrivals(data.rows, state.direction).slice(0, 5).forEach(row => {
      const item = document.createElement('div'); item.className = 'arrival';
      const time = document.createElement('time'); time.textContent = row.time;
      const name = document.createElement('span'); name.textContent = row.name;
      item.append(time, name); shadow.querySelector('.list').append(item);
    });
  }
  function updateEarly() {
    if (state.route !== 'dashboard') return;
    const key = DOM.dashboardKey(document);
    if (state.early && (state.early.date !== key.date || state.early.count !== key.count)) {
      state.early = null; lastEarlySignature = ''; lastEarlyUnits = []; removeCardView();
      status('Ngày hoặc số người đã thay đổi. Bấm “Cập nhật đi sớm” để đọc danh sách mới.');
    }
    const details = DOM.readEarlyDialog(document);
    forgetDisconnectedStyles();
    if (!details || !details.items.length) {
      if (state.dialogView && !state.dialogView.isConnected) state.dialogView = null;
      lastEarlySignature = ''; lastEarlyUnits = [];
      return false;
    }
    if (key.count === null || details.items.length !== key.count) return false;
    if (!details.sortContainer || details.items.some(item => !item.sortNode)) {
      status('Không xác định được vùng danh sách đi sớm của HANET.', 'error');
      return false;
    }
    const signature = JSON.stringify([key, state.direction, details.items.map(item => [item.time,item.name])]);
    const sameUnits = lastEarlyUnits.length === details.items.length && details.items.every((item, index) => item.sortNode === lastEarlyUnits[index]);
    if (signature === lastEarlySignature && sameUnits && state.cardView?.isConnected && state.dialogView?.isConnected) return true;
    lastEarlySignature = signature;
    lastEarlyUnits = details.items.map(item => item.sortNode);
    rememberStyle(details.sortContainer, 'display', 'flex'); rememberStyle(details.sortContainer, 'flex-direction', 'column');
    Core.sortArrivals(details.items, state.direction).forEach((item, i) => rememberStyle(item.sortNode, 'order', String(i)));
    if (!state.dialogView?.isConnected || !details.dialog.contains(state.dialogView)) {
      state.dialogView?.remove(); state.dialogView = document.createElement('div');
      const shadow = state.dialogView.attachShadow({mode:'open'});
      shadow.innerHTML = `<style>${styles}</style><div class="compact"><label for="sort">Giờ đến</label><select id="sort"><option value="desc">Mới nhất trước</option><option value="asc">Sớm nhất trước</option></select></div>`;
      shadow.querySelector('select').value = state.direction;
      shadow.querySelector('select').addEventListener('change', e => setDirection(e.target.value));
      const heading = details.dialog.querySelector('h2'); heading.after(state.dialogView);
    }
    state.early = {...key, rows:details.items.map(({time,name}) => ({time,name})), collectedAt:new Date()};
    drawEarlyCard();
    if (!state.busy) status(`Đã sắp xếp đủ ${state.early.rows.length} FaceID đi sớm ngày ${key.date}.`, 'ok');
    if (state.ui) state.ui.foot.textContent = `Dữ liệu lúc ${vnTime(state.early.collectedAt)}. Bấm cập nhật khi cần đọc lại danh sách.`;
    return true;
  }
  async function refreshEarly() {
    if (state.busy) return;
    state.cancel = false; busy(true);
    let openedHere = false;
    try {
      requireContext('dashboard');
      const key = DOM.dashboardKey(document), card = DOM.earlyCard(document);
      if (!card || !key.date || key.count === null) throw new Error('HANET đang tải tổng quan. Vui lòng thử lại.');
      if (!key.count) {state.early = null; removeCardView(); status('Ngày này chưa có FaceID đi sớm.'); return;}
      const existing = DOM.earlyDialog(document);
      if (!existing && document.querySelector('[role="dialog"]')) throw new Error('Hãy đóng bảng chi tiết khác trước khi cập nhật đi sớm.');
      if (!existing) {card.click(); openedHere = true;}
      status('Đang đọc đầy đủ danh sách đi sớm…');
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        requireContext('dashboard');
        const now = DOM.dashboardKey(document);
        if (now.date !== key.date || now.count !== key.count) throw new Error('Ngày hoặc dữ liệu đã thay đổi. Hãy cập nhật lại.');
        const details = DOM.readEarlyDialog(document);
        if (details && details.items.length === key.count) {
          lastEarlySignature = ''; lastEarlyUnits = [];
          if (!updateEarly() || !state.early) throw new Error('Chưa thể áp dụng thứ tự cho danh sách đi sớm.');
          status(`Đã sắp xếp đủ ${key.count} FaceID; ${state.direction === 'desc' ? 'giờ đến mới nhất' : 'giờ đến sớm nhất'} đứng trước.`, 'ok');
          return;
        }
        await sleep(200);
      }
      throw new Error('HANET chưa tải đủ danh sách đi sớm. Hãy thử lại.');
    } catch (error) {status(error.message, 'error');}
    finally {
      if (openedHere && routeName() === 'dashboard') {
        const dialog = DOM.earlyDialog(document);
        const close = dialog && Array.from(dialog.querySelectorAll('button')).find(b => DOM.text(b) === 'Close');
        close?.click();
      }
      busy(false);
    }
  }
  function tick() {
    scheduled = false; mount();
    if (state.route === 'dashboard') updateEarly();
    if (state.route === 'report' && state.data && !state.busy) {
      const table = DOM.findTable(document);
      const headers = table && Array.from(table.tHead.rows[0].cells, DOM.text).filter(h => h !== 'Ảnh');
      if (!headers || JSON.stringify(headers) !== state.data.headerKey) resetData('Khoảng ngày đã thay đổi. Hãy đọc lại dữ liệu.');
    }
  }
  function schedule() {if (!scheduled) {scheduled = true; setTimeout(tick, 180);}}
  new MutationObserver(schedule).observe(document.documentElement, {childList:true,subtree:true,characterData:true});
  // Any manual filter/date interaction invalidates an exported snapshot, even when
  // a different year happens to have the same day-month column labels.
  document.addEventListener('click', event => {
    if (state.route !== 'report' || !state.data || state.busy || event.composedPath().includes(state.host)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('main') && !target.closest('table')) resetData('Đã thao tác trên HANET. Hãy đọc lại dữ liệu trước khi xuất.');
  }, true);
  document.addEventListener('input', event => {
    if (event.target instanceof Element && event.target.matches('input[placeholder="Tìm Face"]')) {
      if (state.busy) state.cancel = true;
      resetData('Bộ lọc tìm kiếm đã thay đổi. Xóa ô “Tìm Face” rồi đọc lại để xuất đủ dữ liệu.');
    }
  }, true);
  window.addEventListener('popstate', schedule);
  setInterval(schedule, 1000);
  schedule();
})();
