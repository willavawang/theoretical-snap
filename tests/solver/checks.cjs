'use strict';
module.exports=function checks(S,R){
 const entries=[];
 const equal=(a,b,m='Values differ')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(m+': '+JSON.stringify(a)+' != '+JSON.stringify(b));};
 const ok=(x,m='Assertion failed')=>{if(!x)throw new Error(m);};
 const throws=(fn,m)=>{let raised=false;try{fn();}catch(e){raised=true;if(m&&!m.test(String(e)))throw e;}if(!raised)throw new Error('Expected rejection.');};
 function test(name,fn){const start=Date.now();try{fn();entries.push({name,passed:true,ms:Date.now()-start});}catch(e){entries.push({name,passed:false,error:String(e),stack:e.stack});}}
 test('Legal turns retain composition, passing, affordability, and four-slot capacity',()=>{
  const a=S.legalActions(S.costs([1,2,4,6]),6,[1,2,2]);equal(a.length,40);equal(new Set(a.map(x=>x.key)).size,40);
  ok(a.some(x=>x.spent===0));ok(a.some(x=>x.lanes[0].join(',')==='2,4'));ok(a.some(x=>x.lanes[0].join(',')==='6'));
  equal(S.legalActions(S.costs([1,1]),2,[0,0,0]).length,10);equal(S.legalActions(S.costs([6]),6,[4,4,4]).length,1);
  for(const x of a){ok(x.spent<=6);ok(x.slots.every((n,l)=>n+[1,2,2][l]<=4));}
 });
 test('Simultaneous choices and the actual opponent hand never enter the other information key',()=>{
  const m=S.normalizeModel(R.publicFixture()),w={players:m.ranges.map(r=>r[0])},root=S.initialState(m,w),a=S.legalActions(w.players[0].hand,6,[1,2,2]);
  equal(S.infoKey(S.apply(root,a[0],m),1),S.infoKey(S.apply(root,a.at(-1),m),1));
  const changed=S.initialState(m,{players:[{hand:S.costs([1,1,5,6]),remaining:S.costs([2,3,4])},w.players[1]]});
  equal(S.infoKey(root,1),S.infoKey(changed,1));
 });
 test('Matrix CFR discovers the independently certified +1/5 fixture value',()=>{
  const solver=new S.Solver(R.publicFixture());solver.run({iterations:10000,targetGap:.003});const d=solver.diagnostics();
  ok(d.certified);ok(d.nashGap<.003);ok(Math.abs(d.value-.2)<.003);
  const result=solver.analyze({hand:[1,2,4,6],remaining:[3,5,6]},{targetGap:.003});
  ok(result.strategyValidated);equal(result.actions.length,40);ok(result.actions.find(x=>x.action.lanes[2].join(',')==='6').evLoss>.1);
  ok(Math.abs(result.actions.reduce((s,a)=>s+a.frequency,0)-1)<1e-10);
  for(const a of result.actions)ok(Math.abs(a.wdl.reduce((s,v)=>s+v,0)-1)<1e-10);
 });
 test('Hidden types converge without a clairvoyant best response',()=>{
  const s=new S.Solver(R.hiddenFixture());s.run({iterations:5000,targetGap:.01});const d=s.diagnostics();ok(d.nashGap<.01);equal(s.nodes.size,4);
  let cheating=0;
  for(const a of s.model.ranges[0])for(const b of s.model.ranges[1]){
   const state=S.initialState(s.model,{players:[a,b]}),as=s.actions(state,0),bs=s.actions(state,1),p=s.policy(state,1);
   let best=-Infinity;
   for(const x of as){let value=0;for(let j=0;j<bs.length;j++)value+=p[j]*S.terminal(S.apply(S.apply(state,x,s.model),bs[j],s.model).board);best=Math.max(best,value);}
   cheating+=a.weight*b.weight*best;
  }
  ok(cheating>d.upper+.1,'A peeking best response must be distinguishable from the valid bound.');
  throws(()=>s.analyze({hand:[6],remaining:[]}),/absent/);
 });
 test('The shared independent-range optimization matches the general joint-case payoff calculation',()=>{
  const m=R.hiddenFixture(),a=new S.Solver(m);
  const cases=m.ranges[0].flatMap(x=>m.ranges[1].map(y=>({players:[x,y],weight:x.weight*y.weight}))),b=new S.Solver({turn:6,board:m.board,cases});
  const policies=new Map([...a.nodes.values()].map(n=>[n.key,Float64Array.from(n.actions,(_,i)=>2*(i+1)/(n.actions.length*(n.actions.length+1)))]));
  const qa=a.matrixValues(policies),qb=b.matrixValues(policies);
  for(const [key,values]of qa)for(let i=0;i<values.length;i++)ok(Math.abs(values[i]-qb.get(key)[i])<1e-12);
 });
 test('Full-tree CFR solves a genuinely sequential two-turn game with information-set-constrained deviations',()=>{
  const s=new S.Solver(R.example('two-turn-check'),{algorithm:'full'});s.run({iterations:2000,targetGap:.01});
  ok(s.tree.nodes.length>100);ok(s.diagnostics().nashGap<.01);ok(Math.abs(s.diagnostics().value)<1e-10);
  const r=s.analyze({hand:[1,2],remaining:[]});ok(r.strategyValidated);equal(r.actions.length,4);
 });
 test('Outcome-sampled MCCFR approaches the independent matrix-game certificate',()=>{
  const s=new S.Solver(R.publicFixture(),{algorithm:'sampled',seed:93});s.run({iterations:80000,stopAtTarget:false});
  const n0=[...s.nodes.values()].find(n=>n.player===0),n1=[...s.nodes.values()].find(n=>n.player===1),x=S.averagePolicy(n0),y=S.averagePolicy(n1),m=S.normalizeModel(R.publicFixture()),state=S.initialState(m,{players:m.ranges.map(r=>r[0])});
  const q0=Array.from(x,()=>0),q1=Array.from(y,()=>0);let v=0;
  for(let i=0;i<x.length;i++)for(let j=0;j<y.length;j++){const u=S.terminal(S.apply(S.apply(state,n0.actions[i],m),n1.actions[j],m).board);q0[i]+=u*y[j];q1[j]+=u*x[i];v+=x[i]*u*y[j];}
  ok(Math.max(...q0)-Math.min(...q1)<.07);ok(Math.abs(v-.2)<.025);
  equal(s.diagnostics().certified,false);
  ok(s.analyze({hand:[1,2,4,6],remaining:[3,5,6]},{samplesPerAction:40}).actions.every(a=>a.grade==='provisional'));
 });
 test('Chance is without replacement, full-hand draws are skipped, and private observations are remembered',()=>{
  const m=S.normalizeModel({turn:1,rules:{turns:3,deckSize:null},ranges:[0,1].map(()=>[{hand:[1,2,3,4,5,6,6],remaining:[1,2]}])});
  let s=S.initialState(m,{players:m.ranges.map(r=>r[0])});const pass=S.legalActions(s.players[0].hand,1,[0,0,0])[0];s=S.apply(S.apply(s,pass,m),pass,m);
  equal(S.chance(s,m),[{cost:0,probability:1}]);equal(S.applyDraw(s,0).private[0],s.private[0]+'.0');
  const base={...s,players:[{hand:S.costs([3]),remaining:S.costs([1,1,2])},s.players[1]],draw:0,phase:2};equal(S.chance(base,m),[{cost:1,probability:2/3},{cost:2,probability:1/3}]);
  const a=S.applyDraw({...S.applyDraw(base,1),draw:0,phase:2},2),b=S.applyDraw({...S.applyDraw(base,2),draw:0,phase:2},1);
  equal(S.signature(a.players[0]),S.signature(b.players[0]));ok(S.infoKey(a,0)!==S.infoKey(b,0),'Do not merge different remembered draw sequences.');
 });
 test('Sampled and matrix checkpoints resume identically and reject stale beliefs',()=>{
  for(const algorithm of ['matrix','sampled']){
   const a=new S.Solver(R.publicFixture(),{algorithm,seed:20});a.run({iterations:50,stopAtTarget:false});
   const b=new S.Solver(R.publicFixture(),{algorithm}).restore(a.snapshot());
   a.run({iterations:50,stopAtTarget:false});b.run({iterations:50,stopAtTarget:false});equal(a.snapshot(),b.snapshot());
   const m=R.publicFixture();m.ranges[0][0].weight=2;throws(()=>new S.Solver(m,{algorithm}).restore(a.snapshot()),/do not match/);
  }
 });
 test('Queries never change the opponent strategy or condition the solving range on a secret actual hand',()=>{
  const s=new S.Solver(R.hiddenFixture());s.run({iterations:1000});const before=JSON.stringify(s.snapshot());
  for(const p of R.hiddenFixture().ranges[0])s.analyze(p);
  equal(JSON.stringify(s.snapshot()),before);
 });
 test('Bayesian ranges respect the actual opening convention and retain custom deck priors',()=>{
  for(let t=1;t<=6;t++){const m=R.example('turn-'+t);for(let p=0;p<2;p++){ok(Math.abs(m.ranges[p].reduce((s,x)=>s+x.weight,0)-1)<1e-10);for(const x of m.ranges[p]){equal(x.hand.length,4);equal(x.remaining.length,9-t);equal(x.hand.length+m.board[p].flat().length,3+t);}}}
  const a=R.fromDecks({turn:3,history:R.publicSequence(3)}),b=R.fromDecks({turn:3,history:R.publicSequence(3),historyPolicy:'card-consistency'});ok(JSON.stringify(a.ranges)!==JSON.stringify(b.ranges));
  throws(()=>R.fromDecks({turn:3,history:[]}),/preceding/);
  equal(R.fromDecks({decks:[[{cards:Array(12).fill(1),weight:1}],['balanced']]}).ranges[0].length,1);
 });
 test('Reference-policy conditioning follows observed play and preserves private histories',()=>{
  const s=new S.Solver(R.example('two-turn-check'),{algorithm:'full'});s.run({iterations:1000});
  const post=R.fromReferencePolicy(s,[{plays:[[[1],[],[]],[[1],[],[]]]}],{tremble:.01});
  equal(post.turn,2);equal(post.rangeMetadata.uniformFallbackLookups,0);
  equal(post.ranges[0][0].hand,[2]);ok(post.ranges[0][0].observations.endsWith('.0'));
  const end=new S.Solver(post);end.run({iterations:1000});ok(end.diagnostics().nashGap<.01);
  ok(end.analyze(post.ranges[0][0]).strategyValidated);
 });
 test('Budgets stop analysis rather than pruning legal choices or claiming convergence',()=>{
  const s=new S.Solver(R.example('turn-1'),{algorithm:'sampled',maxInfoStates:20});s.run({iterations:1000});
  equal(s.stopReason,'memory');ok(s.nodes.size<=20);equal(s.diagnostics().nashGap,null);
  throws(()=>new S.Solver(R.publicFixture(),{exploration:0}),/Exploration/);
  const m=R.publicFixture();m.turn=0;throws(()=>new S.Solver(m),/Invalid/);
 });
 test('Invalid decks, public counts, and probability weights are rejected',()=>{
  const a=R.publicFixture();a.ranges[0][0].remaining=[];throws(()=>new S.Solver(a),/deck size/);
  const b=R.hiddenFixture();b.ranges[0][1].hand.pop();b.ranges[0][1].remaining.push(1);throws(()=>new S.Solver(b),/PUBLIC/);
  const c=R.publicFixture();c.ranges[0][0].weight=-1;throws(()=>new S.Solver(c),/distribution/);
 });
 return entries;
};
