'use strict';
const {S,actionByKey,pick}=require('./engine.cjs'),{worldSampler}=require('./evaluate.cjs'),crypto=require('node:crypto');
const costCards=(g,p,ids)=>ids.map(id=>{const c=g.players[p].cards.find(c=>c.id===id);if(!c)throw new Error('Unknown card '+id);return c.cost;});
function makeGameState(solver,{seed=1,world}={}){
 const r=S.rng(seed),w=world||worldSampler(solver,r)(),root={turn:solver.model.turn,board:solver.model.rawBoard,players:w.players.map(p=>({hand:S.cards(p.hand),remaining:S.cards(p.remaining),...(p.observations?{observations:p.observations}:{})}))};
 const players=root.players.map((type,p)=>{let next=0;const cards=[];const add=c=>{const id='p'+p+'-'+String(next++).padStart(2,'0');cards.push({id,cost:c});return id;},board=root.board[p].map(xs=>xs.map(add)),hand=type.hand.map(add),drawPile=type.remaining.map(add);for(let i=drawPile.length-1;i>0;i--){const j=Math.floor(r.next()*(i+1));[drawPile[i],drawPile[j]]=[drawPile[j],drawPile[i]];}return {cards,board,hand,drawPile};});
 return {schema:'numerical-snap-game-state-1',modelFingerprint:gameFingerprint(solver),rules:solver.model.rules,root,turn:root.turn,phase:'planning',players,history:[],seed};
}
function actionForPlacements(g,p,placements){
 if(!Array.isArray(placements))throw new Error('Placements must be an array');const seen=new Set(),allocation=Array(18).fill(0),slots=g.players[p].board.map(l=>l.length);let energy=0;
 for(const x of placements){if(!Number.isInteger(x.lane)||x.lane<0||x.lane>2||seen.has(x.cardId)||!g.players[p].hand.includes(x.cardId))throw new Error('Illegal card placement');seen.add(x.cardId);const c=costCards(g,p,[x.cardId])[0];energy+=c;slots[x.lane]++;allocation[(c-1)*3+x.lane]++;}
 if(energy>g.turn||slots.some(n=>n>4))throw new Error('Energy or lane capacity exceeded');const a=actionByKey.get(allocation.join(''));if(!a)throw new Error('Unsupported complete action');return a;
}
function placementsForAction(g,p,a){const available=g.players[p].hand.slice(),out=[];a.lanes.forEach((cs,lane)=>cs.forEach(c=>{const i=available.findIndex(id=>costCards(g,p,[id])[0]===c);if(i<0)throw new Error('Action is incompatible with hand');out.push({cardId:available[i],lane});available.splice(i,1);}));return out;}
function commitTurn(g,plans){
 if(g.phase!=='planning'||plans.length!==2)throw new Error('Game is not accepting a turn');const actions=plans.map((p,i)=>actionForPlacements(g,i,p)),out=JSON.parse(JSON.stringify(g)),entry={turn:g.turn,plans:JSON.parse(JSON.stringify(plans)),plays:actions.map(a=>a.lanes),draws:[0,0],drawIds:[null,null]};
 for(let p=0;p<2;p++)for(const x of plans[p]){out.players[p].hand.splice(out.players[p].hand.indexOf(x.cardId),1);out.players[p].board[x.lane].push(x.cardId);}
 if(g.turn===g.rules.turns){out.phase='finished';out.outcome=S.terminal({power:out.players.map((p,i)=>p.board.map(ids=>costCards(out,i,ids).reduce((s,x)=>s+x,0)))});}
 else{out.turn++;for(let p=0;p<2;p++){const x=out.players[p];if(x.hand.length<g.rules.handLimit&&x.drawPile.length){const id=x.drawPile.shift();x.hand.push(id);entry.draws[p]=costCards(out,p,[id])[0];entry.drawIds[p]=id;}}}out.history.push(entry);return out;
}
function replayRoot(solver,g,players,randomOpponent,player){
 let s=solver.root(S.initialState(solver.model,{players})),likelihood=1;
 for(const entry of g.history){if(entry.turn!==s.turn)return null;const pair=entry.plays.map(lanes=>{const a=Array(18).fill(0);lanes.forEach((cs,l)=>cs.forEach(c=>a[(c-1)*3+l]++));return actionByKey.get(a.join(''));});
  for(let p=0;p<2;p++)if(!pair[p]||pair[p].removed.some((n,c)=>n>s.players[p].hand[c])||pair[p].slots.some((n,l)=>n+s.board.slots[p][l]>4)||pair[p].spent>s.turn)return null;
  if(randomOpponent){const p=1-player,as=solver.actions(s,p),i=as.indexOf(pair[p]);likelihood*=solver.policy(s,p)[i];}
  s=solver.transition(s,pair[0],false);s=solver.transition(s,pair[1],false);
  if(s.phase!==3)for(let p=0;p<2;p++){const choices=S.chance(s,solver.model),cost=randomOpponent&&p!==player?choices[pick(choices.map(x=>x.probability),randomOpponent)].cost:entry.draws[p];if(!choices.some(x=>x.cost===cost))return null;s=S.applyDraw(s,cost);}
 }return {state:s,likelihood};
}
function toSolverState(solver,g){
 if((g.modelFingerprint!==gameFingerprint(solver)&&g.modelFingerprint!==solver.fingerprint)||JSON.stringify(g.rules)!==JSON.stringify(solver.model.rules)||g.root.turn!==solver.model.turn||JSON.stringify(g.root.board)!==JSON.stringify(solver.model.rawBoard))throw new Error('Game state belongs to a different rules/deck model');
 const players=g.root.players.map(t=>({hand:S.costs(t.hand),remaining:S.costs(t.remaining),...(t.observations?{observations:t.observations}:{})})),result=replayRoot(solver,g,players);
 if(!result||result.state.turn!==(g.phase==='finished'?g.turn+1:g.turn))throw new Error('Invalid game history');
 for(let p=0;p<2;p++){const all=[...g.players[p].hand,...g.players[p].drawPile,...g.players[p].board.flat()];if(all.length!==g.players[p].cards.length||new Set(all).size!==all.length)throw new Error('Card conservation violated');S.costs(g.players[p].cards.map(c=>c.cost));
  if(S.signature(result.state.players[p])!==S.signature({hand:S.costs(costCards(g,p,g.players[p].hand)),remaining:S.costs(costCards(g,p,g.players[p].drawPile))}))throw new Error('Game hand/deck do not match history');
  for(let l=0;l<3;l++){const expected=[...g.root.board[p][l],...g.history.flatMap(e=>e.plays[p][l])].sort((a,b)=>a-b),actual=costCards(g,p,g.players[p].board[l]).sort((a,b)=>a-b);if(expected.join(',')!==actual.join(','))throw new Error('Board does not match history');}
 }return result.state;
}
function viewForPlayer(g,p){return {schema:g.schema,turn:g.turn,phase:g.phase,energy:g.turn,rules:g.rules,board:g.players.map((x,i)=>x.board.map(ids=>ids.map(id=>({id,cost:costCards(g,i,[id])[0]})))),hand:g.players[p].hand.map(id=>({id,cost:costCards(g,p,[id])[0]})),opponentHandCount:g.players[1-p].hand.length,remainingDeckCounts:g.players.map(x=>x.drawPile.length),history:g.history.map(x=>({turn:x.turn,plays:x.plays})),outcome:g.outcome};}
function gameFingerprint(solver){return crypto.createHash('sha256').update('numerical-snap-game-1|'+JSON.stringify(solver.spec)).digest('hex');}
function stateId(g){return crypto.createHash('sha256').update(JSON.stringify(g)).digest('hex');}
module.exports={gameFingerprint,makeGameState,actionForPlacements,placementsForAction,commitTurn,toSolverState,viewForPlayer,replayRoot,stateId,costCards};
