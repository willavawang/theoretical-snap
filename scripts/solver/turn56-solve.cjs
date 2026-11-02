#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),M=require('../../solver/two-turn/model.cjs'),V=require('../../solver/two-turn/verify.cjs'),
  {CoupledCFR}=require('../../solver/two-turn/cfr.cjs'),{fixtures}=require('../../solver/two-turn/cases.cjs'),{query}=require('../../solver/two-turn/query.cjs'),P=require('../../solver/two-turn/profile.cjs'),G=require('../../solver/offline/game-state.cjs'),{OfflineSolver}=require('../../solver/offline/engine.cjs');
const args=process.argv.slice(2),get=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];};
function python(request){const r=spawnSync(process.env.SNAP_PYTHON||'python3',[path.join(__dirname,'turn56_reference.py')],{input:JSON.stringify(request),encoding:'utf8',maxBuffer:128*1024*1024,
  env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});if(r.status!==0)throw new Error(r.stderr||'Independent reference failed');return JSON.parse(r.stdout);}
try{
  const saved=get('profile')?JSON.parse(fs.readFileSync(get('profile'))):null,restored=saved?P.restore(saved):null;
  if(saved&&(get('model')||args.includes('--case')))throw new Error('A saved profile supplies its own model; omit --model and --case');
  const name=get('case','asymmetric-draws'),file=get('model'),fixture=fixtures().find(c=>c.name===name);
  if(!saved&&!file&&!fixture)throw new Error('Unknown case; use --model FILE for a custom conditional turn-five game');
  const input=saved?saved.inputModel:file?JSON.parse(fs.readFileSync(file)):fixture.model,game=restored?restored.game:M.compile(input),method=get('method','lp'),seconds=Number(get('seconds',10)),player=Number(get('player',0)),type=Number(get('type',0));
  if(!['lp','cfr'].includes(method)||![0,1].includes(player)||!Number.isFinite(seconds)||seconds<=0||!game.types[player][type])throw new Error('Invalid method, budget or private type');
  const solve=restored?{algorithm:'Restored coupled strategy profile; no new optimization',policies:restored.policies,certificate:restored.certificate}:method==='lp'?python({model:input,seconds}):new CoupledCFR(game).run({milliseconds:seconds*1000});
  const independent=method==='lp'&&!restored?solve.certificate:python({op:'verify',model:input,policies:solve.policies});
  const cert=V.verify(game,solve.policies);for(const key of ['value','upper','lower','nashGap','maxConditionalGain'])if(Math.abs(cert[key]-independent[key])>1e-8)throw new Error('Independent best-response disagreement');
  let gameState;
  if(get('game-state'))gameState=JSON.parse(fs.readFileSync(get('game-state')));
  else{
    const offline=new OfflineSolver({model:input});let players;
    if(game.independent){players=[];players[player]=game.types[player][type];players[1-player]=game.types[1-player][0];}
    else{const c=game.joint.find(c=>c.ids[player]===type);players=c.ids.map((i,p)=>game.types[p][i]);}
    gameState=G.makeGameState(offline,{world:{players},seed:711});
  }
  const placements=get('placements')?JSON.parse(fs.readFileSync(get('placements'))):[];
  const analysis=query(game,solve.policies,{gameState,player,placements});
  if(get('profile-out')){const file=get('profile-out');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(P.pack(game,solve.policies,{independentCertificate:{...independent,rows:undefined}}),null,2)+'\n');}
  const result={schema:'snap-coupled-solve-1',case:get('profile')||file||name,inputModel:input,gameState,analysis,profilePath:get('profile-out')||get('profile')||null,
    solve:{...solve,policies:undefined,certificate:{...solve.certificate,rows:undefined},independentCertificate:{...independent,rows:undefined}},compilerStats:game.stats,
    scope:'Coupled conditional turns-five/six solve. Actual hidden truth is stored for replay, not substituted for the public prior.'};
  const destination=get('out');if(destination){fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({out:path.resolve(destination),value:cert.value,gap:cert.nashGap,status:analysis.status}));}
  else fs.writeFileSync(1,JSON.stringify(result,null,2)+'\n');
}catch(e){fs.writeFileSync(2,JSON.stringify({status:e.status||'error',error:e.message})+'\n');process.exitCode=1;}
