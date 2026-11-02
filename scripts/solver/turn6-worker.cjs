#!/usr/bin/env node
'use strict';
const readline=require('node:readline'),S=require('../../dist/solver/engine.js'),M=require('../../solver/endgame/model.cjs'),V=require('../../solver/endgame/verify.cjs'),{FinalTurnCFR}=require('../../solver/endgame/cfr.cjs'),{fixtures}=require('../../solver/endgame/cases.cjs');
if(process.argv.includes('--cases')){require('node:fs').writeFileSync(1,JSON.stringify(fixtures())+'\n');process.exit(0);}
const cache=new Map();
function legacyPolicy(solver){
  const types=solver.model.ranges||[0,1].map(p=>[...new Map(solver.model.cases.map(c=>[M.typeKey(c.players[p]),c.players[p]])).values()]);
  return types.map((ts,p)=>ts.map(t=>{
    const other=types[1-p][0],players=p===0?[t,other]:[other,t],state=S.initialState(solver.model,{players}),actions=solver.actions(state,p),q=solver.policy(state,p);
    return {typeKey:M.typeKey(t),probabilities:Object.fromEntries(actions.map((a,i)=>[a.key,q[i]]))};
  }));
}
function handle(r){
  if(r.op==='verify')return V.verify(r.model,r.policies,{tolerance:r.tolerance||1e-6,includeActions:!!r.includeActions});
  const start=performance.now(),algorithm=r.algorithm||'reduced-cfr',key=JSON.stringify([r.model,algorithm]);
  let entry=cache.get(key),compileMs=0;const reused=!!entry;
  if(!entry){
    const cstart=performance.now();
    if(algorithm==='legacy-cfr')entry={solver:new S.Solver(r.model,{algorithm:'matrix',maxInfoStates:100000,maxMatrixCells:2000000})};
    else{const game=M.compile(r.model,{reduce:algorithm!=='raw-cfr'});entry={game,solver:new FinalTurnCFR(game)};}
    compileMs=performance.now()-cstart;if(cache.size>=4)cache.clear();cache.set(key,entry);
  }
  if(r.op==='compile')return {stats:entry.game.stats,fingerprint:entry.game.fingerprint,permutation:entry.game.permutation,compileMs};
  let result;
  if(algorithm==='legacy-cfr'){
    const t=performance.now(),before=entry.solver.iterations;
    const stats=entry.solver.run({iterations:r.iterations||1e12,maxMs:r.milliseconds||1000,targetGap:r.tolerance||1e-6,stopAtTarget:r.stopAtTarget!==false});
    const optimizationMs=performance.now()-t,policies=legacyPolicy(entry.solver),vstart=performance.now(),certificate=V.verify(r.model,policies,{tolerance:r.tolerance||1e-6});
    result={algorithm:'Existing Bayesian matrix CFR+',iterations:entry.solver.iterations,additionalIterations:entry.solver.iterations-before,optimizationMs,verificationMs:performance.now()-vstart,policies,certificate,stats,stopReason:entry.solver.stopReason};
  }else result=entry.solver.run({iterations:r.iterations||Infinity,milliseconds:r.milliseconds||1000,tolerance:r.tolerance||1e-6,stopAtTarget:r.stopAtTarget!==false});
  if(!r.includeRows)delete result.certificate.rows;
  if(r.includePolicies===false)delete result.policies;
  return {...result,reusedCompiledGame:reused,compileMs,totalMs:performance.now()-start,compilerStats:entry.game?entry.game.stats:null,
    peakRssBytes:process.resourceUsage().maxRSS*1024,rssScope:'Worker lifetime high-water mark; isolate workers for per-case peaks',heapUsedBytes:process.memoryUsage().heapUsed};
}
console.log(JSON.stringify({ready:true,node:process.version,platform:process.platform,architecture:process.arch}));
const reader=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
reader.on('line',line=>{try{console.log(JSON.stringify({ok:true,result:handle(JSON.parse(line))}));}catch(e){console.log(JSON.stringify({ok:false,error:e.stack}));}});
