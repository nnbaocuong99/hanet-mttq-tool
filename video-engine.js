(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(require('./video-core.js'),require('./video-job.js'),require('./video-zip.js'));
  else root.HanetVideoEngine=factory(root.HanetMttqVideoCore,root.HanetVideoJob,root.HanetVideoZip);
})(typeof self==='undefined'?this:self,function(Core,Job,Zip){
  'use strict';
  const MAX_CLIP=160*1024*1024;
  function isMP4(bytes){return bytes.length>=16&&String.fromCharCode(...bytes.subarray(4,8))==='ftyp';}
  async function fetchVideo(url,signal,fetcher=fetch){
    if(!Job.sourceURL(url))throw new Error('Nguồn video không hợp lệ.');
    const response=await fetcher(url,{signal,credentials:'omit',cache:'no-store'});
    if(!response.ok)throw new Error(`HANET trả lỗi HTTP ${response.status}. Hãy thử tải lại mốc này.`);
    if(response.url&&!Job.sourceURL(response.url))throw new Error('Video chuyển hướng ra ngoài HANET.');
    if(!Core.videoMime(response.headers.get('Content-Type')||''))throw new Error('Máy chủ trả dữ liệu không phải video.');
    const expected=Number(response.headers.get('Content-Length')||0);
    if(expected>MAX_CLIP)throw new Error('Video lớn hơn 160 MB, vượt giới hạn chuyển đổi của bản này.');
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;
      if(size>MAX_CLIP)throw new Error('Video lớn hơn 160 MB.');chunks.push(value);
    }}finally{await reader.cancel().catch(()=>{});}
    if(!size||(expected&&size!==expected&&!response.headers.get('Content-Encoding')))throw new Error('Video tải chưa đủ dữ liệu. Hãy thử lại.');
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
    if(!isMP4(bytes))throw new Error('Nguồn trả về không phải file MP4 hợp lệ.');
    return bytes;
  }
  async function convert(ffmpeg,bytes){
    await ffmpeg.writeFile('input.mp4',bytes);
    try{
      const code=await ffmpeg.exec(Job.transcodeArgs(),15*60*1000);
      if(code!==0)throw new Error('Không chuyển đổi được video sang H.264 (mã '+code+').');
      const output=await ffmpeg.readFile('output.mp4');
      if(!isMP4(output)||output.length<1024)throw new Error('Video sau chuyển đổi bị rỗng hoặc không hợp lệ.');
      return output;
    }finally{
      for(const path of ['input.mp4','output.mp4']){try{await ffmpeg.deleteFile(path);}catch(_){}}
    }
  }
  async function run(job,env){
    const results=[],archive=job.output==='zip'?new Zip.Archive(job.date):null;
    let single=null,url='',saved=false;
    const check=()=>{if(env.cancelled())throw new Error('Đã dừng tải.');};
    const report=status=>env.send({action:'progress',status,results});
    try{
      if(job.all){
        await report('Đang đọc đủ các mốc của ngày trong tab nền…');
        const listed=await env.send({action:'list'});job.items=listed.items;check();
      }
      await report('Đang chuẩn bị chuyển đổi H.264…');
      await env.load();check();
      for(let i=0;i<job.items.length;i++){
        check();const item=job.items[i],label=`${i+1}/${job.items.length} · ${item.time}`;
        try{
          await report('Đang lấy nguồn video '+label+'…');
          const source=await env.send({action:'resolve',index:i});check();
          await report('Đang tải dữ liệu '+label+'…');
          const bytes=await env.fetchVideo(source.url);check();
          await report('Đang chuyển H.264 '+label+'…');
          env.onProgress(percent=>report(`Đang chuyển H.264 ${label} · ${percent}%`).catch(()=>{}));
          const output=await env.convert(bytes);env.onProgress(null);check();
          if(archive)archive.add(Job.itemName(job,item),output);else single=new Blob([output],{type:'video/mp4'});
          results.push({key:item.key,time:item.time,kind:'ready',message:'Đã chuyển đổi, đang chờ lưu file.'});
        }catch(error){
          env.onProgress(null);check();
          results.push({key:item.key,time:item.time,kind:'error',message:error.message});
        }
      }
      check();const good=results.filter(r=>r.kind==='ready').length,failed=results.length-good;
      if(!good)throw new Error('Không tải được video nào. Xem lỗi ở từng mốc bên dưới.');
      if(archive&&failed){
        const note=`Ngày: ${Job.dateLabel(job.date)}\nFaceID: ${job.faceId}\nĐã có ${good}/${job.items.length} video trong ZIP.\nCác mốc chưa tải được:\n`+results.filter(r=>r.kind==='error').map(r=>`${r.time}: ${r.message}`).join('\n');
        archive.add('LOI_TAI.txt',new TextEncoder().encode(note));
      }
      await report(archive?'Đang đóng gói và lưu ZIP…':'Đang lưu MP4…');
      url=env.createURL(archive?archive.blob():single);
      await env.send({action:'save',url});
      const deadline=Date.now()+15*60*1000;
      while(true){
        check();const info=await env.send({action:'download-status'});
        if(info.state==='complete'){saved=true;break;}
        if(info.state==='interrupted')throw new Error('Lưu file bị gián đoạn: '+(info.error||'hãy tải lại')+'.');
        if(Date.now()>deadline)throw new Error('Quá thời gian chờ lưu file.');
        await env.delay(600);
      }
      results.forEach(r=>{if(r.kind==='ready'){r.kind='ok';r.message='Đã lưu video H.264.';}});
      const filename=archive?Job.zipName(job.date):Job.itemName(job,job.items[0]);
      await env.send({action:'done',success:true,results,status:`Đã lưu ${filename} · ${good}/${job.items.length} video.${failed?' Có mốc bị lỗi; xem danh sách bên dưới và LOI_TAI.txt trong ZIP.':''}`});
    }catch(error){
      if(!saved)results.forEach(r=>{if(r.kind==='ready'){r.kind='error';r.message='Chưa lưu được file. '+error.message;}});
      await env.send({action:'done',success:false,results,status:error.message}).catch(()=>{});
    }finally{env.onProgress(null);if(url)env.revokeURL(url);env.release();}
  }
  return {fetchVideo,convert,run,isMP4};
});
