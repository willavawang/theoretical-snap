#!/usr/bin/env node
'use strict';
const {census}=require('../../solver/offline/census.cjs');
const report=census(),file=process.argv[2];
if(file){const fs=require('node:fs'),path=require('node:path');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
