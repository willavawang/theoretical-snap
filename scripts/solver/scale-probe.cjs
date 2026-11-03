'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process'),{performance}=require('node:perf_hooks');
const S=require('../../dist/solver/engine.js'),R=require('../../dist/solver/ranges.js');
const bytes=()=>{if(global.gc)global.gc();const m=process.memoryUsage();return {heap:m.heapUsed,buffers:m.arrayBuffers,rss:m.rss};};
function allDecks(){const out=[],counts=Array(6).fill(0);function visit(c,left){if(c===5){counts[c]=left;out.push({cards:S.cards(counts),weight:1});return;}for(let n=0;n<=left;n++){counts[c]=n;visit(c+1,left-n);}}visit(0,12);return out;}
function probe(mode){
 const before=bytes(),start=performance.now(),decks=mode==='all-decks'?allDecks():null;
 const model=decks?R.fromDecks({decks:[decks,decks]}):R.example('turn-1'),rangeMs=performance.now()-start,afterRanges=bytes();
 const setupStart=performance.now(),solver=new S.Solver(model,{algorithm:'sampled',seed:17,maxInfoStates:mode==='all-decks'?25000:100000}),constructorMs=performance.now()-setupStart,afterSetup=bytes();
 const trainingStart=performance.now(),stats=solver.run({iterations:50000,maxMs:3000}),trainingWallMs=performance.now()-trainingStart,afterTraining=bytes();
 return {mode,deckTypes:decks?decks.length:3,rootTypes:model.ranges.map(r=>r.length),rangeMs,constructorMs,trainingWallMs,retainedRangesBytes:afterRanges.heap+afterRanges.buffers-before.heap-before.buffers,retainedSetupBytes:afterSetup.heap+afterSetup.buffers-before.heap-before.buffers,retainedAfterTrainingBytes:afterTraining.heap+afterTraining.buffers-before.heap-before.buffers,rssAfterTraining:afterTraining.rss,stats,accuracy:'No exhaustive full-game accuracy bound is available. These are resource probes, not solved games.'};
}
if(process.argv[2])console.log(JSON.stringify(probe(process.argv[2])));
else{
 const results=[];for(const mode of ['three-decks-100k','all-decks']){const r=spawnSync(process.execPath,['--expose-gc',__filename,mode],{encoding:'utf8',maxBuffer:5000000});if(r.status!==0)throw new Error(r.stderr||'Probe failed');results.push(JSON.parse(r.stdout));}
 const result={metadata:{generatedAt:new Date().toISOString(),runtime:process.version,cpu:os.cpus()[0].model,memoryBytes:os.totalmem(),engineHash:crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../../dist/solver/engine.js'))).digest('hex'),measurement:'One native Node run per configuration. Retained memory after GC, not peak/browser memory. No time-to-equilibrium claim.'},results};
 fs.mkdirSync(path.resolve(__dirname,'../../benchmarks'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../../benchmarks/solver-scale-probe.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
