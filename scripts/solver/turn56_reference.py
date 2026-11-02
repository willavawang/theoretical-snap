#!/usr/bin/env python3
"""Independent, coupled sequence-form LP for the final two numerical Snap turns.

Chance is in the payoff coefficients; realization flows preserve perfect recall.
Individual-card action enumeration and raw-board payoffs come from the audited
Python oracle, independently of the JavaScript public-tree compiler.
"""
from __future__ import annotations
import itertools
import json
import math
import os
import platform
import resource
import sys
import time
import warnings

os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
os.environ.setdefault('OMP_NUM_THREADS', '1')
import turn6_reference as R
import numpy as np
import scipy
from scipy.optimize import linprog, OptimizeWarning
from scipy.sparse import coo_matrix, hstack

CACHE = {}


def info_key(p, turn, key, pair=None, draw=None):
    return json.dumps([p, 5, key] if turn == 5 else [p, 6, key, pair[0], pair[1], draw], separators=(',', ':'), ensure_ascii=False)


def parse(model):
    rules = {'turns': 6, 'deckSize': 12, 'handLimit': 7, **model.get('rules', {})}
    if model.get('turn') != 5 or rules['turns'] != 6 or not 1 <= rules['handLimit'] <= 7:
        raise ValueError('Reference requires turns five and six, hand limit at most seven')
    board = model.get('board', [[[], [], []], [[], [], []]])
    if len(board) != 2 or any(len(p) != 3 for p in board):
        raise ValueError('Board shape')
    for side in board:
        for lane in side:
            R.counts(lane)
            if len(lane) > 4:
                raise ValueError('Lane capacity')
    types, lookup, joint = [[], []], [{}, {}], {}

    def weight(raw):
        w = raw.get('weight', 1)
        if not math.isfinite(w) or w < 0:
            raise ValueError('Invalid prior')
        return w

    def intern(raw, p):
        h, r = R.counts(raw['hand']), R.counts(raw['remaining'])
        if sum(h) > rules['handLimit']:
            raise ValueError('Hand limit')
        if rules['deckSize'] is not None and sum(h)+sum(r)+sum(map(len, board[p])) != rules['deckSize']:
            raise ValueError('Card conservation')
        key = R.type_key(h, r, raw.get('observations', ''))
        if key not in lookup[p]:
            lookup[p][key] = len(types[p])
            types[p].append({'key': key, 'hand': h, 'remaining': r, 'weight': 0.0,
                             'actions': R.enumerate_actions(h, 5, tuple(map(len, board[p])))})
        return lookup[p][key]

    independent = 'cases' not in model
    if independent:
        if len(model.get('ranges', [])) != 2:
            raise ValueError('Both ranges required')
        for p, rows in enumerate(model['ranges']):
            total = sum(weight(t) for t in rows)
            if total <= 0:
                raise ValueError('Empty prior')
            for t in rows:
                if weight(t):
                    types[p][intern(t, p)]['weight'] += weight(t)/total
        for i, t in enumerate(types[0]):
            for j, u in enumerate(types[1]):
                joint[i, j] = t['weight']*u['weight']
    else:
        total = sum(weight(c) for c in model['cases'])
        if total <= 0:
            raise ValueError('Empty joint prior')
        for c in model['cases']:
            if not weight(c):
                continue
            if len(c['players']) != 2:
                raise ValueError('Both players required')
            ids = tuple(intern(t, p) for p, t in enumerate(c['players']))
            joint[ids] = joint.get(ids, 0.0)+weight(c)/total
        for ids, w in joint.items():
            for p in range(2):
                types[p][ids[p]]['weight'] += w
    for p in range(2):
        if len({(sum(t['hand']), sum(t['remaining'])) for t in types[p]}) != 1:
            raise ValueError('Private types disagree on public counts')
        if not R.reachable(tuple(c for lane in board[p] for c in lane), 5, sum(types[p][0]['hand']), rules):
            raise ValueError('Unreachable snapshot')
    return {'board': board, 'rules': rules, 'types': types, 'joint': joint, 'independent': independent}


def transitions(t, action, occupied, hand_limit):
    key = action[0]
    removed = [sum(int(key[3*c+l]) for l in range(3)) for c in range(6)]
    hand = tuple(t['hand'][c]-removed[c] for c in range(6))
    slots = tuple(occupied[l]+sum(int(key[3*c+l]) for c in range(6)) for l in range(3))
    n = sum(t['remaining'])
    choices = [(0, 1.0)] if sum(hand) >= hand_limit or not n else [(c+1, v/n) for c, v in enumerate(t['remaining']) if v]
    out = []
    for cost, probability in choices:
        h, r = list(hand), list(t['remaining'])
        if cost:
            h[cost-1] += 1
            r[cost-1] -= 1
        out.append({'cost': cost, 'probability': probability, 'hand': tuple(h), 'remaining': tuple(r),
                    'actions': R.enumerate_actions(tuple(h), 6, slots)})
    return out


def compile_game(model, max_nonzeros=2000000, max_sequences=200000, max_worlds=256):
    start = time.perf_counter()
    game = parse(model)
    types = game['types']
    if len(game['joint']) > max_worlds:
        raise RuntimeError('Independent reference root-world limit exceeded; no actions were pruned')
    infos, info_map, root_sequences, sequence_count = [[], []], [{}, {}], [[], []], [1, 1]

    def register(p, key, actions, parent, meta):
        if key in info_map[p]:
            return infos[p][info_map[p][key]]
        first = sequence_count[p]
        sequence_count[p] += len(actions)
        if sequence_count[p] > max_sequences:
            raise RuntimeError('Independent reference sequence limit exceeded; no actions were pruned')
        node = {'key': key, 'actions': actions, 'seq': list(range(first, sequence_count[p])), 'parent': parent, **meta}
        info_map[p][key] = len(infos[p])
        infos[p].append(node)
        return node

    transition_cache = [{}, {}]
    for p in range(2):
        for i, t in enumerate(types[p]):
            n = register(p, info_key(p, 5, t['key']), t['actions'], 0, {'turn': 5, 'type': i})
            root_sequences[p].append(dict(zip((a[0] for a in t['actions']), n['seq'])))
            for a in t['actions']:
                transition_cache[p][i, a[0]] = transitions(t, a, tuple(map(len, game['board'][p])), game['rules']['handLimit'])
    rows, cols, data, branches = [], [], [], set()
    for (i, j), mass in game['joint'].items():
        for a, b in itertools.product(types[0][i]['actions'], types[1][j]['actions']):
            pair = (a[0], b[0])
            branches.add(pair)
            for da, db in itertools.product(transition_cache[0][i, a[0]], transition_cache[1][j, b[0]]):
                draws, ids = (da, db), (i, j)
                ns = [register(p, info_key(p, 6, types[p][ids[p]]['key'], pair, draws[p]['cost']), draws[p]['actions'], root_sequences[p][ids[p]][pair[p]],
                               {'turn': 6, 'type': ids[p], 'pair': pair, 'draw': draws[p]['cost'], 'drawProbability': draws[p]['probability']}) for p in range(2)]
                chance = mass*da['probability']*db['probability']
                for ai, (_, ap) in enumerate(da['actions']):
                    own = tuple(a[1][l]+ap[l] for l in range(3))
                    for bi, (_, bp) in enumerate(db['actions']):
                        other = tuple(b[1][l]+bp[l] for l in range(3))
                        payoff = R.terminal(game['board'], own, other)
                        if payoff:
                            rows.append(ns[0]['seq'][ai]); cols.append(ns[1]['seq'][bi]); data.append(chance*payoff)
                            if len(data) > max_nonzeros:
                                raise RuntimeError('Independent reference payoff limit exceeded; no actions were pruned')
    matrix = coo_matrix((data, (rows, cols)), shape=tuple(sequence_count)).tocsr()
    matrix.eliminate_zeros()
    flows, rhs = [], []
    for p in range(2):
        er, ec, ev = [0], [0], [1.0]
        for row, n in enumerate(infos[p], 1):
            er.append(row); ec.append(n['parent']); ev.append(-1.0)
            for seq in n['seq']:
                er.append(row); ec.append(seq); ev.append(1.0)
        flows.append(coo_matrix((ev, (er, ec)), shape=(len(infos[p])+1, sequence_count[p])).tocsr())
        e = np.zeros(len(infos[p])+1); e[0] = 1.0; rhs.append(e)
    return {**game, 'infos': infos, 'infoMap': info_map, 'rootSequences': root_sequences, 'sequenceCount': sequence_count,
            'matrix': matrix, 'flows': flows, 'rhs': rhs, 'compileMs': (time.perf_counter()-start)*1000,
            'stats': {'rootTypes': list(map(len, types)), 'informationSets': list(map(len, infos)), 'sequences': sequence_count,
                      'publicBranches': len(branches), 'payoffNonzeros': int(matrix.nnz), 'rawPayoffEntries': len(data),
                      'flowNonzeros': [int(f.nnz) for f in flows]}}


def compiled(model):
    key = json.dumps(model, sort_keys=True)
    if key not in CACHE:
        if len(CACHE) >= 3:
            CACHE.clear()
        CACHE[key] = compile_game(model)
        return CACHE[key], False
    return CACHE[key], True


def unpack(game, policies):
    vectors, behaviors = [], []
    for p in range(2):
        supplied = {row['infoKey']: row['probabilities'] for row in policies[p]}
        if len(supplied) != len(policies[p]) or set(supplied) != set(game['infoMap'][p]):
            raise ValueError('Missing, duplicate or extra information-set policies')
        x, ps = np.zeros(game['sequenceCount'][p]), []
        x[0] = 1.0
        for n in game['infos'][p]:
            row = supplied[n['key']]
            allowed = {a[0] for a in n['actions']}
            if any(k not in allowed or not math.isfinite(v) or v < 0 for k, v in row.items()) or abs(sum(row.values())-1) > 1e-8:
                raise ValueError('Illegal or unnormalized policy')
            probs = np.array([row.get(a[0], 0) for a in n['actions']])
            x[n['seq']] = x[n['parent']]*probs
            ps.append(probs)
        if np.max(np.abs(game['flows'][p]@x-game['rhs'][p])) > 1e-8:
            raise ValueError('Behavioral policy violates realization flow')
        vectors.append(x); behaviors.append(ps)
    return vectors, behaviors


def verify(game, policies, tolerance=1e-6, include_actions=False):
    vectors, behavior = unpack(game, policies)
    root_rows, brs, profiles, maximum, continuation_gain = [[], []], [], [], 0.0, 0.0
    for p in range(2):
        cf = game['matrix']@vectors[1] if p == 0 else -game['matrix'].T@vectors[0]
        profile_values, best_values = np.array(cf), np.array(cf)
        for k, n in enumerate(game['infos'][p]):
            if n['turn'] != 6:
                continue
            q = cf[n['seq']]
            mean, best = float(q@behavior[p][k]), float(np.max(q))
            profile_values[n['parent']] += mean
            best_values[n['parent']] += best
            reach = 0.0
            for ids, mass in game['joint'].items():
                if ids[p] != n['type']:
                    continue
                other_seq = game['rootSequences'][1-p][ids[1-p]].get(n['pair'][1-p])
                if other_seq is not None:
                    reach += mass*n['drawProbability']*vectors[1-p][other_seq]
            if vectors[p][n['parent']] > 1e-12 and reach > 1e-12:
                continuation_gain = max(continuation_gain, (best-mean)/reach)
        player_value, player_br = 0.0, 0.0
        for k, n in enumerate(game['infos'][p]):
            if n['turn'] != 5:
                continue
            t = game['types'][p][n['type']]
            q = profile_values[n['seq']]/t['weight']
            br = best_values[n['seq']]/t['weight']
            value, best = float(q@behavior[p][k]), float(np.max(br))
            maximum = max(maximum, best-value)
            player_value += t['weight']*value; player_br += t['weight']*best
            row = {'typeKey': t['key'], 'weight': t['weight'], 'value': value, 'maximumEV': float(np.max(q)), 'bestValue': best, 'gain': max(0.0, best-value)}
            if include_actions:
                row['actions'] = {a[0]: {'ev': float(q[j]), 'bestResponseEV': float(br[j]), 'frequency': float(behavior[p][k][j]),
                                          'evLoss': max(0.0, float(np.max(q)-q[j]))} for j, a in enumerate(n['actions'])}
            root_rows[p].append(row)
        profiles.append(player_value); brs.append(player_br)
    matrix_value = float(vectors[0]@(game['matrix']@vectors[1]))
    if abs(profiles[0]+profiles[1]) > 1e-8 or abs(matrix_value-profiles[0]) > 1e-8:
        raise RuntimeError('Independent profile evaluation mismatch')
    gap = max(0.0, sum(brs))
    return {'value': profiles[0], 'upper': brs[0], 'lower': -brs[1], 'nashGap': gap, 'exploitability': gap/2,
            'maxConditionalGain': max(0.0, maximum), 'maxReachedContinuationGain': max(0.0, continuation_gain),
            'validated': gap <= tolerance and maximum <= tolerance, 'tolerance': tolerance, 'rows': root_rows,
            'method': 'Independent individual-card sequence-form tree; exhaustive information-constrained two-turn best responses',
            'scope': 'Supplied conditional turns-five/six game, not full-game equilibrium or safe re-solving'}


def solve(model, seconds=10.0, tolerance=1e-6, include_actions=False):
    start = time.perf_counter()
    game, reused = compiled(model)
    optimization_start, policies, statuses = time.perf_counter(), [[], []], []
    for p in range(2):
        a = game['matrix'] if p == 0 else -game['matrix'].T
        own, opp = game['flows'][p], game['flows'][1-p]
        nx, nv = game['sequenceCount'][p], opp.shape[0]
        objective = np.concatenate((np.zeros(nx), -game['rhs'][1-p]))
        aub = hstack((-a.T, opp.T), format='csr')
        aeq = hstack((own, coo_matrix((own.shape[0], nv))), format='csr')
        with warnings.catch_warnings():
            warnings.filterwarnings('ignore', message='Unrecognized options detected.*', category=OptimizeWarning)
            result = linprog(objective, A_ub=aub, b_ub=np.zeros(aub.shape[0]), A_eq=aeq, b_eq=game['rhs'][p],
                             bounds=[(0.0, 1.0)]*nx+[(None, None)]*nv, method='highs-ds',
                             options={'time_limit': max(.001, seconds-(time.perf_counter()-optimization_start)), 'threads': 1,
                                      'primal_feasibility_tolerance': 1e-10, 'dual_feasibility_tolerance': 1e-10})
        statuses.append({'status': result.status, 'success': bool(result.success), 'message': result.message,
                         'iterations': int(result.nit or 0), 'variables': nx+nv, 'inequalities': aub.shape[0], 'nonzeros': int(aub.nnz+aeq.nnz)})
        for n in game['infos'][p]:
            xs = np.maximum(0.0, result.x[n['seq']]) if result.x is not None else np.ones(len(n['seq']))
            if xs.sum() <= 0:
                xs = np.ones(len(xs))
            xs /= xs.sum()
            policies[p].append({'infoKey': n['key'], 'turn': n['turn'], 'typeKey': game['types'][p][n['type']]['key'],
                                'probabilities': {a[0]: float(xs[j]) for j, a in enumerate(n['actions'])}})
    optimization_ms = (time.perf_counter()-optimization_start)*1000
    verified_start = time.perf_counter()
    certificate = verify(game, policies, tolerance, include_actions)
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform == 'darwin' else 1024)
    return {'algorithm': 'Coupled two-turn realization-plan LPs; SciPy/HiGHS dual simplex', 'policies': policies, 'certificate': certificate,
            'reusedCompiledGame': reused, 'compileMs': 0.0 if reused else game['compileMs'], 'optimizationMs': optimization_ms,
            'verificationMs': (time.perf_counter()-verified_start)*1000, 'totalMs': (time.perf_counter()-start)*1000,
            'peakRssBytes': peak, 'rssScope': 'Worker lifetime high-water mark; isolate workers for per-case peaks',
            'stats': game['stats'], 'statuses': statuses}


def respond(request):
    if request.get('op') == 'verify':
        game, _ = compiled(request['model'])
        return verify(game, request['policies'], request.get('tolerance', 1e-6), request.get('includeActions', False))
    result = solve(request['model'], request.get('seconds', 10), request.get('tolerance', 1e-6), request.get('includeActions', False))
    if request.get('summaryOnly'):
        result.pop('policies')
    return result


if __name__ == '__main__':
    if '--server' in sys.argv:
        print(json.dumps({'ready': True, 'python': platform.python_version(), 'numpy': np.__version__, 'scipy': scipy.__version__,
                          'platform': platform.platform(), 'threadsRequested': 1}), flush=True)
        for line in sys.stdin:
            try:
                print(json.dumps({'ok': True, 'result': respond(json.loads(line))}), flush=True)
            except Exception as exc:
                print(json.dumps({'ok': False, 'error': str(exc)}), flush=True)
    else:
        print(json.dumps(respond(json.load(sys.stdin))))
