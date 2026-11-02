'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
function fixtures(){
  const board=[[[1],[2],[3,4]],[[1],[2],[3,4]]];
  const small={turn:5,board,ranges:[
    [{hand:[5,6,6,6],remaining:[1,6,6,6],weight:3},{hand:[4,6,6,6],remaining:[2,6,6,6],weight:1}],
    [{hand:[5,6,6,6],remaining:[1,6,6,6],weight:1},{hand:[4,6,6,6],remaining:[2,6,6,6],weight:2}]],beliefScope:'Declared conditional turn-five ranges; not equilibrium-history posteriors'};
  const composition={turn:5,board:[[[1,1,1,1],[],[2]],[[1,1,1,1],[],[2]]],ranges:[
    [{hand:[4,2,2],remaining:[1,6,6,6]},{hand:[4,2,6],remaining:[2,6,6,6]}],
    [{hand:[3,2,6],remaining:[1,6,6,6]},{hand:[5,6,6],remaining:[2,6,6,6]}]],beliefScope:'Composition and future-capacity control; four versus two-plus-two cannot be merged on turn five'};
  const full={turn:5,board:[[[],[],[]],[[],[],[]]],ranges:[
    [{hand:[2,2,2,6,6,6,6],remaining:[1,1,6,6,6]},{hand:[2,2,2,5,6,6,6],remaining:[1,1,6,6,6]}],
    [{hand:[5,6,6,6,6,6,6],remaining:[2,2,6,6,6]},{hand:[4,6,6,6,6,6,6],remaining:[1,1,6,6,6]}]],beliefScope:'Seven-card hands: passing skips draw; a play makes space; no skipped card is burned'};
  const rare=copy(small);rare.ranges[0][0].weight=1;rare.ranges[0][1].weight=.001;rare.ranges[1][0].weight=.001;rare.ranges[1][1].weight=1;
  const correlated={turn:5,board:copy(board),cases:[
    {players:[{hand:[5,6,6,6],remaining:[1,6,6,6],observations:'A'},{hand:[5,6,6,6],remaining:[1,6,6,6]}],weight:1},
    {players:[{hand:[5,6,6,6],remaining:[1,6,6,6],observations:'B'},{hand:[4,6,6,6],remaining:[2,6,6,6]}],weight:1}],beliefScope:'Explicit correlated private-label control'};
  const forced={turn:5,board:[[[1,2],[1,2],[4]],[[],[],[]]],ranges:[[{hand:[6,6,6],remaining:[6,6,6,6]}],[{hand:[6,6,6,6,6,6,6],remaining:[6,6,6,6,6]}]],beliefScope:'Reachable forced win: opponent can play only one six on final turn; passing remains optimal'};
  const symmetric=copy(small);symmetric.ranges[1]=copy(symmetric.ranges[0]);
  const mixed={turn:5,board:[[[1],[2],[3,4]],[[4],[1],[2,3]]],ranges:[
    [{hand:[2,3,6,6],remaining:[1,6,6,6],weight:2},{hand:[1,4,6,6],remaining:[3,6,6,6],weight:1}],
    [{hand:[2,3,6,6],remaining:[1,6,6,6],weight:1},{hand:[2,2,6,6],remaining:[3,6,6,6],weight:3}]],beliefScope:'Asymmetric board and mixed resource distributions; declared conditional ranges'};
  const four=copy(mixed);four.ranges[0].push({hand:[5,6,6,6],remaining:[1,6,6,6],weight:2},{hand:[4,6,6,6],remaining:[3,6,6,6],weight:3});
  four.ranges[1].push({hand:[1,4,6,6],remaining:[3,6,6,6],weight:2},{hand:[5,6,6,6],remaining:[1,6,6,6],weight:1});four.beliefScope='Four private root types per player, coupled continuation and declared asymmetric priors';
  return [{name:'symmetric-draws',model:symmetric,knownValue:0},{name:'asymmetric-draws',model:small},{name:'composition',model:composition},
    {name:'full-hand-skip',model:full},{name:'rare-types',model:rare},{name:'correlated-labels',model:correlated},{name:'forced-win',model:forced,knownValue:1},{name:'mixed-resources',model:mixed},{name:'four-types',model:four}];
}
module.exports={fixtures};
