/* Only native browser downloads are used. No passwords, cookies or API tokens are read. */
importScripts('video-core.js');
(function () {
  'use strict';
  const Core = self.HanetMttqVideoCore;
  const call = (fn, ...args) => new Promise((resolve,reject) => {
    fn(...args, result => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve(result);
    });
  });
  async function ownedDownload(id) {
    if (!Number.isInteger(id) || id < 0) throw new Error('Mã lượt tải không hợp lệ.');
    const items = await call(chrome.downloads.search.bind(chrome.downloads), {id});
    const item = items[0];
    if (!item || item.byExtensionId !== chrome.runtime.id) throw new Error('Không tìm thấy lượt tải của tiện ích.');
    return item;
  }
  async function handle(message, sender) {
    if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.tab || !Core.context(sender.url || '')) throw new Error('Trang gửi yêu cầu không hợp lệ.');
    if (message.action === 'start') {
      const ctx = Core.context(sender.url);
      const url = Core.mediaURL(message.url);
      if (!url || Core.mediaKind(url) === 'stream') throw new Error('Nguồn này chưa phải file video tải trực tiếp.');
      if (!Core.validFilename(message.filename) || !message.filename.startsWith(`HANET/997606/${ctx.faceId}/`)) throw new Error('Tên file không hợp lệ.');
      const id = await call(chrome.downloads.download.bind(chrome.downloads), {url,filename:message.filename,conflictAction:'uniquify',saveAs:false});
      return {ok:true,id};
    }
    if (message.action === 'status') {
      const item = await ownedDownload(message.id);
      if (item.mime && !Core.videoMime(item.mime)) {
        if (item.state === 'in_progress') await call(chrome.downloads.cancel.bind(chrome.downloads),item.id);
        throw new Error('Máy chủ trả về dữ liệu không phải video. Hãy mở lại video trên HANET rồi thử lại.');
      }
      if (item.state === 'complete' && item.bytesReceived === 0) throw new Error('File video rỗng. Hãy mở lại video rồi tải lại.');
      return {ok:true,state:item.state,error:item.error || '',bytes:item.bytesReceived,totalBytes:item.totalBytes};
    }
    if (message.action === 'cancel') {
      const item = await ownedDownload(message.id);
      if (item.state === 'in_progress') await call(chrome.downloads.cancel.bind(chrome.downloads),item.id);
      return {ok:true};
    }
    throw new Error('Yêu cầu tải không hợp lệ.');
  }
  chrome.runtime.onMessage.addListener((message,sender,respond) => {
    if (message?.type !== 'HANET_MTTQ_VIDEO') return false;
    handle(message,sender).then(respond,error => respond({ok:false,error:error.message}));
    return true;
  });
})();
