// Reproduce local runtime assets using the exact versions in package-lock.json.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const [pkg,dest] of [['@ffmpeg/ffmpeg','ffmpeg'],['@ffmpeg/core','core']]){
 const from=path.join(root,'node_modules',pkg,'dist/esm'),to=path.join(root,'vendor',dest);fs.mkdirSync(to,{recursive:true});
 for(const name of fs.readdirSync(from))if(/\.(js|wasm)$/.test(name))fs.copyFileSync(path.join(from,name),path.join(to,name));
 fs.writeFileSync(path.join(to,'package.json'),'{"type":"module"}\n');
}
