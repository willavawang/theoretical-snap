#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks'),C=require('../../solver/offline/checkpoint.cjs'),{coverage,trainingDigest}=require('../../solver/offline/profile.cjs'),{census}=require('../../solver/offline/census.cjs'),G=require('../../solver/offline/game-state.cjs'),D=require('../../solver/offline/decision.cjs'),{sampleGame}=require('../../solver/offline/replay.cjs');
const args=process.argv.slice(2),get=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];},file=get('checkpoint');if(!file)throw new Error('--checkpoint is required');
const s=C.load(path.resolve(file),{maxInfoStates:10000000}),samples=Number(get('samples',2000)),out=path.resolve(get('out',path.join(path.dirname(file),'profile.json'))),digest=trainingDigest(s),replays=[701,81,17,37,51,111,1901,4901].map(seed=>({seed,replay:sampleGame(s,{seed})})),latencies=[];
for(const turn of [...new Set([s.model.turn,3,6])]){
 const candidates=replays.map(({seed,replay})=>({seed,g:replay.states.find(g=>g.turn===turn&&g.phase==='planning')})).filter(x=>x.g).map(x=>({...x,actions:s.actions(G.toSolverState(s,x.g),0)})).sort((a,b)=>b.actions.length-a.actions.length);if(!candidates.length)continue;
 const {g,actions,seed:gameSeed}=candidates[0],action=actions.at(-1);
 for(const method of ['prior-rejection','public-envelope']){
  const start=performance.now(),report=D.analyzeDecision(s,g,0,G.placementsForAction(g,0,action),{samples:Number(get('decision-samples',128)),maxAttempts:Number(get('posterior-attempts',10000)),seed:922,rejectionEnvelope:method==='public-envelope'});
  latencies.push({turn,gameSeed,method,requestedActionCount:actions.length,elapsedMs:performance.now()-start,status:report.status,available:report.status!=='unavailable',reason:report.reason,actionCount:report.actions?report.actions.length:null,belief:report.belief,maxSamplingError:report.actions?Math.max(...report.actions.map(a=>a.evError95)):null});
 }
}
const report={schema:'numerical-snap-profile-1',iterations:s.iterations,trainingDigest:digest,census:census(),coverage:[coverage(s,{samples}),coverage(s,{samples,seed:882,uniformDecks:true})],decisionWorkload:'For each turn, the largest legal-action count among eight deterministic frozen-policy replays. This is a workload comparison, not a representative latency distribution.',decisionLatencies:latencies,interpretation:'Decision timing is sampled frozen-policy evaluation, not equilibrium solving. Timing at a rare public history can end unavailable when posterior rejection exhausts its budget.'};
if(trainingDigest(s)!==digest)throw new Error('Profiling changed the learned strategy');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log('OFFLINE_PROFILE_BEGIN');console.log(JSON.stringify(report));console.log('OFFLINE_PROFILE_END');
