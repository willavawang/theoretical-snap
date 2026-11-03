'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../../dist/solver/engine.js'),R=require('../../dist/solver/ranges.js');
const results=require('./checks.cjs')(S,R);
for(const result of results)test(result.name,()=>assert.ok(result.passed,result.stack||result.error));
