'use strict';
const {S,pick}=require('./engine.cjs'),G=require('./game-state.cjs');
function sampleGame(solver,{seed=701}={}){
 const r=S.rng(seed+1);let gameState=G.makeGameState(solver,{seed});const states=[gameState],steps=[];
 while(gameState.phase==='planning'){
  const s=G.toSolverState(solver,gameState),policies=[0,1].map(p=>solver.policy(s,p)),choices=policies.map(p=>pick(p,r)),actions=choices.map((i,p)=>solver.actions(s,p)[i]),plans=actions.map((a,p)=>G.placementsForAction(gameState,p,a));
  steps.push({turn:gameState.turn,plans,probabilities:choices.map((i,p)=>policies[p][i]),trainedInformationStates:[0,1].map(p=>solver.nodes.has(solver.key(s,p))),views:[0,1].map(p=>G.viewForPlayer(gameState,p))});
  gameState=G.commitTurn(gameState,plans);G.toSolverState(solver,gameState);states.push(gameState);
 }
 return {schema:'numerical-snap-replay-1',modelFingerprint:G.gameFingerprint(solver),policyFingerprint:solver.fingerprint,policyIterations:solver.iterations,seed,states,steps,outcome:gameState.outcome,scope:'A reproducible game from the frozen averaged strategy. Unvisited information states are explicitly marked; this replay does not certify equilibrium.'};
}
module.exports={sampleGame};
