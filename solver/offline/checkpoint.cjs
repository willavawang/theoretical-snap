'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {OfflineSolver,VERSION,catalog}=require('./engine.cjs');
const buildHash=crypto.createHash('sha256').update(fs.readFileSync(require.resolve('./engine.cjs'))).update(fs.readFileSync(require.resolve('./arena.cjs'))).update(fs.readFileSync(require.resolve('../../dist/solver/engine.js'))).digest('hex');
class Writer{
 constructor(file){this.fd=fs.openSync(file,'w');this.b=Buffer.allocUnsafe(65536);this.p=0;this.hash=crypto.createHash('sha256');}
 flush(){if(this.p){fs.writeSync(this.fd,this.b,0,this.p);this.hash.update(this.b.subarray(0,this.p));}this.p=0;}
 bytes(b){if(b.length>this.b.length){this.flush();fs.writeSync(this.fd,b);this.hash.update(b);return;}if(this.p+b.length>this.b.length)this.flush();b.copy(this.b,this.p);this.p+=b.length;}
 u32(n){if(this.p+4>this.b.length)this.flush();this.b.writeUInt32LE(n,this.p);this.p+=4;}
 f64(n){if(this.p+8>this.b.length)this.flush();this.b.writeDoubleLE(n,this.p);this.p+=8;}
 string(s){const b=Buffer.from(s);this.u32(b.length);this.bytes(b);}
 close(){this.flush();fs.writeSync(this.fd,this.hash.digest());fs.fsyncSync(this.fd);fs.closeSync(this.fd);}
}
class Reader{
 constructor(file){this.fd=fs.openSync(file,'r');this.offset=0;this.b=Buffer.allocUnsafe(65536);this.p=0;this.end=0;}
 need(n){if(this.end-this.p>=n)return;const left=this.end-this.p;if(left)this.b.copy(this.b,0,this.p,this.end);this.p=0;this.end=left;while(this.end<n){const got=fs.readSync(this.fd,this.b,this.end,this.b.length-this.end);if(!got)throw new Error('Truncated checkpoint');this.end+=got;}}
 bytes(n){if(n>1000000000)throw new Error('Checkpoint field too large');const out=Buffer.allocUnsafe(n);let k=0;while(k<n){if(this.p===this.end)this.need(1);const take=Math.min(n-k,this.end-this.p);this.b.copy(out,k,this.p,this.p+take);this.p+=take;k+=take;}this.offset+=n;return out;}
 u32(){this.need(4);const v=this.b.readUInt32LE(this.p);this.p+=4;this.offset+=4;return v;}
 f64(){this.need(8);const v=this.b.readDoubleLE(this.p);this.p+=8;this.offset+=8;return v;}
 string(){return this.bytes(this.u32()).toString();}
 close(){fs.closeSync(this.fd);}
}
function verify(file){const fd=fs.openSync(file,'r');try{const length=fs.fstatSync(fd).size;if(length<40)throw new Error('Truncated checkpoint');const h=crypto.createHash('sha256'),b=Buffer.allocUnsafe(1048576);let pos=0;while(pos<length-32){const n=fs.readSync(fd,b,0,Math.min(b.length,length-32-pos),pos);if(!n)throw new Error('Truncated checkpoint');h.update(b.subarray(0,n));pos+=n;}const expected=Buffer.alloc(32);if(fs.readSync(fd,expected,0,32,pos)!==32||!crypto.timingSafeEqual(h.digest(),expected))throw new Error('Checkpoint checksum mismatch');}finally{fs.closeSync(fd);}}
function save(s,file){
 fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.partial',w=new Writer(temporary);
 const metadata={version:VERSION,buildHash,fingerprint:s.fingerprint,spec:s.spec,options:{seed:s.options.seed,maxInfoStates:s.options.maxInfoStates,exploration:s.options.exploration,terminalEnumeration:s.terminalEnumeration,opponentExploration:s.opponentExploration},iterations:s.iterations,passes:s.passes,visits:s.visits,trainingMs:s.trainingMs,randomState:s.random.state};
 try{w.bytes(Buffer.from('SNAPOFF1'));w.string(JSON.stringify(metadata));w.u32(s.publicNodes.length-1);for(let i=1;i<s.publicNodes.length;i++)for(const n of s.publicNodes[i])w.u32(n);w.u32(s.privateHistories.length);for(const h of s.privateHistories)w.string(h);
  w.u32(s.actionSets.length);for(const set of s.actionSets){w.f64(set.key);w.u32(set.actions.length);for(const a of set.actions)w.u32(a.id);}
  w.u32(s.nodes.size);for(const n of s.nodes.values()){w.f64(n.key);w.u32(n.player);w.u32(n.actionSetID);w.u32(n.updates);for(const v of n.regret)w.f64(v);for(const v of n.average)w.f64(v);}
  w.u32(s.deckNodes?s.deckNodes.length:0);if(s.deckNodes)for(const n of s.deckNodes){w.u32(n.regret.length);for(const v of n.regret)w.f64(v);for(const v of n.average)w.f64(v);}w.close();fs.renameSync(temporary,file);
 }catch(e){try{fs.closeSync(w.fd);}catch{}try{fs.unlinkSync(temporary);}catch{}throw e;}
 return {path:path.resolve(file),bytes:fs.statSync(file).size,metadata};
}
function load(file,options={}){
 verify(file);const r=new Reader(file);try{
  if(r.bytes(8).toString()!=='SNAPOFF1')throw new Error('Unknown checkpoint format');const m=JSON.parse(r.string());if(m.version!==VERSION||m.buildHash!==buildHash)throw new Error('Checkpoint engine build does not match');
  const s=new OfflineSolver(options.spec||m.spec,{...m.options,...options});if(s.fingerprint!==m.fingerprint)throw new Error('Checkpoint rules/deck model/estimator do not match');
  const pc=r.u32();if(pc>=2097152)throw new Error('Invalid public-history count');for(let i=0;i<pc;i++){const a=[r.u32(),r.u32(),r.u32()];if(a[0]>i||!catalog[a[1]]||!catalog[a[2]])throw new Error('Invalid public history');s.publicChild(...a);}
  const pr=r.u32();for(let i=0;i<pr;i++){const h=r.string();s.privateHistories.push(h);s.privateMap.set(h,i);}
  const ac=r.u32();for(let i=0;i<ac;i++){const key=r.f64(),n=r.u32();if(n>catalog.length)throw new Error('Invalid action set');const actions=Array.from({length:n},()=>catalog[r.u32()]);if(!n||actions.some(x=>!x))throw new Error('Invalid actions');const set={id:i,key,actions};s.actionSets.push(set);s.actionSetMap.set(key,set);}
  const nc=r.u32();if(nc>s.options.maxInfoStates)throw new Error('Checkpoint exceeds information-state budget');for(let i=0;i<nc;i++){const key=r.f64(),player=r.u32(),actionSetID=r.u32(),updates=r.u32(),set=s.actionSets[actionSetID];if(!Number.isSafeInteger(key)||key<0||key%2!==player||player>1||!set||Math.floor(key/4294967296)>=s.publicNodes.length||Math.floor(key%4294967296/2)>=s.privateHistories.length)throw new Error('Invalid information-state key');const regret=Float64Array.from(set.actions,()=>r.f64()),average=Float64Array.from(set.actions,()=>r.f64());if(regret.some(v=>!Number.isFinite(v))||average.some(v=>!Number.isFinite(v)||v<0))throw new Error('Invalid checkpoint numbers');s.nodes.set(key,{key,player,actionSetID,updates,actions:set.actions,regret,average});s.actionEntries+=set.actions.length;}
  const dc=r.u32();if(dc!==(s.deckNodes?s.deckNodes.length:0))throw new Error('Invalid deck root count');for(let p=0;p<dc;p++){const n=s.deckNodes[p];if(r.u32()!==n.regret.length)throw new Error('Invalid deck root');for(let i=0;i<n.regret.length;i++)n.regret[i]=r.f64();for(let i=0;i<n.average.length;i++)n.average[i]=r.f64();if(n.regret.some(v=>!Number.isFinite(v))||n.average.some(v=>!Number.isFinite(v)||v<0))throw new Error('Invalid deck numbers');}
  if(r.offset!==fs.statSync(file).size-32)throw new Error('Unexpected checkpoint tail');s.iterations=m.iterations;s.passes=m.passes;s.visits=m.visits;s.trainingMs=m.trainingMs;s.random.state=m.randomState;return s;
 }finally{r.close();}
}
module.exports={save,load,buildHash};
