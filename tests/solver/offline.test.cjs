'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {OfflineSolver,S,catalog,allDecks,deal}=require('../../solver/offline/engine.cjs'),C=require('../../solver/offline/checkpoint.cjs'),E=require('../../solver/offline/evaluate.cjs'),G=require('../../solver/offline/game-state.cjs'),D=require('../../solver/offline/decision.cjs'),R=require('../../dist/solver/ranges.js');
test('Complete deck universe and lazy unordered deals preserve the numerical game',()=>{
 const decks=allDecks();assert.equal(decks.length,6188);assert.equal(new Set(decks.map(d=>d.counts.join(','))).size,6188);
 for(const d of decks)assert.equal(d.counts.reduce((a,b)=>a+b,0),12);
 const s=new OfflineSolver();assert.deepEqual(s.pools.map(p=>p.length),[6188,6188]);assert.equal(s.deckSelection,true);assert.equal(s.model.ranges[0].length,1);
 const rng=S.rng(81);for(let i=0;i<1000;i++){const d=decks[i*13%6188],p=deal(d,rng);assert.equal(p.hand.reduce((a,b)=>a+b),4);assert.equal(p.remaining.reduce((a,b)=>a+b),8);assert.ok(p.weight>0);assert.deepEqual(p.hand.map((n,c)=>n+p.remaining[c]),d.counts);}
});
test('Shared 400-action catalog matches the original enumerator without action pruning',()=>{
 assert.equal(catalog.length,400);const s=new OfflineSolver(),r=S.rng(31);for(let i=0;i<250;i++){const w=s.sampleWorld(),state=s.root(S.initialState(s.model,w));state.turn=1+Math.floor(r.next()*6);state.board.slots[0]=[0,1,2].map(()=>Math.floor(r.next()*5));assert.deepEqual(s.actions(state,0).map(a=>a.key),S.legalActions(state.players[0].hand,state.turn,state.board.slots[0]).map(a=>a.key));}
});
test('Compact histories preserve simultaneous privacy and remembered private draws',()=>{
 const s=new OfflineSolver({model:R.hiddenFixture()}),m=s.model,root=s.root(S.initialState(m,{players:m.ranges.map(p=>p[0])})),as=s.actions(root,0),a=s.transition(root,as[0]),b=s.transition(root,as.at(-1));
 assert.equal(s.node(a,1).key,s.node(b,1).key);const altered=s.root(S.initialState(m,{players:[m.ranges[0][1],m.ranges[1][0]]}));assert.equal(s.node(root,1).key,s.node(altered,1).key);
 const x={...root,private:[root.private[0]+'.1.2',root.private[1]]},y={...root,private:[root.private[0]+'.2.1',root.private[1]]};assert.notEqual(s.node(x,0).key,s.node(y,0).key);
});
test('Pure outcome mode reproduces original regret updates exactly',()=>{
 const model=R.publicFixture(),a=new OfflineSolver({model},{seed:17,terminalEnumeration:false,opponentExploration:0}),b=new S.Solver(model,{algorithm:'sampled',seed:17});a.run({iterations:5000});b.run({iterations:5000});const state=S.initialState(b.model,{players:b.model.ranges.map(r=>r[0])});for(let p=0;p<2;p++)assert.deepEqual(a.policy(state,p),b.policy(state,p));assert.equal(a.random.state,b.random.state);
});
test('Terminal enumeration approaches the independent +1/5 certificate',()=>{
 const s=new OfflineSolver({model:R.publicFixture()},{seed:71});s.run({iterations:100000});const d=E.evaluateExact(s,{targetGap:.03});assert.equal(d.certified,true);assert.ok(Math.abs(d.value-.2)<.015);assert.ok(d.nashGap<.03,d.nashGap);assert.equal(s.nodes.size,2);
});
test('A real six-turn twelve-card game meets exhaustive deviation bounds',()=>{
 for(const seed of [17,71]){const s=new OfflineSolver({deckSelection:'fixed',decks:[[{cards:Array(12).fill(5)}],[{cards:Array(12).fill(5)}]]},{seed});s.run({iterations:20000});const d=E.evaluateExact(s);assert.equal(d.validated,true,JSON.stringify({seed,...d}));assert.ok(Math.abs(d.value)<.01);assert.ok(d.treeNodes>100);assert.equal(s.model.rules.turns,6);}
});
test('Private deck selection is included in independent deviation checks',()=>{
 const ds=[5,6].map(c=>({cards:Array(12).fill(c)})),s=new OfflineSolver({deckSelection:'equilibrium',decks:[ds,ds]},{seed:19});s.run({iterations:20000});const d=E.evaluateExact(s,{targetGap:.04});assert.equal(d.certified,true);assert.deepEqual(d.checkedDecks,[2,2]);assert.ok(d.nashGap<.04,JSON.stringify(d));for(const p of s.deckPolicies())assert.ok(Math.abs(p.reduce((a,b)=>a+b)-1)<1e-10);
});
test('Binary checkpoints resume exactly, reject stale models and detect corruption',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'snap-offline-')),file=path.join(dir,'state.bin');try{const s=new OfflineSolver({model:R.hiddenFixture()},{seed:18});s.run({iterations:200});C.save(s,file);const t=C.load(file);s.run({iterations:200});t.run({iterations:200});assert.equal(s.random.state,t.random.state);assert.equal(s.nodes.size,t.nodes.size);for(const n of s.nodes.values()){const b=t.nodes.get(n.key);assert.deepEqual(n.regret,b.regret);assert.deepEqual(n.average,b.average);}assert.throws(()=>C.load(file,{spec:{model:R.publicFixture()}}),/do not match/);const b=fs.readFileSync(file);b[b.length-50]^=1;fs.writeFileSync(file,b);assert.throws(()=>C.load(file),/checksum/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Full state objects replay six turns and enforce conservation and hand limits',()=>{
 const s=new OfflineSolver({deckSelection:'fixed',decks:[[{cards:Array(12).fill(6)}],[{cards:Array(12).fill(6)}]]});let g=G.makeGameState(s,{seed:3});assert.equal(g.players[0].hand.length,4);for(let t=1;t<=6;t++){G.toSolverState(s,g);const plans=t===6?[0,1].map(p=>[{cardId:g.players[p].hand[0],lane:p}]):[[],[]];g=G.commitTurn(g,plans);if(t<6)assert.equal(g.players[0].hand.length,Math.min(4+t,7));}assert.equal(g.phase,'finished');assert.equal(g.outcome,0);G.toSolverState(s,g);assert.equal(g.history[3].draws[0],0);const b=JSON.parse(JSON.stringify(g));b.players[0].hand.push(b.players[0].hand[0]);assert.throws(()=>G.toSolverState(s,b),/conservation/);
});
test('Decision contract returns immutable EVs and alternative card IDs without peeking',()=>{
 const s=new OfflineSolver({model:R.hiddenFixture()},{seed:13});s.run({iterations:5000});const worlds=[{players:[s.model.ranges[0][0],s.model.ranges[1][0]]},{players:[s.model.ranges[0][0],s.model.ranges[1][1]]}],games=worlds.map(world=>G.makeGameState(s,{world,seed:51})),before=JSON.stringify(games[0]),state=G.toSolverState(s,games[0]),chosen=s.actions(state,0).find(a=>a.lanes[2].join(',')==='6'),placements=G.placementsForAction(games[0],0,chosen),reports=games.map(g=>D.analyzeDecision(s,g,0,placements,{samples:128,seed:7}));
 assert.equal(JSON.stringify(games[0]),before);assert.equal(reports[0].yourEV,reports[1].yourEV);assert.equal(reports[0].maximumEV,reports[1].maximumEV);assert.equal(reports[0].actions.length,40);assert.equal(reports[0].submitted.actionKey,chosen.key);assert.ok(reports[0].maximumEV>=reports[0].yourEV);assert.ok(Math.abs(reports[0].evLoss-(reports[0].maximumEV-reports[0].yourEV))<1e-12);for(const row of reports[0].actions){assert.equal(G.actionForPlacements(games[0],0,row.placements).key,row.actionKey);assert.equal(row.assessment,'provisional');}assert.equal('drawPile' in reports[0].view,false);assert.equal(reports[0].view.hand.length,4);
});

test('Saved state objects can be reanalyzed after changing the sampling implementation',()=>{
 const model=R.publicFixture(),a=new OfflineSolver({model},{opponentExploration:0}),b=new OfflineSolver({model},{opponentExploration:.6}),g=G.makeGameState(a);assert.notEqual(a.fingerprint,b.fingerprint);assert.equal(G.gameFingerprint(a),G.gameFingerprint(b));assert.doesNotThrow(()=>G.toSolverState(b,g));
});
test('Frozen policies export complete six-turn replay states and stable card placements',()=>{
 const s=new OfflineSolver({deckSelection:'equilibrium',decks:['all','all']}),replay=require('../../solver/offline/replay.cjs').sampleGame(s,{seed:81});assert.equal(replay.steps.length,6);assert.equal(replay.states.length,7);assert.equal(replay.states[6].phase,'finished');for(const g of replay.states)assert.doesNotThrow(()=>G.toSolverState(s,g));for(let t=0;t<6;t++)for(let p=0;p<2;p++)assert.doesNotThrow(()=>G.actionForPlacements(replay.states[t],p,replay.steps[t].plans[p]));
});
test('The learned deviation probe detects a known exploitable control and never claims an upper bound',()=>{
 const s=new OfflineSolver({model:R.publicFixture()}),d=require('../../solver/offline/deviations.cjs').probe(s,{seconds:60,iterations:5000,samples:3000,maxInfoStates:100});assert.equal(d.certifiedUpperBound,false);assert.ok(d.exploitabilityLowerBound95>0,JSON.stringify(d));const exact=E.evaluateExact(s);assert.ok(d.deviations[0].valueForPlayer0<=exact.upper+d.deviations[0].error);assert.ok(d.deviations[1].valueForPlayer0>=exact.lower-d.deviations[1].error);
});

test('Exact private-history codes retain every opening type and ordered draw history',()=>{
 const H=require('../../solver/offline/private-history.cjs'),roots=new Set();
 for(let rank=0;rank<H.ROOT_TYPES;rank++){
  const token=rank*H.DRAW_HISTORIES+17000,history=H.decode(token),root=history.split('.')[0],pair=root.split('/').map(xs=>xs.split(',').map(Number));
  assert.equal(pair[0].reduce((a,b)=>a+b),4);assert.equal(pair[1].reduce((a,b)=>a+b),8);assert.equal(H.encode(history),token);roots.add(root);
 }
 assert.equal(roots.size,162162);
 const histories=new Set();for(let code=0;code<H.DRAW_HISTORIES;code++){const token=(H.ROOT_TYPES-1)*H.DRAW_HISTORIES+code,history=H.decode(token);assert.equal(H.encode(history),token);assert.ok(history.split('.').length<=6);histories.add(history);assert.ok(token<4294967296);}
 assert.equal(histories.size,H.DRAW_HISTORIES);
 for(const history of ['0,0,0,0,0,4/0,0,0,0,0,8@past.1','00,0,0,0,0,4/0,0,0,0,0,8','0,0,0,0,0,4/0,0,0,0,0,8.1.2.3.4.5.6'])assert.equal(H.encode(history),history);
 assert.throws(()=>H.decode(H.ROOT_TYPES*H.DRAW_HISTORIES),/Invalid/);
});
test('Private-history packing changes storage without changing any learned update',()=>{
 const {trainingDigest}=require('../../solver/offline/profile.cjs'),a=new OfflineSolver({}, {seed:71,compactPrivateHistories:false}),b=new OfflineSolver({}, {seed:71});
 a.run({iterations:1000});b.run({iterations:1000});assert.equal(trainingDigest(a),trainingDigest(b));assert.equal(a.fingerprint,b.fingerprint);assert.ok(b.packedPrivateHistories>1000);assert.equal(a.packedPrivateHistories,0);
 for(let p=0;p<2;p++)assert.deepEqual(a.deckPolicies()[p],b.deckPolicies()[p]);
});
test('A known older checkpoint migrates without resetting training and still resumes exactly',()=>{
 const fixture=require('./fixtures/offline-v1-checkpoint.json'),zlib=require('node:zlib'),{trainingDigest}=require('../../solver/offline/profile.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'snap-migrate-')),file=path.join(dir,'old.bin'),next=path.join(dir,'new.bin');
 try{
  fs.writeFileSync(file,zlib.gunzipSync(Buffer.from(fixture.gzipBase64,'base64')));assert.throws(()=>C.load(file),/explicit migration/);
  const a=C.load(file,{migrateLegacy:true}),b=new OfflineSolver(a.spec,{seed:17});b.run({iterations:fixture.iterations});assert.equal(a.random.state,fixture.randomState);assert.equal(trainingDigest(a),trainingDigest(b));assert.ok(a.packedPrivateHistories>0);
  C.save(a,next);const c=C.load(next);a.run({iterations:1000});b.run({iterations:1000});c.run({iterations:1000});assert.equal(trainingDigest(a),trainingDigest(b));assert.equal(trainingDigest(a),trainingDigest(c));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('The game census agrees with independent early-turn action-tree enumeration',()=>{
 const {census}=require('../../solver/offline/census.cjs'),report=census(),counts=[0n,0n,0n];
 function walk(turn,slots,hand){if(turn>3)return;for(const a of S.legalActions([6,6,6,6,6,6],turn,slots)){const used=a.slots.reduce((a,b)=>a+b,0);if(used>hand)continue;counts[turn-1]++;walk(turn+1,slots.map((n,l)=>n+a.slots[l]),Math.min(7,hand-used+1));}}
 walk(1,[0,0,0],4);assert.deepEqual(counts.map(String),report.turns.slice(0,3).map(r=>r.ownCompletedHistories));assert.equal(report.turns[5].ownPublicPrefixes,'6192523');assert.equal(report.finalTurn.informationStatesLowerBound,'76694682211058');assert.equal(report.finalTurn.regretAndAverageFloat64BytesLowerBound,'2454229830753856');
});
test('Coverage distinguishes forced choices and untrained decisions without changing training',()=>{
 const {coverage,trainingDigest}=require('../../solver/offline/profile.cjs'),s=new OfflineSolver({deckSelection:'fixed',decks:[[{cards:Array(12).fill(6)}],[{cards:Array(12).fill(6)}]]}),before=trainingDigest(s),r=coverage(s,{samples:100});
 assert.equal(trainingDigest(s),before);assert.equal(s.nodes.size,0);assert.equal(r.turns[0].players[0].forced,100);assert.equal(r.turns[5].players[0].nontrivial,100);assert.equal(r.turns[5].players[0].nontrivialTrainedFraction,0);
 s.run({iterations:1000});const t=coverage(s,{samples:100});assert.equal(t.turns[5].players[0].nontrivialTrainedFraction,1);
});

test('Public rejection envelopes accelerate conditioning without changing the exact posterior',()=>{
 const model={turn:5,rules:{deckSize:null},ranges:[[{hand:[5,6],remaining:[1,6]}],[{hand:[5,6],remaining:[1,6]},{hand:[1,5],remaining:[2,6]}]]},s=new OfflineSolver({model}),g0=G.makeGameState(s,{world:{players:s.model.ranges.map(r=>r[0])},seed:17}),five=g0.players[1].hand.find(id=>g0.players[1].cards.find(c=>c.id===id).cost===5),g=G.commitTurn(g0,[[],[{cardId:five,lane:0}]]),envelope=D.rejectionEnvelope(s,g,0);
 assert.equal(envelope.bound,1/4);
 const classify=state=>state.private[1].split('.')[0]===S.signature(s.model.ranges[1][0]);
 const fast=D.posteriorSamples(s,g,0,{samples:5000,maxAttempts:50000,seed:41}),slow=D.posteriorSamples(s,g,0,{samples:5000,maxAttempts:50000,seed:41,rejectionEnvelope:false});
 for(const result of [fast,slow]){assert.equal(result.accepted,5000);const posterior=result.states.filter(classify).length/result.accepted;assert.ok(Math.abs(posterior-7/11)<.025,posterior);}
 assert.ok(fast.attempts<slow.attempts/3,JSON.stringify({fast:fast.attempts,slow:slow.attempts}));
 // A trained private type can put all mass on this action, exceeding 1/4.
 const state=s.root(S.initialState(s.model,{players:s.model.ranges.map(r=>r[0])})),n=s.node(state,1);n.average[n.actions.findIndex(a=>a.lanes[0].join(',')==='5')]=1;
 assert.equal(D.rejectionEnvelope(s,g,0).bound,1);
});

test('Submitted placements retain the exact dragged copy when identical-cost cards share an action',()=>{
 const s=new OfflineSolver({deckSelection:'fixed',decks:[[{cards:Array(12).fill(1)}],[{cards:Array(12).fill(1)}]]}),g=G.makeGameState(s,{seed:17}),placements=[{cardId:g.players[0].hand.at(-1),lane:1}],before=JSON.stringify(g),r=D.analyzeDecision(s,g,0,placements,{samples:32});
 assert.deepEqual(r.submitted.placements,placements);assert.notEqual(r.submitted.placements,placements);assert.equal(JSON.stringify(g),before);assert.equal(G.actionForPlacements(g,0,r.submitted.placements).key,r.submitted.actionKey);
});

test('Result policy identities distinguish independent runs and persist through checkpoint recovery',()=>{
 const P=require('../../solver/offline/policy-identity.cjs'),a=new OfflineSolver({model:R.publicFixture()}),b=new OfflineSolver({model:R.publicFixture()}),dir=fs.mkdtempSync(path.join(os.tmpdir(),'snap-policy-id-')),file=path.join(dir,'state.bin');
 try{assert.equal(a.fingerprint,b.fingerprint);assert.notEqual(P.fingerprint(a),P.fingerprint(b));a.run({iterations:10});const id=P.fingerprint(a);C.save(a,file);const c=C.load(file);assert.equal(P.fingerprint(c),id);c.run({iterations:1});assert.notEqual(P.fingerprint(c),id);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
