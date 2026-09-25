(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(require('./video-core.js'));
  else root.HanetVideoJob=factory(root.HanetMttqVideoCore);
})(typeof self==='undefined'?this:self,function(Core){
  'use strict';
  const MARKER='hanet-mttq-worker=';
  function validDate(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')) return false;
    const d=new Date(value+'T00:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
  }
  function isoDate(label){
    const m=String(label).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const value=m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:'';
    return validDate(value)?value:'';
  }
  function dateLabel(date){return date.split('-').reverse().join('/');}
  function zipName(date){
    if(!validDate(date)) throw new Error('Ngày tải không hợp lệ.');
    const [y,m,d]=date.split('-'); return `${+d}-${+m}-${y}.zip`;
  }
  function workerId(href){try{return new URL(href).hash.slice(1).match(/^hanet-mttq-worker=([a-zA-Z0-9-]+)$/)?.[1]||'';}catch(_){return '';}}
  function sourcePage(faceId,date,id){
    if(!/^\d+$/.test(faceId)||!validDate(date)||!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Thông tin ngày/FaceID không hợp lệ.');
    const from=Date.parse(date+'T00:00:00+07:00');
    const url=new URL(`${Core.ORIGIN}/997606/person/face/${faceId}`);
    url.search=new URLSearchParams({dayFrom:String(from+1000),dayTo:String(from+86400000-1),month:date.slice(0,7)}).toString();
    url.hash=MARKER+id; return url.href;
  }
  function sourceURL(value){
    const raw=Core.mediaURL(value); if(!raw) return '';
    const url=new URL(raw);
    return url.protocol==='https:'&&(url.hostname==='hanet.ai'||url.hostname.endsWith('.hanet.ai'))&&Core.mediaKind(raw)!=='stream'?raw:'';
  }
  function itemName(job,item){
    return Core.filename({placeId:'997606',faceId:job.faceId,date:job.date},item,'mp4').split('/').pop();
  }
  function validateStart(message,currentURL){
    // Chrome can retain the document's initial sender.url after SPA navigation.
    // Validate against tabs.get(...).url and construct filenames here instead.
    const ctx=Core.context(currentURL);
    if(!ctx||ctx.faceId!==message.faceId||!validDate(message.date)) throw new Error('FaceID/ngày đã đổi. Hãy chọn lại các mốc cần tải.');
    if(!['zip','mp4'].includes(message.output)||!Array.isArray(message.items)||!message.items.length||message.items.length>2000) throw new Error('Danh sách tải không hợp lệ.');
    if(message.output==='mp4'&&message.items.length!==1) throw new Error('Chỉ chọn một mốc để tải MP4 riêng.');
    const seen=new Set();
    const items=message.items.map(item=>{
      if(typeof item.key!=='string'||item.key.length>6000||seen.has(item.key)||!Core.clock(item.time)) throw new Error('Mốc video không hợp lệ.');
      seen.add(item.key); return {key:item.key,time:Core.clock(item.time)};
    });
    return {faceId:ctx.faceId,date:message.date,output:message.output,all:message.output==='zip'&&message.all===true,items};
  }
  function transcodeArgs(){
    // H.264 + yuv420p + AAC is playable without an HEVC codec. Keep full duration
    // and aspect ratio; cap at 1080px height/1920px width for practical WASM use.
    return ['-i','input.mp4','-map','0:v:0','-map','0:a:0?',
      '-vf',"scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
      '-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p',
      '-c:a','aac','-b:a','128k','-movflags','+faststart','output.mp4'];
  }
  return {validDate,isoDate,dateLabel,zipName,workerId,sourcePage,sourceURL,itemName,validateStart,transcodeArgs};
});
