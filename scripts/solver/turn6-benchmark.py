#!/usr/bin/env python3
"""Reproducible conditional endgame benchmark; no full-game training or UI writes."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import statistics
import subprocess
import sys
import tempfile
import time

ROOT=Path(__file__).resolve().parents[2]
ENV={**os.environ,"OPENBLAS_NUM_THREADS":"1","OMP_NUM_THREADS":"1","PYTHONUNBUFFERED":"1"}


class Worker:
    def __init__(self,command):
        self.errors=tempfile.TemporaryFile(mode='w+t')
        start=time.perf_counter()
        self.process=subprocess.Popen(command,cwd=ROOT,env=ENV,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.errors,text=True,bufsize=1)
        line=self.process.stdout.readline()
        if not line:raise RuntimeError('Worker failed to start: '+self.error_text())
        self.ready=json.loads(line)
        self.startup_ms=(time.perf_counter()-start)*1000

    def error_text(self):
        self.errors.seek(0);return self.errors.read()

    def call(self,request):
        start=time.perf_counter()
        self.process.stdin.write(json.dumps(request,separators=(',',':'))+'\n');self.process.stdin.flush()
        line=self.process.stdout.readline()
        if not line:raise RuntimeError('Worker ended: '+self.error_text())
        response=json.loads(line)
        if not response.get('ok'):raise RuntimeError(response.get('error'))
        return response['result'],(time.perf_counter()-start)*1000

    def close(self):
        self.process.stdin.close()
        try:self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:self.process.terminate();self.process.wait(timeout=5)
        self.errors.close()


def summary(result):
    out={k:v for k,v in result.items() if k not in ('policies',)}
    out['certificate']={k:v for k,v in result['certificate'].items() if k!='rows'}
    return out


def compare(a,b):
    keys=['value','upper','lower','nashGap','maxConditionalGain']
    error=max(abs(a[k]-b[k]) for k in keys)
    if error>1e-8:raise RuntimeError('Independent certificate mismatch: '+str(error))
    if 'rows' in a and 'rows' in b:
        for p in range(2):
            lookup={r['typeKey']:r for r in b['rows'][p]}
            for row in a['rows'][p]:
                other=lookup[row['typeKey']]
                if 'actions' in row and 'actions' in other:
                    da=row['actions']
                    if isinstance(da,list):da={x['actionKey']:x for x in da}
                    db=other['actions']
                    if isinstance(db,list):db={x['actionKey']:x for x in db}
                    if set(da)!=set(db):raise RuntimeError('Independent action set mismatch')
                    for action in da:
                        error=max(error,abs(da[action]['ev']-db[action]['ev']))
    if error>1e-8:raise RuntimeError('Independent action EV mismatch')
    return error


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',default='benchmarks/turn6/results.json')
    parser.add_argument('--budgets',default='.2,1,10')
    parser.add_argument('--warm-repeats',type=int,default=2)
    parser.add_argument('--cases',default='all')
    parser.add_argument('--quick',action='store_true')
    args=parser.parse_args()
    budgets=sorted(float(x) for x in args.budgets.split(','))
    if any(x<=0 for x in budgets) or args.warm_repeats<0:raise ValueError('Positive budgets required')
    cases=json.loads(subprocess.check_output(['node','scripts/solver/turn6-worker.cjs','--cases'],cwd=ROOT,env=ENV))
    if args.cases!='all':
        requested=set(args.cases.split(','));cases=[c for c in cases if c['name'] in requested]
        if requested!={c['name'] for c in cases}:raise ValueError('Unknown case name')
    if args.quick:
        cases=[c for c in cases if c['name'] in ('public-rational','hidden-trap','correlated-signal','independent-aliases')]
        budgets=[.2,1];args.warm_repeats=1
    files=sorted(list((ROOT/'solver/endgame').glob('*.cjs'))+list((ROOT/'scripts/solver').glob('turn6*')))
    digest=hashlib.sha256()
    for p in files:digest.update(str(p.relative_to(ROOT)).encode());digest.update(p.read_bytes())
    try:cpu=next(x.split(':',1)[1].strip() for x in Path('/proc/cpuinfo').read_text().splitlines() if x.startswith('model name'))
    except (OSError,StopIteration):cpu=platform.processor()
    started=time.perf_counter()
    report={'schema':'snap-turn6-benchmark-1','metadata':{'platform':platform.platform(),'architecture':platform.machine(),'cpu':cpu,'visibleCores':os.cpu_count(),
      'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'sourceDigest':digest.hexdigest(),
      'caseDigest':hashlib.sha256(json.dumps(cases,sort_keys=True).encode()).hexdigest(),'budgetsSeconds':budgets,'warmRepeats':args.warm_repeats},
      'interpretation':{'beliefInput':'Declared conditional priors; no equilibrium-history posterior claim','beliefConstructionMs':None,
        'historicalConditioningMeasured':False,'cold':'Fresh process startup plus compile, optimization, and independent verification',
        'warmLP':'Same compiled matrices; new LP optimization, not a cached equilibrium or a HiGHS basis warm-start',
        'cfrBudgets':'Cumulative requested optimization budgets; each row continues the same averaged CFR policy; stopping checks included',
        'scope':'Final-turn conditional games only. No deck exclusions, full-game certificate, browser timings, or M2 timings.'},'cases':[]}
    reference=Worker([sys.executable,'scripts/solver/turn6_reference.py','--server'])
    try:
        report['metadata']['referenceRuntime']=reference.ready
        report['twoTurnControl'],_=reference.call({'op':'control'})
    finally:reference.close()
    report['stateAudit']=json.loads(subprocess.check_output(['node','-e','console.log(JSON.stringify(require("./solver/endgame/audit.cjs").audit()))'],cwd=ROOT,env=ENV))
    for case in cases:
        name,model=case['name'],case['model'];record={k:v for k,v in case.items() if k!='model'};record['lp']={};record['cfr']=[]
        py=Worker([sys.executable,'scripts/solver/turn6_reference.py','--server'])
        js=Worker(['node','scripts/solver/turn6-worker.cjs'])
        try:
            small=name not in ('all-seven-card-hands','broad-asymmetric','blocked-lane')
            result,wall=py.call({'model':model,'seconds':max(10,budgets[-1]),'includeActions':small})
            if not result['certificate']['validated']:raise RuntimeError('Reference LP missed target: '+name)
            cross,_=js.call({'op':'verify','model':model,'policies':result['policies'],'includeActions':small})
            error=compare(result['certificate'],cross)
            record['lp']['cold']={**summary(result),'workerStartupMs':py.startup_ms,'rpcMs':wall,'coldEndToEndMs':py.startup_ms+wall,'crossLanguageError':error}
            if 'knownValue' in case and abs(case['knownValue']-result['certificate']['value'])>1e-8:raise RuntimeError('Known-answer mismatch')
            if 'knownValue' in case:
                exact,_=py.call({'op':'rational','model':model,'policies':result['policies']})
                if not exact['exactEquilibrium']:raise RuntimeError('Rational control failed')
                record['lp']['rationalCertificate']=exact
            record['lp']['budgets']=[]
            for budget in budgets:
                r,wall=py.call({'model':model,'seconds':budget,'summaryOnly':True})
                record['lp']['budgets'].append({'budgetSeconds':budget,'rpcMs':wall,**summary(r)})
            warm=[]
            for _ in range(args.warm_repeats):
                r,wall=py.call({'model':model,'seconds':max(10,budgets[-1]),'summaryOnly':True})
                warm.append({'rpcMs':wall,**summary(r)})
            record['lp']['warm']=warm
            if warm:record['lp']['warmMedianMs']=statistics.median(r['rpcMs'] for r in warm)
            if small:
                raw,wall=py.call({'model':model,'seconds':10,'reduce':False,'poolTypes':False,'summaryOnly':True})
                if not raw['certificate']['validated'] or abs(raw['certificate']['value']-result['certificate']['value'])>1e-8:raise RuntimeError('Raw/reduced LP mismatch')
                record['lp']['unreduced']={'rpcMs':wall,**summary(raw)}
        finally:py.close();js.close()
        for algorithm in ['legacy-cfr','raw-cfr','reduced-cfr']:
            worker=Worker(['node','scripts/solver/turn6-worker.cjs']);py=Worker([sys.executable,'scripts/solver/turn6_reference.py','--server'])
            try:
                rows=[];previous=0;spent=0
                for i,budget in enumerate(budgets):
                    r,wall=worker.call({'model':model,'algorithm':algorithm,'milliseconds':max(.001,budget-previous)*1000,
                                       'tolerance':1e-6,'includePolicies':i==len(budgets)-1})
                    spent+=r['optimizationMs'];previous=budget
                    row={'requestedCumulativeBudgetSeconds':budget,'actualCumulativeOptimizationMs':spent,'rpcMs':wall,**summary(r)}
                    if i==0:row.update(workerStartupMs=worker.startup_ms,coldEndToEndMs=worker.startup_ms+wall)
                    if i==len(budgets)-1:
                        independent,_=py.call({'op':'verify','model':model,'policies':r['policies']})
                        row['crossLanguageError']=compare(r['certificate'],independent)
                    rows.append(row)
                record['cfr'].append({'algorithm':algorithm,'runtime':worker.ready,'budgets':rows})
            finally:worker.close();py.close()
        report['cases'].append(record)
        destination=ROOT/args.out;destination.parent.mkdir(parents=True,exist_ok=True)
        report['elapsedSeconds']=time.perf_counter()-started
        temporary=destination.with_suffix('.partial');temporary.write_text(json.dumps(report,indent=2)+'\n');temporary.replace(destination)
        print(json.dumps({'case':name,'lpGap':record['lp']['cold']['certificate']['nashGap'],'coldLpMs':record['lp']['cold']['coldEndToEndMs'],
                         'cfrGaps':{x['algorithm']:x['budgets'][-1]['certificate']['nashGap'] for x in record['cfr']}}),flush=True)
    print(json.dumps({'complete':True,'cases':len(report['cases']),'seconds':report['elapsedSeconds'],'output':str(destination)}),flush=True)


if __name__=='__main__':main()
