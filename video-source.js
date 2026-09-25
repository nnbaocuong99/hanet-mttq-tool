(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(require('./video-core.js'),require('./video-dom.js'),require('./video-job.js'));
  else if(root===root.top){
    const API=factory(root.HanetMttqVideoCore,root.HanetMttqVideoDOM,root.HanetVideoJob);
    const id=root.HanetVideoJob.workerId(root.location.href);
    // Keep the receiver available if the SPA removes the URL fragment during
    // startup. Only our background can address this tab through tabs.sendMessage.
    API.listen(root,id);
  }
})(typeof window==='undefined'?this:window,function(Core,DOM,Job){
  'use strict';
  function createResolver(win,settings={}){
    const doc=win.document,delay=ms=>new Promise(r=>win.setTimeout(r,ms));
    const timing={poll:250,timeout:45000,settle:500,scroll:500,...settings};
    let opened=new Set();
    async function closeOpened(){
      for(const dialog of [...opened].reverse()) if(DOM.rendered(dialog)) DOM.closeControl(dialog)?.click();
      const end=Date.now()+2000;
      while([...opened].some(DOM.rendered)&&Date.now()<end)await delay(timing.poll);
      opened.clear();
    }
    async function prepare(job){
      const end=Date.now()+timing.timeout;let clicked=false;
      while(Date.now()<end){
        const ctx=Core.context(win.location.href);
        if(!ctx||ctx.faceId!==job.faceId) throw new Error('Tab nền chưa vào đúng FaceID. Kiểm tra phiên đăng nhập HANET.');
        const panel=DOM.timelinePanel(doc);
        if(panel&&Job.isoDate(DOM.panelDate(panel))===job.date){
          if(DOM.timeline(doc,panel).length)return panel;
        }else if(!clicked){
          const cell=[...doc.querySelectorAll('main td,main [role="cell"]')].find(n=>Job.isoDate(DOM.text(n))===job.date);
          const row=cell?.closest('[role="button"],button,tr');
          if(row){clicked=true;row.click();}
        }
        await delay(timing.poll);
      }
      throw new Error('Không đọc được các mốc của ngày này ở tab nền. Hãy kiểm tra phiên HANET rồi thử lại.');
    }
    function scrollers(panel){
      return [...panel.querySelectorAll('div')].filter(node=>{
        const style=win.getComputedStyle(node);
        return node.hasAttribute('data-radix-scroll-area-viewport')||(/auto|scroll/.test(style.overflowY)&&node.scrollHeight>node.clientHeight);
      });
    }
    async function walk(job,findKey=''){
      const panel=await prepare(job),scrolls=scrollers(panel),items=new Map();
      for(const node of scrolls)node.scrollTop=0;
      let stable=0,previous=-1;
      for(let step=0;step<150;step++){
        for(const item of DOM.timeline(doc,panel))items.set(item.key,item);
        if(findKey&&items.has(findKey))return items.get(findKey);
        if(items.size>2000)throw new Error('Ngày này có hơn 2.000 mốc. Hãy chọn nhóm nhỏ hơn.');
        const atBottom=scrolls.every(n=>n.scrollTop+n.clientHeight>=n.scrollHeight-2);
        stable=atBottom&&items.size===previous?stable+1:0;previous=items.size;
        if(stable>=3){
          if(findKey)return null;
          return [...items.values()].map(({key,time})=>({key,time}));
        }
        for(const node of scrolls)node.scrollTop=Math.min(node.scrollHeight,node.scrollTop+Math.max(1,node.clientHeight*0.8));
        await delay(timing.scroll);
      }
      throw new Error('Chưa đọc hết các mốc của ngày. Hãy thử lại hoặc chọn ít mốc hơn.');
    }
    async function resolve(job,requested){
      await closeOpened();
      const panel=await prepare(job);
      let item=DOM.timeline(doc,panel).find(n=>n.key===requested.key);
      // Never use a time-only match: two cameras may share exactly one second.
      if(!item)item=await walk(job,requested.key);
      if(!item)throw new Error('Mốc đã chọn không còn trong danh sách của ngày này. Hãy mở lại ngày và chọn lại.');
      const direct=DOM.source(item.row);if(direct&&Job.sourceURL(direct.url))return {url:direct.url};
      const baseline=new Set(DOM.dialogs(doc,true));
      const oldURLs=new Set([...doc.querySelectorAll('video')].map(n=>DOM.source(n)?.url).filter(Boolean));
      const activated=new Set();let stable='',since=0;
      try{
        item.target.click();
        const end=Date.now()+timing.timeout;
        while(Date.now()<end){
          if(Core.context(win.location.href)?.faceId!==job.faceId)throw new Error('FaceID trong tab nền đã thay đổi.');
          for(const dialog of DOM.dialogs(doc,true))if(!baseline.has(dialog))opened.add(dialog);
          for(const dialog of opened){
            const times=[...dialog.querySelectorAll('h2 time,h2 span,h2 p,h2 li')].map(n=>Core.clock(DOM.text(n))).filter(Boolean);
            if(times.length&&!times.includes(requested.time))continue;
            const source=DOM.source(dialog);
            if(source&&!oldURLs.has(source.url)){
              if(!Job.sourceURL(source.url))throw new Error('HANET chưa trả về file MP4 trực tiếp cho mốc này.');
              if(stable!==source.url){stable=source.url;since=Date.now();}
              if(Date.now()-since>=timing.settle){
                // Playback is unnecessary; keep the native source tab silent.
                if(source.video){source.video.muted=true;source.video.pause();}
                return {url:source.url};
              }
            }else{
              const play=DOM.playControl(dialog);
              if(play&&!activated.has(play)){activated.add(play);play.click();}
            }
          }
          await delay(timing.poll);
        }
        throw new Error('HANET không cung cấp video cho mốc '+requested.time+'.');
      }finally{await closeOpened();}
    }
    return {resolve,prepare,closeOpened,collect:job=>walk(job)};
  }
  function listen(win,id){
    const resolver=createResolver(win);let busy=false;
    win.chrome.runtime.onMessage.addListener((message,sender,respond)=>{
      if(message?.type!=='HANET_VIDEO_SOURCE'||sender.id!==win.chrome.runtime.id||(id&&message.id!==id))return false;
      if(message.action==='ping'){respond({ok:true});return false;}
      if(!['resolve','list'].includes(message.action))return false;
      if(busy){respond({ok:false,error:'Tab nền đang xử lý một mốc khác.'});return false;}
      busy=true;
      const task=message.action==='list'?resolver.collect(message.job).then(items=>({items})):resolver.resolve(message.job,message.item);
      task.then(result=>respond({ok:true,...result}),e=>respond({ok:false,error:e.message})).finally(()=>busy=false);
      return true;
    });
  }
  return {createResolver,listen};
});
