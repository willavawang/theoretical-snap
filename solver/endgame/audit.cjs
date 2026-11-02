'use strict';
const S=require('../../dist/solver/engine.js'),{compositions}=require('./cases.cjs'),{choose}=require('../offline/engine.cjs');
const sum=a=>a.reduce((x,y)=>x+y,0),resource=t=>t.hand.join(',')+'/'+t.remaining.join(',');
function traces(deck,plays,{historyPolicy='uniform',cap=300000}={}){
  const counts=S.costs(deck),out=[];
  for(const hand of compositions(4)){
    if(hand.some((n,c)=>n>counts[c]))continue;
    const remaining=counts.map((n,c)=>n-hand[c]);let weight=1;
    for(let c=0;c<6;c++)weight*=choose(counts[c],hand[c]);weight/=choose(12,4);
    out.push({hand,remaining,observations:resource({hand,remaining}),weight});
  }
  let current=out,slots=[0,0,0];const actionCache=new Map();
  plays.forEach((lanes,t)=>{
    const removed=S.costs(lanes.flat()),next=[];
    for(const x of current){
      if(removed.some((n,c)=>n>x.hand[c]))continue;
      const key=x.hand.join(',')+'|'+(t+1)+'|'+slots.join(',');
      if(!actionCache.has(key))actionCache.set(key,S.legalActions(x.hand,t+1,slots).length);
      const probability=historyPolicy==='uniform'?1/actionCache.get(key):1;
      const hand=x.hand.map((n,c)=>n-removed[c]),weight=x.weight*probability,total=sum(x.remaining);
      if(sum(hand)>=7||!total)next.push({...x,hand,weight,observations:x.observations+'.0'});
      else x.remaining.forEach((n,c)=>{if(!n)return;const h=hand.slice(),r=x.remaining.slice();h[c]++;r[c]--;next.push({hand:h,remaining:r,weight:weight*n/total,observations:x.observations+'.'+(c+1)});});
    }
    lanes.forEach((cs,l)=>{slots[l]+=cs.length;});current=next;
    if(current.length>cap)throw new Error('Audit trace cap reached; no branches were dropped');
  });
  const mass=sum(current.map(t=>t.weight));
  return {traces:current.map(t=>({...t,weight:t.weight/mass})),historyLikelihood:mass,slots};
}
function aggregate(ts,key){const m=new Map();for(const t of ts)m.set(key(t),(m.get(key(t))||0)+t.weight);return m;}
function audit(){
  const deck=S.PRESETS.balanced,pass=[[],[],[]],passes=Array.from({length:5},()=>pass),all=traces(deck,passes);
  const early=passes.map(x=>x.map(l=>l.slice())),late=passes.map(x=>x.map(l=>l.slice()));early[0]=[[1],[],[]];late[1]=[[1],[],[]];
  const a=traces(deck,early),b=traces(deck,late),ha=aggregate(a.traces,t=>t.hand.join(',')),hb=aggregate(b.traces,t=>t.hand.join(','));
  const keys=new Set([...ha.keys(),...hb.keys()]);let variation=0;for(const k of keys)variation+=Math.abs((ha.get(k)||0)-(hb.get(k)||0));variation/=2;
  const grouped=new Map();for(const t of all.traces){const k=resource(t);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(t);}
  const aliases=[...grouped.values()].find(xs=>xs.length>1);
  return {schema:'snap-state-audit-measurements-1',enumeratedFamily:{deck:'balanced',publicHistory:'both players pass for five turns; one player enumerated',historicalPolicy:'uniform legal action probabilities',
    privateHistories:all.traces.length,currentHandRemainingClasses:grouped.size,currentHandClasses:aggregate(all.traces,t=>t.hand.join(',')).size,
    historyLikelihood:all.historyLikelihood,exampleAliasedHistories:aliases?aliases.slice(0,2).map(t=>({hand:t.hand,remaining:t.remaining,observations:t.observations})):[]},
    sameBoardDifferentHistory:{early:'one cost-1 card left on turn one, then pass',late:'pass turn one, one cost-1 card left on turn two, then pass',
      publicSlots:a.slots,publicHandCount:sum(a.traces[0].hand),publicRemainingCount:sum(a.traces[0].remaining),earlyHistories:a.traces.length,lateHistories:b.traces.length,
      terminalHandPosteriorTotalVariation:variation,scope:'Exact finite enumeration under a specified uniform-play policy, not an equilibrium-history claim'},
    combinatorialAllDeckPassFamily:{openingHands:126,threeOrderedDraws:216,fiveCardRemainders:252,privateHistories:126*216*252,
      currentHandRemainingStates:792*252,currentHandStates:792,
      scope:'Exact count across all legal decks for five passes: hand fills after three new draws and the final two draws are skipped. Not a whole-game compression factor'},
    nonterminalConclusion:'Matching current hand/remaining deck makes own future chance law equal. Full strategic/CFR equivalence of forgotten draw histories remains unproven here.'};
}
module.exports={audit,traces,aggregate};
