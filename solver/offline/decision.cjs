'use strict';
const {S,cumulative,pickCDF,deal}=require('./engine.cjs'),G=require('./game-state.cjs');
function posteriorSamples(solver,g,player,{samples,maxAttempts,seed}){
 const r=S.rng(seed),own=g.root.players[player],ownType={hand:S.costs(own.hand),remaining:S.costs(own.remaining),...(own.observations?{observations:own.observations}:{})};let sample;
 if(solver.pools){const q=solver.deckPolicies()[1-player],cdf=cumulative(q);sample=()=>{const players=[];players[player]=ownType;players[1-player]=deal(solver.pools[1-player][pickCDF(cdf,r)],r);return {players};};}
 else{const q=S.Solver.prototype.queryWorlds.call(solver,{...own,player}),cdf=cumulative(q.worlds.map(w=>w.weight));sample=()=>q.worlds[pickCDF(cdf,r)];}
 const states=[];let attempts=0;
 while(states.length<samples&&attempts<maxAttempts){attempts++;const result=G.replayRoot(solver,g,sample().players,r,player);if(result&&r.next()<result.likelihood)states.push(result.state);}
 return {states,attempts,method:'Exact rejection conditioning on the frozen averaged reference policy',accepted:states.length};
}
function analyzeDecision(solver,g,player,placements,options={}){
 if(player!==0&&player!==1)throw new Error('Invalid player');if(g.phase!=='planning')throw new Error('Analysis requires a pre-commit position');
 const state=G.toSolverState(solver,g),submitted=G.actionForPlacements(g,player,placements),actions=solver.actions(state,player),frequency=solver.policy(state,player),samples=options.samples||512,seed=options.seed||1701;
 const belief=posteriorSamples(solver,g,player,{samples,maxAttempts:options.maxAttempts||Math.max(samples,50000),seed});
 const base={schema:'numerical-snap-decision-1',stateId:G.stateId(g),modelFingerprint:solver.fingerprint,policyIterations:solver.iterations,player,turn:g.turn,units:'P(win) - P(loss)',view:G.viewForPlayer(g,player),belief:{...belief,states:undefined}};
 if(belief.states.length<Math.min(32,samples))return {...base,status:'unavailable',reason:'Posterior sample budget exhausted; the actual hidden hand was not substituted.'};
 const count=belief.states.length,error=Math.min(2,Math.sqrt(2*Math.log(2*actions.length/.05)/count)),rows=[];
 for(let a=0;a<actions.length;a++){const r=S.rng(seed+1),wdl=[0,0,0];let value=0;for(const source of belief.states){let s=source;if(player===0)s=solver.transition(s,actions[a],false);else{const as=solver.actions(s,0),q=solver.policy(s,0),i=pickCDF(cumulative(q),r);s=solver.transition(s,as[i],false);s=solver.transition(s,actions[a],false);}const u=solver.rollout(s,r)*(player===0?1:-1);value+=u;wdl[u>0?0:u===0?1:2]++;}rows.push({actionKey:actions[a].key,placements:G.placementsForAction(g,player,actions[a]),lanes:actions[a].lanes,frequency:frequency[a],ev:value/count,wdl:wdl.map(n=>n/count),evError95:error,samples:count});}
 const maximumEV=Math.max(...rows.map(x=>x.ev));for(const row of rows){row.evLoss=Math.max(0,maximumEV-row.ev);row.lossInterval95=[Math.max(0,row.evLoss-2*error),Math.min(2,row.evLoss+2*error)];row.assessment='provisional';}
 const own=rows.find(x=>x.actionKey===submitted.key),best=rows.slice().sort((a,b)=>b.ev-a.ev||b.frequency-a.frequency);
 return {...base,status:'provisional',reason:'Frozen-strategy action values; full-game equilibrium error is not certified.',submitted:own,yourEV:own.ev,maximumEV,evLoss:own.evLoss,best:best[0],alternatives:best.filter(x=>x!==own).slice(0,options.alternatives||8),actions:rows,uncertainty:'Simultaneous 95% sampling bound; excludes error in the reference strategy. Every action uses the same posterior.'};
}
module.exports={posteriorSamples,analyzeDecision};
