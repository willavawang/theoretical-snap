'use strict';
// Research-only terminal effect menus. Not a general Marvel Snap engine.
const crypto=require('node:crypto');
const sum=xs=>xs.reduce((a,b)=>a+b,0);
function effectKey(a){return JSON.stringify({move:a.move||null,plays:(a.plays||[]).map(x=>({lane:x.lane,power:x.power,spawnOthers:x.spawnOthers||0,destroyAtLeast:x.destroyAtLeast||0}))});}
function validate(g){
  if(g.schema!=='snap-capability-study-1'||g.cases)throw new Error('Independent declared capability ranges required');
  if(![0,1].includes(g.priority)||g.board?.length!==2||g.board.some(s=>s.length!==3))throw new Error('Board/priority');
  g.board.forEach(s=>s.forEach(l=>{if(l.length>4||l.some(x=>!Number.isInteger(x)||x<0))throw new Error('Board power/capacity');}));
  if(g.ranges?.length!==2)throw new Error('Both private ranges required');
  for(const ts of g.ranges){
    if(!ts.length||ts.length>128||new Set(ts.map(t=>t.id)).size!==ts.length)throw new Error('Type identities or type limit');
    if(ts.some(t=>!Number.isFinite(t.weight)||t.weight<=0||!t.actions.length||new Set(t.actions.map(a=>a.id)).size!==t.actions.length))throw new Error('Invalid types/actions');
    for(const t of ts)for(const a of t.actions){
      if((a.plays||[]).some(x=>!Number.isInteger(x.lane)||x.lane<0||x.lane>2||!Number.isInteger(x.power)||x.power<0||x.spawnOthers!==undefined&&(!Number.isInteger(x.spawnOthers)||x.spawnOthers<0)||x.destroyAtLeast!==undefined&&(!Number.isInteger(x.destroyAtLeast)||x.destroyAtLeast<1)))throw new Error('Invalid play effect');
      if(a.move&&(!Number.isInteger(a.move.from)||!Number.isInteger(a.move.to)||a.move.from<0||a.move.from>2||a.move.to<0||a.move.to>2||a.move.from===a.move.to||!Number.isInteger(a.move.power)||a.move.power<0))throw new Error('Invalid move');
    }
  }
}
function resolve(g,a,b){
  const board=g.board.map(s=>s.map(l=>l.slice())),pair=[a,b];
  for(let p=0;p<2;p++)if(pair[p].move){
    const m=pair[p].move,i=board[p][m.from].indexOf(m.power);
    if(i<0||board[p][m.to].length>=4)throw new Error('Unsupported/illegal staged move');
    board[p][m.from].splice(i,1);board[p][m.to].push(m.power);
  }
  for(const p of [g.priority,1-g.priority])for(const play of pair[p].plays||[]){
    if(board[p][play.lane].length>=4)throw new Error('Illegal play into a full location');
    board[p][play.lane].push(play.power);
    if(play.spawnOthers)for(let lane=0;lane<3;lane++)if(lane!==play.lane&&board[p][lane].length<4)board[p][lane].push(play.spawnOthers);
    if(play.destroyAtLeast){
      const targets=board[1-p][play.lane].map((v,i)=>v>=play.destroyAtLeast?i:-1).filter(i=>i>=0);
      if(targets.length>1)throw new Error('Multiple destruction targets are outside this bounded study');
      if(targets.length)board[1-p][play.lane].splice(targets[0],1);
    }
  }
  const dif=board[0].map((l,i)=>sum(l)-sum(board[1][i])),lanes=dif.reduce((v,x)=>v+Math.sign(x),0);
  return {utility:Math.sign(lanes||sum(dif)),board};
}
function compile(input,{reduce=true,poolTypes=true}={}){
  validate(input);const start=performance.now(),original=input.ranges.map(ts=>{const mass=sum(ts.map(t=>t.weight));return ts.map(t=>({...t,key:t.id,weight:t.weight/mass}));});
  const union=[[],[]],maps=[new Map(),new Map()],assignments=[[],[]];
  original.forEach((ts,p)=>ts.forEach((t,i)=>{
    const groups=new Map();
    for(const a of t.actions){const key=reduce?effectKey(a):t.id+'/'+a.id;if(!maps[p].has(key)){maps[p].set(key,union[p].length);union[p].push(a);}
      const id=maps[p].get(key);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(a.id);}
    assignments[p][i]=groups;
  }));
  if(union[0].length*union[1].length>500000)throw new Error('Study payoff-pair budget exceeded; no pruning');
  let payoff=union[0].map(a=>Int8Array.from(union[1],b=>resolve(input,a,b).utility));
  const before=union.map(x=>x.length);
  if(reduce){
    const reps=[[],[]],mapping=[[],[]];
    for(let p=0;p<2;p++){const found=new Map();union[p].forEach((a,i)=>{
      const key=Array.from({length:union[1-p].length},(_,j)=>p===0?payoff[i][j]:payoff[j][i]).join(',');
      if(!found.has(key)){found.set(key,reps[p].length);reps[p].push(i);}mapping[p][i]=found.get(key);
    });}
    const next=reps[0].map(i=>Int8Array.from(reps[1],j=>payoff[i][j]));payoff=next;
    for(let p=0;p<2;p++){
      union[p]=reps[p].map(i=>union[p][i]);
      assignments[p]=assignments[p].map(old=>{const groups=new Map();for(const [i,as] of old){const id=mapping[p][i];if(!groups.has(id))groups.set(id,[]);groups.get(id).push(...as);}return groups;});
    }
  }
  const types=original.map((ts,p)=>{const found=new Map(),out=[];ts.forEach((t,i)=>{
    const ids=[...assignments[p][i].keys()].sort((a,b)=>a-b),key=reduce&&poolTypes?ids.join(','):'type:'+i;
    if(!found.has(key)){found.set(key,out.length);out.push({ids,weight:0});}const ci=found.get(key);out[ci].weight+=t.weight;
  });return out;});
  return {input,original,union,payoff,types,assignments,compileMs:performance.now()-start,
    stats:{originalTypes:original.map(x=>x.length),strategyTypes:types.map(x=>x.length),unionBeforeSharing:before,unionAfterSharing:union.map(x=>x.length),payoffCells:payoff.length*payoff[0].length,
      originalActionEntries:original.map(ts=>sum(ts.map(t=>t.actions.length))),strategyEntries:types.map(ts=>sum(ts.map(t=>t.ids.length)))},
    fingerprint:crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex')};
}
function verify(g,policies,{includeActions=true,tolerance=1e-6}={}){
  validate(g);const ts=g.ranges.map(xs=>{const mass=sum(xs.map(t=>t.weight));return xs.map(t=>({...t,weight:t.weight/mass}));});
  const lookup=policies.map(side=>new Map(side.map(t=>[t.typeKey,t.probabilities])));
  ts.forEach((side,p)=>{if(lookup[p].size!==side.length||policies[p].length!==side.length)throw new Error('Policy type count');side.forEach(t=>{
    const row=lookup[p].get(t.id),valid=new Set(t.actions.map(a=>a.id));
    if(!row||Object.entries(row).some(([k,v])=>!valid.has(k)||!Number.isFinite(v)||v<0)||Math.abs(sum(Object.values(row))-1)>1e-8)throw new Error('Illegal policy');
  });});
  const rows=[[],[]],best=[0,0],profile=[0,0];let maxConditionalGain=0;
  for(let p=0;p<2;p++)for(const t of ts[p]){
    const own=lookup[p].get(t.id),actions=t.actions.map(a=>{
      let ev=0;for(const u of ts[1-p])for(const b of u.actions){const weight=u.weight*(lookup[1-p].get(u.id)[b.id]||0);if(weight)ev+=weight*(p===0?resolve(g,a,b).utility:-resolve(g,b,a).utility);}
      return {actionId:a.id,ev,frequency:own[a.id]||0};
    }),br=Math.max(...actions.map(a=>a.ev)),value=sum(actions.map(a=>a.ev*a.frequency)),gain=Math.max(0,br-value);
    profile[p]+=t.weight*value;best[p]+=t.weight*br;maxConditionalGain=Math.max(maxConditionalGain,gain);
    rows[p].push({typeKey:t.id,weight:t.weight,value,bestValue:br,gain,...(includeActions?{actions:actions.map(a=>({...a,evLoss:Math.max(0,br-a.ev)}))}:{})});
  }
  if(Math.abs(profile[0]+profile[1])>1e-8)throw new Error('Zero-sum mismatch');
  const gap=Math.max(0,best[0]+best[1]);return {value:profile[0],upper:best[0],lower:-best[1],nashGap:gap,maxConditionalGain,validated:gap<=tolerance&&maxConditionalGain<=tolerance,tolerance,rows};
}
module.exports={validate,resolve,compile,verify,effectKey};
