'use strict';
const {actionValues,lift}=require('./model.cjs');
const {verify}=require('./verify.cjs');
function normalize(xs){let n=0;for(const x of xs)n+=Math.max(0,x);return n?Float64Array.from(xs,x=>Math.max(0,x)/n):new Float64Array(xs.length).fill(1/xs.length);}
class FinalTurnCFR {
  constructor(game){this.game=game;this.iterations=0;this.nodes=game.classes.map(ts=>ts.map(t=>({regret:new Float64Array(t.ids.length),average:new Float64Array(t.ids.length)})));}
  current(){return this.nodes.map(ns=>ns.map(n=>normalize(n.regret)));}
  averaged(){return this.nodes.map(ns=>ns.map(n=>normalize(n.average)));}
  iteration(){
    for(let p=0;p<2;p++){
      const policies=this.current(),values=actionValues(this.game,policies,p);
      this.nodes[p].forEach((n,i)=>{
        const q=values[i],policy=policies[p][i];let mean=0;for(let a=0;a<q.length;a++)mean+=q[a]*policy[a];
        for(let a=0;a<q.length;a++)n.regret[a]=Math.max(0,n.regret[a]+q[a]-mean);
      });
    }
    this.iterations++;const current=this.current();
    this.nodes.forEach((ns,p)=>ns.forEach((n,i)=>{for(let a=0;a<n.average.length;a++)n.average[a]+=this.iterations*current[p][i][a];}));
  }
  policy(){return lift(this.game,this.averaged());}
  run({iterations=Infinity,milliseconds=1000,tolerance=1e-6,stopAtTarget=true}={}){
    const start=performance.now(),initial=this.iterations;let certificate,reason='iteration-budget';
    while(this.iterations-initial<iterations){
      this.iteration();
      if(this.iterations%100===0){
        if(stopAtTarget){certificate=verify(this.game.input,this.policy(),{tolerance});if(certificate.validated){reason='accuracy-target';break;}}
        if(performance.now()-start>=milliseconds){reason='time-budget';break;}
      }
    }
    const optimizationMs=performance.now()-start,policies=this.policy(),vstart=performance.now();
    certificate=verify(this.game.input,policies,{tolerance});
    return {algorithm:'Deterministic final-turn CFR+ with linear averaging',iterations:this.iterations,optimizationMs,verificationMs:performance.now()-vstart,stopReason:reason,policies,certificate,stats:this.game.stats};
  }
}
module.exports={FinalTurnCFR};
