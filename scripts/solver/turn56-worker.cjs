#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),readline=require('node:readline'),M=require('../../solver/two-turn/model.cjs'),V=require('../../solver/two-turn/verify.cjs'),{CoupledCFR}=require('../../solver/two-turn/cfr.cjs');
if(process.argv.includes('--cases')){fs.writeFileSync(1,JSON.stringify(require('../../solver/two-turn/cases.cjs').fixtures()));process.exit(0);}
let current,encoded,solver;
function respond(req){
  const key=JSON.stringify([req.model,req.limits||{}]),reused=key===encoded;
  if(!reused){current=M.compile(req.model,req.limits);solver=new CoupledCFR(current);encoded=key;}
  if(req.op==='verify')return V.verify(current,req.policies,{tolerance:req.tolerance||1e-6,includeActions:!!req.includeActions});
  if(req.op==='compile')return {stats:current.stats,compileMs:current.compileMs};
  const start=performance.now(),result=solver.run({milliseconds:req.milliseconds||1000,iterations:req.iterations===undefined?Infinity:req.iterations,
    tolerance:req.tolerance||1e-6,stopAtTarget:req.stopAtTarget!==false});
  if(req.includePolicies===false)delete result.policies;
  const currentRssBytes=process.memoryUsage().rss,rawMaxRss=process.resourceUsage().maxRSS;
  // Older Darwin/libuv versions expose bytes; Linux exposes KiB. Include both
  // raw data and the selected unit so the measurement can be independently audited.
  const rawMaxRssUnit=process.platform==='darwin'&&rawMaxRss>currentRssBytes/2?'bytes':'KiB';
  return {...result,compileMs:reused?0:current.compileMs,reusedCompiledGame:reused,totalMs:performance.now()-start+(reused?0:current.compileMs),
    peakRssBytes:rawMaxRss*(rawMaxRssUnit==='bytes'?1:1024),currentRssBytes,rawMaxRss,rawMaxRssUnit,rssScope:'Worker lifetime high-water mark at report time; fresh worker per benchmark case'};
}
process.stdout.write(JSON.stringify({ready:true,node:process.version,platform:process.platform,architecture:process.arch})+'\n');
readline.createInterface({input:process.stdin}).on('line',line=>{try{process.stdout.write(JSON.stringify({ok:true,result:respond(JSON.parse(line))})+'\n');}catch(e){process.stdout.write(JSON.stringify({ok:false,error:e.message,status:e.status||'error'})+'\n');}});
