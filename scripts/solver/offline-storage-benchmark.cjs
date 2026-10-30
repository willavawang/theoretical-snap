#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process'),{performance}=require('node:perf_hooks');
const {OfflineSolver}=require('../../solver/offline/engine.cjs'),C=require('../../solver/offline/checkpoint.cjs'),{trainingDigest}=require('../../solver/offline/profile.cjs');
const args=process.argv.slice(2),get=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];},variant=get('variant'),iterations=Number(get('iterations',10000)),checkpoint=get('checkpoint'),out=path.resolve(get('out','artifacts/offline/storage-benchmark'));
if(!Number.isInteger(iterations)||iterations<0)throw new Error('Invalid iteration budget');
fs.mkdirSync(out,{recursive:true});
if(variant){
 if(!['strings','packed'].includes(variant))throw new Error('Unknown storage variant');
 const compactPrivateHistories=variant==='packed',start=performance.now(),s=checkpoint?C.load(path.resolve(checkpoint),{migrateLegacy:true,maxInfoStates:10000000,compactPrivateHistories}):new OfflineSolver({deckSelection:'equilibrium',decks:['all','all']},{seed:17,maxInfoStates:10000000,compactPrivateHistories}),loadedMs=performance.now()-start;
 const trainingStart=performance.now();s.run({iterations});const trainingMs=performance.now()-trainingStart;
 if(global.gc)global.gc();const memory=process.memoryUsage(),stats=s.stats(),digest=trainingDigest(s),saved=C.save(s,path.join(out,variant+'.bin'));
 const report={variant,checkpoint:checkpoint||null,additionalIterations:iterations,loadedMs,trainingMs,metadata:{cpu:os.cpus()[0].model,cores:os.cpus().length,memoryBytes:os.totalmem(),runtime:process.version,platform:process.platform,architecture:process.arch,buildHash:C.buildHash},memory,retainedBytes:memory.heapUsed+memory.arrayBuffers,stats,trainingDigest:digest,checkpointBytes:saved.bytes};
 fs.writeFileSync(path.join(out,variant+'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}else{
 const results=[];
 for(const name of ['strings','packed']){
  const child=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=4096',__filename,'--variant',name,'--iterations',String(iterations),'--out',out,...(checkpoint?['--checkpoint',checkpoint]:[])],{encoding:'utf8',maxBuffer:1048576});
  if(child.status!==0)throw new Error(child.stderr||'Storage benchmark failed');results.push(JSON.parse(child.stdout));
 }
 if(results[0].trainingDigest!==results[1].trainingDigest)throw new Error('Storage variants changed the training result');
 const [a,b]=results,report={results,identicalTraining:true,retainedBytesSaved:a.retainedBytes-b.retainedBytes,retainedReduction:1-b.retainedBytes/a.retainedBytes,checkpointBytesSaved:a.checkpointBytes-b.checkpointBytes,checkpointReduction:1-b.checkpointBytes/a.checkpointBytes,interpretation:'Isolated processes with identical seed, iterations and learned-table digest. RSS and elapsed time remain sensitive to allocation, GC and machine load. This does not solve the full-game table-size problem.'};
 fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
