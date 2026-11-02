#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),M=require('../../solver/endgame/model.cjs'),V=require('../../solver/endgame/verify.cjs'),{FinalTurnCFR}=require('../../solver/endgame/cfr.cjs'),{fixtures}=require('../../solver/endgame/cases.cjs'),{query}=require('../../solver/endgame/query.cjs'),G=require('../../solver/offline/game-state.cjs'),{OfflineSolver}=require('../../solver/offline/engine.cjs');
const args=process.argv.slice(2),get=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];};
function python(request){
  const r=spawnSync(process.env.SNAP_PYTHON||'python3',[path.join(__dirname,'turn6_reference.py')],{input:JSON.stringify(request),encoding:'utf8',maxBuffer:64*1024*1024,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  if(r.status!==0)throw new Error(r.stderr||'Independent Python reference failed');return JSON.parse(r.stdout);
}
const name=get('case','public-rational'),fixture=fixtures().find(c=>c.name===name),file=get('model');
if(!file&&!fixture)throw new Error('Unknown case; use --model FILE for a declared conditional game');
const model=file?JSON.parse(fs.readFileSync(file)):fixture.model,game=M.compile(model),method=get('method','lp'),seconds=Number(get('seconds',10)),player=Number(get('player',0)),typeIndex=Number(get('type',0));
if(!['lp','cfr'].includes(method)||![0,1].includes(player)||!Number.isFinite(seconds)||seconds<=0)throw new Error('Invalid method/player/budget');
let solve;
if(method==='lp')solve=python({model,seconds});
else{solve=new FinalTurnCFR(game).run({milliseconds:seconds*1000});solve.independentCertificate=python({op:'verify',model,policies:solve.policies});}
const jsCertificate=V.verify(model,solve.policies),type=game.originalTypes[player][typeIndex];if(!type)throw new Error('Unknown private type index');
if(Math.abs(jsCertificate.nashGap-solve.certificate.nashGap)>1e-8||Math.abs(jsCertificate.value-solve.certificate.value)>1e-8)throw new Error('Independent verifier disagreement');
let gameState;
if(get('game-state'))gameState=JSON.parse(fs.readFileSync(get('game-state')));
else{
  const s=new OfflineSolver({model}),other=1-player;let world;
  if(s.model.cases)world=s.model.cases.find(c=>M.typeKey(c.players[player])===type.key);
  else{const players=[];players[player]=s.model.ranges[player].find(t=>M.typeKey(t)===type.key);players[other]=s.model.ranges[other][0];world={players};}
  gameState=G.makeGameState(s,{world,seed:701});
}
const action=type.actions.find(a=>a.lanes[2].join(',')==='6')||type.actions.find(a=>a.spent>0)||type.actions[0];
const placements=get('placements')?JSON.parse(fs.readFileSync(get('placements'))):G.placementsForAction(gameState,player,action);
const analysis=query(game,solve.policies,{player,typeKey:type.key,gameState,placements});
const result={schema:'snap-final-turn-solve-1',case:file||name,inputModel:model,gameState,analysis,solve:{...solve,policies:undefined,certificate:{...solve.certificate,rows:undefined}},compilerStats:game.stats,
  scope:'Standalone supplied-range final-turn solve. Sampled hidden truth is stored for replay and is not used to choose the strategy or compute action EVs.'};
const destination=get('out');if(destination){fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({out:path.resolve(destination),value:jsCertificate.value,gap:jsCertificate.nashGap,status:analysis.status}));}
else fs.writeFileSync(1,JSON.stringify(result,null,2)+'\n');
