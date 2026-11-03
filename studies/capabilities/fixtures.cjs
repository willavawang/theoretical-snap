'use strict';
const S=require('../../dist/solver/engine.js'),T=require('../../solver/endgame/model.cjs');
const copy=x=>JSON.parse(JSON.stringify(x)),sum=xs=>xs.reduce((a,b)=>a+b,0);
const hands=[[6,6,6,6],[1,5,6,6],[2,4,6,6],[3,3,6,6],[1,1,4,6],[1,2,3,6],[2,2,2,6]];
const priors={concentrated:[.60,.08,.08,.08,.06,.05,.05],flexible:[.10,.10,.10,.10,.20,.20,.20]};
const boards=[
 {id:'uneven-race',board:[[[1],[2,3],[4,5]],[[1,5],[4],[2,3]]]},
 {id:'close-races',board:[[[1,2],[3,4],[5]],[[1,3],[2,4],[5]]]},
 {id:'one-leading-lane',board:[[[1,2,3],[4],[5]],[[1],[2,3],[4,5]]]},
 {id:'balanced-board',board:[[[1,4],[2,3],[5]],[[1,2,3],[4],[5]]]},
 {id:'our-full-lane',board:[[[1,1,1,1],[2],[]],[[1,1],[1,2],[1]]]},
 {id:'their-full-lane',board:[[[1,1],[1,2],[1]],[[1,1,1,1],[2],[]]]}
];
function fromAction(a){return {id:a.key,plays:a.lanes.flatMap((cs,lane)=>cs.map(power=>({lane,power}))),sourcePlayedCards:a.slots.reduce((a,b)=>a+b,0)};}
function vector(a){const out=[0,0,0];for(const p of a.plays||[])out[p.lane]+=p.power;return out;}
function packet(v){return {id:'v:'+v.join(','),plays:v.flatMap((power,lane)=>power?[{lane,power}]:[]),sourcePlayedCards:'unspecified'};}
function coarse(ranges,slots){
  const groups=new Map();
  for(const t of ranges){
    const vs=t.actions.map(vector),maxPower=Math.max(...vs.map(sum)),maxLanes=Math.max(...vs.map(v=>v.filter(x=>x>0).length)),access=[0,1,2].map(l=>vs.some(v=>v[l]>0)?1:0).join('');
    const key=maxPower+'|'+maxLanes+'|'+access;
    if(!groups.has(key))groups.set(key,{id:'cap:'+key,weight:0,menus:new Map()});const group=groups.get(key);group.weight+=t.weight;
    for(const v of vs)group.menus.set(v.join(','),packet(v));
  }
  return [...groups.values()].map(g=>({id:g.id,weight:g.weight,actions:[...g.menus.values()].sort((a,b)=>a.id.localeCompare(b.id))}));
}
function unrestricted(slots,budget=6){
  const actions=[];for(let a=0;a<=budget;a++)for(let b=0;b<=budget-a;b++)for(let c=0;c<=budget-a-b;c++){
    const v=[a,b,c];if(v.some((n,l)=>n&&slots[l]>=4))continue;actions.push(packet(v));
  }return [{id:'unrestricted:'+budget,weight:1,actions}];
}
function cases(){
  const out=[];
  for(const b of boards)for(const [prior,weights] of Object.entries(priors)){
    const numerical={turn:6,board:copy(b.board),ranges:[
      [{hand:[1,2,4,6],remaining:[6,6,6],weight:1},{hand:[2,2,2,6],remaining:[6,6,6],weight:1}],
      hands.map((hand,i)=>({hand,remaining:[6,6,6],weight:weights[i]}))],beliefScope:'Predeclared capability-sensitivity control, not a real-Snap or equilibrium-deck posterior'};
    const n=S.normalizeModel(numerical),ranges=n.ranges.map((side,p)=>side.map(t=>({id:T.typeKey(t),weight:t.weight,actions:S.legalActions(t.hand,6,n.board.slots[p]).map(fromAction)})));
    const detailed={schema:'snap-capability-study-1',board:copy(b.board),priority:0,ranges,scope:'Synthetic additive six-power control'};
    const coarseGame=copy(detailed);coarseGame.ranges[1]=coarse(ranges[1],n.board.slots[1]);
    const free=copy(detailed);free.ranges[1]=unrestricted(n.board.slots[1]);
    out.push({id:b.id+'/'+prior,boardId:b.id,prior,numerical,models:{D:detailed,Q:copy(detailed),C:coarseGame,U:free}});
  }return out;
}
function controls(){
  const ownHands=[[1,2,4,6]],board=[[[1,3],[4],[]],[[],[],[]]];
  const own=ownHands.map(hand=>({id:'our-plan',weight:1,actions:S.legalActions(S.costs(hand),6,board[0].map(x=>x.length)).map(fromAction)}));
  const base=(id,board,ranges,priority=0)=>({id,game:{schema:'snap-capability-study-1',board,ranges,priority,scope:'Bounded documented-effect control; not a complete real-Snap position/deck model'}});
  const focus15={id:'focus-15',weight:1,actions:[{id:'pass',plays:[]},...[0,1,2].map(lane=>({id:'focus:'+lane,plays:[{lane,power:15}],sourcePlayedCards:1}))]};
  const doom={id:'one-card-three-lanes',weight:1,actions:[{id:'pass',plays:[]},...[0,1,2].map(lane=>({id:'doom:'+lane,plays:[{lane,power:5,spawnOthers:5}],sourcePlayedCards:1}))]};
  const focus=base('focus-15',copy(board),[copy(own),[focus15]]);
  const spread=base('doom-15',copy(board),[copy(own),[doom]]);
  const mixed=base('focus-or-doom',copy(board),[copy(own),[{...copy(focus15),weight:.5},{...copy(doom),weight:.5}]]);
  const motionBoard=[[[3],[2],[]],[[3],[],[5]]],motionOwn=[{id:'allocate-two',weight:1,actions:[{id:'pass',plays:[]},...[0,1,2].map(lane=>({id:'add-two:'+lane,plays:[{lane,power:2}]}))]}];
  const still={id:'three-power-stays',weight:1,actions:[{id:'stay',plays:[]}]},movable={id:'movable-three',weight:1,actions:[{id:'stay',plays:[]},...[1,2].map(to=>({id:'move-to:'+to,plays:[],move:{from:0,to,power:3},sourcePlayedCards:0}))]};
  const noMove=base('movement-absent',copy(motionBoard),[copy(motionOwn),[still]],1),move=base('movement-available',copy(motionBoard),[copy(motionOwn),[movable]],1);
  const bodyBoard=[[[],[5],[]],[[],[],[5]]],bodies=[{id:'matched-ten-power',weight:1,actions:[{id:'one-ten',plays:[{lane:0,power:10}]},{id:'two-fives',plays:[{lane:0,power:5},{lane:0,power:5}]}]}];
  const plain={id:'plain-three',weight:1,actions:[{id:'pass',plays:[]},{id:'three-left',plays:[{lane:0,power:3}]}]},shang={id:'destroy-ten',weight:1,actions:[{id:'pass',plays:[]},{id:'shang-left',plays:[{lane:0,power:3,destroyAtLeast:10}]}]};
  const power=base('destruction-absent',copy(bodyBoard),[copy(bodies),[plain]],0),after=base('destruction-after-us',copy(bodyBoard),[copy(bodies),[shang]],0),before=base('destruction-before-us',copy(bodyBoard),[copy(bodies),[copy(shang)]],1);
  return [focus,spread,mixed,noMove,move,power,after,before];
}
module.exports={cases,controls,coarse,unrestricted,packet,vector,fromAction,priors,boards};
