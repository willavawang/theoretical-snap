'use strict';

// Exact coding of the unrestricted opening model, not a strategic abstraction.
// 126 four-card hands * 1,287 eight-card remainders * 19,608 draw histories
// fit in one unsigned 32-bit integer. Other supplied histories stay verbatim.
const DRAW_HISTORIES=19608,ROOT_TYPES=162162;
function compositions(total){
 const keys=new Map(),strings=[],counts=Array(6).fill(0);
 function visit(c,left){
  if(c===5){counts[c]=left;let key=0;for(const n of counts)key=key*13+n;keys.set(key,strings.length);strings.push(counts.join(','));return;}
  for(let n=0;n<=left;n++){counts[c]=n;visit(c+1,left-n);}
 }
 visit(0,total);return {keys,strings};
}
const hands=compositions(4),remainders=compositions(8),roots=new Map();
function rankRoot(root){
 if(roots.has(root))return roots.get(root);
 let rank=null;
 const pair=root.split('/');
 if(pair.length===2){
  const parts=pair.map(x=>x.split(','));
  if(parts.every(xs=>xs.length===6&&xs.every(x=>/^(0|[1-9][0-9]?)$/.test(x)&&Number(x)<=12))){
   const keys=parts.map(xs=>xs.reduce((key,x)=>key*13+Number(x),0)),a=hands.keys.get(keys[0]),b=remainders.keys.get(keys[1]);
   if(a!==undefined&&b!==undefined)rank=a*remainders.strings.length+b;
  }
 }
 if(roots.size>=4096)roots.clear();roots.set(root,rank);return rank;
}
function encode(history){
 if(typeof history!=='string')return history;
 const dot=history.indexOf('.'),root=dot<0?history:history.slice(0,dot),rank=rankRoot(root);
 if(rank===null)return history;
 let digits=0,power=1;
 if(dot>=0){
  const tail=history.slice(dot+1).split('.');
  if(tail.length>5||tail.some(x=>!/^[0-6]$/.test(x)))return history;
  for(const cost of tail){digits=digits*7+Number(cost);power*=7;}
 }
 return rank*DRAW_HISTORIES+(power-1)/6+digits;
}
function decode(token){
 if(typeof token==='string')return token;
 if(!Number.isInteger(token)||token<0||token>=ROOT_TYPES*DRAW_HISTORIES)throw new Error('Invalid private-history code');
 const rank=Math.floor(token/DRAW_HISTORIES),history=token%DRAW_HISTORIES;
 let length=0,power=1,offset=0;
 while(history>=offset+power){offset+=power;power*=7;length++;}
 let digits=history-offset;const costs=Array(length);
 for(let i=length-1;i>=0;i--){costs[i]=digits%7;digits=Math.floor(digits/7);}
 return hands.strings[Math.floor(rank/remainders.strings.length)]+'/'+remainders.strings[rank%remainders.strings.length]+costs.map(c=>'.'+c).join('');
}
module.exports={encode,decode,DRAW_HISTORIES,ROOT_TYPES};
