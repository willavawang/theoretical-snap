'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {performance}=require('node:perf_hooks'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'../../dist/solver');
function harness(onMessage=()=>{}){
 const messages=[],sandbox={setTimeout,clearTimeout,performance,TextEncoder,crypto:webcrypto,onmessage:null,postMessage(message){messages.push(message);onMessage(message,sandbox);}};
 sandbox.self=sandbox;
 const context=vm.createContext(sandbox);
 sandbox.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.resolve(root,file),'utf8'),context,{filename:file}));
 vm.runInContext(fs.readFileSync(path.join(root,'worker.js'),'utf8'),context,{filename:'worker.js'});
 return {messages,send:data=>sandbox.onmessage({data})};
}
test('Worker protocol returns validated EVs and reports unavailable persistent cache',async()=>{
 const h=harness();await h.send({type:'solve',example:'hidden-final',maxMs:5000,iterations:2000,targetGap:.02,cache:true});
 const errors=h.messages.filter(m=>m.type==='error');assert.deepEqual(errors,[]);
 const r=h.messages.find(m=>m.type==='result');assert.ok(r);
 assert.equal(r.analysis.strategyValidated,true);assert.equal(r.cached,false);assert.equal(r.cacheSaved,false);
 assert.ok(r.checkpointBytes>0);assert.ok(r.analysis.actions.length>1);assert.ok(h.messages.some(m=>m.type==='evaluating'));
 for(const a of r.analysis.actions)assert.ok(Math.abs(a.wdl.reduce((s,v)=>s+v,0)-1)<1e-10);
});
test('Worker cancellation suppresses a stale result and invalid models return an error',async()=>{
 const h=harness((m,s)=>{if(m.type==='progress')void s.onmessage({data:{type:'cancel'}});});
 await h.send({type:'solve',example:'public-final',maxMs:5000,iterations:1000,targetGap:1e-9,cache:false});
 assert.ok(h.messages.some(m=>m.type==='progress'));assert.equal(h.messages.some(m=>m.type==='result'),false);
 await h.send({type:'solve',model:{turn:0},cache:false});
 assert.ok(h.messages.some(m=>m.type==='error'&&/Invalid/.test(m.message)));
});
test('Workbench and Worker scripts parse without browser globals',()=>{
 for(const file of ['worker.js','lab.js'])new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});
});
