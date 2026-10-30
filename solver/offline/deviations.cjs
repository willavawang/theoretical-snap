'use strict';
const {OfflineSolver}=require('./engine.cjs'),{evaluateRollouts}=require('./evaluate.cjs'),{performance}=require('node:perf_hooks');
function probe(reference,{seconds=3,samples=3000,maxInfoStates=100000,memoryMiB=2048,seed=4901,iterations=Infinity}={}){
 const base=evaluateRollouts(reference,{samples,seed,alpha:.05/3}),results=[];
 for(let player=0;player<2;player++){
  const deviation=new OfflineSolver(reference.spec,{seed:seed+player+1,maxInfoStates,reference,updaterOnly:player,terminalEnumeration:reference.terminalEnumeration,opponentExploration:reference.opponentExploration}),start=performance.now();
  while(performance.now()-start<seconds*1000&&deviation.iterations<iterations){deviation.run({iterations:Math.min(100,iterations-deviation.iterations),maxMs:100});if(deviation.stopReason==='memory'||process.memoryUsage().rss>memoryMiB*1048576)break;}
  const probabilities=reference.pools?reference.deckPolicies():undefined;if(probabilities)probabilities[player]=deviation.deckPolicies()[player];
  const v=evaluateRollouts(deviation,{samples,seed:seed+player+11,alpha:.05/3,opponentSolver:reference,opponentPlayer:1-player,probabilities}),ownEV=player===0?v.ev:-v.ev,baselineEV=player===0?base.ev:-base.ev,error=v.evError95+base.evError95;
  results.push({player,trainingMs:performance.now()-start,training:deviation.stats(),valueForPlayer0:v.ev,error:v.evError95,ownEV,estimatedGain:ownEV-baselineEV,gainInterval95:[ownEV-baselineEV-error,ownEV-baselineEV+error]});
 }
 const gap=results[0].valueForPlayer0-results[1].valueForPlayer0,error=results[0].error+results[1].error;
 return {referenceIterations:reference.iterations,modelFingerprint:reference.fingerprint,baseline:base,deviations:results,foundNashGap:gap,exploitabilityLowerBound95:Math.max(0,(gap-error)/2),certifiedUpperBound:false,interpretation:'Learned information-constrained deviations give a lower bound on exploitability. Failure to find a profitable deviation does not certify equilibrium. Confidence is simultaneous 95% for the frozen-policy Monte Carlo evaluations, not a bound on optimizer quality.'};
}
module.exports={probe};
