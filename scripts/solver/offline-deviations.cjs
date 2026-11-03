#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),C=require('../../solver/offline/checkpoint.cjs'),{probe}=require('../../solver/offline/deviations.cjs');
const a=process.argv.slice(2),o={};while(a.length){const k=a.shift();o[k.replace(/^--/,'')]=a.shift();}
const checkpoint=path.resolve(o.checkpoint||'artifacts/offline/open-game/checkpoint.bin'),reference=C.load(checkpoint),result=probe(reference,{seconds:Number(o.seconds||3),samples:Number(o.samples||3000),maxInfoStates:Number(o['max-states']||100000)}),out=path.resolve(o.out||path.join(path.dirname(checkpoint),'deviations.json'));fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log('OFFLINE_DEVIATIONS_BEGIN');console.log(JSON.stringify(result));console.log('OFFLINE_DEVIATIONS_END');
