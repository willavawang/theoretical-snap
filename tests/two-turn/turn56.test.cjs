'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const M=require('../../solver/two-turn/model.cjs'),V=require('../../solver/two-turn/verify.cjs'),{CoupledCFR}=require('../../solver/two-turn/cfr.cjs'),{fixtures}=require('../../solver/two-turn/cases.cjs'),
  {conditionalFinalTurn}=require('../../solver/two-turn/continuation.cjs'),{query}=require('../../solver/two-turn/query.cjs'),TV=require('../../solver/endgame/verify.cjs'),G=require('../../solver/offline/game-state.cjs'),{OfflineSolver}=require('../../solver/offline/engine.cjs');
const examples=fixtures(),input=name=>examples.find(c=>c.name===name).model,copy=x=>JSON.parse(JSON.stringify(x)),cache=new Map(),close=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
function reference(request){
  const key=JSON.stringify(request);if(cache.has(key))return cache.get(key);
  const r=spawnSync(process.env.SNAP_PYTHON||'python3',[path.resolve(__dirname,'../../scripts/solver/turn56_reference.py')],{input:key,encoding:'utf8',maxBuffer:128*1024*1024,
    env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout);cache.set(key,out);return out;
}
const lp=name=>reference({model:input(name),seconds:30,includeActions:true});
function agreement(a,b){for(const k of ['value','upper','lower','nashGap','maxConditionalGain','maxReachedContinuationGain'])close(a[k],b[k]);
  for(let p=0;p<2;p++)for(const row of a.rows[p]){const other=b.rows[p].find(t=>t.typeKey===row.typeKey);assert.ok(other);if(!row.actions||!other.actions)continue;
    const aa=Array.isArray(row.actions)?Object.fromEntries(row.actions.map(x=>[x.actionKey,x])):row.actions,bb=Array.isArray(other.actions)?Object.fromEntries(other.actions.map(x=>[x.actionKey,x])):other.actions;
    assert.deepEqual(Object.keys(aa).sort(),Object.keys(bb).sort());for(const k of Object.keys(aa)){close(aa[k].ev,bb[k].ev);close(aa[k].bestResponseEV,bb[k].bestResponseEV);}
  }
}
function state(game,ids=[0,0],seed=1){return G.makeGameState(new OfflineSolver({model:game.input}),{world:{players:ids.map((i,p)=>game.types[p][i])},seed});}
function firstPositive(game,policy,p,i){const row=policy[p].find(r=>r.infoKey===game.nodes[p][game.roots[p][i]].key);return game.nodes[p][game.roots[p][i]].actions.find(a=>row.probabilities[a.key]>1e-9);}
function commit(game,policy,g,ids){return G.commitTurn(g,ids.map((i,p)=>G.placementsForAction(g,p,firstPositive(game,policy,p,i))));}

test('Independent coupled LP solves all declared controls and agrees on every root action EV',()=>{
  for(const c of examples){const result=lp(c.name),g=M.compile(c.model),checked=V.verify(g,result.policies,{includeActions:true});assert.ok(result.certificate.validated,c.name);assert.ok(checked.validated,c.name);
    agreement(result.certificate,checked);if(c.knownValue!==undefined)close(result.certificate.value,c.knownValue);
  }
});

test('Full hand skips its draw after passing; playing opens a slot and draws without replacement',()=>{
  const g=M.compile(input('full-hand-skip')),t=g.types[0][0],root=g.nodes[0][g.roots[0][0]],pass=root.actions.findIndex(a=>a.spent===0),play=root.actions.findIndex(a=>a.spent===2);
  const skipped=g.transitions[0][0][pass];assert.equal(skipped.length,1);assert.equal(skipped[0].cost,0);assert.deepEqual(skipped[0].remaining,t.remaining);assert.equal(skipped[0].hand.reduce((a,b)=>a+b),7);
  const draws=g.transitions[0][0][play];assert.deepEqual(draws.map(d=>d.cost),[1,6]);close(draws[0].probability,.4);close(draws[1].probability,.6);
  for(const d of draws){assert.equal(d.hand.reduce((a,b)=>a+b),7);assert.equal(d.remaining.reduce((a,b)=>a+b),4);assert.equal(d.remaining[d.cost-1],t.remaining[d.cost-1]-1);}
});

test('Turn-five equal power retains different card compositions, hands and slot use',()=>{
  const g=M.compile(input('composition')),root=g.nodes[0][g.roots[0][0]],a=root.actions.findIndex(a=>a.lanes[1].join(',')==='4'&&a.spent===4),b=root.actions.findIndex(a=>a.lanes[1].join(',')==='2,2'&&a.spent===4);
  assert.ok(a>=0&&b>=0);assert.deepEqual(root.actions[a].power,root.actions[b].power);assert.notEqual(root.actions[a].key,root.actions[b].key);assert.notDeepEqual(root.actions[a].slots,root.actions[b].slots);
  const da=g.transitions[0][0][a].find(d=>d.cost===1),db=g.transitions[0][0][b].find(d=>d.cost===1);assert.notDeepEqual(da.hand,db.hand);assert.notDeepEqual(da.actions.map(a=>a.key),db.actions.map(a=>a.key));
  assert.ok(root.actions.some(a=>a.spent===0));assert.ok(root.actions.some(a=>a.spent===2));assert.ok(root.actions.every(a=>a.spent<=5&&!a.lanes.flat().includes(6)));
});

test('Private histories and correlated labels remain private, distinct information sets',()=>{
  const m=copy(input('correlated-labels')),g=M.compile(m);assert.equal(g.types[0].length,2);assert.deepEqual(g.types[0][0].hand,g.types[0][1].hand);assert.notEqual(g.types[0][0].key,g.types[0][1].key);
  assert.notEqual(g.nodes[0][g.roots[0][0]].key,g.nodes[0][g.roots[0][1]].key);assert.deepEqual(Array.from(g.conditional[0][0]),[1,0]);assert.deepEqual(Array.from(g.conditional[0][1]),[0,1]);
  const aliases=copy(input('asymmetric-draws'));aliases.ranges[0].push({...copy(aliases.ranges[0][0]),observations:'remembered different draw order'});const h=M.compile(aliases);assert.equal(h.types[0].length,3);
  for(const node of h.nodes[0])assert.ok(!node.key.includes('opponent-secret'));
});

test('CFR averages realization plans, preserving own reach at later information sets',()=>{
  const g=M.compile(input('asymmetric-draws')),c=new CoupledCFR(g),samples=[];for(let k=0;k<12;k++){c.iteration();samples.push(c.current());}
  const average=c.averaged(),total=78;
  for(let p=0;p<2;p++)for(const n of g.nodes[p])for(let a=0;a<n.groups.length;a++){
    const actual=n.turn===5?average[p][n.id][a]:average[p][n.parent][n.parentAction]*average[p][n.id][a];
    let expected=0;samples.forEach((ps,k)=>{const reach=n.turn===5?1:ps[p][n.parent][n.parentAction];expected+=(k+1)*reach*ps[p][n.id][a]/total;});close(actual,expected,1e-12);
  }
  const independent=reference({op:'verify',model:g.input,policies:c.policy()});agreement(V.evaluate(g,average),independent);
});

test('Both implementations check the actual averaged CFR policy on independent and correlated games',()=>{
  for(const name of ['asymmetric-draws','correlated-labels']){const g=M.compile(input(name)),c=new CoupledCFR(g),result=c.run({iterations:120,milliseconds:1e9,stopAtTarget:false});
    const independent=reference({op:'verify',model:g.input,policies:result.policies,includeActions:true});agreement(V.verify(g,result.policies,{includeActions:true}),independent);
  }
});

test('Best responses optimize the future turn rather than freezing the returned continuation',()=>{
  const g=M.compile(input('asymmetric-draws')),policies=g.nodes.map(ns=>ns.map(n=>new Float64Array(n.groups.length).fill(0)));
  g.nodes.forEach((ns,p)=>ns.forEach(n=>{const j=n.groups.findIndex(group=>group.some(a=>a.spent===0));policies[p][n.id][j]=1;}));
  const result=V.evaluate(g,policies,{includeActions:true}),row=result.rows[0][0],pass=g.nodes[0][g.roots[0][0]].actions.find(a=>a.spent===0),action=row.actions.find(a=>a.actionKey===pass.key);
  close(action.ev,0);close(action.bestResponseEV,1);close(result.nashGap,2);agreement(result,reference({op:'verify',model:g.input,policies:M.lift(g,policies),includeActions:true}));
});

test('Global error cannot conceal a large deviation for a rare root hand',()=>{
  const g=M.compile(input('rare-types')),ps=M.importPolicy(g,lp('rare-types').policies);
  for(const n of g.nodes[0])if(n.typeIndex===1){ps[0][n.id].fill(0);ps[0][n.id][n.groups.findIndex(group=>group.some(a=>a.spent===0))]=1;}
  const result=V.evaluate(g,ps);assert.ok(result.maxConditionalGain>.1);assert.ok(result.maxConditionalGain>result.nashGap*100);assert.equal(result.validated,false);
  agreement(result,reference({op:'verify',model:g.input,policies:M.lift(g,ps)}));
});

test('Continuation posteriors include turn-five strategy likelihood and retain all draw events',()=>{
  const g=M.compile(input('asymmetric-draws')),ps=M.importPolicy(g,lp('asymmetric-draws').policies),pass=g.rootUnion.map(xs=>xs.find(a=>a.spent===0).key);
  for(let p=0;p<2;p++)g.roots[p].forEach((id,i)=>{const n=g.nodes[p][id],k=n.actions.findIndex(a=>a.spent===0);ps[p][id].fill(0);ps[p][id][k]=p===0&&i===1?.1:1;if(p===0&&i===1)ps[p][id][k===0?1:0]=.9;});
  const result=conditionalFinalTurn(g,M.lift(g,ps),pass);assert.equal(result.status,'available');close(result.publicReachProbability,.775);
  const mass=result.model.ranges[0].reduce((v,t)=>v+t.weight,0),first=result.model.ranges[0].filter(t=>JSON.parse(t.observations)[0]===g.types[0][0].key).reduce((v,t)=>v+t.weight,0);close(first/mass,30/31);
  assert.ok(result.model.ranges[0].some(t=>JSON.parse(t.observations)[2]===1));assert.ok(result.model.ranges[0].some(t=>JSON.parse(t.observations)[2]===6));
  const impossible=[pass[0],g.rootUnion[1].find(a=>a.spent>0).key];assert.equal(conditionalFinalTurn(g,M.lift(g,ps),impossible).status,'unavailable');
});

test('Reached children of an exact coupled LP pass separate terminal-game checks',()=>{
  for(const name of ['asymmetric-draws','correlated-labels','full-hand-skip']){const g=M.compile(input(name)),r=lp(name);let checked=0;
    for(const branch of g.branches){const child=conditionalFinalTurn(g,r.policies,branch.keys);if(child.status!=='available')continue;assert.ok(TV.verify(child.model,child.policies).validated,name);checked++;}
    assert.ok(checked>0);
  }
});

test('Shared lane relabeling preserves policies, action values and best-response bounds',()=>{
  const m=copy(input('asymmetric-draws')),r=lp('asymmetric-draws'),perm=[2,0,1];m.board=m.board.map(side=>perm.map(l=>side[l]));
  const action=k=>Array.from({length:18},(_,j)=>k[3*Math.floor(j/3)+perm[j%3]]).join('');
  const policies=r.policies.map(side=>side.map(row=>{const parts=JSON.parse(row.infoKey);if(parts[1]===6){parts[3]=action(parts[3]);parts[4]=action(parts[4]);}
    return {...row,infoKey:JSON.stringify(parts),probabilities:Object.fromEntries(Object.entries(row.probabilities).map(([k,v])=>[action(k),v]))};}));
  const cert=V.verify(M.compile(m),policies);assert.ok(cert.validated);close(cert.value,r.certificate.value);
});

test('Game State Object queries preserve physical copies and do not use actual hidden opponent truth',()=>{
  const g=M.compile(input('full-hand-skip')),r=lp('full-hand-skip'),a=state(g,[0,0]),b=state(g,[0,1]),before=JSON.stringify(a),own=a.players[0].hand.filter(id=>G.costCards(a,0,[id])[0]===2),placements=[{cardId:own[2],lane:2}];
  const qa=query(g,r.policies,{gameState:a,placements}),qb=query(g,r.policies,{gameState:b,placements});close(qa.yourEV,qb.yourEV);close(qa.maximumEV,qb.maximumEV);
  assert.equal(qa.policyFingerprint,qb.policyFingerprint);assert.deepEqual(qa.submitted.placements,placements);assert.equal(JSON.stringify(a),before);
  const wrong=copy(a);wrong.rules.handLimit=6;assert.throws(()=>query(g,r.policies,{gameState:wrong,placements}),/different/);
});

test('A played Game State Object reaches turn six with validated local EVs',()=>{
  const g=M.compile(input('asymmetric-draws')),r=lp('asymmetric-draws'),next=commit(g,r.policies,state(g),[0,0]),before=JSON.stringify(next),result=query(g,r.policies,{gameState:next,placements:[]});
  assert.equal(next.turn,6);assert.equal(result.status,'conditional-validated');assert.ok(result.continuationCertificate.validated);assert.ok(Number.isFinite(result.yourEV));assert.equal(JSON.stringify(next),before);
  for(const a of result.actions){close(a.evLoss,result.maximumEV-a.ev);assert.ok(a.placements.every(p=>next.players[0].hand.includes(p.cardId)));}
});

test('Approximate whole-game validation does not silently validate inaccurate rare children',()=>{
  const g=M.compile(input('asymmetric-draws')),ps=M.importPolicy(g,lp('asymmetric-draws').policies),eps=1e-9;
  g.roots.forEach((ids,p)=>ids.forEach(id=>{ps[p][id]=Float64Array.from(ps[p][id],v=>(1-eps)*v+eps/ps[p][id].length);}));
  const policies=M.lift(g,ps),parent=V.evaluate(g,ps);assert.ok(parent.validated);
  const branch=g.branches.find(b=>{const child=conditionalFinalTurn(g,policies,b.keys);return child.status==='available'&&!TV.verify(child.model,child.policies).validated;});assert.ok(branch);
  const ids=branch.keys.map((key,p)=>g.types[p].findIndex((t,i)=>g.rootLookup[p][i].has(key))),root=state(g,ids),next=G.commitTurn(root,branch.keys.map((key,p)=>G.placementsForAction(root,p,g.rootUnion[p].find(a=>a.key===key))));
  const result=query(g,policies,{gameState:next,placements:[]});assert.equal(result.status,'provisional');assert.equal(result.continuationCertificate.validated,false);
});

test('Zero-reach opponent commitments never fall back to the stored hidden hand',()=>{
  const g=M.compile(input('asymmetric-draws')),r=lp('asymmetric-draws'),ps=M.importPolicy(g,r.policies);
  const other=g.rootUnion[1].find(a=>g.types[1].every((t,i)=>{const local=g.rootLookup[1][i].get(a.key);return local===undefined||ps[1][g.roots[1][i]][local]===0;}));assert.ok(other);
  const j=g.types[1].findIndex((t,i)=>g.rootLookup[1][i].has(other.key)),root=state(g,[0,j]),next=G.commitTurn(root,[G.placementsForAction(root,0,firstPositive(g,r.policies,0,0)),G.placementsForAction(root,1,other)]);
  assert.equal(query(g,r.policies,{gameState:next,placements:[]}).status,'unavailable');
});

test('Resource stops reject the complete request rather than solving a pruned game',()=>{
  assert.throws(()=>M.compile(input('full-hand-skip'),{maxBranches:1}),e=>e.status==='resource-limit');
  assert.throws(()=>M.compile(input('full-hand-skip'),{maxActionEntries:1}),e=>e.status==='resource-limit');
  const invalid=copy(input('asymmetric-draws'));invalid.board[0][2]=[3,6];assert.throws(()=>M.compile(invalid),/cannot be reached/);
});

test('Saved profiles preserve the model and policy identities and recheck their bounds',()=>{
  const P=require('../../solver/two-turn/profile.cjs'),g=M.compile(input('asymmetric-draws')),r=lp('asymmetric-draws'),saved=P.pack(g,r.policies),restored=P.restore(copy(saved));
  assert.equal(restored.game.fingerprint,g.fingerprint);assert.equal(P.fingerprint(restored.policies),saved.policyFingerprint);assert.ok(restored.certificate.validated);
  const wrongModel=copy(saved);wrongModel.inputModel.ranges[0][0].weight=4;assert.throws(()=>P.restore(wrongModel),/model fingerprint/);
  const wrongPolicy=copy(saved);wrongPolicy.policies[0][0].probabilities[Object.keys(wrongPolicy.policies[0][0].probabilities)[0]]+=.01;assert.throws(()=>P.restore(wrongPolicy),/policy fingerprint/);
  const bad=copy(saved);bad.certificate.validated=false;assert.ok(P.restore(bad).certificate.validated);
});

test('A fresh worker reports peak and current RSS in consistent byte units',()=>{
  const result=spawnSync(process.execPath,[path.resolve(__dirname,'../../scripts/solver/turn56-worker.cjs')],{input:JSON.stringify({model:input('forced-win'),milliseconds:1,includePolicies:false})+'\n',encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const row=JSON.parse(result.stdout.trim().split('\n')[1]);assert.ok(row.ok);const r=row.result;
  assert.ok(r.peakRssBytes>=r.currentRssBytes*.8);assert.ok(r.peakRssBytes<r.currentRssBytes*10);assert.ok(['bytes','KiB'].includes(r.rawMaxRssUnit));
});
