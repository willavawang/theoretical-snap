'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),path=require('node:path');
const S=require('../../dist/solver/engine.js'),R=require('../../dist/solver/ranges.js'),M=require('../../solver/endgame/model.cjs'),V=require('../../solver/endgame/verify.cjs'),{FinalTurnCFR}=require('../../solver/endgame/cfr.cjs'),{fixtures}=require('../../solver/endgame/cases.cjs'),{audit}=require('../../solver/endgame/audit.cjs'),{query}=require('../../solver/endgame/query.cjs'),G=require('../../solver/offline/game-state.cjs'),{OfflineSolver}=require('../../solver/offline/engine.cjs');
const examples=fixtures(),model=name=>examples.find(c=>c.name===name).model,copy=x=>JSON.parse(JSON.stringify(x)),cache=new Map();
function reference(request){
  const k=JSON.stringify(request);if(cache.has(k))return cache.get(k);
  const result=spawnSync(process.env.SNAP_PYTHON||'python3',[path.resolve(__dirname,'../../scripts/solver/turn6_reference.py')],{input:JSON.stringify(request),encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  assert.equal(result.status,0,result.stderr);const out=JSON.parse(result.stdout);cache.set(k,out);return out;
}
const lp=name=>reference({model:model(name)});

test('Independent terminal action enumerator preserves all legal card compositions',()=>{
  const rng=S.rng(91);
  for(let k=0;k<150;k++){
    const hand=Array(6).fill(0);for(let j=0;j<1+Math.floor(rng.next()*7);j++)hand[Math.floor(rng.next()*6)]++;
    const occupied=[0,1,2].map(()=>Math.floor(rng.next()*5)),energy=1+Math.floor(rng.next()*6);
    assert.deepEqual(M.actions(hand,energy,occupied).map(a=>a.key).sort(),S.legalActions(hand,energy,occupied).map(a=>a.key).sort());
  }
  const all=M.actions([6,6,6,6,6,6],6,[0,0,0]);assert.equal(all.length,400);assert.equal(new Set(all.map(a=>a.power.join(','))).size,84);
});

test('Exact terminal quotient reduces all 792 hands to 103 strategy classes per player',()=>{
  const g=M.compile(model('all-seven-card-hands'));
  assert.deepEqual(g.stats.originalTypes,[792,792]);assert.deepEqual(g.stats.strategyClasses,[103,103]);assert.equal(g.stats.cellsBeforeOutcomeSharing,7056);assert.equal(g.stats.payoffCells,6724);
  assert.deepEqual(g.stats.originalActionEntries,[49836,49836]);assert.deepEqual(g.stats.classActionEntries,[3476,3476]);
});

test('LP control has independent rational best-response bounds at exactly +1/5',()=>{
  const r=lp('public-rational');assert.ok(r.certificate.validated);assert.ok(Math.abs(r.certificate.value-.2)<1e-12);
  const exact=reference({op:'rational',model:model('public-rational'),policies:r.policies});assert.equal(exact.upper,'1/5');assert.equal(exact.lower,'1/5');assert.equal(exact.exactEquilibrium,true);
  const js=V.verify(model('public-rational'),r.policies);assert.ok(js.validated);assert.ok(Math.abs(js.value-.2)<1e-12);
});

test('Hidden-hand equilibrium is +1/2 while averaging revealed-hand games incorrectly gives +1',()=>{
  const input=model('hidden-trap'),r=lp('hidden-trap');assert.ok(r.certificate.validated);assert.ok(Math.abs(r.certificate.value-.5)<1e-12);
  let clairvoyant=0;for(const t of input.ranges[1]){const m=copy(input);m.ranges[1]=[t];clairvoyant+=reference({model:m}).certificate.value/2;}
  assert.ok(Math.abs(clairvoyant-1)<1e-12);
  assert.equal(reference({op:'rational',model:input,policies:r.policies}).nashGap,'0');
});

test('Correlated private labels cannot be dropped merely because hand and deck match',()=>{
  const input=model('correlated-signal'),g=M.compile(input),r=lp('correlated-signal');assert.deepEqual(g.stats.strategyClasses,[2,2]);assert.ok(Math.abs(r.certificate.value-1)<1e-12);
  const erased=copy(input);erased.cases.forEach(c=>delete c.players[0].observations);
  const bad=reference({model:erased});assert.ok(Math.abs(bad.certificate.value-.5)<1e-12);
  assert.equal(reference({op:'rational',model:input,policies:r.policies}).upper,'1');
});

test('Independent payoff-equivalent private types can be pooled and the policy lifted',()=>{
  const original=lp('hidden-two-types'),aliases=lp('independent-aliases'),g=M.compile(model('independent-aliases'));
  assert.deepEqual(g.stats.originalTypes,[6,6]);assert.deepEqual(g.stats.strategyClasses,[2,2]);assert.equal(g.fingerprint,M.compile(model('hidden-two-types')).fingerprint);
  assert.ok(Math.abs(original.certificate.value-aliases.certificate.value)<1e-12);assert.ok(V.verify(g.input,aliases.policies).validated);
  const raw=reference({model:model('independent-aliases'),reduce:false,poolTypes:false});assert.ok(raw.certificate.validated);assert.ok(Math.abs(raw.certificate.value-aliases.certificate.value)<1e-12);
});

test('Every shared lane permutation preserves values, policies and the canonical conditional key',()=>{
  const input=model('public-rational'),r=lp('public-rational'),key=M.compile(input).fingerprint;
  for(const perm of M.permutations){
    const m=copy(input);m.board=m.board.map(p=>perm.map(l=>p[l]));
    const policies=r.policies.map(side=>side.map(t=>({typeKey:t.typeKey,probabilities:Object.fromEntries(Object.entries(t.probabilities).map(([k,v])=>{
      const out=Array(18);for(let c=0;c<6;c++)for(let l=0;l<3;l++)out[3*c+l]=k[3*c+perm[l]];return [out.join(''),v];
    }))})));
    assert.equal(M.compile(m).fingerprint,key);assert.ok(V.verify(m,policies).validated);
  }
});

test('With conditional beliefs fixed, equal power differences and occupancy share terminal payoffs',()=>{
  const first={turn:6,board:[[[1],[2],[3]],[[1],[2],[3]]],ranges:[0,1].map(()=>[{hand:[1,1,2,3,4,6],remaining:[1,5,6]}])},second=copy(first);second.board=[[[2],[3],[4]],[[2],[3],[4]]];
  const a=M.compile(first),b=M.compile(second);assert.equal(a.fingerprint,b.fingerprint);assert.deepEqual(a.payoffs,b.payoffs);
});

test('Board-specific identical payoff rows can collapse a forced-outcome game without deleting moves',()=>{
  const g=M.compile(model('already-won'));assert.equal(g.stats.payoffCells,1);assert.deepEqual(g.stats.classActionEntries,[1,1]);assert.equal(g.originalTypes[0][0].actions.length,40);assert.ok(g.stats.originalActionEntries[1]>100);
});

test('Python and JavaScript agree on every original action EV against the same fixed policy',()=>{
  const input=model('hidden-two-types'),policies=lp('hidden-two-types').policies,js=V.verify(input,policies,{includeActions:true}),py=reference({op:'verify',model:input,policies,includeActions:true});
  for(let p=0;p<2;p++)for(const row of js.rows[p]){
    const other=py.rows[p].find(t=>t.typeKey===row.typeKey);
    for(const a of row.actions)assert.ok(Math.abs(a.ev-other.actions[a.actionKey].ev)<1e-12);
  }
});

test('A small global Nash gap cannot hide a large supported private-type error',()=>{
  const input=model('rare-types'),base=lp('rare-types'),policies=copy(base.policies),rows=V.verify(input,policies,{includeActions:true}).rows[0],rare=rows.find(t=>t.weight<.001),worst=rare.actions.slice().sort((a,b)=>a.ev-b.ev)[0];
  policies[0].find(t=>t.typeKey===rare.typeKey).probabilities={[worst.actionKey]:1};
  const v=V.verify(input,policies,{tolerance:.001});assert.ok(v.nashGap<.001);assert.ok(v.maxConditionalGain>.1);assert.equal(v.validated,false);
});

test('Reduced deterministic CFR returns averaged policies checked by both independent evaluators',()=>{
  const input=model('public-rational'),s=new FinalTurnCFR(M.compile(input)),r=s.run({iterations:10000,milliseconds:10000,tolerance:.002});
  assert.ok(r.certificate.validated);assert.ok(Math.abs(r.certificate.value-.2)<.002);
  const independent=reference({op:'verify',model:input,policies:r.policies,tolerance:.002});assert.ok(independent.validated);assert.ok(Math.abs(independent.nashGap-r.certificate.nashGap)<1e-12);
});

test('Passing can have zero loss despite a componentwise stronger legal terminal move',()=>{
  const input=model('already-won'),g=M.compile(input),policies=M.lift(g,g.classes.map(ts=>ts.map(t=>new Float64Array(t.ids.length).fill(1/t.ids.length))));
  policies[0][0].probabilities={['0'.repeat(18)]:1};
  const v=V.verify(input,policies,{includeActions:true});assert.ok(v.validated);assert.ok(Math.abs(v.value-1)<1e-12);assert.equal(v.rows[0][0].actions.find(a=>a.actionKey==='0'.repeat(18)).evLoss,0);
});

test('The separate one-point/two-point sequential control has exact value zero without randomized openings',()=>{
  const r=reference({op:'control'});assert.equal(r.rootValue,0);assert.equal(r.balancedPolicyUpper,0);assert.equal(r.balancedPolicyLower,0);assert.equal(r.openingDistributionRequired,false);assert.equal(r.suffixGames,16);
});

test('The audit finds real draw-history aliases and distinguishes same-board posteriors',()=>{
  const r=audit();assert.equal(r.enumeratedFamily.privateHistories,8910);assert.equal(r.enumeratedFamily.currentHandRemainingClasses,126);
  assert.deepEqual(r.enumeratedFamily.exampleAliasedHistories[0].hand,r.enumeratedFamily.exampleAliasedHistories[1].hand);assert.notEqual(r.enumeratedFamily.exampleAliasedHistories[0].observations,r.enumeratedFamily.exampleAliasedHistories[1].observations);
  assert.ok(r.sameBoardDifferentHistory.terminalHandPosteriorTotalVariation>.06);assert.equal(r.combinatorialAllDeckPassFamily.privateHistories,6858432);
});

test('Earlier equal-power card compositions preserve different resources and are not terminal-merged',()=>{
  const input={turn:4,board:[[[1],[2],[3]],[[1],[2],[3]]],ranges:[0,1].map(()=>[{hand:[2,2,4,6],remaining:[1,3,4,5,6]}])},m=S.normalizeModel(input),state=S.initialState(m,{players:m.ranges.map(r=>r[0])}),as=S.legalActions(state.players[0].hand,4,state.board.slots[0]),four=as.find(a=>a.lanes[0].join(',')==='4'&&a.spent===4),twos=as.find(a=>a.lanes[0].join(',')==='2,2'&&a.spent===4),pass=S.legalActions(state.players[1].hand,4,state.board.slots[1])[0];
  const a=S.apply(S.apply(state,four,m),pass,m),b=S.apply(S.apply(state,twos,m),pass,m);assert.deepEqual(a.board.power,b.board.power);assert.notDeepEqual(a.board.slots,b.board.slots);assert.notDeepEqual(a.players[0].hand,b.players[0].hand);assert.throws(()=>M.compile(input),/final turn/);
});

test('Game State queries preserve dragged physical copies, leave facts unchanged and do not peek',()=>{
  const input=model('hidden-trap'),s=new OfflineSolver({model:input}),g=M.compile(input),policies=lp('hidden-trap').policies,own=s.model.ranges[0][0],games=s.model.ranges[1].map(opponent=>G.makeGameState(s,{world:{players:[own,opponent]},seed:7})),plans=games.map(state=>[{cardId:state.players[0].hand.find(id=>state.players[0].cards.find(c=>c.id===id).cost===6),lane:0}]);
  const before=games.map(JSON.stringify),results=games.map((state,i)=>query(g,policies,{player:0,typeKey:g.originalTypes[0][0].key,gameState:state,placements:plans[i]}));
  assert.deepEqual(games.map(JSON.stringify),before);assert.equal(results[0].yourEV,results[1].yourEV);assert.deepEqual(results[0].submitted.placements,plans[0]);assert.equal(results[0].status,'conditional-validated');
  const duplicate=copy(input);duplicate.ranges[0]=[{hand:[1,1,1,1],remaining:[1,2,3]}];const ds=new OfflineSolver({model:duplicate}),dg=G.makeGameState(ds,{seed:12}),cg=M.compile(duplicate),lpResult=reference({model:duplicate}),placement=[{cardId:dg.players[0].hand.at(-1),lane:1}],r=query(cg,lpResult.policies,{player:0,typeKey:cg.originalTypes[0][0].key,gameState:dg,placements:placement});assert.deepEqual(r.submitted.placements,placement);
});

test('Impossible full-game terminal snapshots are rejected rather than benchmarked as valid positions',()=>{
  const m=copy(model('public-rational'));m.board[0][0].push(6);m.ranges[0][0].remaining.pop();assert.throws(()=>M.compile(m),/cannot be reached/);
  const bad=copy(model('public-rational'));bad.ranges[0][0].hand.push(7);assert.throws(()=>M.compile(bad),/Costs/);
});
