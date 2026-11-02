'use strict';
const crypto=require('node:crypto'),S=require('../../dist/solver/engine.js'),T=require('../endgame/model.cjs');
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const infoKey=(p,turn,key,pair,draw)=>JSON.stringify(turn===5?[p,5,key]:[p,6,key,pair[0],pair[1],draw]);
class ResourceLimit extends Error {constructor(message){super(message);this.name='ResourceLimit';this.status='resource-limit';}}
function drawOutcomes(type,action,limit=7){
  const removed=Array(6).fill(0);action.lanes.flat().forEach(c=>removed[c-1]++);
  const hand=type.hand.map((n,c)=>n-removed[c]),remaining=type.remaining.slice(),n=sum(remaining);
  if(sum(hand)>=limit||!n)return [{cost:0,probability:1,hand,remaining}];
  return remaining.flatMap((count,c)=>{if(!count)return [];const h=hand.slice(),r=remaining.slice();h[c]++;r[c]--;return [{cost:c+1,probability:count/n,hand:h,remaining:r}];});
}
function compile(input,options={}){
  const start=performance.now(),normalized=S.normalizeModel(input);
  if(normalized.turn!==5||normalized.rules.turns!==6||normalized.rules.handLimit>7)throw new Error('Coupled solver requires turns five and six and at most seven cards in hand');
  const limits={maxBranches:4096,maxInfosets:100000,maxPayoffCells:5000000,maxActionEntries:1000000,...options};
  const types=[[],[]],indexes=[new Map(),new Map()],joint=[];
  const add=(t,p)=>{const key=T.typeKey(t);if(!indexes[p].has(key)){indexes[p].set(key,types[p].length);types[p].push({...t,key,weight:0});}return indexes[p].get(key);};
  const independent=!!normalized.ranges;
  if(independent)normalized.ranges.forEach((ts,p)=>ts.forEach(t=>{types[p][add(t,p)].weight=t.weight;}));
  else for(const c of normalized.cases){const ids=c.players.map(add);joint.push({ids,weight:c.weight});ids.forEach((i,p)=>types[p][i].weight+=c.weight);}
  const conditional=types.map((ts,p)=>ts.map((t,i)=>{
    if(independent)return Float64Array.from(types[1-p],x=>x.weight);
    const xs=new Float64Array(types[1-p].length);for(const c of joint)if(c.ids[p]===i)xs[c.ids[1-p]]+=c.weight/t.weight;return xs;
  }));
  const nodes=[[],[]],roots=[[],[]],rootUnion=[[],[]],unionMaps=[new Map(),new Map()],rootLookup=[[],[]],transitions=[[],[]],actionCache=new Map();
  let originalEntries=0,classEntries=0,storedCells=0;
  const getActions=(hand,energy,slots)=>{const key=hand.join(',')+'|'+energy+'|'+slots.join(',');if(!actionCache.has(key))actionCache.set(key,T.actions(hand,energy,slots));return actionCache.get(key);};
  function node(p,n){
    if(sum(nodes.map(xs=>xs.length))+1>limits.maxInfosets)throw new ResourceLimit('Information-set limit exceeded; no actions were pruned');
    originalEntries+=n.actions.length;classEntries+=n.groups.length;
    if(classEntries>limits.maxActionEntries)throw new ResourceLimit('Strategy-entry limit exceeded; no actions were pruned');
    const id=nodes[p].length;nodes[p].push({...n,id,player:p});return id;
  }
  types.forEach((ts,p)=>ts.forEach((t,i)=>{
    const actions=getActions(t.hand,5,normalized.board.slots[p]),groups=actions.map(a=>[a]);
    roots[p][i]=node(p,{turn:5,typeIndex:i,typeKey:t.key,key:infoKey(p,5,t.key),actions,groups});
    rootLookup[p][i]=new Map();transitions[p][i]=[];
    actions.forEach((a,k)=>{
      if(!unionMaps[p].has(a.key)){unionMaps[p].set(a.key,rootUnion[p].length);rootUnion[p].push(a);}
      rootLookup[p][i].set(a.key,k);
      const occupied=normalized.board.slots[p].map((n,l)=>n+a.slots[l]);
      transitions[p][i][k]=drawOutcomes(t,a,normalized.rules.handLimit).map(d=>({...d,actions:getActions(d.hand,6,occupied)}));
    });
  }));
  rootUnion.forEach(xs=>xs.sort((a,b)=>a.key.localeCompare(b.key)));
  const branches=[],matrices=new Map();let terminalNodes=0,skipOutcomes=0;
  for(const a of rootUnion[0])for(const b of rootUnion[1]){
    const pair=[a,b],keys=pair.map(x=>x.key),eligible=types.map((ts,p)=>ts.map((t,i)=>({t,i,local:rootLookup[p][i].get(keys[p])})).filter(x=>x.local!==undefined));
    const possible=(p,i)=>eligible[1-p].some(x=>conditional[p][i][x.i]>0);
    if(!eligible[0].some(x=>possible(0,x.i)))continue;
    if(branches.length>=limits.maxBranches)throw new ResourceLimit('Public-branch limit exceeded; no actions were pruned');
    const children=[[],[]],unions=[[],[]],powerIndex=[new Map(),new Map()];
    for(let p=0;p<2;p++)for(const x of eligible[p]){
      if(!possible(p,x.i))continue;
      for(const draw of transitions[p][x.i][x.local]){
        const grouping=new Map();
        for(const action of draw.actions){const k=action.power.join(',');if(!powerIndex[p].has(k)){powerIndex[p].set(k,unions[p].length);unions[p].push(action.power);}const id=powerIndex[p].get(k);if(!grouping.has(id))grouping.set(id,[]);grouping.get(id).push(action);}
        const ids=[...grouping.keys()],id=node(p,{turn:6,typeIndex:x.i,typeKey:x.t.key,key:infoKey(p,6,x.t.key,keys,draw.cost),parent:roots[p][x.i],parentAction:x.local,
          pair:keys,drawCost:draw.cost,drawProbability:draw.probability,hand:draw.hand,remaining:draw.remaining,actions:draw.actions,groups:[...grouping.values()],ids});
        children[p].push(id);terminalNodes++;if(!draw.cost)skipOutcomes++;
      }
    }
    const delta=normalized.board.power[0].map((v,l)=>v-normalized.board.power[1][l]+a.power[l]-b.power[l]);
    const matrixKey=JSON.stringify([delta,unions]);let payoffs=matrices.get(matrixKey);
    if(!payoffs){
      const size=unions[0].length*unions[1].length;if(storedCells+size>limits.maxPayoffCells)throw new ResourceLimit('Terminal payoff-cell limit exceeded; no actions were pruned');
      payoffs=new Int8Array(size);unions[0].forEach((x,i)=>unions[1].forEach((y,j)=>{payoffs[i*unions[1].length+j]=T.outcome(delta,x,y);}));matrices.set(matrixKey,payoffs);storedCells+=size;
    }
    branches.push({keys,nodes:children,unions,payoffs});
  }
  const fingerprint=crypto.createHash('sha256').update('snap-coupled-56-1|'+JSON.stringify(input)).digest('hex');
  return {schema:'snap-coupled-56-1',input:JSON.parse(JSON.stringify(input)),normalized,types,independent,joint,conditional,nodes,roots,rootUnion,rootLookup,transitions,branches,fingerprint,
    compileMs:performance.now()-start,limits,stats:{rootTypes:types.map(ts=>ts.length),rootActions:rootUnion.map(xs=>xs.length),publicBranches:branches.length,
      informationSets:nodes.map(xs=>xs.length),terminalInformationSets:terminalNodes,skippedDrawInformationSets:skipOutcomes,originalActionEntries:originalEntries,
      strategyActionEntries:classEntries,numericCFRBytes:16*classEntries,payoffCells:storedCells,payoffBytes:storedCells,sharedPayoffTables:matrices.size},
    scope:'Supplied conditional two-turn game (turns five and six); no equilibrium-history, safe re-solving or unrestricted deck-selection certificate'};
}
function lift(game,policies){return game.nodes.map((ns,p)=>ns.map(n=>({infoKey:n.key,turn:n.turn,typeKey:n.typeKey,probabilities:Object.fromEntries(n.groups.flatMap((group,j)=>group.map(a=>[a.key,policies[p][n.id][j]/group.length])))})));}
function importPolicy(game,supplied){
  if(!Array.isArray(supplied)||supplied.length!==2)throw new Error('Both policies required');
  return game.nodes.map((ns,p)=>{
    const map=new Map();for(const row of supplied[p]){if(map.has(row.infoKey))throw new Error('Duplicate information-set policy');map.set(row.infoKey,row.probabilities);}
    if(map.size!==ns.length)throw new Error('Policy information-set count mismatch');
    return ns.map(n=>{const row=map.get(n.key);if(!row)throw new Error('Missing information-set policy');const allowed=new Set(n.actions.map(a=>a.key));
      if(Object.entries(row).some(([k,v])=>!allowed.has(k)||!Number.isFinite(v)||v<0)||Math.abs(sum(Object.values(row))-1)>1e-8)throw new Error('Illegal or unnormalized policy');
      return Float64Array.from(n.groups,g=>sum(g.map(a=>row[a.key]||0)));
    });
  });
}
// Counterfactual reach excludes the evaluated player's own turn-five choice.
function values(game,policies,player){
  const q=game.nodes[player].map(n=>new Float64Array(n.groups.length)),rootBR=game.roots[player].map(id=>new Float64Array(game.nodes[player][id].groups.length)),reach=new Float64Array(q.length),other=1-player;
  for(const branch of game.branches){
    const bases=new Map(),width=branch.unions[1].length;
    for(const id of branch.nodes[player]){
      const own=game.nodes[player][id],cacheKey=game.independent?'all':own.typeIndex;
      if(!bases.has(cacheKey)){
        const distribution=new Float64Array(branch.unions[other].length);let mass=0;
        for(const oid of branch.nodes[other]){
          const opp=game.nodes[other][oid],conditional=game.conditional[player][own.typeIndex][opp.typeIndex];
          const weight=conditional*policies[other][opp.parent][opp.parentAction]*opp.drawProbability;if(!weight)continue;mass+=weight;
          opp.ids.forEach((a,j)=>{distribution[a]+=weight*policies[other][oid][j];});
        }
        const v=new Float64Array(branch.unions[player].length);
        for(let a=0;a<v.length;a++)for(let b=0;b<distribution.length;b++)v[a]+=distribution[b]*(player===0?branch.payoffs[a*width+b]:-branch.payoffs[b*width+a]);
        bases.set(cacheKey,{v,mass});
      }
      const base=bases.get(cacheKey);reach[id]=own.drawProbability*base.mass;
      let mean=0,best=-Infinity;own.ids.forEach((a,j)=>{const v=own.drawProbability*base.v[a];q[id][j]=v;mean+=policies[player][id][j]*v;best=Math.max(best,v);});
      q[own.parent][own.parentAction]+=mean;rootBR[own.typeIndex][own.parentAction]+=best;
    }
  }
  return {q,rootBR,reach};
}
module.exports={compile,infoKey,drawOutcomes,lift,importPolicy,values,ResourceLimit};
