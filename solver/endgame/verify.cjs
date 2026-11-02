'use strict';

// Independent of the candidate compiler's action enumeration and payoff table.
const S=require('../../dist/solver/engine.js');
const key=t=>t.hand.join(',')+'/'+t.remaining.join(',')+'@'+(t.observations||'');
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const prepared=new WeakMap();
function payoff(board,a,b){
  let score=0,total=0;
  for(let l=0;l<3;l++){
    const x=sum(board[0][l])+sum(a.lanes[l])-sum(board[1][l])-sum(b.lanes[l]);
    if(x>0)score++;else if(x<0)score--;total+=x;
  }
  return score>0?1:score<0?-1:total>0?1:total<0?-1:0;
}
function verify(input, policies, {includeActions=false,tolerance=1e-6}={}) {
  const encoded=JSON.stringify(input);let data=prepared.get(input);
  if(!data||data.encoded!==encoded){
  const model=S.normalizeModel(input),types=[[],[]],index=[new Map(),new Map()],joint=[];
  const add=(t,p)=>{const k=key(t);if(!index[p].has(k)){index[p].set(k,types[p].length);types[p].push({...t,key:k,weight:0});}return index[p].get(k);};
  if(model.ranges)model.ranges.forEach((ts,p)=>ts.forEach(t=>{types[p][add(t,p)].weight=t.weight;}));
  else for(const c of model.cases){const ids=c.players.map(add);ids.forEach((i,p)=>types[p][i].weight+=c.weight);joint.push({ids,weight:c.weight});}
  types.forEach((ts,p)=>ts.forEach(t=>{t.actions=S.legalActions(t.hand,model.turn,model.board.slots[p]);}));
  data={encoded,model,types,joint};prepared.set(input,data);
  }
  const {model,types,joint}=data;
  const ps=types.map((ts,p)=>{
    const supplied=new Map(policies[p].map(x=>[x.typeKey,x.probabilities]));
    return ts.map(t=>{
      const actions=t.actions,prob=supplied.get(t.key);
      if(!prob)throw new Error('Missing private-type policy');
      const allowed=new Set(actions.map(a=>a.key));
      if(Object.entries(prob).some(([a,v])=>!allowed.has(a)||!Number.isFinite(v)||v<0))throw new Error('Illegal policy action or probability');
      const weights=actions.map(a=>prob[a.key]||0),mass=sum(weights);
      if(Math.abs(mass-1)>1e-8)throw new Error('Private-type policy is not normalized');
      return {actions,weights};
    });
  });
  function distribution(player,type){
    const masses=new Map(),opponent=1-player;
    const weights=model.ranges?types[opponent].map(t=>t.weight):types[opponent].map(()=>0);
    if(!model.ranges)for(const c of joint)if(c.ids[player]===type)weights[c.ids[opponent]]+=c.weight/types[player][type].weight;
    ps[opponent].forEach((policy,j)=>policy.actions.forEach((a,k)=>{
      const mass=weights[j]*policy.weights[k];if(!mass)return;
      const v=a.lanes.map(sum).join(',');if(!masses.has(v))masses.set(v,{action:a,mass:0});masses.get(v).mass+=mass;
    }));return [...masses.values()];
  }
  const rows=[[],[]], best=[0,0],profile=[0,0];let maxConditionalGain=0;
  for(let p=0;p<2;p++){
    let common;if(model.ranges)common=distribution(p,0);
    const cache=new Map();
    types[p].forEach((t,i)=>{
      const d=common||distribution(p,i), own=ps[p][i], values=own.actions.map(a=>{
        const k=(model.ranges?'all':i)+'/'+a.lanes.map(sum).join(',');if(cache.has(k))return cache.get(k);
        let ev=0;for(const other of d)ev+=other.mass*(p===0?payoff(model.rawBoard,a,other.action):-payoff(model.rawBoard,other.action,a));
        cache.set(k,ev);return ev;
      });
      const value=sum(values.map((v,j)=>v*own.weights[j])),br=Math.max(...values),gain=br-value;
      profile[p]+=t.weight*value;best[p]+=t.weight*br;maxConditionalGain=Math.max(maxConditionalGain,gain);
      rows[p].push({typeKey:t.key,weight:t.weight,value,bestValue:br,gain,...(includeActions?{actions:own.actions.map((a,j)=>({actionKey:a.key,lanes:a.lanes,ev:values[j],frequency:own.weights[j],evLoss:Math.max(0,br-values[j])}))}:{})});
    });
  }
  const upper=best[0],lower=-best[1],gap=Math.max(0,upper-lower);
  if(Math.abs(profile[0]+profile[1])>1e-8)throw new Error('Inconsistent zero-sum profile evaluation');
  return {value:profile[0],upper,lower,nashGap:gap,exploitability:gap/2,maxConditionalGain,validated:gap<=tolerance&&maxConditionalGain<=tolerance,tolerance,rows,
    method:'Exhaustive private-information-constrained best responses using legacy action generation and independent terminal payoffs',scope:'Supplied conditional final-turn game only'};
}
module.exports={verify,payoff};
