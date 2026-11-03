'use strict';
const M=require('./model.cjs'),T=require('../endgame/model.cjs'),S=require('../../dist/solver/engine.js');
function conditionalFinalTurn(game,policies,pair){
  const ps=M.importPolicy(game,policies),actions=pair.map((key,p)=>game.rootUnion[p].find(a=>a.key===key));
  if(actions.some(a=>!a))throw new Error('Unknown public turn-five commitment');
  const mapping=[new Map(),new Map()],rows=[[],[]];
  function derived(p,i,d){
    const t=game.types[p][i],observations=JSON.stringify([t.key,'draw',d.cost]),raw={hand:S.cards(d.hand),remaining:S.cards(d.remaining),observations};
    const key=T.typeKey({hand:d.hand,remaining:d.remaining,observations});mapping[p].set(M.infoKey(p,6,t.key,pair,d.cost),key);return raw;
  }
  let cases,reach;
  if(game.independent){
    const masses=[0,0];
    for(let p=0;p<2;p++)game.types[p].forEach((t,i)=>{const a=game.rootLookup[p][i].get(pair[p]);if(a===undefined)return;const weight=t.weight*ps[p][game.roots[p][i]][a];
      if(!weight)return;for(const d of game.transitions[p][i][a]){rows[p].push({...derived(p,i,d),weight:weight*d.probability});masses[p]+=weight*d.probability;}
    });reach=masses[0]*masses[1];
  }else{
    cases=[];reach=0;
    for(const c of game.joint){const local=c.ids.map((i,p)=>game.rootLookup[p][i].get(pair[p]));if(local.some(a=>a===undefined))continue;
      const weight=c.weight*ps[0][game.roots[0][c.ids[0]]][local[0]]*ps[1][game.roots[1][c.ids[1]]][local[1]];if(!weight)continue;
      for(const a of game.transitions[0][c.ids[0]][local[0]])for(const b of game.transitions[1][c.ids[1]][local[1]]){
        const mass=weight*a.probability*b.probability;cases.push({players:[derived(0,c.ids[0],a),derived(1,c.ids[1],b)],weight:mass});reach+=mass;
      }
    }
  }
  if(!(reach>0))return {status:'unavailable',reason:'The public commitment pair has zero probability under the supplied profile; a posterior requires an explicit off-policy belief assumption',publicReachProbability:0};
  const model={turn:6,rules:game.normalized.rules,board:game.normalized.rawBoard.map((side,p)=>side.map((cs,l)=>[...cs,...actions[p].lanes[l]])),
    ...(game.independent?{ranges:rows}:{cases}),publicHistory:{prefix:game.input.publicHistory||null,turn:5,commitments:pair},
    beliefScope:'Exact Bayesian conditioning on the supplied coupled profile and revealed turn-five actions; not an opening-equilibrium posterior'};
  const source=policies.map(xs=>new Map(xs.map(x=>[x.infoKey,x.probabilities]))),lifted=mapping.map((map,p)=>[...map].map(([key,typeKey])=>({typeKey,probabilities:source[p].get(key)})));
  return {status:'available',model,policies:lifted,mapping,publicReachProbability:reach};
}
module.exports={conditionalFinalTurn};
