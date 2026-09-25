(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./video-core.js'));
  else root.HanetMttqVideoDOM = factory(root.HanetMttqVideoCore);
})(typeof window === 'undefined' ? this : window, function (Core) {
  'use strict';
  const OWN = '[data-hanet-video-tools]';
  const TIME_NODES = 'time,li,p,span,div,button,a,td,strong';
  const DIALOGS = '[role="dialog"],dialog,[data-slot="dialog-content"],[data-slot="sheet-content"]';
  const text = node => Core.clean(node?.textContent);
  function rendered(node) {
    if (!node?.isConnected || node.closest('[hidden],[data-state="closed"]')) return false;
    for (let el = node; el && el.nodeType === 1; el = el.parentElement) {
      const style = el.ownerDocument.defaultView.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }
  function visible(node) { return rendered(node) && !node.closest('[aria-hidden="true"]'); }
  function panelDate(panel) {
    const heading = panel?.querySelector('[data-slot="sheet-title"],h2');
    const value = text(heading);
    return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value) ? value : '';
  }
  function timelinePanel(doc) {
    // The native date drawer is a Radix portal outside <main>. Its aria-hidden
    // becomes true while a nested photo/video modal is open; keep that drawer.
    const candidates = Array.from(doc.querySelectorAll('[data-slot="sheet-content"],[role="dialog"],dialog'));
    return candidates.find(panel => rendered(panel) && panelDate(panel) &&
      (panel.matches('[data-slot="sheet-content"]') || panel.querySelector('[role="button"] li'))) || null;
  }
  function panelHeader(panel) {
    return panel.querySelector('[data-slot="sheet-header"]') || panel.querySelector('h2')?.parentElement || panel;
  }
  function timeNodes(scope) {
    return Array.from(scope.querySelectorAll(TIME_NODES)).filter(node => {
      if (node.closest(OWN) || !Core.clock(text(node))) return false;
      return !Array.from(node.children).some(child => Core.clock(text(child)));
    });
  }
  function source(scope, allowData = true) {
    if (!scope) return null;
    const videos = scope.matches?.('video') ? [scope] : Array.from(scope.querySelectorAll('video'));
    for (const video of videos) {
      if (!visible(video)) continue;
      const child = video.querySelector('source[src]');
      const raw = video.currentSrc || video.getAttribute('src') || child?.getAttribute('src');
      const url = Core.mediaURL(raw, video.ownerDocument.baseURI);
      if (url) return {url, mime:video.getAttribute('type') || child?.getAttribute('type') || '', video};
    }
    for (const node of scope.querySelectorAll(allowData ? 'a[href],[data-video-url],[data-video-src]' : 'a[href]')) {
      const raw = node.getAttribute('data-video-url') || node.getAttribute('data-video-src') || node.getAttribute('href');
      const url = Core.mediaURL(raw, node.ownerDocument.baseURI), kind = Core.mediaKind(url);
      if (url && (node.hasAttribute('data-video-url') || node.hasAttribute('data-video-src') || ['mp4','webm','mov','ogv','stream'].includes(kind))) return {url,mime:'',video:null};
    }
    for (const attr of ['data-video-url','data-video-src']) {
      const url = allowData && Core.mediaURL(scope.getAttribute?.(attr), scope.ownerDocument.baseURI);
      if (url) return {url,mime:'',video:null};
    }
    return null;
  }
  function timeline(doc, panel = timelinePanel(doc)) {
    if (!panel || !rendered(panel)) return [];
    const times = timeNodes(panel).filter(node => node.closest(DIALOGS) === panel && rendered(node));
    const counts = new Map(), items = [], seen = new Set();
    for (const timeNode of times) {
      let row = null, target = null, node = timeNode;
      const nativeRow = timeNode.closest('[role="button"],button');
      if (nativeRow && panel.contains(nativeRow) && !times.some(other => other !== timeNode && nativeRow.contains(other))) {
        row = nativeRow; target = nativeRow;
      }
      for (let depth = 0; !row && node && node !== panel && depth < 7; depth++, node = node.parentElement) {
        if (times.some(other => other !== timeNode && node.contains(other))) break;
        const interactive = node.matches('button,[role="button"],a[href],[onclick]') || typeof node.onclick === 'function' || /(?:^|\s)(?:[^ ]*:)?cursor-pointer(?:\s|$)/.test(node.className || '');
        const evidence = node.matches('video,[data-video-url],[data-video-src]') || node.querySelector('img,video,[data-video-url],[data-video-src],svg.lucide-video,svg.lucide-play');
        if (interactive) { row = node; target = node; break; }
        if (evidence && !row) { row = node; target = node; }
      }
      if (!row || seen.has(row)) continue;
      if (target.matches('a[href]')) {
        const href = target.getAttribute('href');
        if (href && href !== '#' && !['mp4','webm','mov','ogv'].includes(Core.mediaKind(Core.mediaURL(href,doc.baseURI)))) continue;
      }
      seen.add(row);
      const time = Core.clock(text(timeNode));
      const identified = row.closest('[data-event-id],[data-checkin-id]');
      const identity = identified?.getAttribute('data-event-id') || identified?.getAttribute('data-checkin-id') || row.id || '';
      const image = row.querySelector('img');
      let poster = image?.getAttribute('src') || '';
      // Signed query strings can change on re-render while the event stays the same.
      try { const url = new URL(poster,doc.baseURI); poster = url.origin + url.pathname; } catch (_) {}
      const raw = JSON.stringify([time,identity,text(row),poster]);
      const occurrence = counts.get(raw) || 0; counts.set(raw,occurrence + 1);
      items.push({key:raw + ':' + occurrence,time,timeNode,row,target,panel});
    }
    return items;
  }
  function dayLabel(doc) {
    return panelDate(timelinePanel(doc));
  }
  function dialogs(doc, includeCovered = false) { return Array.from(doc.querySelectorAll(DIALOGS)).filter(includeCovered ? rendered : visible); }
  function closeControl(dialog) {
    return Array.from(dialog.querySelectorAll('button,[role="button"]')).find(button => {
      const label = text(button) || button.getAttribute('aria-label') || button.getAttribute('title') || '';
      return /^(?:close|đóng|đóng video|đóng cửa sổ)$/i.test(label) || !!button.querySelector('svg.lucide-x');
    }) || null;
  }
  function playControl(scope) {
    return Array.from(scope.querySelectorAll('button,[role="tab"],[role="button"]')).find(node => {
      const label = Core.clean(node.innerText || node.textContent) || node.getAttribute('aria-label') || node.getAttribute('title') || '';
      return /^(?:video|xem video|phát video|play video)$/i.test(label) && !node.disabled && node.getAttribute('aria-disabled') !== 'true' && visible(node);
    }) || null;
  }
  return {OWN,DIALOGS,text,visible,rendered,timelinePanel,panelDate,panelHeader,timeline,source,dayLabel,dialogs,closeControl,playControl};
});
