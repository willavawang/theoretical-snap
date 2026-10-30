'use strict';
// Offline backend: same rules and all legal moves, independent of the site.
const S=require('../../dist/solver/engine.js'),crypto=require('node:crypto'),{NodeArena}=require('./arena.cjs');
const privateHistory=require('./private-history.cjs');
const VERSION='snap-offline-1',sum=a=>a.reduce((s,x)=>s+x,0);
const catalog=S.legalActions([6,6,6,6,6,6],6,[0,0,0]);catalog.forEach((a,id)=>a.id=id);
const actionByKey=new Map(catalog.map(a=>[a.key,a]));
function choose(n,k){let v=1;for(let i=1;i<=k;i++)v=v*(n-i+1)/i;return Math.round(v);}
function normalize(a){const n=sum(a);if(!(n>0)||a.some(x=>!Number.isFinite(x)||x<0))throw new Error('Invalid probabilities');return Float64Array.from(a,x=>x/n);}
function pick(p,r){let x=r.next();for(let i=0;i<p.length;i++){x-=p[i];if(x<0)return i;}return p.length-1;}
function cumulative(p){let n=0;return Float64Array.from(p,x=>n+=x);}
function pickCDF(c,r){const x=r.next();let lo=0,hi=c.length-1;while(lo<hi){const m=(lo+hi)>>>1;if(x<c[m])hi=m;else lo=m+1;}return lo;}
function allDecks(){const out=[],counts=Array(6).fill(0);function visit(c,left){if(c===5){counts[c]=left;out.push({name:counts.map((n,i)=>n+'x'+(i+1)).join(' '),counts:counts.slice(),weight:1});return;}for(let n=0;n<=left;n++){counts[c]=n;visit(c+1,left-n);}}visit(0,12);return out;}
function deckList(input){if(input==='all')return allDecks();if(!Array.isArray(input)||!input.length)throw new Error('A deck list or all is required');const found=new Map();for(const d of input){const cards=typeof d==='string'?S.PRESETS[d]:(d.cards||S.PRESETS[d.name]);if(!cards||cards.length!==12)throw new Error('Decks must contain twelve costs');const counts=S.costs(cards),key=counts.join(','),weight=typeof d==='string'?1:(d.weight===undefined?1:d.weight);if(!Number.isFinite(weight)||weight<0)throw new Error('Invalid deck weight');if(found.has(key))found.get(key).weight+=weight;else found.set(key,{name:typeof d==='string'?d:(d.name||key),counts,weight});}return [...found.values()].filter(x=>x.weight>0);}
function deal(deck,r){const remaining=deck.counts.slice(),hand=Array(6).fill(0);let left=12;for(let i=0;i<4;i++){let draw=Math.floor(r.next()*left);for(let c=0;c<6;c++){draw-=remaining[c];if(draw<0){remaining[c]--;hand[c]++;left--;break;}}}let mass=1;for(let c=0;c<6;c++)mass*=choose(deck.counts[c],hand[c]);return {hand,remaining,weight:mass/495};}
function dummy(d){const cs=S.cards(d.counts);return {hand:cs.slice(0,4),remaining:cs.slice(4)};}
function legalClass(s,p){let k=0;for(const x of s.players[p].hand)k=k*13+x;for(const x of s.board.slots[p])k=k*5+x;return k*8+s.turn;}
class OfflineSolver extends S.Solver{
 constructor(spec={},options={}){
  const pools=spec.model?null:(spec.decks||['all','all']).map(deckList),rules={turns:6,handLimit:7,deckSize:12,...spec.rules};
  if(rules.turns>6)throw new Error('Offline catalog supports at most six turns');
  if(pools&&(rules.deckSize!==12||rules.handLimit!==7))throw new Error('Opening deals require the twelve-card, seven-card model');
  super(spec.model||{turn:1,rules,ranges:pools.map(ds=>[dummy(ds[0])])},{algorithm:'sampled',maxInfoStates:2000000,...options});
  this.spec=JSON.parse(JSON.stringify(spec));this.pools=pools;this.deckSelection=!!pools&&(spec.deckSelection||'equilibrium')==='equilibrium';
  if(pools&&!['fixed','equilibrium'].includes(spec.deckSelection||'equilibrium'))throw new Error('Unknown deck-selection mode');
  this.terminalEnumeration=options.terminalEnumeration!==false;this.opponentExploration=options.opponentExploration===undefined?.6:options.opponentExploration;if(!Number.isFinite(this.opponentExploration)||this.opponentExploration<0||this.opponentExploration>1)throw new Error('Invalid opponent exploration');this.model.fingerprint=VERSION+'|'+JSON.stringify(spec)+'|terminal='+this.terminalEnumeration+'|opponentExploration='+this.opponentExploration;
  this.fingerprint=crypto.createHash('sha256').update(this.model.fingerprint).digest('hex');
  this.algorithm='Offline outcome-sampling MCCFR'+(this.terminalEnumeration?' + terminal action enumeration':'');
  this.publicNodes=[null];this.publicMap=new Map();this.privateHistories=[];this.privateMap=new Map();this.packedPrivateHistories=0;
  this.actionSets=[];this.actionSetMap=new Map();this.actionEntries=0;this.nodes=new NodeArena(this);
  this.fixed=pools?pools.map(ds=>normalize(ds.map(d=>d.weight))):null;
  this.rootCDF=pools?this.fixed.map(cumulative):this.model.cases?[cumulative(this.model.cases.map(c=>c.weight))]:this.model.ranges.map(r=>cumulative(r.map(t=>t.weight)));
  this.deckNodes=pools?pools.map(ds=>({regret:new Float64Array(ds.length),average:new Float64Array(ds.length)})):null;
  this.reference=options.reference||null;this.updaterOnly=options.updaterOnly;this.referenceDeckPolicies=this.reference&&pools?this.reference.deckPolicies():null;this.foreignMaps=new WeakMap();
 }
 publicChild(parent,a,b,create=true){const k=parent+'/'+a+'/'+b;let id=this.publicMap.get(k);if(id===undefined&&create){id=this.publicNodes.length;if(id>=2097152)throw new S.BudgetError('Public-history key budget reached');this.publicNodes.push([parent,a,b]);this.publicMap.set(k,id);}return id;}
 publicFromOriginal(s){let id=0;for(const pair of s.public.split(';').filter(Boolean)){const ks=pair.split('/'),a=actionByKey.get(ks[0]),b=actionByKey.get(ks[1]);if(!a||!b)return undefined;id=this.publicChild(id,a.id,b.id,false);if(id===undefined)return undefined;}return id;}
 foreignPublic(other,id){if(id<0)return undefined;let map=this.foreignMaps.get(other);if(!map){map=new Map([[0,0]]);this.foreignMaps.set(other,map);}if(map.has(id))return map.get(id);const n=other.publicNodes[id],parent=this.foreignPublic(other,n[0]),answer=parent===undefined?undefined:this.publicChild(parent,n[1],n[2],false);map.set(id,answer);return answer;}
 privateToken(history){return this.options.compactPrivateHistories===false?privateHistory.decode(history):privateHistory.encode(history);}
 internPrivate(history){const token=this.privateToken(history);let id=this.privateMap.get(token);if(id===undefined){id=this.privateHistories.length;if(id>=2147483648)throw new S.BudgetError('Private-history key budget reached');this.privateHistories.push(token);this.privateMap.set(token,id);if(typeof token==='number')this.packedPrivateHistories++;}return id;}
 key(s,p,create=false,owner=this){const pub=s.publicId===undefined?this.publicFromOriginal(s):owner===this?s.publicId:this.foreignPublic(owner,s.publicId);if(pub===undefined||pub<0)return undefined;const token=this.privateToken(s.private[p]);let priv=this.privateMap.get(token);if(priv===undefined&&create)priv=this.internPrivate(token);return priv===undefined?undefined:pub*4294967296+priv*2+p;}
 actionSet(s,p){const key=legalClass(s,p);let set=this.actionSetMap.get(key);if(set)return set;const actions=catalog.filter(a=>a.spent<=s.turn&&a.slots.every((n,l)=>n+s.board.slots[p][l]<=4)&&a.removed.every((n,c)=>n<=s.players[p].hand[c]));set={id:this.actionSets.length,key,actions};this.actionSets.push(set);this.actionSetMap.set(key,set);return set;}
 actions(s,p){return this.actionSet(s,p).actions;}
 node(s,p){if(this.reference&&p!==this.updaterOnly)return {actions:this.actions(s,p)};const key=this.key(s,p,true);let n=this.nodes.get(key);if(!n){if(this.nodes.size>=this.options.maxInfoStates)throw new S.BudgetError('Information-state budget reached');const set=this.actionSet(s,p);this.nodes.set(key,{key,player:p,actionSetID:set.id,actions:set.actions,regret:new Float64Array(set.actions.length),average:new Float64Array(set.actions.length),updates:0});this.actionEntries+=set.actions.length;n=this.nodes.get(key);}return n;}
 policy(s,p,owner=this){const n=this.nodes.get(this.key(s,p,false,owner));return n?S.averagePolicy(n):new Float64Array(this.actions(s,p).length).fill(1/this.actions(s,p).length);}
 transition(s,a,create=true){const next=S.apply(s,a,this.model);if(s.phase===1){const id=s.publicId<0?undefined:this.publicChild(s.publicId,s.pending.id,a.id,create);next.publicId=id===undefined?-1:id;next.public='';}return next;}
 root(s){s.publicId=0;return s;}
 deckPolicies(){return this.pools.map((ds,p)=>{const n=this.deckNodes[p],z=sum(n.average);return this.deckSelection?(z?Float64Array.from(n.average,x=>x/z):new Float64Array(ds.length).fill(1/ds.length)):this.fixed[p];});}
 world(r=this.random){if(this.pools){const ps=this.deckPolicies(),ids=ps.map(p=>pickCDF(cumulative(p),r)),players=ids.map((id,p)=>deal(this.pools[p][id],r));return {players,weight:players[0].weight*players[1].weight*ps[0][ids[0]]*ps[1][ids[1]],deckIDs:ids};}if(this.model.cases)return this.model.cases[pickCDF(this.rootCDF[0],r)];const players=this.model.ranges.map((xs,p)=>xs[pickCDF(this.rootCDF[p],r)]);return {players,weight:players[0].weight*players[1].weight};}
 sampleWorld(){if(!this.pools)return this.world();const ids=this.rootCDF.map(c=>pickCDF(c,this.random)),players=ids.map((id,p)=>deal(this.pools[p][id],this.random));return {players,weight:players[0].weight*players[1].weight*this.fixed[0][ids[0]]*this.fixed[1][ids[1]],deckIDs:ids};}
 actorPolicy(s,p,n){return this.reference&&p!==this.updaterOnly?this.reference.policy(s,p,this):S.regretPolicy(n.regret);}
 terminalEpisode(s,updater,mine,other,sampling){
  if(s.phase===0&&updater===1){const opp=this.node(s,0),p=this.actorPolicy(s,0,opp),b=Float64Array.from(p,x=>(1-this.opponentExploration)*x+this.opponentExploration/p.length),i=pick(b,this.random);return p[i]/b[i]*this.sampledEpisode(this.transition(s,opp.actions[i]),updater,mine,other*p[i],sampling*b[i]);}
  const own=this.node(s,updater),p=this.actorPolicy(s,updater,own);let opposite;if(updater===0){const opp=this.node(s,1),q=this.actorPolicy(s,1,opp);opposite=opp.actions[pick(q,this.random)];}else opposite=s.pending;
  const values=new Float64Array(own.actions.length),sign=updater===0?1:-1;
  for(let i=0;i<values.length;i++){const pair=updater===0?[own.actions[i],opposite]:[opposite,own.actions[i]],board={power:s.board.power.map((xs,j)=>xs.map((v,l)=>v+pair[j].power[l]))};values[i]=sign*S.terminal(board);}
  let value=0;for(let i=0;i<values.length;i++)value+=p[i]*values[i];
  for(let i=0;i<values.length;i++){own.regret[i]+=other/sampling*(values[i]-value);own.average[i]+=mine*p[i]/sampling;}own.updates++;return value;
 }
 sampledEpisode(s,updater,mine,other,sampling){
  this.visits++;if(s.phase===3)return S.terminal(s.board)*(updater===0?1:-1);
  if(s.phase===2){const xs=S.chance(s,this.model),x=xs[pick(xs.map(x=>x.probability),this.random)];return this.sampledEpisode(S.applyDraw(s,x.cost),updater,mine,other*x.probability,sampling*x.probability);}
  if(this.terminalEnumeration&&s.turn===this.model.rules.turns)return this.terminalEpisode(s,updater,mine,other,sampling);
  const actor=s.phase,n=this.node(s,actor),p=this.actorPolicy(s,actor,n),explore=actor===updater?this.options.exploration:this.opponentExploration,b=Float64Array.from(p,x=>(1-explore)*x+explore/p.length),a=pick(b,this.random);
  const child=this.sampledEpisode(this.transition(s,n.actions[a]),updater,mine*(actor===updater?p[a]:1),other*(actor!==updater?p[a]:1),sampling*b[a]),actionValue=child/b[a],value=p[a]*actionValue;
  if(actor===updater){for(let i=0;i<p.length;i++){n.regret[i]+=other/sampling*((i===a?actionValue:0)-value);n.average[i]+=mine*p[i]/sampling;}n.updates++;}return value;
 }
 sampledIteration(){
  for(const updater of this.updaterOnly===undefined?[0,1]:[this.updaterOnly]){
   if(!this.deckSelection){const w=this.sampleWorld();this.sampledEpisode(this.root(S.initialState(this.model,w)),updater,1,w.weight,w.weight);}
   else{const ps=this.deckNodes.map((n,p)=>this.reference&&p!==updater?this.referenceDeckPolicies[p]:S.regretPolicy(n.regret)),bs=ps.map((p,i)=>{const e=i===updater?this.options.exploration:this.opponentExploration;return Float64Array.from(p,x=>(1-e)*x+e/p.length);}),ids=bs.map(p=>pick(p,this.random)),players=ids.map((id,p)=>deal(this.pools[p][id],this.random)),chance=players[0].weight*players[1].weight;
    const value=this.sampledEpisode(this.root(S.initialState(this.model,{players})),updater,ps[updater][ids[updater]],ps[1-updater][ids[1-updater]]*chance,bs[0][ids[0]]*bs[1][ids[1]]*chance),n=this.deckNodes[updater],a=ids[updater],q=value*ps[1-updater][ids[1-updater]]/bs[1-updater][ids[1-updater]]/bs[updater][a],v=ps[updater][a]*q;
    for(let i=0;i<n.regret.length;i++){n.regret[i]+=(i===a?q:0)-v;n.average[i]+=ps[updater][i];}
   }this.passes++;
  }this.iterations++;
 }
 rollout(s,r=this.random,otherSolver,otherPlayer){while(s.phase!==3){if(s.phase===2){const xs=S.chance(s,this.model),x=xs[pick(xs.map(x=>x.probability),r)];s=S.applyDraw(s,x.cost);}else{const p=s.phase,as=this.actions(s,p),q=otherSolver&&p===otherPlayer?otherSolver.policy(s,p,this):this.policy(s,p);s=this.transition(s,as[pick(q,r)],false);}}return S.terminal(s.board);}
 stats(){return {version:VERSION,algorithm:this.algorithm,iterations:this.iterations,passes:this.passes,informationStates:this.nodes.size,actionEntries:this.actionEntries,numericTableBytes:this.actionEntries*16,arenaAllocatedBytes:this.nodes.allocatedBytes(),publicHistories:this.publicNodes.length,privateHistories:this.privateHistories.length,packedPrivateHistories:this.packedPrivateHistories,legalActionSets:this.actionSets.length,sharedActions:catalog.length,visitedNodes:this.visits,trainingMs:this.trainingMs,stopReason:this.stopReason,deckSelection:this.deckSelection,deckTypes:this.pools?this.pools.map(x=>x.length):null,diagnostics:this.diagnostics()};}
 analyze(){throw new Error('Use offline/decision.cjs for complete game-state reports');}
}
module.exports={VERSION,OfflineSolver,S,catalog,actionByKey,choose,deal,allDecks,pick,pickCDF,cumulative,sum};
