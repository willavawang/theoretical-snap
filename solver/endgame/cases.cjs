'use strict';
const R=require('../../dist/solver/ranges.js'),S=require('../../dist/solver/engine.js');
const copy=x=>JSON.parse(JSON.stringify(x));
function compositions(n){const out=[],a=Array(6).fill(0);function walk(c,left){if(c===5){a[c]=left;out.push(a.slice());return;}for(let k=0;k<=left;k++){a[c]=k;walk(c+1,left-k);}}walk(0,n);return out;}
function allHands(n,remaining){return compositions(n).map(xs=>({hand:S.cards(xs),remaining:Array(remaining).fill(6),weight:1}));}
function fixtures(){
  const publicGame=R.publicFixture(),hidden=R.hiddenFixture(),weighted=copy(hidden);
  weighted.ranges[0][0].weight=1;weighted.ranges[0][1].weight=1e-4;
  weighted.ranges[1][0].weight=1e-4;weighted.ranges[1][1].weight=1;
  const correlated=copy(publicGame);delete correlated.ranges;
  correlated.cases=[
    {players:[{hand:[1,2,4,6],remaining:[3,5,6],observations:'signal-A'},{hand:[1,1,1,1],remaining:[6,6,6]}],weight:1},
    {players:[{hand:[1,2,4,6],remaining:[3,5,6],observations:'signal-B'},{hand:[1,1,1,6],remaining:[6,6,6]}],weight:1}
  ];correlated.beliefScope='Synthetic correlated-signal conditional control; not the independent-deck opening game';
  const hiddenTrap=copy(publicGame);hiddenTrap.ranges[1]=correlated.cases.map(c=>copy(c.players[1]));
  hiddenTrap.beliefScope='Declared hidden-hand control: averaging revealed-hand solutions incorrectly gives +1 instead of +1/2';
  const won={turn:6,board:[[[1,5],[2,3],[4]],[[],[],[]]],ranges:[[{hand:[1,2,4,6],remaining:[3,5,6]}],[{hand:[1,1,2,2,3,4,6],remaining:[6,6,6,6,6]}]],beliefScope:'Reachable guaranteed-win control; passing has zero EV loss despite available plays'};
  const aliases=copy(hidden);
  aliases.ranges=aliases.ranges.map(range=>range.flatMap(t=>[0,1,2].map(i=>({...copy(t),observations:'irrelevant independent label '+i,remaining:i===2?[1,1,1]:t.remaining}))));
  const broad={turn:6,board:[[[],[],[]],[[],[],[]]],ranges:[allHands(7,5),allHands(7,5)],beliefScope:'Declared independent prior over every seven-card hand; empty board is reachable by five passes'};
  const slots={turn:6,board:[[[1,1,1,1],[2],[]],[[1,1,1,1],[],[2]]],ranges:[allHands(4,3),allHands(4,3)],beliefScope:'Declared independent priors; four ones and a two can be legally played before turn six'};
  const asymmetric=copy(broad);asymmetric.ranges=[allHands(7,5).filter((_,i)=>i%7===0),allHands(7,5).filter((_,i)=>i%11===0)];
  asymmetric.ranges.forEach((r,p)=>r.forEach((t,i)=>{t.weight=1+(i*(p+3))%17;}));asymmetric.beliefScope='Declared asymmetric broad hand priors, not equilibrium-history beliefs';
  const randomCases=[];
  for(const seed of [71,173,4901]){
    const rng=S.rng(seed),m=copy(hidden);m.ranges.forEach(r=>r.forEach(t=>{t.weight=.1+rng.next();}));
    const perm=seed%2?[2,0,1]:[1,2,0];m.board=m.board.map(side=>perm.map(i=>side[i]));
    randomCases.push({name:'weighted-seed-'+seed,model:m,category:'seeded legal conditional prior',seed});
  }
  return [{name:'public-rational',model:publicGame,category:'known +1/5 control',knownValue:.2},
    {name:'hidden-two-types',model:hidden,category:'small hidden hands'},
    {name:'rare-types',model:weighted,category:'conditional accuracy stress'},
    {name:'hidden-trap',model:hiddenTrap,category:'non-clairvoyance control',knownValue:.5},
    {name:'correlated-signal',model:correlated,category:'correlated information stress',knownValue:1},
    {name:'already-won',model:won,category:'weak dominance and EV-loss control',knownValue:1},
    {name:'independent-aliases',model:aliases,category:'exact private-type pooling'},
    {name:'blocked-lane',model:slots,category:'reachable occupied-slot stress'},
    {name:'broad-asymmetric',model:asymmetric,category:'broad asymmetric independent ranges'},
    {name:'all-seven-card-hands',model:broad,category:'all 792 seven-card hands per player'},...randomCases];
}
module.exports={fixtures,compositions};
