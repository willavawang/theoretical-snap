#!/usr/bin/env python3
"""Reproduce two reachable, equal-board histories with different terminal values."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default='benchmarks/turn6/same-board-counterexample.json')
    args = parser.parse_args()
    env = {**os.environ, 'OPENBLAS_NUM_THREADS': '1', 'OMP_NUM_THREADS': '1'}
    source = r'''
const S=require('./dist/solver/engine.js'),A=require('./solver/endgame/audit.cjs');
const expand=counts=>counts.flatMap((n,c)=>Array(n).fill(c+1));
const models=[0,1].map(turn=>{
  const plays=Array.from({length:5},()=>[[],[],[]]);plays[turn]=[[1],[],[]];
  const rows=new Map();
  for(const t of A.traces(S.PRESETS.balanced,plays).traces){
    const key=t.hand.join(',')+'/'+t.remaining.join(',');
    if(!rows.has(key))rows.set(key,{hand:expand(t.hand),remaining:expand(t.remaining),weight:0});
    rows.get(key).weight+=t.weight;
  }
  return {turn:6,board:[[[],[],[]],[[1],[],[]]],
    ranges:[[{hand:[1,1,2,3,4,5,6],remaining:[2,3,4,5,6]}],[...rows.values()]],
    beliefScope:'Posterior from balanced deck under uniform historical legal play; not an equilibrium posterior'};
});
process.stdout.write(JSON.stringify(models));
'''
    models = json.loads(subprocess.check_output(['node', '-e', source], cwd=ROOT, env=env))
    results = []
    for model in models:
        solved = json.loads(subprocess.check_output(
            [sys.executable, 'scripts/solver/turn6_reference.py'],
            input=json.dumps({'model': model, 'seconds': 10}), text=True, cwd=ROOT, env=env))
        cross = json.loads(subprocess.check_output(
            ['node', '-e', "const fs=require('node:fs'),V=require('./solver/endgame/verify.cjs');const x=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(V.verify(x.model,x.policies)));"],
            input=json.dumps({'model': model, 'policies': solved['policies']}), text=True, cwd=ROOT, env=env))
        keys = ('value', 'upper', 'lower', 'nashGap', 'maxConditionalGain')
        error = max(abs(solved['certificate'][k]-cross[k]) for k in keys)
        if not solved['certificate']['validated'] or not cross['validated'] or error > 1e-8:
            raise RuntimeError('Independent bounds did not agree')
        solved.pop('policies')
        solved['certificate'].pop('rows', None)
        solved['crossLanguageError'] = error
        results.append(solved)
    paths = [Path(__file__), ROOT/'solver/endgame/audit.cjs', ROOT/'scripts/solver/turn6_reference.py', ROOT/'solver/endgame/verify.cjs']
    digest = hashlib.sha256()
    for path in paths:
        digest.update(str(path.relative_to(ROOT)).encode()); digest.update(path.read_bytes())
    output = {'schema': 'snap-same-board-history-counterexample-1', 'sourceDigest': digest.hexdigest(),
              'models': models, 'results': results,
              'valueDifference': results[0]['certificate']['value']-results[1]['certificate']['value'],
              'scope': 'Same public board/counts and own current resources; the cost-1 play on turn one versus turn two induces different opponent posteriors under uniform legal historical play. Not equilibrium-history beliefs.'}
    destination = ROOT/args.out
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, indent=2)+'\n')
    print(json.dumps({'output': str(destination), 'values': [r['certificate']['value'] for r in results],
                      'valueDifference': output['valueDifference']}))


if __name__ == '__main__':
    main()
