'use strict';
const {S,cumulative,pickCDF,deal,actionByKey}=require('./engine.cjs'),G=require('./game-state.cjs');
const policyIdentity=require('./policy-identity.cjs');
function rejectionEnvelope(solver,g,player){
 const opponent=1-player,slots=g.root.board[opponent].map(l=>l.length),steps=[],needed=new Map();let publicId=0;
 for(const entry of g.history){
  const pair=entry.plays.map(lanes=>{const key=Array(18).fill(0);lanes.forEach((cs,l)=>cs.forEach(c=>key[(c-1)*3+l]++));return actionByKey.get(key.join(''));}),action=pair[opponent];
  // Every compatible hand contains these played cards. Its legal-action set
  // contains that of this subset, bounding an unvisited uniform policy.
  const step={publicId,actionId:action.id,bound:1/S.legalActions(action.removed,entry.turn,slots).length};steps.push(step);
  if(publicId!==undefined&&step.bound<1){if(!needed.has(publicId))needed.set(publicId,[]);needed.get(publicId).push(step);}
  for(let l=0;l<3;l++)slots[l]+=action.slots[l];
  publicId=publicId===undefined?undefined:solver.publicChild(publicId,pair[0].id,pair[1].id,false);
 }
 // Averaged trained policies can exceed the uniform bound. Inspect all stored
 // opponent nodes at each requested public prefix, without conditioning on an
 // actual hidden hand. Unrepresented nodes retain the safe uniform bound.
 if(needed.size)for(const key of solver.nodes.keys()){
  if(key%2!==opponent)continue;const matches=needed.get(Math.floor(key/4294967296));if(!matches)continue;
  const node=solver.nodes.get(key),mass=node.average.reduce((a,b)=>a+b,0);if(!mass)continue;
  for(const step of matches){const index=node.actions.findIndex(a=>a.id===step.actionId);if(index>=0)step.bound=Math.max(step.bound,node.average[index]/mass);}
 }
 return {bound:steps.reduce((b,step)=>b*step.bound,1),steps:steps.map(step=>({publicId:step.publicId,actionId:step.actionId,bound:step.bound}))};
}
function posteriorSamples(solver,g,player,{samples,maxAttempts,seed,rejectionEnvelope:useEnvelope=true}){
 const r=S.rng(seed),own=g.root.players[player],ownType={hand:S.costs(own.hand),remaining:S.costs(own.remaining),...(own.observations?{observations:own.observations}:{})};let sample;
 if(solver.pools){const q=solver.deckPolicies()[1-player],cdf=cumulative(q);sample=()=>{const players=[];players[player]=ownType;players[1-player]=deal(solver.pools[1-player][pickCDF(cdf,r)],r);return {players};};}
 else{const q=S.Solver.prototype.queryWorlds.call(solver,{...own,player}),cdf=cumulative(q.worlds.map(w=>w.weight));sample=()=>q.worlds[pickCDF(cdf,r)];}
 const envelope=useEnvelope?rejectionEnvelope(solver,g,player):{bound:1,steps:[]},states=[];let attempts=0;
 while(states.length<samples&&attempts<maxAttempts){attempts++;const result=G.replayRoot(solver,g,sample().players,r,player);if(result){if(result.likelihood>envelope.bound+1e-12)throw new Error('Invalid public-history rejection envelope');if(r.next()<Math.min(1,result.likelihood/envelope.bound))states.push(result.state);}}
 return {states,attempts,method:'Exact rejection conditioning on the frozen averaged reference policy',likelihoodUpperBound:envelope.bound,accepted:states.length};
}
function analyzeDecision(solver,g,player,placements,options={}){
 if(player!==0&&player!==1)throw new Error('Invalid player');if(g.phase!=='planning')throw new Error('Analysis requires a pre-commit position');
 const state=G.toSolverState(solver,g),submitted=G.actionForPlacements(g,player,placements),actions=solver.actions(state,player),frequency=solver.policy(state,player),samples=options.samples||512,seed=options.seed||1701;
 const belief=posteriorSamples(solver,g,player,{samples,maxAttempts:options.maxAttempts||Math.max(samples,50000),seed,rejectionEnvelope:options.rejectionEnvelope!==false});
 const base={schema:'numerical-snap-decision-1',stateId:G.stateId(g),modelFingerprint:G.gameFingerprint(solver),policyFingerprint:policyIdentity.fingerprint(solver),policyIdentity:policyIdentity.identity(solver),policyIterations:solver.iterations,player,turn:g.turn,units:'P(win) - P(loss)',view:G.viewForPlayer(g,player),belief:{...belief,states:undefined}};
 if(belief.states.length<Math.min(32,samples))return {...base,status:'unavailable',reason:'Posterior sample budget exhausted; the actual hidden hand was not substituted.'};
 const count=belief.states.length,error=Math.min(2,Math.sqrt(2*Math.log(2*actions.length/.05)/count)),rows=[];
 for(let a=0;a<actions.length;a++){const r=S.rng(seed+1),wdl=[0,0,0];let value=0;for(const source of belief.states){let s=source;if(player===0)s=solver.transition(s,actions[a],false);else{const as=solver.actions(s,0),q=solver.policy(s,0),i=pickCDF(cumulative(q),r);s=solver.transition(s,as[i],false);s=solver.transition(s,actions[a],false);}const u=solver.rollout(s,r)*(player===0?1:-1);value+=u;wdl[u>0?0:u===0?1:2]++;}rows.push({actionKey:actions[a].key,placements:G.placementsForAction(g,player,actions[a]),lanes:actions[a].lanes,frequency:frequency[a],ev:value/count,wdl:wdl.map(n=>n/count),evError95:error,samples:count});}
 const maximumEV=Math.max(...rows.map(x=>x.ev));for(const row of rows){row.evLoss=Math.max(0,maximumEV-row.ev);row.lossInterval95=[Math.max(0,row.evLoss-2*error),Math.min(2,row.evLoss+2*error)];row.assessment='provisional';}
 const own=rows.find(x=>x.actionKey===submitted.key),best=rows.slice().sort((a,b)=>b.ev-a.ev||b.frequency-a.frequency);
 // Identical-cost copies share a strategic action, but the user's actual drag
 // must keep its physical card IDs for the submitted-plan preview.
 own.placements=placements.map(x=>({...x}));
 return {...base,status:'provisional',reason:'Frozen-strategy action values; full-game equilibrium error is not certified.',submitted:own,yourEV:own.ev,handEV:rows.reduce((v,a)=>v+a.frequency*a.ev,0),maximumEV,evLoss:own.evLoss,best:best[0],alternatives:best.filter(x=>x!==own).slice(0,options.alternatives||8),actions:rows,uncertainty:'Simultaneous 95% sampling bound; excludes error in the reference strategy. Every action uses the same posterior.'};
}
module.exports={posteriorSamples,analyzeDecision,rejectionEnvelope};
