'use strict';

// A conditional final-turn game. This does not replace the full-game history key.
const crypto = require('node:crypto');
const S = require('../../dist/solver/engine.js');
const sum = xs => xs.reduce((a, b) => a + b, 0);
const typeKey = t => t.hand.join(',') + '/' + t.remaining.join(',') + '@' + (t.observations || '');
const permutations = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];

// Enumerate affordable submultisets, then distribute each selected cost to lanes.
// This is separate from the legacy engine's interleaved enumerator.
function actions(hand, energy, occupied) {
  const selected = Array(6).fill(0), out = [];
  function distribute() {
    const allocation = Array(18).fill(0), used = [0,0,0];
    function visit(c) {
      if (c === 6) {
        const lanes = [0,1,2].map(l => allocation.flatMap((n,k) => k % 3 === l ? Array(n).fill(1 + Math.floor(k/3)) : []));
        out.push({key:allocation.join(''), lanes, power:lanes.map(sum), slots:used.slice(), spent:sum(lanes.flat())});
        return;
      }
      const n = selected[c];
      for (let a=0; a<=n && a+used[0]+occupied[0]<=4; a++) {
        for (let b=0; b<=n-a && b+used[1]+occupied[1]<=4; b++) {
          const d=n-a-b;
          if (d+used[2]+occupied[2]>4) continue;
          const xs=[a,b,d];
          for(let l=0;l<3;l++){allocation[3*c+l]=xs[l];used[l]+=xs[l];}
          visit(c+1);
          for(let l=0;l<3;l++){allocation[3*c+l]=0;used[l]-=xs[l];}
        }
      }
    }
    visit(0);
  }
  function select(c, left) {
    if(c===6){distribute();return;}
    for(let n=0;n<=Math.min(hand[c],Math.floor(left/(c+1)));n++){selected[c]=n;select(c+1,left-n*(c+1));}
  }
  select(0,energy);
  return out.sort((a,b)=>a.key.localeCompare(b.key));
}

function outcome(delta, a, b) {
  const d=delta.map((v,l)=>v+a[l]-b[l]);
  const wins=d.reduce((n,v)=>n+(v>0?1:v<0?-1:0),0);
  return Math.sign(wins || sum(d));
}

function compile(input, options={}) {
  const start=performance.now(), normalized=S.normalizeModel(input);
  if(normalized.turn!==normalized.rules.turns || normalized.turn>6) throw new Error('Endgame compiler requires the final turn, with at most six energy');
  if(normalized.rules.handLimit>7)throw new Error('Endgame benchmark supports at most seven cards in hand');
  const reduced=options.reduce!==false, pool=options.poolTypes!==false && reduced;
  const originalTypes=[[],[]], maps=[new Map(),new Map()], joint=[];
  function intern(t,p) {
    const key=typeKey(t);
    if(!maps[p].has(key)){maps[p].set(key,originalTypes[p].length);originalTypes[p].push({...t,key,weight:0});}
    return maps[p].get(key);
  }
  const independent=!!normalized.ranges;
  if(independent) normalized.ranges.forEach((range,p)=>range.forEach(t=>{const i=intern(t,p);originalTypes[p][i].weight=t.weight;}));
  else for(const c of normalized.cases){const ids=c.players.map(intern);joint.push({ids,weight:c.weight});ids.forEach((i,p)=>originalTypes[p][i].weight+=c.weight);}
  const delta=normalized.board.power[0].map((v,l)=>v-normalized.board.power[1][l]);
  let permutation=[0,1,2];
  if(options.symmetry!==false) permutation=permutations.slice().sort((a,b)=>{
    const key=p=>JSON.stringify(p.map(l=>[delta[l],normalized.board.slots[0][l],normalized.board.slots[1][l]]));
    return key(a).localeCompare(key(b));
  })[0];
  const unions=[[],[]], unionMaps=[new Map(),new Map()], classes=[[],[]], assignments=[[],[]];
  originalTypes.forEach((types,p)=>{
    const classMap=new Map(), actionCache=new Map();
    types.forEach((t,i)=>{
      const h=t.hand.join(',');
      if(!actionCache.has(h))actionCache.set(h,actions(t.hand,normalized.turn,normalized.board.slots[p]));
      t.actions=actionCache.get(h);
      const groupMap=new Map();
      for(const a of t.actions){
        const power=permutation.map(l=>a.power[l]);
        const k=reduced?power.join(','):permutation.map(l=>a.lanes[l].join(',')).join('/');
        if(!unionMaps[p].has(k)){unionMaps[p].set(k,unions[p].length);unions[p].push({key:k,power});}
        const id=unionMaps[p].get(k);
        if(!groupMap.has(id))groupMap.set(id,[]);
        groupMap.get(id).push(a);
      }
      const ids=[...groupMap.keys()].sort((a,b)=>a-b), ck=independent&&pool?ids.join(','):'type:'+i;
      if(!classMap.has(ck)){classMap.set(ck,classes[p].length);classes[p].push({ids,weight:0,members:[]});}
      const ci=classMap.get(ck);classes[p][ci].weight+=t.weight;classes[p][ci].members.push(i);
      assignments[p][i]={classIndex:ci,groups:groupMap};
    });
  });
  const cd=permutation.map(l=>delta[l]), n1=unions[1].length;let payoffs=new Int8Array(unions[0].length*n1);
  unions[0].forEach((a,i)=>unions[1].forEach((b,j)=>{payoffs[i*n1+j]=outcome(cd,a.power,b.power);}));
  const powerUnionSizes=unions.map(xs=>xs.length),cellsBeforeOutcomeSharing=payoffs.length;
  if(reduced&&options.shareOutcomes!==false){
    const mapping=[[],[]],representatives=[[],[]];
    for(let p=0;p<2;p++){
      const signatures=new Map();
      for(let i=0;i<unions[p].length;i++){
        const signature=Array.from({length:unions[1-p].length},(_,j)=>p===0?payoffs[i*n1+j]:payoffs[j*n1+i]).join(',');
        if(!signatures.has(signature)){signatures.set(signature,representatives[p].length);representatives[p].push(i);}
        mapping[p][i]=signatures.get(signature);
      }
    }
    const next=new Int8Array(representatives[0].length*representatives[1].length);
    representatives[0].forEach((a,i)=>representatives[1].forEach((b,j)=>{next[i*representatives[1].length+j]=payoffs[a*n1+b];}));
    payoffs=next;
    for(let p=0;p<2;p++){
      const old=unions[p].slice();unions[p]=representatives[p].map(i=>old[i]);classes[p]=[];const groupedTypes=new Map();
      originalTypes[p].forEach((t,i)=>{
        const groups=new Map();
        for(const [id,members]of assignments[p][i].groups){const k=mapping[p][id];if(!groups.has(k))groups.set(k,[]);groups.get(k).push(...members);}
        const ids=[...groups.keys()].sort((a,b)=>a-b),key=independent&&pool?ids.join(','):'type:'+i;
        if(!groupedTypes.has(key)){groupedTypes.set(key,classes[p].length);classes[p].push({ids,weight:0,members:[]});}
        const classIndex=groupedTypes.get(key);classes[p][classIndex].weight+=t.weight;classes[p][classIndex].members.push(i);assignments[p][i]={classIndex,groups};
      });
    }
  }
  const classJoint=independent?null:joint.map(c=>({ids:c.ids.map((i,p)=>assignments[p][i].classIndex),weight:c.weight}));
  // The key identifies this conditional game, not an equilibrium-history posterior.
  const semanticTypes=originalTypes.map(ts=>{
    if(!independent)return ts.map(t=>({key:t.key,weight:t.weight}));
    const grouped=new Map();
    for(const t of ts){
      const available=[...new Set(t.actions.map(a=>permutation.map(l=>a.power[l]).join(',')))].sort();
      const key=JSON.stringify(available);grouped.set(key,(grouped.get(key)||0)+t.weight);
    }
    return [...grouped].sort((a,b)=>a[0].localeCompare(b[0]));
  });
  const keyObject={energy:normalized.turn,lanes:cd.map((v,i)=>[v,normalized.board.slots[0][permutation[i]],normalized.board.slots[1][permutation[i]]]),independent,
    types:semanticTypes,joint:independent?undefined:joint};
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify(keyObject)).digest('hex');
  const stats={independent,originalTypes:originalTypes.map(x=>x.length),strategyClasses:classes.map(x=>x.length),originalActionEntries:originalTypes.map(ts=>sum(ts.map(t=>t.actions.length))),
    classActionEntries:classes.map(ts=>sum(ts.map(t=>t.ids.length))),powerUnionSizes,cellsBeforeOutcomeSharing,unionActions:unions.map(x=>x.length),payoffCells:payoffs.length,
    numericCFRBytes:16*sum(classes.flat().map(t=>t.ids.length)),payoffBytes:payoffs.byteLength};
  return {schema:'snap-final-turn-1',input:JSON.parse(JSON.stringify(input)),normalized,independent,originalTypes,classes,assignments,unions,payoffs,joint:classJoint,permutation,
    fingerprint,stats,compileMs:performance.now()-start,scope:'Equilibrium of the supplied conditional final-turn game; no full-game or historical-posterior certificate'};
}

function actionValues(g, policies, player) {
  const own=g.classes[player], opp=g.classes[1-player], n0=g.unions[0].length,n1=g.unions[1].length;
  const distributions=g.independent?[new Float64Array(g.unions[1-player].length)]:own.map(()=>new Float64Array(g.unions[1-player].length));
  if(g.independent){
    opp.forEach((t,i)=>t.ids.forEach((a,j)=>{distributions[0][a]+=t.weight*policies[1-player][i][j];}));
  }else for(const c of g.joint){
    const i=c.ids[player], j=c.ids[1-player], w=c.weight/own[i].weight;
    opp[j].ids.forEach((a,k)=>{distributions[i][a]+=w*policies[1-player][j][k];});
  }
  if(g.independent){
    const d=distributions[0],values=new Float64Array(g.unions[player].length);
    for(let a=0;a<values.length;a++)for(let b=0;b<d.length;b++)values[a]+=d[b]*(player===0?g.payoffs[a*n1+b]:-g.payoffs[b*n1+a]);
    return own.map(t=>Float64Array.from(t.ids,a=>values[a]));
  }
  const cache=new Map();
  return own.map((t,i)=>{
    const dist=distributions[g.independent?0:i];
    return Float64Array.from(t.ids,a=>{
      const key=(g.independent?'all':i)+'/'+a;if(cache.has(key))return cache.get(key);
      let v=0;
      for(let b=0;b<dist.length;b++)v+=dist[b]*(player===0?g.payoffs[a*n1+b]:-g.payoffs[b*n1+a]);
      cache.set(key,v);return v;
    });
  });
}

function lift(g, policies) {
  return g.originalTypes.map((types,p)=>types.map((t,i)=>{
    const assignment=g.assignments[p][i], c=g.classes[p][assignment.classIndex], q=policies[p][assignment.classIndex], out={};
    c.ids.forEach((id,j)=>{const members=assignment.groups.get(id);for(const a of members)out[a.key]=q[j]/members.length;});
    return {typeKey:t.key,probabilities:out};
  }));
}
module.exports={compile,actions,outcome,actionValues,lift,typeKey,permutations};
