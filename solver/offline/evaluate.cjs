'use strict';
const {S,deal,cumulative,pickCDF}=require('./engine.cjs'),R=require('../../dist/solver/ranges.js');
function exactModel(solver,model,maxTreeNodes){
 const e=new S.Solver(model,{algorithm:'full',maxTreeNodes,maxInfoStates:maxTreeNodes});
 for(const [key,indices]of e.tree.groups){const state=e.tree.nodes[indices[0]].state,n=e.nodes.get(key),p=solver.policy(state,n.player);if(n.actions.map(a=>a.key).join('|')!==solver.actions(state,n.player).map(a=>a.key).join('|'))throw new Error('Action ordering mismatch in independent evaluator');n.average.set(p);}
 return {...e.diagnostics(),treeNodes:e.tree.nodes.length,informationStates:e.nodes.size};
}
function evaluateExact(solver,{maxTreeNodes=100000,targetGap=.01,maxDecks=8}={}){
 try{
  if(!solver.pools){const d=exactModel(solver,solver.spec.model,maxTreeNodes);return {...d,targetGap,validated:d.nashGap<=targetGap&&d.maxConditionalGain<=targetGap};}
  if(solver.pools.some(p=>p.length>maxDecks))return {certified:false,validated:false,reason:'Full-game exhaustive deviation budget exceeded; every deck remains available during training.'};
  const ps=solver.deckPolicies(),decks=solver.pools.map((pool,p)=>pool.map((d,i)=>({cards:S.cards(d.counts),weight:ps[p][i]}))),model=R.fromDecks({decks});model.rules=solver.model.rules;
  const profile=exactModel(solver,model,maxTreeNodes);if(!solver.deckSelection)return {...profile,targetGap,validated:profile.nashGap<=targetGap&&profile.maxConditionalGain<=targetGap};
  const best=[-Infinity,-Infinity];let trees=profile.treeNodes;
  for(let p=0;p<2;p++)for(const deck of solver.pools[p]){const distribution=decks.slice();distribution[p]=[{cards:S.cards(deck.counts),weight:1}];const m=R.fromDecks({decks:distribution});m.rules=solver.model.rules;const d=exactModel(solver,m,maxTreeNodes);best[p]=Math.max(best[p],p===0?d.upper:-d.lower);trees+=d.treeNodes;}
  const gap=Math.max(0,best[0]+best[1]);return {certified:true,validated:gap<=targetGap,conditionalRootCoverageValidated:profile.maxConditionalGain<=targetGap,targetGap,value:profile.value,upper:best[0],lower:-best[1],nashGap:gap,exploitability:gap/2,maxConditionalGain:profile.maxConditionalGain,checkedDecks:solver.pools.map(p=>p.length),treeNodes:trees,method:'Exhaustive information-constrained deviations including private deck choice',scope:'This configured deck universe and rules; not every rare future information state.'};
 }catch(e){if(!(e instanceof S.BudgetError))throw e;return {certified:false,validated:false,reason:e.message};}
}
function worldSampler(solver,r,probabilities){
 if(!solver.pools)return ()=>solver.world(r);
 const ps=probabilities||solver.deckPolicies(),cdf=ps.map(cumulative);
 return ()=>{const ids=cdf.map(c=>pickCDF(c,r)),players=ids.map((id,p)=>deal(solver.pools[p][id],r));return {players,deckIDs:ids};};
}
function evaluateRollouts(solver,{samples=5000,seed=901,alpha=.05,opponentSolver,opponentPlayer,probabilities}={}){
 const r=S.rng(seed),sample=worldSampler(solver,r,probabilities),wdl=[0,0,0];let total=0;
 for(let i=0;i<samples;i++){const u=solver.rollout(solver.root(S.initialState(solver.model,sample())),r,opponentSolver,opponentPlayer);total+=u;wdl[u>0?0:u===0?1:2]++;}
 return {samples,ev:total/samples,wdl:wdl.map(n=>n/samples),evError95:Math.min(2,Math.sqrt(2*Math.log(2/alpha)/samples)),confidence:1-alpha,scope:'Frozen-profile Monte Carlo value; not an exploitability upper bound.'};
}
module.exports={evaluateExact,evaluateRollouts,worldSampler,exactModel};
