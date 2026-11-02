'use strict';
const {verify}=require('./verify.cjs'),G=require('../offline/game-state.cjs');
// A result adapter for the existing Game State Object, with explicit conditional priors.
function query(game,policies,{player=0,typeKey,gameState,placements,tolerance=1e-6}={}){
  const certificate=verify(game.input,policies,{includeActions:true,tolerance});
  const row=certificate.rows[player].find(t=>t.typeKey===typeKey);
  if(!row)throw new Error('Query type is absent from the public conditional range');
  let submittedKey;
  if(gameState){
    if(gameState.phase!=='planning'||gameState.turn!==game.normalized.turn)throw new Error('Wrong query phase/turn');
    const costs=(p,ids)=>G.costCards(gameState,p,ids),actualBoard=gameState.players.map((p,i)=>p.board.map(ids=>costs(i,ids).slice().sort((a,b)=>a-b)));
    const expected=game.normalized.rawBoard.map(p=>p.map(xs=>xs.slice().sort((a,b)=>a-b)));
    if(JSON.stringify(actualBoard)!==JSON.stringify(expected))throw new Error('Game State Object board disagrees with conditional model');
    const own=game.originalTypes[player].find(t=>t.key===typeKey),hand=costs(player,gameState.players[player].hand).sort((a,b)=>a-b),want=own.hand.flatMap((n,c)=>Array(n).fill(c+1));
    if(hand.join(',')!==want.join(','))throw new Error('Actual hand disagrees with query type');
    const remaining=costs(player,gameState.players[player].drawPile).sort((a,b)=>a-b),expectedRemaining=own.remaining.flatMap((n,c)=>Array(n).fill(c+1));
    if(remaining.join(',')!==expectedRemaining.join(','))throw new Error('Actual remaining deck disagrees with query type');
    if(own.observations){
      let observed=gameState.root.players[player].observations||'';
      if(gameState.history.length){
        const root=gameState.root.players[player],h=Array(6).fill(0),r=Array(6).fill(0);root.hand.forEach(c=>h[c-1]++);root.remaining.forEach(c=>r[c-1]++);
        observed=h.join(',')+'/'+r.join(',')+(observed?'@'+observed:'')+gameState.history.map(e=>'.'+e.draws[player]).join('');
      }
      if(observed!==own.observations)throw new Error('Private observation label disagrees with query type');
    }
    if(placements)submittedKey=G.actionForPlacements(gameState,player,placements).key;
  }else if(placements)throw new Error('Physical placements require a Game State Object');
  const rows=row.actions.map(a=>{
    const action=game.originalTypes[player].find(t=>t.key===typeKey).actions.find(x=>x.key===a.actionKey);
    return {...a,...(gameState?{placements:G.placementsForAction(gameState,player,action)}:{}),assessment:certificate.validated?'conditional-validated':'provisional'};
  });
  const submitted=rows.find(a=>a.actionKey===submittedKey);
  if(submitted)submitted.placements=placements.map(x=>({...x}));
  const best=rows.slice().sort((a,b)=>b.ev-a.ev||b.frequency-a.frequency);
  return {schema:'snap-final-turn-decision-1',stateId:gameState?G.stateId(gameState):null,modelFingerprint:game.fingerprint,player,typeKey,
    units:'P(win) - P(loss)',status:certificate.validated?'conditional-validated':'provisional',certificate,
    submitted:submitted||null,yourEV:submitted?submitted.ev:null,handEV:row.value,maximumEV:row.bestValue,evLoss:submitted?submitted.evLoss:null,
    best:best[0],alternatives:best.filter(a=>a!==submitted),actions:rows,
    frequencyConvention:'One lifted equilibrium policy; equal-payoff action copies split their class probability uniformly',
    scope:game.scope};
}
module.exports={query};
