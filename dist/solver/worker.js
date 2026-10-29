/* Browser Worker: bounded, cancellable computation and versioned local checkpoints. */
'use strict';
importScripts('./engine.js','./ranges.js');
let generation=0;
const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
function db(){return new Promise((resolve,reject)=>{if(typeof indexedDB==='undefined')return resolve(null);const r=indexedDB.open('theoretical-snap-solver',1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('policies',{keyPath:'id'});s.createIndex('savedAt','savedAt');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function cacheKey(s){const bytes=new TextEncoder().encode(s.model.fingerprint+'|'+s.algorithm);if(typeof crypto==='object'&&crypto.subtle){const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');}return s.model.fingerprint+'|'+s.algorithm;}
async function cacheRead(id){const d=await db();if(!d)return null;return new Promise((resolve,reject)=>{const r=d.transaction('policies','readonly').objectStore('policies').get(id);r.onsuccess=()=>{resolve(r.result?.snapshot||null);d.close();};r.onerror=()=>{reject(r.error);d.close();};});}
async function cacheWrite(id,snapshot){const d=await db();if(!d)return false;return new Promise((resolve,reject)=>{const tx=d.transaction('policies','readwrite'),s=tx.objectStore('policies');s.put({id,snapshot,savedAt:Date.now()});const count=s.count();count.onsuccess=()=>{let extra=count.result-6;if(extra>0){const cursor=s.index('savedAt').openKeyCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c&&extra>0){s.delete(c.primaryKey);extra--;c.continue();}};}};tx.oncomplete=()=>{resolve(true);d.close();};tx.onerror=()=>{reject(tx.error);d.close();};});}
async function solve(request,token,emit=true){
 const started=performance.now(),model=request.model||SnapRanges.example(request.example||'public-final'),rangeMs=performance.now()-started;
 const options={seed:request.seed||17,maxInfoStates:request.maxInfoStates||25000,maxTreeNodes:50000,maxMatrixCells:2000000,...request.solverOptions};
 const solver=new SnapSolver.Solver(model,options),id=await cacheKey(solver);let cached=false,cacheError=null;
 if(request.cache!==false&&request.readCache!==false)try{const old=await cacheRead(id);if(old){solver.restore(old);cached=true;}}catch(e){cacheError=String(e);}
 const initialIterations=solver.iterations,trainStart=performance.now(),budget=request.maxMs===undefined?2000:request.maxMs,maxIterations=request.iterations===undefined?10000:request.iterations,target=request.targetGap===undefined?.01:request.targetGap;
 let last=solver.stats(),lastEmission=0;
 while(generation===token&&solver.iterations-initialIterations<maxIterations&&performance.now()-trainStart<budget){
  if(last.diagnostics.certified&&last.diagnostics.nashGap<=target&&last.diagnostics.maxConditionalGain<=target)break;
  last=solver.run({iterations:Math.min(50,maxIterations-(solver.iterations-initialIterations)),maxMs:25,targetGap:target});
  if(emit&&performance.now()-lastEmission>250){postMessage({type:'progress',stats:last,elapsedMs:performance.now()-started,cached});lastEmission=performance.now();}
  if(last.stopReason==='memory'||last.stopReason==='accuracy')break;await wait();
 }
 if(generation!==token)return null;
 const query=request.query||(model.ranges?model.ranges[0][0]:model.cases[0].players[0]);
 if(emit)postMessage({type:'evaluating',stats:last});
 const analysis=solver.analyze(query,{targetGap:target,samplesPerAction:request.samplesPerAction||128});
 const solveWallMs=performance.now()-started;
 let checkpointBytes=0,cacheSaved=false;
 if(request.cache!==false&&generation===token)try{const snapshot=solver.snapshot();checkpointBytes=new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;cacheSaved=await cacheWrite(id,snapshot);}catch(e){cacheError=String(e);}
 return {version:SnapSolver.VERSION,stats:solver.stats(),analysis,cached,cacheSaved,cacheError,checkpointBytes,rangeMs,solveWallMs,totalMs:performance.now()-started,modelScope:model.beliefScope||'Explicit conditional ranges'};
}
onmessage=async event=>{
 const request=event.data||{};
 if(request.type==='cancel'){generation++;return;}
 const token=++generation;
 try{
  if(request.type==='benchmark'){
   const results=[];for(const name of ['public-final','hidden-final','two-turn-check','turn-6','turn-5','turn-3','turn-1']){
    if(generation!==token)return;postMessage({type:'benchmark-case',name});
    const cold=await solve({example:name,maxMs:1500,targetGap:.01,samplesPerAction:128,cache:true,readCache:false},token,false);
    if(!cold)return;const warm=cold.cacheSaved?await solve({example:name,maxMs:0,iterations:0,targetGap:.01,samplesPerAction:128,cache:true},token,false):null;
    if(generation!==token)return;
    results.push({name,coldMs:cold.solveWallMs,warmMs:warm?.cached?warm.solveWallMs:null,cacheAvailable:!!warm?.cached,coldWasCached:cold.cached,converged:cold.analysis.strategyValidated,gap:cold.stats.diagnostics.nashGap,maxConditionalGain:cold.stats.diagnostics.maxConditionalGain,states:cold.stats.informationStates,checkpointBytes:cold.checkpointBytes,algorithm:cold.stats.algorithm});
    postMessage({type:'benchmark-progress',results});
   }
   postMessage({type:'benchmark-result',results,metadata:{engineVersion:SnapSolver.VERSION,userAgent:typeof navigator==='object'?navigator.userAgent:'unknown',hardwareConcurrency:typeof navigator==='object'?navigator.hardwareConcurrency:null,budgetMs:1500,targetGap:.01,measurement:'This browser Worker. Existing IndexedDB cache hits are identified; they are not fresh cold solves.'}});
  }else{
   const result=await solve(request,token,true);if(result&&generation===token)postMessage({type:'result',...result});
  }
 }catch(error){if(generation===token)postMessage({type:'error',message:error.message,stack:error.stack});}
};
