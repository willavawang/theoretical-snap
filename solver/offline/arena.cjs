'use strict';
const META=65536,PARAM=1048576;
// Compact persistent numeric storage; temporary views supply the engine API.
class NodeArena{
 constructor(owner){this.owner=owner;this.index=new Map();this.blocks=[];this.parameters=[];this.count=0;this.cursor=0;}
 get size(){return this.count;}
 has(k){return this.index.has(k);}
 view(i){const b=this.blocks[Math.floor(i/META)],j=i%META,key=b.key[j],setID=b.set[j],set=this.owner.actionSets[setID],offset=b.offset[j],data=this.parameters[Math.floor(offset/PARAM)],p=offset%PARAM,n=set.actions.length;return {key,player:key%2,actionSetID:setID,actions:set.actions,regret:data.subarray(p,p+n),average:data.subarray(p+n,p+2*n),get updates(){return b.updates[j];},set updates(v){b.updates[j]=v;}};}
 get(k){const i=this.index.get(k);return i===undefined?undefined:this.view(i);}
 set(k,n){let i=this.index.get(k);if(i===undefined){i=this.count++;this.index.set(k,i);if(i%META===0)this.blocks.push({key:new Float64Array(META),set:new Uint32Array(META),offset:new Uint32Array(META),updates:new Uint32Array(META)});const size=n.actions.length*2;if(this.cursor%PARAM+size>PARAM)this.cursor=Math.ceil(this.cursor/PARAM)*PARAM;if(this.cursor>=4294967296)throw new Error('Numeric arena exceeds format limit');const block=Math.floor(this.cursor/PARAM);if(!this.parameters[block])this.parameters[block]=new Float64Array(PARAM);const b=this.blocks[Math.floor(i/META)],j=i%META;b.key[j]=k;b.set[j]=n.actionSetID;b.offset[j]=this.cursor;this.cursor+=size;}const t=this.view(i);t.regret.set(n.regret);t.average.set(n.average);t.updates=n.updates;return this;}
 *values(){for(let i=0;i<this.count;i++)yield this.view(i);}
 *keys(){yield* this.index.keys();}
 *[Symbol.iterator](){for(const n of this.values())yield [n.key,n];}
 allocatedBytes(){return this.blocks.length*META*20+this.parameters.length*PARAM*8;}
}
module.exports={NodeArena};
