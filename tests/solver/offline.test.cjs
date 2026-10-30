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
 const model=R.publicFixture(),a=new OfflineSolver({model},{seed:17,terminalEnumeration:false}),b=new S.Solver(model,{algorithm:'sampled',seed:17});a.run({iterations:5000});b.run({iterations:5000});const state=S.initialState(b.model,{players:b.model.ranges.map(r=>r[0])});for(let p=0;p<2;p++)assert.deepEqual(a.policy(state,p),b.policy(state,p));assert.equal(a.random.state,b.random.state);
});
test('Terminal enumeration approaches the independent +1/5 certificate',()=>{
 const s=new OfflineSolver({model:R.publicFixture()},{seed:71});s.run({iterations:100000});const d=E.evaluateExact(s,{targetGap:.03});assert.equal(d.certified,true);assert.ok(Math.abs(d.value-.2)<.015);assert.ok(d.nashGap<.03,d.nashGap);assert.equal(s.nodes.size,2);
});
test('A real six-turn twelve-card game meets exhaustive deviation bounds',()=>{
 const s=new OfflineSolver({deckSelection:'fixed',decks:[[{cards:Array(12).fill(5)}],[{cards:Array(12).fill(5)}]]},{seed:71});s.run({iterations:20000});const d=E.evaluateExact(s);assert.equal(d.validated,true,JSON.stringify(d));assert.ok(Math.abs(d.value)<.01);assert.ok(d.treeNodes>100);assert.equal(s.model.rules.turns,6);
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
