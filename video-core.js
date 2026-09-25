(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HanetMttqVideoCore = factory();
})(typeof self === 'undefined' ? this : self, function () {
  'use strict';
  const ORIGIN = 'https://connect.hanet.ai';
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  function context(href) {
    try {
      const url = new URL(href), match = url.pathname.match(/^\/997606\/person\/face\/(\d+)\/?$/);
      if (url.origin !== ORIGIN || !match) return null;
      const fields = ['dayFrom', 'dayTo', 'month'].map(key => url.searchParams.get(key) || '');
      return {faceId:match[1], placeId:'997606', key:JSON.stringify([match[1], ...fields]), date:dateFromTimestamp(fields[0])};
    } catch (_) { return null; }
  }
  function dateFromTimestamp(value) {
    if (!/^\d{12,13}$/.test(String(value))) return '';
    const date = new Date(Number(value));
    if (!Number.isFinite(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const get = type => parts.find(part => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function clock(value) {
    const match = clean(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match || +match[1] > 23 || +match[2] > 59 || +(match[3] || 0) > 59) return '';
    return `${match[1].padStart(2,'0')}:${match[2]}${match[3] ? ':' + match[3] : ''}`;
  }
  function mediaURL(value, base = ORIGIN) {
    try {
      if (!value || String(value).length > 16384) return '';
      const url = new URL(value, base);
      if (url.username || url.password) return '';
      if (url.protocol === 'blob:') return url.origin === ORIGIN ? url.href : '';
      return /^(https?:)$/.test(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }
  function mediaKind(value, mime = '') {
    const url = mediaURL(value);
    if (!url) return '';
    const path = new URL(url).pathname.toLowerCase();
    if (/\.(m3u8|mpd)$/.test(path) || /mpegurl|dash\+xml/i.test(mime)) return 'stream';
    if (/\.webm$/.test(path) || /webm/i.test(mime)) return 'webm';
    if (/\.(ogv|ogg)$/.test(path) || /ogg/i.test(mime)) return 'ogv';
    if (/\.mov$/.test(path) || /quicktime/i.test(mime)) return 'mov';
    if (/\.(mp4|m4v)$/.test(path) || /(?:video|application)\/mp4/i.test(mime)) return 'mp4';
    return url.startsWith('blob:') ? 'blob' : 'unknown';
  }
  function filenamePart(value) {
    let part = clean(value).replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').replace(/\.{2,}/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0,90);
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part)) part = '_' + part;
    return part || 'video';
  }
  function hash(value) {
    let n = 2166136261;
    for (const char of String(value)) { n ^= char.charCodeAt(0); n = Math.imul(n,16777619); }
    return (n >>> 0).toString(16).padStart(8,'0');
  }
  function filename(ctx, item, extension) {
    const ext = ['mp4','webm','ogv','mov'].includes(extension) ? extension : 'mp4';
    const date = filenamePart(ctx.date || 'ngay-dang-xem');
    const time = filenamePart(item.time.replace(/:/g,'-'));
    return `HANET/${ctx.placeId}/${ctx.faceId}/${date}/HANET_${ctx.faceId}_${date}_${time}_${hash(item.key)}.${ext}`;
  }
  function validFilename(value) {
    return typeof value === 'string' && value.length <= 400 && /^HANET\/997606\/\d+\//.test(value) &&
      !/[\\\x00-\x1f<>:"|?*]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..' && !/[. ]$/.test(part)) && /\.(mp4|webm|ogv|mov)$/.test(value);
  }
  function videoMime(mime) {
    return !/mpegurl|dash\+xml/i.test(mime) && (!mime || /^video\//i.test(mime) || /^(?:application|binary)\/(?:octet-stream|mp4)(?:;|$)/i.test(mime));
  }
  return {ORIGIN,clean,context,clock,mediaURL,mediaKind,filenamePart,hash,filename,validFilename,videoMime,dateFromTimestamp};
});
