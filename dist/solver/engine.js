/* Numerical Snap playing solver, v1.
 * Original CFR / outcome-sampling MCCFR implementation.
 * Both players retain private observations; simultaneous commitments are hidden.
 * Utility: win +1, draw 0, loss -1. No cube model.
 */
(function(root){
'use strict';
const VERSION='playing-solver-1',now=()=>typeof performance==='object'?performance.now():Date.now();
const sum=a=>a.reduce((s,v)=>s+v,0),copy=x=>JSON.parse(JSON.stringify(x));
class BudgetError extends Error{}
function costs(cs){const a=[0,0,0,0,0,0];for(const c of cs){if(!Number.isInteger(c)||c<1||c>6)throw new RangeError('Costs must be integers 1–6.');a[c-1]++;}return a;}
const cards=a=>a.flatMap((n,c)=>Array(n).fill(c+1));
const signature=p=>p.hand.join(',')+'/'+p.remaining.join(',')+(p.observations?'@'+p.observations:'');
function normalize(ws){if(!ws.length||ws.some(w=>!Number.isFinite(w)||w<0)||!(sum(ws)>0))throw new RangeError('Invalid probability distribution.');const n=sum(ws);return ws.map(w=>w/n);}
function rng(seed=1){let x=seed>>>0;return {next(){x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;},get state(){return x>>>0;},set state(v){x=v>>>0;}};}
function sample(ps,r){let v=r.next();for(let i=0;i<ps.length;i++){v-=ps[i];if(v<0)return i;}return ps.length-1;}
function regretPolicy(rs){const p=Float64Array.from(rs,x=>Math.max(0,x)),n=sum(p);if(n>0)for(let i=0;i<p.length;i++)p[i]/=n;else p.fill(1/p.length);return p;}
function averagePolicy(n){const t=sum(n.average);return t>0?Float64Array.from(n.average,x=>x/t):new Float64Array(n.actions.length).fill(1/n.actions.length);}
const PRESETS={midrange:[1,2,2,2,3,3,3,4,4,4,5,6],low:[1,1,1,1,2,2,2,2,3,3,4,5],balanced:[1,1,2,2,3,3,4,4,5,5,6,6]};
function legalActions(hand,energy,occupied,limit=4){
 const out=[],allocation=Array(18).fill(0),power=[0,0,0],slots=[0,0,0],removed=Array(6).fill(0);
 function visit(c,left){
  if(c===6){const lanes=[0,1,2].map(l=>allocation.flatMap((n,k)=>k%3===l?Array(n).fill(Math.floor(k/3)+1):[]));out.push({key:allocation.join(''),power:power.slice(),slots:slots.slice(),removed:removed.slice(),spent:energy-left,lanes});return;}
  const cost=c+1,n=Math.min(hand[c],Math.floor(left/cost));
  for(let a=0;a<=Math.min(n,limit-occupied[0]-slots[0]);a++)for(let b=0;b<=Math.min(n-a,limit-occupied[1]-slots[1]);b++)for(let d=0;d<=Math.min(n-a-b,limit-occupied[2]-slots[2]);d++){
   const xs=[a,b,d];for(let l=0;l<3;l++){allocation[c*3+l]=xs[l];power[l]+=cost*xs[l];slots[l]+=xs[l];}
   removed[c]=a+b+d;visit(c+1,left-cost*removed[c]);
   for(let l=0;l<3;l++){allocation[c*3+l]=0;power[l]-=cost*xs[l];slots[l]-=xs[l];}removed[c]=0;
  }
 }
 visit(0,energy);return out;
}
function terminal(board){let locations=0,total=0;for(let l=0;l<3;l++){const d=board.power[0][l]-board.power[1][l];locations+=Math.sign(d);total+=d;}return Math.sign(locations||total);}
function normalizeModel(input){
 const config=copy(input),rules={turns:6,handLimit:7,deckSize:12,...config.rules},turn=config.turn===undefined?1:config.turn;
 if(!Number.isInteger(turn)||!Number.isInteger(rules.turns)||turn<1||turn>rules.turns||rules.turns>7||!Number.isInteger(rules.handLimit)||rules.handLimit<1||rules.handLimit>12)throw new RangeError('Invalid rules or starting turn.');
 const raw=config.board||[[[],[],[]],[[],[],[]]];
 if(raw.length!==2||raw.some(p=>p.length!==3))throw new RangeError('board[player][lane] must contain six card arrays.');
 raw.forEach(p=>p.forEach(l=>{costs(l);if(l.length>4)throw new RangeError('Four slots per lane side.');}));
 const board={power:raw.map(p=>p.map(sum)),slots:raw.map(p=>p.map(l=>l.length))},revealed=raw.map(p=>sum(p.map(l=>l.length)));
 function priv(p,i){const hand=costs(p.hand),remaining=costs(p.remaining);if(sum(hand)>rules.handLimit)throw new RangeError('Hand exceeds hand limit.');if(rules.deckSize!==null&&sum(hand)+sum(remaining)+revealed[i]!==rules.deckSize)throw new RangeError('Revealed cards, hand and remaining deck must equal the deck size.');return {hand,remaining,weight:p.weight===undefined?1:p.weight,...(p.observations?{observations:String(p.observations)}:{})};}
 let ranges=null,cases=null;
 if(config.cases){cases=config.cases.map(c=>{if(c.players.length!==2)throw new RangeError('Joint cases need two players.');return {players:c.players.map(priv),weight:c.weight===undefined?1:c.weight};});const ps=normalize(cases.map(c=>c.weight));cases=cases.map((c,i)=>({...c,weight:ps[i]})).filter(c=>c.weight>0);}
 else{if(!config.ranges||config.ranges.length!==2)throw new RangeError('Supply private ranges for BOTH players, or weighted joint cases. The actual query is separate.');ranges=config.ranges.map((list,i)=>{const m=new Map();for(const p of list){const q=priv(p,i),k=signature(q);if(m.has(k))m.get(k).weight+=q.weight;else m.set(k,q);}const xs=[...m.values()],ps=normalize(xs.map(x=>x.weight));return xs.map((x,j)=>({...x,weight:ps[j]})).filter(x=>x.weight>0);});}
 for(let p=0;p<2;p++){const ts=ranges?ranges[p]:cases.map(c=>c.players[p]);if(new Set(ts.map(t=>sum(t.hand)+','+sum(t.remaining))).size!==1)throw new RangeError('Root hypotheses disagree on PUBLIC hand/deck counts.');}
 return {config,rules,turn,board,rawBoard:raw,ranges,cases,fingerprint:VERSION+'|'+JSON.stringify(config),scope:config.beliefScope||'User-specified conditional continuation ranges'};
}
function enumerateCases(m,limit=Infinity){if(m.cases){if(m.cases.length>limit)throw new BudgetError('Root-case budget exceeded.');return m.cases;}if(m.ranges[0].length*m.ranges[1].length>limit)throw new BudgetError('Root-case budget exceeded.');return m.ranges[0].flatMap(a=>m.ranges[1].map(b=>({players:[a,b],weight:a.weight*b.weight})));}
function initialState(m,w){return {turn:m.turn,phase:0,draw:0,players:w.players.map(p=>({hand:p.hand.slice(),remaining:p.remaining.slice()})),board:{power:m.board.power.map(p=>p.slice()),slots:m.board.slots.map(p=>p.slice())},public:'',private:w.players.map(signature),pending:null};}
function infoKey(s,p){return p+'|'+s.turn+'|'+s.public+'|'+s.private[p]+'|'+signature(s.players[p])+'|'+s.players.map(t=>sum(t.hand)+','+sum(t.remaining)).join(';');}
function apply(s,a,m){
 if(s.phase===0)return {...s,phase:1,pending:a};
 const pair=[s.pending,a],board={power:s.board.power.map((xs,p)=>xs.map((v,l)=>v+pair[p].power[l])),slots:s.board.slots.map((xs,p)=>xs.map((v,l)=>v+pair[p].slots[l]))};
 const players=s.players.map((t,p)=>({hand:t.hand.map((n,c)=>n-pair[p].removed[c]),remaining:t.remaining}));
 return {...s,turn:s.turn+1,phase:s.turn===m.rules.turns?3:2,draw:0,board,players,public:s.public+';'+pair.map(a=>a.key).join('/'),pending:null};
}
function chance(s,m){const p=s.players[s.draw],n=sum(p.remaining);return sum(p.hand)>=m.rules.handLimit||!n?[{cost:0,probability:1}]:p.remaining.flatMap((v,c)=>v?[{cost:c+1,probability:v/n}]:[]);}
function applyDraw(s,cost){const p=s.draw,players=s.players.slice(),hand=players[p].hand.slice(),remaining=players[p].remaining.slice();if(cost){hand[cost-1]++;remaining[cost-1]--;}players[p]={hand,remaining};const observations=s.private.slice();observations[p]+='.'+cost;return {...s,players,private:observations,phase:p===1?0:2,draw:p+1};}
class Solver{
 constructor(config,options={}){
  this.model=normalizeModel(config);this.options={algorithm:'auto',seed:1,maxInfoStates:60000,maxActionCache:5000,maxTreeNodes:50000,maxMatrixCells:2000000,exploration:0.6,...options};
  if(!['auto','matrix','full','sampled'].includes(this.options.algorithm))throw new RangeError('Unknown algorithm.');if(!(this.options.exploration>0&&this.options.exploration<=1))throw new RangeError('Exploration must be greater than zero and at most one.');
  this.random=rng(this.options.seed);this.nodes=new Map();this.actionCache=new Map();this.iterations=0;this.passes=0;this.visits=0;this.trainingMs=0;this.stopReason=null;this.matrix=null;this.tree=null;
  const start=now();
  if(this.options.algorithm==='matrix'||(this.options.algorithm==='auto'&&this.model.turn===this.model.rules.turns)){try{this.compileMatrix();}catch(e){if(!(e instanceof BudgetError)||this.options.algorithm==='matrix')throw e;this.nodes.clear();}}
  if(!this.matrix&&(this.options.algorithm==='full'||(this.options.algorithm==='auto'&&this.model.turn>=this.model.rules.turns-1))){try{this.compileTree();}catch(e){if(!(e instanceof BudgetError)||this.options.algorithm==='full')throw e;this.nodes.clear();this.tree=null;}}
  this.algorithm=this.matrix?'Bayesian matrix CFR+':this.tree?'Full-tree CFR':'Outcome-sampling MCCFR';this.setupMs=now()-start;
 }
 actions(s,p){const k=s.players[p].hand.join('')+'|'+s.turn+'|'+s.board.slots[p].join(',');let as=this.actionCache.get(k);if(as)return as;as=legalActions(s.players[p].hand,s.turn,s.board.slots[p]);if(this.actionCache.size>=this.options.maxActionCache)this.actionCache.delete(this.actionCache.keys().next().value);this.actionCache.set(k,as);return as;}
 node(s,p){const key=infoKey(s,p);let n=this.nodes.get(key);if(!n){if(this.nodes.size>=this.options.maxInfoStates)throw new BudgetError('Information-state memory budget reached.');const actions=this.actions(s,p);n={key,player:p,actions,regret:new Float64Array(actions.length),average:new Float64Array(actions.length),updates:0};this.nodes.set(key,n);}return n;}
 policy(s,p){const n=this.nodes.get(infoKey(s,p));return n?averagePolicy(n):new Float64Array(this.actions(s,p).length).fill(1/this.actions(s,p).length);}
 sampleWorld(){const m=this.model;if(m.cases)return m.cases[sample(m.cases.map(c=>c.weight),this.random)];const players=m.ranges.map(r=>r[sample(r.map(t=>t.weight),this.random)]);return {players,weight:players[0].weight*players[1].weight};}
 compileMatrix(){
  const groups=[new Map(),new Map()],blocks=[],union=[[],[]],unionIds=[new Map(),new Map()],storage=new Map();let cells=0,equivalentCells=0;
  const add=(p,n,mass)=>{if(!groups[p].has(n.key)){const ids=n.actions.map(a=>{if(!unionIds[p].has(a.key)){unionIds[p].set(a.key,union[p].length);union[p].push(a);}return unionIds[p].get(a.key);});groups[p].set(n.key,{node:n,mass:0,ids});}groups[p].get(n.key).mass+=mass;};
  const difference=this.model.board.power[0].map((x,l)=>x-this.model.board.power[1][l]),total=sum(difference);
  const payoff=(a,b)=>{let lanes=0;for(let l=0;l<3;l++)lanes+=Math.sign(difference[l]+a.power[l]-b.power[l]);return Math.sign(lanes||total+a.spent-b.spent);};
  if(this.model.ranges){
   const first=this.model.ranges.map(r=>r[0]);
   for(let p=0;p<2;p++)for(const type of this.model.ranges[p]){const players=first.slice();players[p]=type;add(p,this.node(initialState(this.model,{players}),p),type.weight);}
   cells=union[0].length*union[1].length;if(cells>this.options.maxMatrixCells)throw new BudgetError('Payoff-matrix memory budget exceeded.');
   const payoffs=new Int8Array(cells);for(let i=0;i<union[0].length;i++)for(let j=0;j<union[1].length;j++)payoffs[i*union[1].length+j]=payoff(union[0][i],union[1][j]);
   equivalentCells=sum([...groups[0].values()].map(g=>g.ids.length))*sum([...groups[1].values()].map(g=>g.ids.length));
   this.matrix={groups,blocks,cells,equivalentCells,independent:true,union,payoffs};return;
  }
  for(const w of enumerateCases(this.model,10000)){
   const s=initialState(this.model,w),a=this.node(s,0),b=this.node(s,1);add(0,a,w.weight);add(1,b,w.weight);
   const k=a.actions.map(a=>a.key).join(',')+'/'+b.actions.map(a=>a.key).join(',');let payoffs=storage.get(k);
   const n=a.actions.length*b.actions.length;equivalentCells+=n;
   if(!payoffs){cells+=n;if(cells>this.options.maxMatrixCells)throw new BudgetError('Payoff-matrix memory budget exceeded.');payoffs=new Int8Array(n);for(let i=0;i<a.actions.length;i++)for(let j=0;j<b.actions.length;j++)payoffs[i*b.actions.length+j]=payoff(a.actions[i],b.actions[j]);storage.set(k,payoffs);}
   blocks.push({a,b,weight:w.weight,payoff:payoffs,na:a.actions.length,nb:b.actions.length});
  }
  this.matrix={groups,blocks,cells,equivalentCells,independent:false};
 }
 matrixValues(strategies){
  const q=new Map([...this.nodes.values()].map(n=>[n.key,new Float64Array(n.actions.length)]));
  if(this.matrix.independent){
   const {union,groups,payoffs}=this.matrix,marginals=union.map(as=>new Float64Array(as.length));
   for(let p=0;p<2;p++)for(const [key,g]of groups[p]){const strategy=strategies.get(key);g.ids.forEach((id,a)=>marginals[p][id]+=g.mass*strategy[a]);}
   const values=union.map(as=>new Float64Array(as.length));
   for(let i=0;i<union[0].length;i++)for(let j=0;j<union[1].length;j++){const u=payoffs[i*union[1].length+j];values[0][i]+=u*marginals[1][j];values[1][j]-=u*marginals[0][i];}
   for(let p=0;p<2;p++)for(const [key,g]of groups[p])g.ids.forEach((id,a)=>q.get(key)[a]=values[p][id]);
   return q;
  }
  for(const b of this.matrix.blocks){const x=strategies.get(b.a.key),y=strategies.get(b.b.key),qa=q.get(b.a.key),qb=q.get(b.b.key);for(let i=0;i<b.na;i++)for(let j=0;j<b.nb;j++){const u=b.weight*b.payoff[i*b.nb+j];qa[i]+=u*y[j];qb[j]-=u*x[i];}}
  for(let p=0;p<2;p++)for(const [k,g]of this.matrix.groups[p])for(let a=0;a<q.get(k).length;a++)q.get(k)[a]/=g.mass;return q;
 }
 matrixIteration(){for(let p=0;p<2;p++){const ps=new Map([...this.nodes.values()].map(n=>[n.key,regretPolicy(n.regret)])),q=this.matrixValues(ps);for(const g of this.matrix.groups[p].values()){const n=g.node,v=q.get(n.key),s=ps.get(n.key),base=sum(v.map((x,i)=>x*s[i]));for(let i=0;i<v.length;i++)n.regret[i]=Math.max(0,n.regret[i]+v[i]-base);n.updates++;}}
  const w=this.iterations+1;for(const n of this.nodes.values()){const p=regretPolicy(n.regret);for(let a=0;a<p.length;a++)n.average[a]+=w*p[a];}this.iterations++;this.passes+=2;
 }
 compileTree(){const ws=enumerateCases(this.model,1000),nodes=[],groups=new Map();const build=(s,depth)=>{if(nodes.length>=this.options.maxTreeNodes)throw new BudgetError('Full-tree budget exceeded.');const id=nodes.length,n={state:s,depth,edges:[]};nodes.push(n);if(s.phase===3){n.kind='terminal';n.payoff=terminal(s.board);}else if(s.phase===2){n.kind='chance';for(const x of chance(s,this.model))n.edges.push({probability:x.probability,child:build(applyDraw(s,x.cost),depth+1)});}else{n.kind='decision';n.player=s.phase;n.info=this.node(s,s.phase);for(const a of n.info.actions)n.edges.push({child:build(apply(s,a,this.model),depth+1)});if(!groups.has(n.info.key))groups.set(n.info.key,[]);groups.get(n.info.key).push(id);}return id;};const roots=ws.map(w=>({index:build(initialState(this.model,w),0),weight:w.weight}));const order=nodes.map((_,i)=>i).sort((a,b)=>nodes[b].depth-nodes[a].depth);this.tree={nodes,groups,roots,order};}
 treeEvaluation(ps){const {nodes,roots,order}=this.tree,v=new Float64Array(nodes.length),r0=new Float64Array(nodes.length),r1=new Float64Array(nodes.length),rc=new Float64Array(nodes.length);for(const r of roots){r0[r.index]=r1[r.index]=1;rc[r.index]=r.weight;}for(const i of [...order].reverse()){const n=nodes[i];if(n.kind==='terminal')continue;const p=n.kind==='decision'?ps.get(n.info.key):null;n.edges.forEach((e,a)=>{const j=e.child;r0[j]=r0[i]*(n.player===0?p[a]:1);r1[j]=r1[i]*(n.player===1?p[a]:1);rc[j]=rc[i]*(n.kind==='chance'?e.probability:1);});}for(const i of order){const n=nodes[i];v[i]=n.kind==='terminal'?n.payoff:sum(n.edges.map((e,a)=>v[e.child]*(n.kind==='chance'?e.probability:ps.get(n.info.key)[a])));}return {values:v,r0,r1,rc,value:sum(roots.map(r=>r.weight*v[r.index]))};}
 fullIteration(){const ps=new Map([...this.nodes.values()].map(n=>[n.key,regretPolicy(n.regret)])),e=this.treeEvaluation(ps);for(const [key,indices]of this.tree.groups){const n=this.nodes.get(key),q=new Float64Array(n.actions.length),sign=n.player===0?1:-1,opp=n.player===0?e.r1:e.r0;for(const i of indices){const t=this.tree.nodes[i],w=e.rc[i]*opp[i];t.edges.forEach((x,a)=>q[a]+=w*sign*e.values[x.child]);}const p=ps.get(key),base=sum(q.map((x,a)=>x*p[a])),own=(n.player===0?e.r0:e.r1)[indices[0]];for(let a=0;a<q.length;a++){n.regret[a]+=q[a]-base;n.average[a]+=own*p[a];}n.updates++;}this.iterations++;this.passes+=2;}
 sampledEpisode(s,updater,mine,other,sampling){
  this.visits++;if(s.phase===3)return terminal(s.board)*(updater===0?1:-1);
  if(s.phase===2){const xs=chance(s,this.model),x=xs[sample(xs.map(x=>x.probability),this.random)];return this.sampledEpisode(applyDraw(s,x.cost),updater,mine,other*x.probability,sampling*x.probability);}
  const actor=s.phase,n=this.node(s,actor),p=regretPolicy(n.regret),b=actor===updater?Float64Array.from(p,x=>(1-this.options.exploration)*x+this.options.exploration/p.length):p,a=sample(b,this.random);
  const child=this.sampledEpisode(apply(s,n.actions[a],this.model),updater,mine*(actor===updater?p[a]:1),other*(actor!==updater?p[a]:1),sampling*b[a]),actionValue=child/b[a],value=p[a]*actionValue;
  if(actor===updater){for(let i=0;i<p.length;i++){n.regret[i]+=(other/sampling)*((i===a?actionValue:0)-value);n.average[i]+=mine*p[i]/sampling;}n.updates++;}return value;
 }
 sampledIteration(){for(let p=0;p<2;p++){const w=this.sampleWorld();this.sampledEpisode(initialState(this.model,w),p,1,w.weight,w.weight);this.passes++;}this.iterations++;}
 bestResponse(player,ps,e){const {nodes,groups,roots,order}=this.tree,v=new Float64Array(nodes.length),choices=new Map(),opp=player===0?e.r1:e.r0,sign=player===0?1:-1;for(const i of order){const n=nodes[i];if(n.kind==='terminal')v[i]=sign*n.payoff;else if(n.kind==='chance')v[i]=sum(n.edges.map(x=>x.probability*v[x.child]));else if(n.player!==player)v[i]=sum(n.edges.map((x,a)=>ps.get(n.info.key)[a]*v[x.child]));else{if(!choices.has(n.info.key)){const q=new Float64Array(n.edges.length);for(const j of groups.get(n.info.key)){const t=nodes[j],w=e.rc[j]*opp[j];t.edges.forEach((x,a)=>q[a]+=w*v[x.child]);}let best=0;for(let a=1;a<q.length;a++)if(q[a]>q[best])best=a;choices.set(n.info.key,best);}v[i]=v[n.edges[choices.get(n.info.key)].child];}}
  let maxConditionalGain=0;for(const indices of groups.values()){const first=nodes[indices[0]];if(first.player!==player||first.state.turn!==this.model.turn||first.state.public!=='')continue;let mass=0,gain=0;for(const i of indices){const w=e.rc[i]*opp[i];mass+=w;gain+=w*(v[i]-sign*e.values[i]);}if(mass>0)maxConditionalGain=Math.max(maxConditionalGain,gain/mass);}
  return {value:sum(roots.map(r=>r.weight*v[r.index])),maxConditionalGain};
 }
 diagnostics(){
  if(!this.matrix&&!this.tree)return {certified:false,nashGap:null,exploitability:null,maxConditionalGain:null,reason:'Exhaustive best responses exceed the configured budget. Iteration count and strategy stability are not convergence certificates.'};
  const ps=new Map([...this.nodes.values()].map(n=>[n.key,averagePolicy(n)]));let value,upper,lower,maxConditionalGain=0;
  if(this.matrix){const q=this.matrixValues(ps),best=[0,0],profile=[0,0];for(let p=0;p<2;p++)for(const [key,g]of this.matrix.groups[p]){const xs=q.get(key),policy=ps.get(key),mean=sum(xs.map((x,a)=>x*policy[a])),maximum=Math.max(...xs);best[p]+=g.mass*maximum;profile[p]+=g.mass*mean;maxConditionalGain=Math.max(maxConditionalGain,maximum-mean);}value=profile[0];upper=best[0];lower=-best[1];}
  else{const e=this.treeEvaluation(ps),a=this.bestResponse(0,ps,e),b=this.bestResponse(1,ps,e);value=e.value;upper=a.value;lower=-b.value;maxConditionalGain=Math.max(a.maxConditionalGain,b.maxConditionalGain);}
  const nashGap=Math.max(0,upper-lower);return {certified:true,value,upper,lower,nashGap,exploitability:nashGap/2,maxConditionalGain,method:'Exhaustive information-set-constrained best responses to the averaged strategy',scope:'This supplied-range continuation game, not a certificate for different beliefs or safe full-game re-solving.'};
 }
 run(o={}){const count=o.iterations===undefined?1000:o.iterations,maxMs=o.maxMs===undefined?Infinity:o.maxMs,target=o.targetGap===undefined?.01:o.targetGap,start=now(),initial=this.iterations;this.stopReason=null;while(this.iterations-initial<count){if(this.iterations>initial&&now()-start>=maxMs){this.stopReason='time';break;}try{if(this.matrix)this.matrixIteration();else if(this.tree)this.fullIteration();else this.sampledIteration();}catch(e){if(!(e instanceof BudgetError))throw e;this.stopReason='memory';break;}if((this.matrix||this.tree)&&this.iterations%25===0&&o.stopAtTarget!==false){const d=this.diagnostics();if(d.nashGap<=target&&d.maxConditionalGain<=target){this.stopReason='accuracy';break;}}}this.trainingMs+=now()-start;return this.stats();}
 stats(){const entries=sum([...this.nodes.values()].map(n=>n.actions.length));return {version:VERSION,algorithm:this.algorithm,iterations:this.iterations,passes:this.passes,informationStates:this.nodes.size,actionEntries:entries,numericTableBytes:entries*16,treeNodes:this.tree?this.tree.nodes.length:0,matrixCells:this.matrix?this.matrix.cells:0,equivalentUnsharedCells:this.matrix?this.matrix.equivalentCells:0,visitedNodes:this.visits,setupMs:this.setupMs,trainingMs:this.trainingMs,stopReason:this.stopReason,diagnostics:this.diagnostics()};}
 queryWorlds(query){const player=query.player||0,needle=signature({hand:costs(query.hand),remaining:costs(query.remaining),observations:query.observations});let worlds;if(this.model.cases){worlds=this.model.cases.filter(w=>signature(w.players[player])===needle);if(!worlds.length)throw new RangeError('Queried private type has zero probability.');const p=normalize(worlds.map(w=>w.weight));worlds=worlds.map((w,i)=>({...w,weight:p[i]}));}else{const own=this.model.ranges[player].find(t=>signature(t)===needle);if(!own)throw new RangeError('Queried hand/deck is absent from its public range. Querying must not reveal a private hand to the opponent.');worlds=this.model.ranges[1-player].map(other=>({players:player===0?[own,other]:[other,own],weight:other.weight}));}return {player,worlds};}
 rollout(s,r){while(s.phase!==3){if(s.phase===2){const xs=chance(s,this.model),x=xs[sample(xs.map(x=>x.probability),r)];s=applyDraw(s,x.cost);}else{const p=s.phase,as=this.actions(s,p);s=apply(s,as[sample(this.policy(s,p),r)],this.model);}}return terminal(s.board);}
 analyze(query,o={}){
  const started=now(),{player,worlds}=this.queryWorlds(query),state=initialState(this.model,worlds[0]),actions=this.actions(state,player),n=this.nodes.get(infoKey(state,player)),frequency=n?averagePolicy(n):new Float64Array(actions.length).fill(1/actions.length),sign=player===0?1:-1;
  const out=actions.map((action,a)=>({action,frequency:frequency[a],ev:0,wdl:[0,0,0],samples:0,error95:0}));
  if(this.matrix){for(const w of worlds){const s=initialState(this.model,w),opp=this.actions(s,1-player),p=this.policy(s,1-player);for(let a=0;a<actions.length;a++)for(let b=0;b<opp.length;b++){const pair=player===0?[actions[a],opp[b]]:[opp[b],actions[a]],u=terminal(apply(apply(s,pair[0],this.model),pair[1],this.model).board)*sign,weight=w.weight*p[b];out[a].ev+=weight*u;out[a].wdl[u>0?0:u===0?1:2]+=weight;}}}
  else if(this.tree){const ps=new Map([...this.nodes.values()].map(n=>[n.key,averagePolicy(n)])),e=this.treeEvaluation(ps),wdl=Array(this.tree.nodes.length);for(const i of this.tree.order){const t=this.tree.nodes[i];if(t.kind==='terminal'){const u=sign*t.payoff;wdl[i]=[u>0?1:0,u===0?1:0,u<0?1:0];}else{const v=[0,0,0];t.edges.forEach((x,a)=>{const p=t.kind==='chance'?x.probability:ps.get(t.info.key)[a];for(let k=0;k<3;k++)v[k]+=p*wdl[x.child][k];});wdl[i]=v;}}
   const indices=this.tree.groups.get(infoKey(state,player))||[],reach=player===0?e.r1:e.r0;let mass=0;for(const i of indices){const t=this.tree.nodes[i],w=e.rc[i]*reach[i];mass+=w;t.edges.forEach((x,a)=>{out[a].ev+=w*e.values[x.child]*sign;for(let k=0;k<3;k++)out[a].wdl[k]+=w*wdl[x.child][k];});}if(!(mass>0))throw new Error('No queried information-state reach.');for(const x of out){x.ev/=mass;x.wdl=x.wdl.map(v=>v/mass);}}
  else{const count=o.samplesPerAction||256,seed=o.seed||777,ps=worlds.map(w=>w.weight),error=Math.min(2,Math.sqrt(2*Math.log(2*actions.length/(o.alpha||.05))/count));for(let a=0;a<actions.length;a++){const r=rng(seed);for(let k=0;k<count;k++){let s=initialState(this.model,worlds[sample(ps,r)]);if(player===0)s=apply(s,actions[a],this.model);else{const as=this.actions(s,0);s=apply(s,as[sample(this.policy(s,0),r)],this.model);s=apply(s,actions[a],this.model);}const u=sign*this.rollout(s,r);out[a].ev+=u;out[a].wdl[u>0?0:u===0?1:2]++;}out[a].ev/=count;out[a].wdl=out[a].wdl.map(v=>v/count);out[a].samples=count;out[a].error95=error;}}
  const maximumEV=Math.max(...out.map(x=>x.ev)),d=this.diagnostics(),target=o.targetGap===undefined?.01:o.targetGap,threshold=o.mistakeThreshold===undefined?.02:o.mistakeThreshold;
  const strategyValidated=d.certified&&d.nashGap<=target&&d.maxConditionalGain<=target;
  for(const x of out){x.evLoss=Math.max(0,maximumEV-x.ev);x.lossInterval=[Math.max(0,x.evLoss-2*x.error95),Math.min(2,x.evLoss+2*x.error95)];x.grade=!strategyValidated?'provisional':x.lossInterval[0]>threshold?'mistake':x.lossInterval[1]<=threshold?'correct':'uncertain';}
  return {scope:this.model.scope,player,maximumEV,strategyEV:sum(out.map(x=>x.ev*x.frequency)),strategyValidated,evaluation:this.matrix||this.tree?'Exhaustive against the averaged opponent strategy':'Monte Carlo rollouts against the averaged opponent strategy',analysisMs:now()-started,diagnostics:d,actions:out};
 }
 snapshot(){const sets=[],ids=new Map(),nodes=[];for(const n of this.nodes.values()){const k=n.actions.map(a=>a.key).join('|');if(!ids.has(k)){ids.set(k,sets.length);sets.push(n.actions);}nodes.push({key:n.key,player:n.player,actionSet:ids.get(k),regret:Array.from(n.regret),average:Array.from(n.average),updates:n.updates});}return {version:VERSION,fingerprint:this.model.fingerprint,algorithm:this.algorithm,iterations:this.iterations,passes:this.passes,randomState:this.random.state,actionSets:sets,nodes};}
 checkpoint(){return this.snapshot();}
 restore(c){if(c.version!==VERSION||c.fingerprint!==this.model.fingerprint||c.algorithm!==this.algorithm)throw new Error('Checkpoint rules, beliefs or algorithm do not match.');if(c.nodes.length>this.options.maxInfoStates)throw new BudgetError('Checkpoint exceeds memory budget.');for(const x of c.nodes){const actions=c.actionSets[x.actionSet];if(!actions||actions.length!==x.regret.length||actions.length!==x.average.length||x.regret.some(v=>!Number.isFinite(v))||x.average.some(v=>!Number.isFinite(v)||v<0))throw new Error('Invalid checkpoint action set or numeric data.');let n=this.nodes.get(x.key);if(n&&n.actions.map(a=>a.key).join('|')!==actions.map(a=>a.key).join('|'))throw new Error('Checkpoint actions mismatch.');if(!n){n={key:x.key,player:x.player,actions,regret:new Float64Array(actions.length),average:new Float64Array(actions.length)};this.nodes.set(x.key,n);}n.regret.set(x.regret);n.average.set(x.average);n.updates=x.updates;}this.iterations=c.iterations;this.passes=c.passes;this.random.state=c.randomState;return this;}
}
function label(a){return a.lanes.map((cs,l)=>cs.length?cs.join('+')+' → '+['Left','Middle','Right'][l]:null).filter(Boolean).join(' · ')||'Pass';}
const api={VERSION,PRESETS,Solver,BudgetError,costs,cards,signature,normalizeModel,legalActions,terminal,initialState,infoKey,apply,applyDraw,chance,rng,regretPolicy,averagePolicy,label,clock:now};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SnapSolver=api;
})(typeof self!=='undefined'?self:globalThis);
