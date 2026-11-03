'use strict';
const fs=require('node:fs'),readline=require('node:readline'),M=require('./model.cjs'),F=require('./fixtures.cjs');
if(process.argv.includes('--fixtures')){fs.writeFileSync(1,JSON.stringify({cases:F.cases(),controls:F.controls()}));process.exit(0);}
process.stdout.write(JSON.stringify({ready:true,node:process.version,platform:process.platform})+'\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
 try{const r=JSON.parse(line);const answer=r.op==='compile'?M.compile(r.game,r.options):M.verify(r.game,r.policies,{includeActions:r.includeActions!==false});
 if(r.op==='compile'){answer.original=undefined;answer.assignments=undefined;answer.union=undefined;answer.payoff=undefined;answer.input=undefined;answer.types=undefined;}
 process.stdout.write(JSON.stringify({ok:true,result:answer,rssBytes:process.memoryUsage().rss,peakRssBytes:process.resourceUsage().maxRSS*1024})+'\n');
 }catch(e){process.stdout.write(JSON.stringify({ok:false,error:e.message})+'\n');}
});
