/* Coordinates a single inactive HANET source tab and a local offscreen encoder.
   No password, cookie, token or website private API is read. */
importScripts('video-core.js','video-job.js');
(function(){
  'use strict';
  const Core=self.HanetMttqVideoCore,Job=self.HanetVideoJob;
  const OFFSCREEN=chrome.runtime.getURL('video-offscreen.html');
  let job=null,creating=null,starting=false,persistQueue=Promise.resolve();
  const loaded=chrome.storage.session.get('videoJob').then(data=>{job=data.videoJob||null;});
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  function persist(){persistQueue=persistQueue.then(()=>chrome.storage.session.set({videoJob:job}));return persistQueue;}
  const running=()=>job?.state==='running';
  const view=()=>job?{id:job.id,state:job.state,status:job.status,results:job.results,total:job.items.length,filename:job.filename||'',error:job.error||''}:null;
  async function removeSource(target=job){
    const tabId=target?.sourceTab;if(tabId==null)return;
    target.sourceTab=null;await persist();
    try{await chrome.tabs.remove(tabId);}catch(_){}
  }
  async function ensureOffscreen(){
    if(creating)return creating;
    creating=(async()=>{
      const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[OFFSCREEN]});
      if(!contexts.length)await chrome.offscreen.createDocument({url:'video-offscreen.html',reasons:['BLOBS','WORKERS'],justification:'Chuyển định dạng video sang H.264'});
    })();
    try{await creating;}finally{creating=null;}
  }
  async function stop(reason='Đã dừng tải.',state='cancelled'){
    if(!running())return;
    const target=job;
    target.state=state;target.status=reason;target.error=state==='failed'?reason:'';
    await persist();
    if(target.downloadId!=null){try{await chrome.downloads.cancel(target.downloadId);}catch(_){}}
    try{await chrome.runtime.sendMessage({type:'HANET_VIDEO_OFFSCREEN',action:'cancel',id:target.id});}catch(_){}
    await removeSource(target);
  }
  async function sourceRequest(item,action='resolve'){
    const id=job.id,deadline=Date.now()+60000;
    while(Date.now()<deadline){
      if(!running()||job.id!==id)throw new Error('Đã dừng tải.');
      const tab=await chrome.tabs.get(job.sourceTab);
      if(!running()||job.id!==id)throw new Error('Đã dừng tải.');
      if(tab.status==='complete'){
        if(Core.context(tab.url)?.faceId!==job.faceId)throw new Error('Tab nền chưa đăng nhập HANET hoặc không có quyền xem FaceID này.');
        let ready=false;
        try{ready=(await chrome.tabs.sendMessage(tab.id,{type:'HANET_VIDEO_SOURCE',action:'ping',id})).ok;}catch(_){}
        if(ready){
          const result=await chrome.tabs.sendMessage(tab.id,{type:'HANET_VIDEO_SOURCE',action,id,job:{faceId:job.faceId,date:job.date},item});
          if(!running()||job.id!==id)throw new Error('Đã dừng tải.');
          if(!result?.ok)throw new Error(result?.error||'Không đọc được nguồn video.');
          if(action==='resolve'&&!Job.sourceURL(result.url))throw new Error('Nguồn video không thuộc HANET.');
          return result;
        }
      }
      await delay(500);
    }
    throw new Error('Tab nền không sẵn sàng. Hãy làm mới lại tiện ích và trang HANET.');
  }
  async function publicMessage(message,sender){
    if(sender.id!==chrome.runtime.id||sender.frameId!==0||!sender.tab||!String(sender.url||'').startsWith(Core.ORIGIN+'/'))throw new Error('Trang gửi yêu cầu không hợp lệ.');
    await loaded;
    if(message.action==='start'){
      if(running()||starting)throw new Error('Đang xử lý một lượt tải. Hãy chờ hoàn tất hoặc bấm Dừng tải.');
      starting=true;
      try{
      const current=await chrome.tabs.get(sender.tab.id);
      const input=Job.validateStart(message,current.url);
      job={...input,id:crypto.randomUUID(),owner:sender.tab.id,sourceTab:null,downloadId:null,state:'running',status:'Đang chuẩn bị tab tải nền…',results:[],updated:Date.now()};
      await persist();
      try{
        await ensureOffscreen();
        if(!running())throw new Error('Đã dừng tải.');
        const source=await chrome.tabs.create({url:Job.sourcePage(job.faceId,job.date,job.id),active:false});
        job.sourceTab=source.id;
        if(!running())throw new Error('Đã dừng tải.');
        await chrome.tabs.update(source.id,{muted:true,autoDiscardable:false});
        await persist();
        if(!running())throw new Error('Đã dừng tải.');
        const result=await chrome.runtime.sendMessage({type:'HANET_VIDEO_OFFSCREEN',action:'run',job:{id:job.id,...input}});
        if(!result?.ok)throw new Error(result?.error||'Không khởi động được bộ xử lý video.');
        return {ok:true,id:job.id};
      }catch(error){if(running())await stop(error.message,'failed');else await removeSource();throw error;}
      }finally{starting=false;}
    }
    if(!job||job.id!==message.id||job.owner!==sender.tab.id)throw new Error('Không tìm thấy lượt tải của tab này.');
    if(message.action==='status'){
      if(running()&&Date.now()-job.updated>90000)await stop('Bộ xử lý video đã ngừng phản hồi. Hãy tải lại.','failed');
      return {ok:true,...view()};
    }
    if(message.action==='cancel'){await stop();return {ok:true};}
    throw new Error('Yêu cầu không hợp lệ.');
  }
  async function engineMessage(message,sender){
    if(sender.id!==chrome.runtime.id||sender.url!==OFFSCREEN)throw new Error('Bộ xử lý không hợp lệ.');
    await loaded;
    if(!job||job.id!==message.id)throw new Error('Lượt tải đã hết hiệu lực.');
    if(!running())return {ok:false,error:job.status};
    job.updated=Date.now();
    if(message.action==='heartbeat'){await persist();return {ok:true};}
    if(message.action==='progress'){
      job.status=String(message.status||'').slice(0,600);
      if(Array.isArray(message.results))job.results=message.results;
      await persist();return {ok:true};
    }
    if(message.action==='list'){
      if(!job.all)throw new Error('Lượt tải này chỉ bao gồm các mốc đã chọn.');
      const result=await sourceRequest(null,'list');
      const checked=Job.validateStart({...job,items:result.items},Job.sourcePage(job.faceId,job.date,job.id));
      job.items=checked.items;await persist();return {ok:true,items:job.items};
    }
    if(message.action==='resolve'){
      const item=job.items[message.index];if(!item)throw new Error('Mốc tải không hợp lệ.');
      return sourceRequest(item);
    }
    if(message.action==='save'){
      if(job.downloadId!=null||!String(message.url).startsWith('blob:'+chrome.runtime.getURL('')))throw new Error('File tải không hợp lệ.');
      const filename=job.output==='zip'?Job.zipName(job.date):Job.itemName(job,job.items[0]);
      const savingJob=job;
      const id=await chrome.downloads.download({url:message.url,filename,saveAs:false,conflictAction:'uniquify'});
      if(job!==savingJob||!running()){try{await chrome.downloads.cancel(id);}catch(_){}throw new Error('Đã dừng tải.');}
      job.downloadId=id;job.filename=filename;await persist();
      // Stop may have arrived while Chrome was starting the disk download.
      if(job!==savingJob||!running()){try{await chrome.downloads.cancel(id);}catch(_){}throw new Error('Đã dừng tải.');}
      return {ok:true,id,filename};
    }
    if(message.action==='download-status'){
      const items=await chrome.downloads.search({id:job.downloadId});const item=items[0];
      if(!item||item.byExtensionId!==chrome.runtime.id)throw new Error('Không tìm thấy file đang lưu.');
      if(item.state==='complete'&&item.bytesReceived<=0)throw new Error('File lưu bị rỗng.');
      return {ok:true,state:item.state,error:item.error||''};
    }
    if(message.action==='done'){
      const finished=job;
      job.state=message.success?'complete':'failed';job.status=message.status;job.results=message.results||[];job.error=message.success?'':message.status;
      await persist();await removeSource(finished);return {ok:true};
    }
    throw new Error('Yêu cầu bộ xử lý không hợp lệ.');
  }
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    const handler=message?.type==='HANET_MTTQ_VIDEO'?publicMessage:message?.type==='HANET_VIDEO_ENGINE'?engineMessage:null;
    if(!handler)return false;
    handler(message,sender).then(respond,e=>respond({ok:false,error:e.message}));return true;
  });
  chrome.tabs.onRemoved.addListener(tabId=>{
    loaded.then(async()=>{if(running()&&(tabId===job.owner||tabId===job.sourceTab))await stop('Đã dừng vì tab HANET hoặc tab tải nền đã đóng.');}).catch(()=>{});
  });
})();
