import {FFmpeg} from './vendor/ffmpeg/index.js';
let active=null;
function start(job){
  const state={id:job.id,cancelled:false,ffmpeg:new FFmpeg(),abort:null,progress:null};active=state;
  const send=async message=>{
    const result=await chrome.runtime.sendMessage({type:'HANET_VIDEO_ENGINE',id:job.id,...message});
    if(!result?.ok)throw new Error(result?.error||'Bộ điều phối tải không phản hồi.');return result;
  };
  const heartbeat=setInterval(()=>send({action:'heartbeat'}).catch(()=>{state.cancelled=true;state.abort?.abort();state.ffmpeg.terminate();}),15000);
  let lastProgress=0;
  state.ffmpeg.on('progress',({progress})=>{
    if(state.progress&&Date.now()-lastProgress>1000){lastProgress=Date.now();state.progress(Math.min(99,Math.max(0,Math.round(progress*100))));}
  });
  HanetVideoEngine.run(job,{
    send,cancelled:()=>state.cancelled,
    load:()=>state.ffmpeg.load({coreURL:chrome.runtime.getURL('vendor/core/ffmpeg-core.js'),wasmURL:chrome.runtime.getURL('vendor/core/ffmpeg-core.wasm')}),
    fetchVideo:async url=>{
      state.abort=new AbortController();const timeout=setTimeout(()=>state.abort?.abort(),120000);
      try{return await HanetVideoEngine.fetchVideo(url,state.abort.signal);}finally{clearTimeout(timeout);state.abort=null;}
    },
    convert:bytes=>HanetVideoEngine.convert(state.ffmpeg,bytes),
    onProgress:fn=>{state.progress=fn;},
    createURL:blob=>URL.createObjectURL(blob),revokeURL:url=>URL.revokeObjectURL(url),
    delay:ms=>new Promise(r=>setTimeout(r,ms)),
    release:()=>{clearInterval(heartbeat);state.ffmpeg.terminate();if(active===state)active=null;}
  });
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message?.type!=='HANET_VIDEO_OFFSCREEN'||sender.id!==chrome.runtime.id||sender.tab)return false;
  if(message.action==='run'){
    if(active){respond({ok:false,error:'Bộ xử lý đang bận, hãy thử lại sau vài giây.'});return false;}
    respond({ok:true});start(message.job);return false;
  }
  if(message.action==='cancel'){
    if(active?.id===message.id){active.cancelled=true;active.abort?.abort();active.ffmpeg.terminate();}
    respond({ok:true});return false;
  }
  return false;
});
