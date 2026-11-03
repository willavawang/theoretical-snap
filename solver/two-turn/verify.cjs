'use strict';
const M=require('./model.cjs');
function evaluate(game,policies,{tolerance=1e-6,includeActions=false}={}){
  const ds=[0,1].map(p=>M.values(game,policies,p)),rows=[[],[]],best=[0,0],profile=[0,0];let maxConditionalGain=0,maxReachedContinuationGain=0;
  for(let p=0;p<2;p++){
    game.types[p].forEach((t,i)=>{
      const id=game.roots[p][i],q=ds[p].q[id],br=ds[p].rootBR[i],policy=policies[p][id];let value=0;
      for(let a=0;a<q.length;a++)value+=q[a]*policy[a];
      const maximumEV=Math.max(...q),bestValue=Math.max(...br),gain=Math.max(0,bestValue-value);profile[p]+=t.weight*value;best[p]+=t.weight*bestValue;maxConditionalGain=Math.max(maxConditionalGain,gain);
      rows[p].push({typeKey:t.key,weight:t.weight,value,maximumEV,bestValue,gain,...(includeActions?{actions:game.nodes[p][id].actions.map((a,j)=>({actionKey:a.key,lanes:a.lanes,ev:q[j],bestResponseEV:br[j],frequency:policy[j],evLoss:Math.max(0,maximumEV-q[j])}))}:{})});
    });
    for(const n of game.nodes[p])if(n.turn===6&&policies[p][n.parent][n.parentAction]>1e-12&&ds[p].reach[n.id]>1e-12){
      const q=ds[p].q[n.id],mean=q.reduce((v,x,j)=>v+x*policies[p][n.id][j],0);maxReachedContinuationGain=Math.max(maxReachedContinuationGain,(Math.max(...q)-mean)/ds[p].reach[n.id]);
    }
  }
  if(Math.abs(profile[0]+profile[1])>1e-8)throw new Error('Zero-sum profile mismatch');
  const upper=best[0],lower=-best[1],gap=Math.max(0,upper-lower);
  return {value:profile[0],upper,lower,nashGap:gap,exploitability:gap/2,maxConditionalGain,maxReachedContinuationGain,
    validated:gap<=tolerance&&maxConditionalGain<=tolerance,tolerance,rows,
    method:'Exhaustive information-constrained two-turn best responses; independent Python sequence-form check required separately',scope:game.scope};
}
function verify(game,supplied,options){return evaluate(game,M.importPolicy(game,supplied),options);}
module.exports={evaluate,verify};
