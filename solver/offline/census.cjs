'use strict';
const {catalog,choose}=require('./engine.cjs');

// Count action histories, not hidden worlds. With arbitrary twelve-card decks,
// every accepted single-player history has at least one consistent deal/order:
// schedule its required cards in order of first play, then fill unused draws.
// The two players' existence constraints are independent, so counts square.
function census(){
 let states=new Map([['0,0,0,4',1n]]),prefixes=1n;const turns=[];
 for(let turn=1;turn<=6;turn++){
  const joint=prefixes*prefixes;
  const row={turn,ownPublicPrefixes:prefixes.toString(),jointPublicPrefixes:joint.toString(),informationStatesLowerBound:(2n*joint).toString()};
  const next=new Map();let histories=0n;
  for(const [key,count]of states){
   const xs=key.split(',').map(Number),hand=xs.pop();
   for(const a of catalog){
    const used=a.slots.reduce((s,n)=>s+n,0);
    if(a.spent>turn||used>hand||a.slots.some((n,l)=>n+xs[l]>4))continue;
    const slots=xs.map((n,l)=>n+a.slots[l]),after=hand-used,h=turn===6?after:Math.min(7,after+1),k=slots.concat(h).join(',');
    next.set(k,(next.get(k)||0n)+count);histories+=count;
   }
  }
  row.ownCompletedHistories=histories.toString();turns.push(row);states=next;prefixes=histories;
 }
 const finalInformationStates=BigInt(turns[5].informationStatesLowerBound),openingTypes=BigInt(choose(9,5)*choose(13,5));
 return {schema:'numerical-snap-census-1',rules:{turns:6,deckSize:12,handLimit:7,openingHand:4,lanes:3,slotsPerLane:4},legalDeckTypes:choose(17,5),ownOpeningTypes:openingTypes.toString(),jointOpeningTypes:(openingTypes*openingTypes).toString(),turns,finalTurn:{informationStatesLowerBound:finalInformationStates.toString(),minimumActionsPerState:2,regretAndAverageFloat64BytesLowerBound:(finalInformationStates*32n).toString(),scope:'An unmerged perfect-recall table with separate double-precision regret and average entries. This is not a lower bound on a compressed solution or another algorithm.'},proof:'At turn six, each of the two players remembers every revealed joint commitment prefix. Each counted prefix has a compatible private deal. There are at most eight played cards before turn six; the sixth-turn draw leaves at least one affordable card and one free lane slot. Passing and at least one placement are therefore legal. Hidden private histories add further distinctions.'};
}
module.exports={census};
