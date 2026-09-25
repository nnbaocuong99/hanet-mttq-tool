(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.HanetVideoZip=factory();
})(typeof self==='undefined'?this:self,function(){
  'use strict';
  const table=Uint32Array.from({length:256},(_,n)=>{
    for(let i=0;i<8;i++) n=n&1?0xedb88320^(n>>>1):n>>>1; return n>>>0;
  });
  function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
  function record(size,signature){const bytes=new Uint8Array(size);const view=new DataView(bytes.buffer);view.setUint32(0,signature,true);return {bytes,view};}
  class Archive{
    constructor(date){this.parts=[];this.entries=[];this.names=new Set();this.offset=0;const [y,m,d]=date.split('-').map(Number);this.date=((Math.max(1980,y)-1980)<<9)|(m<<5)|d;}
    add(name,bytes){
      if(!(bytes instanceof Uint8Array)||!bytes.length||/[\\/\x00-\x1f]/.test(name)||name==='..'||this.names.has(name))throw new Error('Nội dung hoặc tên file ZIP không hợp lệ.');
      if(this.offset+bytes.length>1024*1024*1024)throw new Error('ZIP vượt 1 GB. Hãy chia các mốc thành nhóm nhỏ hơn.');
      if(this.entries.length>=65535)throw new Error('Quá nhiều file trong ZIP.');
      const encoded=new TextEncoder().encode(name),crc=crc32(bytes),{bytes:header,view:v}=record(30,0x04034b50);
      v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,this.date,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,encoded.length,true);
      this.parts.push(header,encoded,new Blob([bytes]));
      this.entries.push({encoded,crc,size:bytes.length,offset:this.offset});
      this.offset+=header.length+encoded.length+bytes.length;this.names.add(name);
    }
    blob(){
      if(!this.entries.length)throw new Error('Không có video để đóng gói.');
      const central=[];let size=0;
      for(const e of this.entries){const {bytes,view:v}=record(46,0x02014b50);
        v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,this.date,true);v.setUint32(16,e.crc,true);v.setUint32(20,e.size,true);v.setUint32(24,e.size,true);v.setUint16(28,e.encoded.length,true);v.setUint32(42,e.offset,true);
        central.push(bytes,e.encoded);size+=bytes.length+e.encoded.length;
      }
      const {bytes:end,view:v}=record(22,0x06054b50);v.setUint16(8,this.entries.length,true);v.setUint16(10,this.entries.length,true);v.setUint32(12,size,true);v.setUint32(16,this.offset,true);
      return new Blob([...this.parts,...central,end],{type:'application/zip'});
    }
  }
  return {Archive,crc32};
});
