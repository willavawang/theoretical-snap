'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('./model.cjs'),F=require('./fixtures.cjs'),S=require('../../dist/solver/engine.js');
test('primary fixtures remain reachable declared numerical games; common own ranges and equal opponent power budgets',()=>{
 const cs=F.cases();assert.equal(cs.length,12);
 for(const c of cs){assert.equal(S.normalizeModel(c.numerical).turn,6);assert.deepEqual(c.models.D.ranges[0],c.models.C.ranges[0]);assert.deepEqual(c.models.D.ranges[0],c.models.U.ranges[0]);
  for(const t of c.models.D.ranges[1])assert.equal(Math.max(...t.actions.map(a=>F.vector(a).reduce((x,y)=>x+y,0))),6);
  assert.deepEqual(c.models.D,c.models.Q);
  for(const t of c.models.D.ranges[1])assert.ok(t.actions.some(a=>a.plays.length===0),'passing retained');
 }
});
test('coarse/free capabilities contain numerical choices; no opponent move frequencies prescribed',()=>{
 for(const c of F.cases()){
  const vectors=g=>new Set(g.ranges[1].flatMap(t=>t.actions.map(a=>F.vector(a).join(','))));
  const d=vectors(c.models.D),q=vectors(c.models.C),u=vectors(c.models.U);
  for(const v of d){assert.ok(q.has(v));assert.ok(u.has(v));}
  assert.ok(c.models.C.ranges[1].every(t=>t.actions.length>1));assert.equal(c.models.U.ranges[1].length,1);
  assert.ok(c.models.U.ranges[1][0].actions.every(a=>!('probability' in a)));
 }
 assert.equal(F.unrestricted([0,0,0])[0].actions.length,84);
});
test('one-card multi-lane effect changes contested lanes at matched maximum power',()=>{
 const cs=Object.fromEntries(F.controls().map(c=>[c.id,c.game])),focus=cs['focus-15'],doom=cs['doom-15'];
 const a=doom.ranges[0][0].actions.find(a=>JSON.stringify(F.vector(a))==='[2,4,0]');
 assert.ok(a);
 assert.equal(M.resolve(doom,a,doom.ranges[1][0].actions[1]).utility,1);
 const c=focus.ranges[0][0].actions.find(a=>JSON.stringify(F.vector(a))==='[0,0,6]');
 assert.equal(M.resolve(focus,c,focus.ranges[1][0].actions[1]).utility,1);
 assert.equal(M.resolve(doom,c,doom.ranges[1][0].actions[1]).utility,-1);
 assert.equal(focus.ranges[1][0].actions[1].sourcePlayedCards,1);
 assert.equal(doom.ranges[1][0].actions[1].sourcePlayedCards,1);
});
test('move precedes reveal and single-target destruction depends on revealed bodies and priority',()=>{
 const cs=Object.fromEntries(F.controls().map(c=>[c.id,c.game]));
 const m=cs['movement-available'],a=m.ranges[0][0].actions.find(a=>a.id==='add-two:0'),b=m.ranges[1][0].actions.find(a=>a.id==='move-to:1');
 assert.equal(M.resolve(m,a,b).utility,-1);
 for(const [id,expected] of [['destruction-absent',1],['destruction-after-us',-1],['destruction-before-us',1]]){
  const g=cs[id],one=g.ranges[0][0].actions[0],two=g.ranges[0][0].actions[1],enemy=g.ranges[1][0].actions[1];
  assert.equal(M.resolve(g,one,enemy).utility,expected);assert.equal(M.resolve(g,two,enemy).utility,1);
 }
});
test('equivalent effects ignore one-versus-three source labels and quotient pools equivalent types',()=>{
 const g=structuredClone(F.controls().find(c=>c.id==='doom-15').game),a=g.ranges[1][0].actions[1];
 const spawn={...a,id:'spawn',sourcePlayedCards:1},three={id:'three',sourcePlayedCards:3,plays:[0,1,2].map(lane=>({lane,power:5}))};
 g.ranges[1]=[{id:'one-label',weight:.4,actions:[spawn]},{id:'three-label',weight:.6,actions:[three]}];
 for(const own of g.ranges[0][0].actions)assert.deepEqual(M.resolve(g,own,spawn).board,M.resolve(g,own,three).board);
 const q=M.compile(g),raw=M.compile(g,{poolTypes:false});assert.equal(q.stats.strategyTypes[1],1);assert.equal(raw.stats.strategyTypes[1],2);
 assert.equal(q.stats.payoffCells,raw.stats.payoffCells);
});
test('bounded effects reject unsupported ambiguous target choice and illegal slots',()=>{
 const g=structuredClone(F.controls().find(c=>c.id==='destruction-after-us').game);
 g.board[0][0]=[10,11];
 assert.throws(()=>M.resolve(g,{plays:[]},g.ranges[1][0].actions[1]),/Multiple destruction targets/);
 g.board[0][0]=[1,1,1,1];
 assert.throws(()=>M.resolve(g,g.ranges[0][0].actions[0],{plays:[]}),/full/);
});
test('checker averages over hidden own range before selecting opponent best replies',()=>{
 const g={schema:'snap-capability-study-1',priority:0,board:[[[1],[1],[]],[[],[],[1]]],ranges:[
 [{id:'left',weight:1,actions:[{id:'a',plays:[{lane:0,power:3}]}]},{id:'middle',weight:1,actions:[{id:'b',plays:[{lane:1,power:3}]}]}],
 [{id:'unknown-own-hand',weight:1,actions:[{id:'l',plays:[{lane:0,power:4}]},{id:'m',plays:[{lane:1,power:4}]}]}]]};
 const p=[[{typeKey:'left',probabilities:{a:1}},{typeKey:'middle',probabilities:{b:1}}],[{typeKey:'unknown-own-hand',probabilities:{l:.5,m:.5}}]];
 const v=M.verify(g,p);assert.equal(v.rows[1][0].bestValue,.5);assert.equal(v.value,-.5);assert.equal(v.validated,true);
});
