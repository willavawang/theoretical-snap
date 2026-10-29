/* Finite deck/hand ranges. Historical belief assumptions are explicit. */
(function(root){
'use strict';
const S=typeof module!=='undefined'&&module.exports?require('./engine.js'):root.SnapSolver;
const sum=a=>a.reduce((s,v)=>s+v,0),key=p=>p.hand.join(',')+'/'+p.remaining.join(',');
function merge(xs){const m=new Map();for(const x of xs){const k=key(x);if(m.has(k))m.get(k).weight+=x.weight;else m.set(k,x);}return [...m.values()];}
function draw(xs,limit=7){const out=[];for(const x of xs){const n=sum(x.remaining);if(!n||sum(x.hand)>=limit){out.push(x);continue;}for(let c=0;c<6;c++)if(x.remaining[c]){const hand=x.hand.slice(),remaining=x.remaining.slice(),p=remaining[c]/n;hand[c]++;remaining[c]--;out.push({hand,remaining,weight:x.weight*p});}}return merge(out);}
function parseHistory(history,turn){
 if(history.length!==turn-1)throw new RangeError('Supply one pair of complete revealed turns for each preceding turn.');
 const board=[[[],[],[]],[[],[],[]]],actions=[];
 history.forEach((entry,t)=>{const plays=entry.plays||entry;if(!Array.isArray(plays)||plays.length!==2||plays.some(p=>p.length!==3))throw new RangeError('History uses plays[player][lane] card arrays.');const pair=[];for(let p=0;p<2;p++){const lanes=plays[p],used=S.costs(lanes.flat()),allocation=Array(18).fill(0);if(sum(lanes.flat())>t+1)throw new RangeError('Historical energy budget exceeded.');lanes.forEach((cs,l)=>{S.costs(cs);cs.forEach(c=>allocation[(c-1)*3+l]++);board[p][l].push(...cs);if(board[p][l].length>4)throw new RangeError('Historical four-slot limit exceeded.');});pair.push({key:allocation.join(''),used,lanes});}actions.push(pair);});
 return {board,actions};
}
function deckPrior(list){if(!Array.isArray(list)||!list.length)throw new RangeError('A nonempty deck distribution is required.');const out=list.map(x=>({cards:typeof x==='string'?S.PRESETS[x]:(x.cards||S.PRESETS[x.name]),weight:typeof x==='string'?1:(x.weight===undefined?1:x.weight)}));for(const d of out){if(!d.cards||d.cards.length!==12)throw new RangeError('Each deck needs twelve numerical cards.');S.costs(d.cards);if(!Number.isFinite(d.weight)||d.weight<0)throw new RangeError('Invalid deck weight.');}const total=sum(out.map(x=>x.weight));if(!(total>0))throw new RangeError('Deck distribution has no mass.');return out.map(x=>({...x,weight:x.weight/total}));}
function fromDecks(input={}){
 const turn=input.turn||1,history=input.history||[],{board,actions}=parseHistory(history,turn),policy=input.historyPolicy||'uniform';
 if(!['uniform','card-consistency'].includes(policy))throw new RangeError('historyPolicy must be uniform or card-consistency.');
 const priors=input.decks||[Object.keys(S.PRESETS),Object.keys(S.PRESETS)],ranges=[],likelihoods=[];
 for(let player=0;player<2;player++){
  let output=[];
  for(const deck of deckPrior(priors[player])){
   let states=[{hand:[0,0,0,0,0,0],remaining:S.costs(deck.cards),weight:deck.weight}];
   // Three opening cards plus the first draw: four available on turn one.
   for(let i=0;i<4;i++)states=draw(states);
   const occupied=[0,0,0];
   for(let t=1;t<turn;t++){
    const a=actions[t-1][player],next=[];
    for(const state of states){if(a.used.some((n,c)=>state.hand[c]<n))continue;const likelihood=policy==='uniform'?1/S.legalActions(state.hand,t,occupied).length:1;next.push({hand:state.hand.map((n,c)=>n-a.used[c]),remaining:state.remaining,weight:state.weight*likelihood});}
    a.lanes.forEach((cs,l)=>occupied[l]+=cs.length);states=draw(merge(next));
   }
   output.push(...states);
  }
  output=merge(output);const total=sum(output.map(p=>p.weight));if(!(total>0))throw new RangeError('No configured deck supports the public history for player '+player+'.');likelihoods.push(total);
  ranges.push(output.map(p=>({hand:S.cards(p.hand),remaining:S.cards(p.remaining),weight:p.weight/total})));
 }
 return {turn,board,ranges,beliefScope:turn===1?'Full game from the deal, with configured private deck priors':policy==='uniform'?'Conditional continuation: Bayesian ranges under uniform legal historical play; NOT an equilibrium-history posterior':'Conditional continuation: card-consistency ranges; strategic play likelihoods omitted',rangeMetadata:{historyPolicy:policy,typeCounts:ranges.map(r=>r.length),historyLikelihoods:likelihoods}};
}
function publicFixture(){return {turn:6,board:[[[1],[2,3],[4,5]],[[1,5],[4],[2,3]]],ranges:[0,1].map(()=>[{hand:[1,2,4,6],remaining:[3,5,6],weight:1}]),beliefScope:'Public-hand final-turn validation game'};}
function hiddenFixture(){const m=publicFixture();m.ranges=m.ranges.map(r=>r.concat([{hand:[1,1,5,6],remaining:[2,3,4],weight:1}]));m.beliefScope='Two equally weighted private hand/deck types per player';return m;}
function publicSequence(turn){return Array.from({length:turn-1},(_,i)=>({plays:[0,1].map(p=>[0,1,2].map(l=>l===(i+p)%3?[i+1]:[]))}));}
function example(name){if(name==='public-final')return publicFixture();if(name==='hidden-final')return hiddenFixture();if(name==='two-turn-check')return {turn:1,rules:{turns:2,deckSize:null},ranges:[0,1].map(()=>[{hand:[1,2],remaining:[]}]),beliefScope:'Small two-turn validation game, with no draws'};const m=/^turn-([1-6])$/.exec(name);if(!m)throw new RangeError('Unknown example.');const turn=Number(m[1]);return fromDecks({turn,history:publicSequence(turn)});}
const api={fromDecks,parseHistory,publicFixture,hiddenFixture,publicSequence,example};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SnapRanges=api;
})(typeof self!=='undefined'?self:globalThis);
