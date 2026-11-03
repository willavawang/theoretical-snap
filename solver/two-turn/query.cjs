'use strict';
const crypto=require('node:crypto'),M=require('./model.cjs'),V=require('./verify.cjs'),G=require('../offline/game-state.cjs'),{OfflineSolver}=require('../offline/engine.cjs'),
  T=require('../endgame/model.cjs'),TV=require('../endgame/verify.cjs'),{conditionalFinalTurn}=require('./continuation.cjs');
function keyFor(lanes){const a=Array(18).fill(0);lanes.forEach((cs,l)=>cs.forEach(c=>{a[3*(c-1)+l]++;}));return a.join('');}
function query(game,policies,{gameState,player=0,placements,tolerance=1e-6}={}){
  if(![0,1].includes(player)||!gameState||gameState.phase!=='planning')throw new Error('A planning Game State Object and player are required');
  const state=gameState,offline=new OfflineSolver({model:game.input});G.toSolverState(offline,state);
  const root=state.root.players[player];
  // Determine only the querying player's private root type. Opponent truth is never a prior.
  const S=require('../../dist/solver/engine.js'),ownKey=T.typeKey({hand:S.costs(root.hand),remaining:S.costs(root.remaining),observations:root.observations||''});
  const i=game.types[player].findIndex(t=>t.key===ownKey);if(i<0)throw new Error('Own root information is absent from the supplied range');
  const ps=M.importPolicy(game,policies),certificate=V.evaluate(game,ps,{tolerance,includeActions:true});
  let rows,handEV,maximumEV,localCertificate=null,observationReach=null,info;
  if(state.turn===5){
    if(state.history.length)throw new Error('Unexpected history before root decision');
    const row=certificate.rows[player].find(t=>t.typeKey===ownKey);rows=row.actions.map(x=>({...x}));handEV=row.value;maximumEV=row.maximumEV;
  }else if(state.turn===6&&state.history.length===1){
    const entry=state.history[0],pair=entry.plays.map(keyFor);info=M.infoKey(player,6,ownKey,pair,entry.draws[player]);
    const node=game.nodes[player].find(n=>n.key===info);if(!node)throw new Error('Own observation is impossible under the supplied model');
    const values=M.values(game,ps,player),reach=values.reach[node.id];
    if(!(reach>0))return {status:'unavailable',reason:'The revealed opponent commitment has zero conditional reach under this profile; an off-policy belief assumption is required',certificate};
    const q=Array.from(values.q[node.id],x=>x/reach);maximumEV=Math.max(...q);handEV=q.reduce((v,x,j)=>v+x*ps[player][node.id][j],0);
    rows=node.groups.flatMap((group,j)=>group.map(a=>({actionKey:a.key,lanes:a.lanes,ev:q[j],frequency:ps[player][node.id][j]/group.length,evLoss:Math.max(0,maximumEV-q[j])})));
    const child=conditionalFinalTurn(game,policies,pair);observationReach=game.types[player][i].weight*ps[player][node.parent][node.parentAction]*reach;
    if(child.status==='available'&&observationReach>0)localCertificate=TV.verify(child.model,child.policies,{tolerance});
  }else throw new Error('The coupled query supports planning turns five and six');
  const submittedKey=placements?G.actionForPlacements(state,player,placements).key:null;
  rows=rows.map(a=>({...a,placements:G.placementsForAction(state,player,{lanes:a.lanes})}));
  const submitted=rows.find(a=>a.actionKey===submittedKey)||null;if(submitted)submitted.placements=placements.map(x=>({...x}));
  const best=rows.slice().sort((a,b)=>b.ev-a.ev||b.frequency-a.frequency);
  const validated=certificate.validated&&(state.turn===5||!!localCertificate?.validated);
  return {schema:'snap-coupled-decision-1',status:validated?'conditional-validated':'provisional',stateId:G.stateId(state),modelFingerprint:game.fingerprint,
    policyFingerprint:crypto.createHash('sha256').update(JSON.stringify(policies)).digest('hex'),player,turn:state.turn,rootTypeKey:ownKey,infoKey:info||M.infoKey(player,5,ownKey),
    units:'P(win) - P(loss)',certificate,continuationCertificate:localCertificate,observationReachProbability:observationReach,
    submitted,yourEV:submitted?submitted.ev:null,handEV,maximumEV,evLoss:submitted?submitted.evLoss:null,best:best[0],alternatives:best.filter(a=>a!==submitted),actions:rows,
    continuationConvention:'Turn-five action EV uses the same frozen returned continuation policy. Best-response EV additionally optimizes future own play. Turn-six validation also requires a local conditional-game check.',scope:game.scope};
}
module.exports={query};
