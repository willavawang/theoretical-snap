'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const S=require('../../dist/solver/engine.js'),R=require('../../dist/solver/ranges.js');
const output=path.resolve(__dirname,'../../benchmarks');fs.mkdirSync(output,{recursive:true});
const target=.01,budgetMs=Number(process.env.SNAP_BENCH_MS||1500),repeats=Number(process.env.SNAP_BENCH_REPEATS||3);
function run(name,repeat){
 if(global.gc)global.gc();
 const coldStart=performance.now(),model=R.example(name),rangeMs=performance.now()-coldStart;
 const options={seed:17+repeat,maxInfoStates:25000,maxMatrixCells:2000000,maxTreeNodes:50000};
 const before=process.memoryUsage(),solver=new S.Solver(model,options);
 const stats=solver.run({iterations:10000,maxMs:budgetMs,targetGap:target});
 const query=model.ranges[0][0],analysis=solver.analyze(query,{targetGap:target,samplesPerAction:128});
 const coldTotalMs=performance.now()-coldStart;
 if(global.gc)global.gc();const after=process.memoryUsage();
 const checkpointStart=performance.now(),serialized=JSON.stringify(solver.snapshot()),checkpointMs=performance.now()-checkpointStart;
 const compressionStart=performance.now(),compressed=zlib.gzipSync(serialized),compressionMs=performance.now()-compressionStart;
 const warmStart=performance.now(),restored=new S.Solver(model,options).restore(JSON.parse(serialized));
 const warmAnalysis=restored.analyze(query,{targetGap:target,samplesPerAction:128}),warmTotalMs=performance.now()-warmStart;
 if(Math.abs(warmAnalysis.strategyEV-analysis.strategyEV)>1e-10)throw new Error('Warm checkpoint changed the measured action evaluation.');
 return {name,repeat,rangeMs,coldTotalMs,warmTotalMs,checkpointMs,compressionMs,checkpointBytes:Buffer.byteLength(serialized),gzipBytes:compressed.length,heapDeltaBytes:after.heapUsed-before.heapUsed,arrayBufferDeltaBytes:after.arrayBuffers-before.arrayBuffers,rssBytes:after.rss,rootTypes:model.ranges.map(r=>r.length),stats,queryActions:analysis.actions.length,analysisMs:analysis.analysisMs,converged:analysis.strategyValidated,timeToAccuracyMs:analysis.strategyValidated?coldTotalMs:null,topActions:analysis.actions.slice().sort((a,b)=>b.frequency-a.frequency).slice(0,3).map(a=>({turn:S.label(a.action),frequency:a.frequency,ev:a.ev,loss:a.evLoss,grade:a.grade}))};
}
const metadata={generatedAt:new Date().toISOString(),engineVersion:S.VERSION,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../../dist/solver/engine.js'))).digest('hex'),runtime:process.version,platform:process.platform,architecture:process.arch,cpu:os.cpus()[0]?.model,cpuCount:os.cpus().length,totalMemoryBytes:os.totalmem(),targetNashGap:target,targetMaxConditionalGain:target,budgetMs,repeats,measurement:'Node process on the executing machine. NOT Safari, phone, browser Worker or WebAssembly measurements.',beliefs:'Three equally weighted private deck presets. Midgame examples use explicitly uniform historical legal-play likelihoods, not equilibrium-history posteriors.'};
const results=[];for(const name of ['public-final','hidden-final','two-turn-check','turn-6','turn-5','turn-3','turn-1'])for(let repeat=0;repeat<repeats;repeat++){const r=run(name,repeat);results.push(r);console.log(JSON.stringify({case:name,repeat,coldMs:Math.round(r.coldTotalMs),warmMs:Math.round(r.warmTotalMs),states:r.stats.informationStates,algorithm:r.stats.algorithm,gap:r.stats.diagnostics.nashGap,conditionalGain:r.stats.diagnostics.maxConditionalGain,converged:r.converged,stop:r.stats.stopReason}));}
const median=xs=>{const s=xs.slice().sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
const summary=[...new Set(results.map(r=>r.name))].map(name=>{const rs=results.filter(r=>r.name===name);return {name,convergedRuns:rs.filter(r=>r.converged).length,runs:rs.length,medianColdMs:median(rs.map(r=>r.coldTotalMs)),medianWarmMs:median(rs.map(r=>r.warmTotalMs)),medianGzipBytes:median(rs.map(r=>r.gzipBytes)),medianStates:median(rs.map(r=>r.stats.informationStates)),medianHeapMiB:median(rs.map(r=>(r.heapDeltaBytes+r.arrayBufferDeltaBytes)/1048576)),algorithm:rs[0].stats.algorithm,maxMeasuredGap:rs.every(r=>r.stats.diagnostics.certified)?Math.max(...rs.map(r=>r.stats.diagnostics.nashGap)):null,maxConditionalGain:rs.every(r=>r.stats.diagnostics.certified)?Math.max(...rs.map(r=>r.stats.diagnostics.maxConditionalGain)):null};});
const report={metadata,summary,results};
fs.writeFileSync(path.join(output,'solver-results.json'),JSON.stringify(report,null,2)+'\n');
const lines=['# Playing solver — benchmark results','',metadata.measurement,'',metadata.beliefs,'','Target: Nash gap and maximum conditional root-type improvement at most '+target+'. A missing certificate is not a solved position.','', '| Position | Algorithm | Runs meeting target | Cold median | Warm median | Gzip checkpoint | States |', '|---|---|---:|---:|---:|---:|---:|',...summary.map(r=>'| '+[r.name,r.algorithm,r.convergedRuns+'/'+r.runs,r.medianColdMs.toFixed(1)+' ms',r.medianWarmMs.toFixed(1)+' ms',(r.medianGzipBytes/1024).toFixed(1)+' KiB',r.medianStates].join(' | ')+' |'),'','Cold time includes range construction, initialization, training and action EV evaluation. Warm time includes JSON parsing, solver reconstruction and the same EV evaluation; it resumes the IDENTICAL public position, rules and belief model. It is not a timing for a new position.','', 'For sampled games, these are bounded computation times, not measured times to equilibrium. Numeric table bytes omit JavaScript object/key overhead; retained heap and array-buffer deltas are approximate Node measurements. Checkpoints retain regrets and average strategies, with shared action metadata.','', 'Device-specific engineering decisions require running the same harness on target browsers. Full-game and rare-history certification remain separate from terminal-game certification.'];
fs.writeFileSync(path.join(output,'solver-results.md'),lines.join('\n')+'\n');
console.log('BENCHMARK_JSON_BEGIN');console.log(JSON.stringify(report));console.log('BENCHMARK_JSON_END');
