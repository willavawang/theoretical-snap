'use strict';
const crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {S,pick}=require('./engine.cjs'),{worldSampler}=require('./evaluate.cjs');

// Independent of the private-history representation; used for storage A/B tests.
function trainingDigest(s){
 const hash=crypto.createHash('sha256'),buffer=Buffer.allocUnsafe(65536);let offset=0;
 function number(n){if(offset+8>buffer.length){hash.update(buffer.subarray(0,offset));offset=0;}buffer.writeDoubleLE(n,offset);offset+=8;}
 for(const n of [s.random.state,s.iterations,s.passes,s.visits,s.nodes.size])number(n);
 for(const node of s.nodes.values()){
  number(node.key);number(node.updates);number(node.actions.length);
  for(const a of node.actions)number(a.id);
  for(const n of node.regret)number(n);for(const n of node.average)number(n);
 }
 if(s.deckNodes)for(const node of s.deckNodes){for(const n of node.regret)number(n);for(const n of node.average)number(n);}
 hash.update(buffer.subarray(0,offset));return hash.digest('hex');
}
function coverage(s,{samples=2000,seed=881,uniformDecks=false}={}){
 if(!Number.isInteger(samples)||samples<1)throw new Error('Coverage needs positive samples');
 const r=S.rng(seed),probabilities=uniformDecks&&s.pools?s.pools.map(pool=>new Float64Array(pool.length).fill(1/pool.length)):undefined,sample=worldSampler(s,r,probabilities),turns=Array.from({length:s.model.rules.turns},(_,i)=>({turn:i+1,players:[0,1].map(()=>({decisions:0,forced:0,trained:0,nontrivial:0,nontrivialTrained:0}))}));
 const start=performance.now(),before=s.nodes.size;
 for(let i=0;i<samples;i++){
  let state=s.root(S.initialState(s.model,sample()));
  while(state.phase!==3){
   if(state.phase===2){const xs=S.chance(state,s.model),x=xs[pick(xs.map(x=>x.probability),r)];state=S.applyDraw(state,x.cost);}
   else{
    const p=state.phase,actions=s.actions(state,p),node=s.nodes.get(s.key(state,p)),row=turns[state.turn-1].players[p],trained=!!node&&node.updates>0;
    row.decisions++;if(trained)row.trained++;
    if(actions.length===1)row.forced++;else{row.nontrivial++;if(trained)row.nontrivialTrained++;}
    state=s.transition(state,actions[pick(s.policy(state,p),r)],false);
   }
  }
 }
 for(const turn of turns)for(const p of turn.players){p.trainedFraction=p.decisions?p.trained/p.decisions:null;p.nontrivialTrainedFraction=p.nontrivial?p.nontrivialTrained/p.nontrivial:null;}
 if(s.nodes.size!==before)throw new Error('Coverage evaluation mutated the training table');
 return {samples,seed,rootDeckDistribution:uniformDecks&&s.pools?'uniform over configured decks':'frozen reference deck mixture',elapsedMs:performance.now()-start,turns,scope:'Monte Carlo visitation coverage, not strategic accuracy. Unvisited nontrivial decisions use the uniform fallback. Forced decisions need no learned choice.'};
}
module.exports={trainingDigest,coverage};
