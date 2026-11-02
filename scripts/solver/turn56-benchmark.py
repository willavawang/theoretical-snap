#!/usr/bin/env python3
"""Reproducible, independently checked coupled two-turn benchmark."""
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

ROOT = Path(__file__).resolve().parents[2]
ENV = {**os.environ, 'OPENBLAS_NUM_THREADS': '1', 'OMP_NUM_THREADS': '1', 'PYTHONUNBUFFERED': '1'}


class Worker:
    def __init__(self, command):
        self.errors = tempfile.TemporaryFile(mode='w+t')
        start = time.perf_counter()
        self.process = subprocess.Popen(command, cwd=ROOT, env=ENV, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.errors, text=True, bufsize=1)
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError('Worker did not start: '+self.error_text())
        self.ready = json.loads(line)
        self.startup_ms = (time.perf_counter()-start)*1000

    def error_text(self):
        self.errors.seek(0)
        return self.errors.read()

    def call(self, request):
        start = time.perf_counter()
        self.process.stdin.write(json.dumps(request)+'\n'); self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError('Worker ended: '+self.error_text())
        response = json.loads(line)
        if not response.get('ok'):
            raise RuntimeError(response.get('error'))
        return response['result'], (time.perf_counter()-start)*1000

    def close(self):
        self.process.stdin.close()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.terminate(); self.process.wait(timeout=5)
        self.errors.close()


def summary(result):
    return {k: v for k, v in result.items() if k != 'policies'}


def compare(a, b):
    keys = ['value', 'upper', 'lower', 'nashGap', 'maxConditionalGain', 'maxReachedContinuationGain']
    error = max(abs(a[k]-b[k]) for k in keys)
    for p in range(2):
        lookup = {t['typeKey']: t for t in b['rows'][p]}
        for row in a['rows'][p]:
            other = lookup[row['typeKey']]
            if 'actions' in row and 'actions' in other:
                aa, bb = row['actions'], other['actions']
                if isinstance(aa, list):
                    aa = {x['actionKey']: x for x in aa}
                if isinstance(bb, list):
                    bb = {x['actionKey']: x for x in bb}
                if set(aa) != set(bb):
                    raise RuntimeError('Independent root action sets disagree')
                for key in aa:
                    for field in ('ev', 'bestResponseEV'):
                        error = max(error, abs(aa[key][field]-bb[key][field]))
    if error > 1e-8:
        raise RuntimeError('Independent policy/value disagreement: '+str(error))
    return error


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default='benchmarks/turn56/results.json')
    parser.add_argument('--budgets', default='.2,1,10')
    parser.add_argument('--warm-repeats', type=int, default=2)
    parser.add_argument('--cases', default='all')
    parser.add_argument('--quick', action='store_true')
    args = parser.parse_args()
    budgets = sorted(float(x) for x in args.budgets.split(','))
    if not budgets or any(x <= 0 for x in budgets) or args.warm_repeats < 0:
        raise ValueError('Positive budgets and nonnegative repeats required')
    cases = json.loads(subprocess.check_output(['node', 'scripts/solver/turn56-worker.cjs', '--cases'], cwd=ROOT, env=ENV))
    if args.cases != 'all':
        requested = set(args.cases.split(',')); cases = [c for c in cases if c['name'] in requested]
        if requested != {c['name'] for c in cases}:
            raise ValueError('Unknown case name')
    if args.quick:
        cases = [c for c in cases if c['name'] in ('asymmetric-draws', 'full-hand-skip', 'correlated-labels', 'forced-win')]
        budgets = [.2, 1]; args.warm_repeats = 1
    paths = sorted(list((ROOT/'solver/two-turn').glob('*.cjs'))+list((ROOT/'scripts/solver').glob('turn56*')))
    digest = hashlib.sha256()
    for path in paths:
        digest.update(str(path.relative_to(ROOT)).encode()); digest.update(path.read_bytes())
    hardware = json.loads(subprocess.check_output(['node', '-e', "const o=require('node:os'),c=o.cpus();process.stdout.write(JSON.stringify({cpu:c[0]?.model||'unavailable',logicalCores:c.length,totalMemoryBytes:o.totalmem()}))"], cwd=ROOT))
    start = time.perf_counter()
    report = {'schema': 'snap-coupled-56-benchmark-1', 'metadata': {'platform': platform.platform(), 'architecture': platform.machine(), **hardware,
              'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'sourceDigest': digest.hexdigest(),
              'caseDigest': hashlib.sha256(json.dumps(cases, sort_keys=True).encode()).hexdigest(), 'budgetsSeconds': budgets, 'warmRepeats': args.warm_repeats},
              'interpretation': {'scope': 'Coupled conditional turns-five/six games, no deck exclusions or whole-game certificate',
              'cold': 'Fresh reference process startup plus independent sequence-form build, LP optimization and verification',
              'warm': 'New LP optimization and verification on the same compiled sequence-form tree; no cached equilibrium lookup or basis warm-start',
              'beliefConstructionMs': None, 'historicalConditioningMeasured': False,
              'target': 'Global gap and maximum root-private-type full-continuation deviation gain <= 1e-6',
              'continuationCaveat': 'Rare later information sets can have larger local errors; their residual is reported separately and turn-six queries require their own local check',
              'budget': 'Soft optimization budget; compilation, verification, current iteration and scheduling can exceed it'}, 'cases': []}
    for case in cases:
        record = {k: v for k, v in case.items() if k != 'model'}
        model = case['model']
        py, js = Worker([sys.executable, 'scripts/solver/turn56_reference.py', '--server']), Worker(['node', 'scripts/solver/turn56-worker.cjs'])
        try:
            report['metadata']['referenceRuntime'] = py.ready; report['metadata']['candidateRuntime'] = js.ready
            solved, wall = py.call({'model': model, 'seconds': 30, 'includeActions': True})
            if not solved['certificate']['validated']:
                raise RuntimeError('Reference missed target: '+case['name'])
            cross, _ = js.call({'op': 'verify', 'model': model, 'policies': solved['policies'], 'includeActions': True})
            if 'knownValue' in case and abs(case['knownValue']-solved['certificate']['value']) > 1e-8:
                raise RuntimeError('Known control disagrees')
            record['lp'] = {'cold': {**summary(solved), 'workerStartupMs': py.startup_ms, 'rpcMs': wall, 'coldEndToEndMs': py.startup_ms+wall,
                                     'crossLanguageError': compare(solved['certificate'], cross)}, 'budgets': [], 'warm': []}
            record['lp']['policyJsonBytes'] = len(json.dumps(solved['policies'], separators=(',', ':')).encode())
            record['lp']['positiveActionProbabilities'] = sum(v > 0 for side in solved['policies'] for row in side for v in row['probabilities'].values())
            for budget in budgets:
                r, elapsed = py.call({'model': model, 'seconds': budget, 'summaryOnly': True})
                record['lp']['budgets'].append({'budgetSeconds': budget, 'rpcMs': elapsed, **r})
            for _ in range(args.warm_repeats):
                r, elapsed = py.call({'model': model, 'seconds': 30, 'summaryOnly': True})
                record['lp']['warm'].append({'rpcMs': elapsed, **r})
            if record['lp']['warm']:
                record['lp']['warmMedianMs'] = statistics.median(r['rpcMs'] for r in record['lp']['warm'])
            record['cfr'] = []; previous = 0; spent = 0
            for index, budget in enumerate(budgets):
                r, elapsed = js.call({'model': model, 'milliseconds': (budget-previous)*1000, 'includePolicies': index == len(budgets)-1})
                previous = budget; spent += r['optimizationMs']
                row = {**summary(r), 'requestedCumulativeBudgetSeconds': budget, 'actualCumulativeOptimizationMs': spent, 'rpcMs': elapsed}
                if index == 0:
                    row.update(workerStartupMs=js.startup_ms, coldEndToEndMs=js.startup_ms+elapsed)
                if index == len(budgets)-1:
                    checked, _ = py.call({'op': 'verify', 'model': model, 'policies': r['policies']})
                    row['crossLanguageError'] = compare(r['certificate'], checked)
                record['cfr'].append(row)
        finally:
            py.close(); js.close()
        report['cases'].append(record); report['elapsedSeconds'] = time.perf_counter()-start
        destination = ROOT/args.out; destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix('.partial'); temporary.write_text(json.dumps(report, indent=2)+'\n'); temporary.replace(destination)
        print(json.dumps({'case': case['name'], 'lpGap': record['lp']['cold']['certificate']['nashGap'], 'coldLpMs': record['lp']['cold']['coldEndToEndMs'],
                          'cfrGap': record['cfr'][-1]['certificate']['nashGap']}), flush=True)
    print(json.dumps({'complete': True, 'cases': len(cases), 'seconds': report['elapsedSeconds'], 'output': str(destination)}), flush=True)


if __name__ == '__main__':
    main()
