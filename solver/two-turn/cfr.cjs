'use strict';
const M=require('./model.cjs'),V=require('./verify.cjs');
const norm=xs=>{let total=0;for(const v of xs)total+=Math.max(0,v);return total?Float64Array.from(xs,v=>Math.max(0,v)/total):new Float64Array(xs.length).fill(1/xs.length);};
class CoupledCFR{
  constructor(game){this.game=game;this.iterations=0;this.nodes=game.nodes.map(ns=>ns.map(n=>({regret:new Float64Array(n.groups.length),average:new Float64Array(n.groups.length)})));}
  current(){return this.nodes.map(ns=>ns.map(n=>norm(n.regret)));}
  averaged(){return this.nodes.map(ns=>ns.map(n=>norm(n.average)));}
  iteration(){
    for(let p=0;p<2;p++){
      const policies=this.current(),{q}=M.values(this.game,policies,p);
      this.nodes[p].forEach((n,i)=>{let value=0;for(let a=0;a<q[i].length;a++)value+=q[i][a]*policies[p][i][a];for(let a=0;a<q[i].length;a++)n.regret[a]=Math.max(0,n.regret[a]+q[i][a]-value);});
    }
    this.iterations++;const ps=this.current();
    this.nodes.forEach((ns,p)=>ns.forEach((n,i)=>{
      const meta=this.game.nodes[p][i],reach=meta.turn===5?1:ps[p][meta.parent][meta.parentAction];
      for(let a=0;a<n.average.length;a++)n.average[a]+=this.iterations*reach*ps[p][i][a];
    }));
  }
  policy(){return M.lift(this.game,this.averaged());}
  run({iterations=Infinity,milliseconds=1000,tolerance=1e-6,checkEvery=25,stopAtTarget=true}={}){
    if(!(milliseconds>0)||!(iterations>=0)||!Number.isInteger(checkEvery)||checkEvery<1)throw new Error('Invalid solve budget');
    const start=performance.now(),first=this.iterations;let reason='iteration-budget',certificate;
    while(this.iterations-first<iterations){
      this.iteration();
      if(this.iterations%checkEvery===0){
        if(stopAtTarget){certificate=V.evaluate(this.game,this.averaged(),{tolerance});if(certificate.validated){reason='accuracy-target';break;}}
        if(performance.now()-start>=milliseconds){reason='time-budget';break;}
      }
    }
    const optimizationMs=performance.now()-start,vstart=performance.now();certificate=V.evaluate(this.game,this.averaged(),{tolerance});
    return {algorithm:'Coupled public-tree CFR+; linear realization-weighted averaging',iterations:this.iterations,optimizationMs,verificationMs:performance.now()-vstart,stopReason:reason,certificate,policies:this.policy(),stats:this.game.stats};
  }
}
module.exports={CoupledCFR};
