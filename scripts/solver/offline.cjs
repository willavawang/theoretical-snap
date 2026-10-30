#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{performance}=require('node:perf_hooks');
const {OfflineSolver}=require('../../solver/offline/engine.cjs'),C=require('../../solver/offline/checkpoint.cjs'),E=require('../../solver/offline/evaluate.cjs'),G=require('../../solver/offline/game-state.cjs'),D=require('../../solver/offline/decision.cjs');
function args(){const a=process.argv.slice(2),command=a[0]&&!a[0].startsWith('--')?a.shift():'train',o={command};while(a.length){const k=a.shift();if(!k.startsWith('--'))throw new Error('Unexpected argument '+k);o[k.slice(2)]=a.length&&!a[0].startsWith('--')?a.shift():true;}return o;}
function number(o,k,d){const x=o[k]===undefined?d:Number(o[k]);if(!Number.isFinite(x)||x<0)throw new Error('Invalid '+k);return x;}
function writeJSON(file,data){const temporary=file+'.partial';fs.writeFileSync(temporary,JSON.stringify(data,null,2)+'\n');fs.renameSync(temporary,file);}
function makeSpec(o){if(o.config)return JSON.parse(fs.readFileSync(o.config));const R=require('../../dist/solver/ranges.js');if(o.case==='public-final')return {model:R.publicFixture()};if(o.case==='hidden-final')return {model:R.hiddenFixture()};if(o.case==='two-turn')return {model:R.example('two-turn-check')};if(o.case==='six-turn-check')return {deckSelection:'fixed',decks:[[{cards:Array(12).fill(5)}],[{cards:Array(12).fill(5)}]]};if(o.case==='deck-check'){const list=[4,5,6].map(c=>({name:'twelve-'+c,cards:Array(12).fill(c)}));return {deckSelection:'equilibrium',decks:[list,list]};}return {deckSelection:o.fixed?'fixed':'equilibrium',decks:['all','all']};}
function deckSummary(s){return s.pools?s.deckPolicies().map((q,p)=>s.pools[p].map((d,i)=>({counts:d.counts,probability:q[i]})).sort((a,b)=>b.probability-a.probability).slice(0,12)):null;}
async function main(){
 const o=args(),out=path.resolve(o.out||'artifacts/offline/open-game');fs.mkdirSync(out,{recursive:true});
 if(o.command==='status'){console.log(fs.readFileSync(path.join(out,'status.json'),'utf8'));return;}
 if(o.command==='stop'){fs.writeFileSync(path.join(out,'STOP'),'Stop requested\n');console.log('Stop requested; the runner will checkpoint at its next batch boundary.');return;}
 if(o.background){const log=fs.openSync(path.join(out,'runner.log'),'a'),a=process.argv.slice(2).filter(x=>x!=='--background'),heap=Math.max(128,Math.floor(number(o,'memory-mib',2048)*.75)),child=spawn(process.execPath,['--expose-gc','--max-old-space-size='+heap,__filename,...a],{cwd:process.cwd(),detached:true,stdio:['ignore',log,log]});child.unref();fs.closeSync(log);writeJSON(path.join(out,'launch.json'),{pid:child.pid,host:os.hostname(),startedAt:new Date().toISOString(),out});console.log(JSON.stringify({background:true,pid:child.pid,out}));return;}
 if(!['train','resume','inspect'].includes(o.command))throw new Error('Use train, resume, inspect, status or stop');
 const lock=path.join(out,'runner.lock');let fd;try{fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,host:os.hostname(),startedAt:new Date().toISOString()}));fs.closeSync(fd);}catch(e){if(e.code==='EEXIST')throw new Error('A runner lock already exists in '+out+'. Use status/stop; recover a stale lock only after confirming its runner has exited.');throw e;}process.once('exit',()=>{try{fs.unlinkSync(lock);}catch{}});
 const stateCap=number(o,'max-states',2000000),checkpoint=path.resolve(typeof o.resume==='string'?o.resume:path.join(out,'checkpoint.bin')),spec=o.config?makeSpec(o):undefined;
 const s=o.command==='resume'||o.resume||o.command==='inspect'?C.load(checkpoint,{maxInfoStates:stateCap,...(spec?{spec}:{})}):new OfflineSolver(makeSpec(o),{seed:number(o,'seed',17),maxInfoStates:stateCap,terminalEnumeration:!o['pure-outcome']});
 const started=performance.now(),seconds=number(o,'seconds',300),iterationBudget=number(o,'iterations',1e12),memoryLimit=number(o,'memory-mib',2048)*1048576,target=number(o,'target',.01),checkpointEvery=number(o,'checkpoint-seconds',30)*1000,initialIterations=s.iterations;
 let stopRequested=false,lastCheckpoint=started,lastProgress=0,status='running',certificate={certified:false,validated:false};const trajectory=[];
 const metadata={startedAt:new Date().toISOString(),host:os.hostname(),cpu:os.cpus()[0].model,cpuCount:os.cpus().length,totalMemory:os.totalmem(),runtime:process.version,platform:process.platform,architecture:process.arch,buildHash:C.buildHash,modelFingerprint:s.fingerprint,gameFingerprint:G.gameFingerprint(s),spec:s.spec,resourceLimits:{seconds,memoryMiB:memoryLimit/1048576,maxInfoStates:stateCap},pid:process.pid};
 process.on('SIGINT',()=>{stopRequested=true;});process.on('SIGTERM',()=>{stopRequested=true;});try{fs.unlinkSync(path.join(out,'STOP'));}catch(e){if(e.code!=='ENOENT')throw e;}
 function record(){const memory=process.memoryUsage(),row={elapsedMs:performance.now()-started,...s.stats(),memory};trajectory.push(row);writeJSON(path.join(out,'status.json'),{status,metadata,latest:row,checkpoint,certificate});return row;}
 function save(){const begin=performance.now(),saved=C.save(s,checkpoint);writeJSON(path.join(out,'checkpoint.json'),{...saved,saveMs:performance.now()-begin});lastCheckpoint=performance.now();}
 if(o.command!=='inspect'){
  while(s.iterations-initialIterations<iterationBudget&&performance.now()-started<seconds*1000){
   s.run({iterations:100,maxMs:200,stopAtTarget:false});
   if(performance.now()-lastProgress>=5000){const row=record();console.log(JSON.stringify({type:'progress',elapsedSeconds:Math.round(row.elapsedMs/1000),iterations:s.iterations,states:s.nodes.size,rssMiB:Math.round(row.memory.rss/1048576)}));lastProgress=performance.now();}
   if(s.stopReason==='memory'){status='state-budget';break;}if(process.memoryUsage().rss>=memoryLimit){status='memory-budget';break;}
   if(stopRequested||fs.existsSync(path.join(out,'STOP'))){status='paused';break;}
   if(performance.now()-lastCheckpoint>=checkpointEvery){save();certificate=E.evaluateExact(s,{targetGap:target});if(certificate.validated){status='accuracy-target';break;}}
   await new Promise(resolve=>setImmediate(resolve));
  }
  if(status==='running')status=s.iterations-initialIterations>=iterationBudget?'iteration-budget':'time-budget';save();
 }
 certificate=E.evaluateExact(s,{targetGap:target});
 const profile=E.evaluateRollouts(s,{samples:number(o,'samples',2000),seed:1901});
 const replay=require('../../solver/offline/replay.cjs').sampleGame(s,{seed:701});writeJSON(path.join(out,'game-replay.json'),replay);
 const gameState=G.makeGameState(s,{seed:701}),state=G.toSolverState(s,gameState),action=s.actions(state,0).find(a=>a.spent===Math.min(1,state.turn))||s.actions(state,0)[0],placements=G.placementsForAction(gameState,0,action),decision=D.analyzeDecision(s,gameState,0,placements,{samples:number(o,'decision-samples',256),maxAttempts:number(o,'posterior-attempts',50000)});
 writeJSON(path.join(out,'decision-example.json'),{gameState,analysis:decision});
 if(global.gc)global.gc();const latest=record(),report={status,metadata,certificate,profile,latest,trajectory,currentExploratoryDeckMixtures:deckSummary(s),checkpoint:{path:checkpoint,bytes:fs.statSync(checkpoint).size},decisionExample:'decision-example.json',gameReplay:'game-replay.json',interpretation:certificate.validated?'Accuracy target met only for the explicitly certified game and scope.':'No full-game equilibrium certificate. Deck weights and action values are exploratory, not GTO recommendations.'};
 writeJSON(path.join(out,'report.json'),report);console.log('OFFLINE_REPORT_BEGIN');console.log(JSON.stringify(report));console.log('OFFLINE_REPORT_END');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
