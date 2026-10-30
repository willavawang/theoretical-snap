'use strict';
const fs=require('node:fs');
const p=JSON.parse(fs.readFileSync('configs/solver/research-run.json'));
const seconds=process.env.OFFLINE_SECONDS||p.seconds,run=process.env.OFFLINE_RESUME_RUN_ID||p.resumeRunId||'';
if(!/^\d+$/.test(String(seconds))||Number(seconds)>3600||Number(seconds)<1)throw new Error('Training seconds must be 1–3600');
if(run&&!/^\d+$/.test(String(run)))throw new Error('Invalid resume run ID');
console.log('seconds='+seconds);console.log('resume_run_id='+run);
