#!/usr/bin/env python3
"""Independent final-turn Bayesian-game LP and exhaustive best responses.

Uses individual-card assignment to enumerate actions and reconstructs all
payoffs from the raw board. It does not import JavaScript payoff/strategy code.
SciPy/HiGHS is an independent optimizer, not an exact rational certificate.
"""
from __future__ import annotations
import functools
import itertools
import json
import math
import os
import platform
import resource
import sys
import time
import warnings
from fractions import Fraction

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
import numpy as np
import scipy
from scipy.optimize import linprog, OptimizeWarning
from scipy.sparse import coo_matrix


def counts(cards):
    out = [0] * 6
    for c in cards:
        if not isinstance(c, int) or not 1 <= c <= 6:
            raise ValueError("Card costs must be integers 1..6")
        out[c - 1] += 1
    return tuple(out)


def type_key(hand, remaining, observations=""):
    return ",".join(map(str, hand)) + "/" + ",".join(map(str, remaining)) + "@" + str(observations or "")


@functools.lru_cache(maxsize=10000)
def enumerate_actions(hand, energy, occupied):
    cards = tuple(c + 1 for c, n in enumerate(hand) for _ in range(n))
    allocation, slots, found = [0] * 18, list(occupied), {}

    def visit(i, left):
        if i == len(cards):
            key = "".join(map(str, allocation))
            power = tuple(sum((c + 1) * allocation[3 * c + l] for c in range(6)) for l in range(3))
            found[key] = power
            return
        visit(i + 1, left)  # Passing / leaving this physical copy unplayed.
        cost = cards[i]
        if cost > left:
            return
        for lane in range(3):
            if slots[lane] >= 4:
                continue
            slots[lane] += 1
            allocation[3 * (cost - 1) + lane] += 1
            visit(i + 1, left - cost)
            allocation[3 * (cost - 1) + lane] -= 1
            slots[lane] -= 1

    visit(0, energy)
    return tuple(sorted(found.items()))


def terminal(board, own, other):
    differences = [sum(board[0][l]) + own[l] - sum(board[1][l]) - other[l] for l in range(3)]
    wins = sum((d > 0) - (d < 0) for d in differences)
    result = wins if wins else sum(differences)
    return (result > 0) - (result < 0)


def reachable(revealed, turn, target_hand, rules):
    if rules["deckSize"] is None:
        return True
    # Independent subset-based energy/hand-count feasibility check.
    cards=tuple(revealed)
    if len(cards)>8 or len(cards)+target_hand>rules["deckSize"]:
        return False
    sizes=[m.bit_count() for m in range(1<<len(cards))]
    powers=[sum(cards[i] for i in range(len(cards)) if m&(1<<i)) for m in range(1<<len(cards))]
    @functools.lru_cache(None)
    def walk(t,remaining,hand):
        if t==turn:
            return remaining==0 and hand==target_hand
        subset=remaining
        while True:
            if sizes[subset]<=hand and powers[subset]<=t:
                next_mask=remaining^subset
                after=hand-sizes[subset]
                seen=len(cards)-sizes[next_mask]+after
                next_hand=after+(after<rules["handLimit"] and seen<rules["deckSize"])
                if walk(t+1,next_mask,next_hand):return True
            if subset==0:break
            subset=(subset-1)&remaining
        return False
    return walk(1,(1<<len(cards))-1,min(4,rules["handLimit"],rules["deckSize"]))


def parse_model(model):
    rules = {"turns": 6, "deckSize": 12, "handLimit": 7, **model.get("rules", {})}
    turn = model.get("turn", 1)
    if turn != rules["turns"] or not 1 <= turn <= 6:
        raise ValueError("Reference requires a final-turn continuation")
    if not 1 <= rules["handLimit"] <= 7:
        raise ValueError("Reference supports at most seven cards in hand")
    board = model.get("board", [[[], [], []], [[], [], []]])
    if len(board) != 2 or any(len(p) != 3 for p in board):
        raise ValueError("Board shape")
    for side in board:
        for lane in side:
            counts(lane)
            if len(lane) > 4:
                raise ValueError("Lane capacity")
    types, lookup, joint = [[], []], [{}, {}], []

    def intern(raw, player):
        hand, remaining = counts(raw["hand"]), counts(raw["remaining"])
        if sum(hand) > rules["handLimit"]:
            raise ValueError("Hand limit")
        if rules["deckSize"] is not None and sum(hand) + sum(remaining) + sum(map(len, board[player])) != rules["deckSize"]:
            raise ValueError("Deck conservation")
        key = type_key(hand, remaining, raw.get("observations", ""))
        if key not in lookup[player]:
            lookup[player][key] = len(types[player])
            types[player].append({"key": key, "hand": hand, "remaining": remaining, "weight": 0.0,
                                  "actions": enumerate_actions(hand, turn, tuple(map(len, board[player])))})
        return lookup[player][key]

    def weight(raw):
        w = raw.get("weight", 1)
        if not math.isfinite(w) or w < 0:
            raise ValueError("Invalid prior weight")
        return w

    independent = "cases" not in model
    if independent:
        if len(model.get("ranges", [])) != 2:
            raise ValueError("Both public ranges required")
        for p, r in enumerate(model["ranges"]):
            total = sum(weight(t) for t in r)
            if total <= 0:
                raise ValueError("Empty range")
            for t in r:
                if weight(t):
                    types[p][intern(t, p)]["weight"] += weight(t) / total
    else:
        total = sum(weight(c) for c in model["cases"])
        if total <= 0:
            raise ValueError("Empty joint prior")
        for case in model["cases"]:
            if not weight(case):
                continue
            ids = [intern(t, p) for p, t in enumerate(case["players"])]
            w = weight(case) / total
            joint.append((ids[0], ids[1], w))
            for p, i in enumerate(ids):
                types[p][i]["weight"] += w
    for p in range(2):
        if len({(sum(t["hand"]), sum(t["remaining"])) for t in types[p]}) != 1:
            raise ValueError("Private hypotheses disagree on public counts")
        if not reachable(tuple(c for lane in board[p] for c in lane),turn,sum(types[p][0]["hand"]),rules):
            raise ValueError("Snapshot cannot be reached under energy/draw rules")
    return {"board": board, "types": types, "joint": joint, "independent": independent, "rules": rules, "turn": turn}


def compile_game(model, reduce=True, pool_types=True):
    start = time.perf_counter()
    parsed = parse_model(model)
    types, union, union_lookup, assignment = [[], []], [[], []], [{}, {}], [[], []]
    for p, originals in enumerate(parsed["types"]):
        pooled = {}
        for original in originals:
            groups = {}
            for action, power in original["actions"]:
                k = power if reduce else action
                if k not in union_lookup[p]:
                    union_lookup[p][k] = len(union[p])
                    union[p].append(power)
                groups.setdefault(union_lookup[p][k], []).append(action)
            ids = tuple(sorted(groups))
            ck = ids if parsed["independent"] and reduce and pool_types else ("original", original["key"])
            if ck not in pooled:
                pooled[ck] = len(types[p])
                types[p].append({"ids": ids, "weight": 0.0})
            ci = pooled[ck]
            types[p][ci]["weight"] += original["weight"]
            assignment[p].append((ci, groups))
    matrix = np.array([[terminal(parsed["board"], a, b) for b in union[1]] for a in union[0]], dtype=np.float64)
    power_union_sizes=list(map(len,union))
    cells_before_outcomes=int(matrix.size)
    if reduce:
        representatives,mapping=[[],[]],[[],[]]
        for p in range(2):
            signatures={}
            for i in range(len(union[p])):
                signature=tuple(matrix[i,:] if p==0 else matrix[:,i])
                if signature not in signatures:
                    signatures[signature]=len(representatives[p]);representatives[p].append(i)
                mapping[p].append(signatures[signature])
        matrix=matrix[np.ix_(representatives[0],representatives[1])]
        union=[[union[p][i] for i in representatives[p]] for p in range(2)]
        types=[[],[]]
        for p,originals in enumerate(parsed["types"]):
            pooled={}
            for i,original in enumerate(originals):
                groups={}
                for old,members in assignment[p][i][1].items():
                    groups.setdefault(mapping[p][old],[]).extend(members)
                ids=tuple(sorted(groups))
                ck=ids if parsed["independent"] and pool_types else ("original",original["key"])
                if ck not in pooled:
                    pooled[ck]=len(types[p]);types[p].append({"ids":ids,"weight":0.0})
                ci=pooled[ck];types[p][ci]["weight"]+=original["weight"];assignment[p][i]=(ci,groups)
    joint = [(assignment[0][a][0], assignment[1][b][0], w) for a, b, w in parsed["joint"]]
    return {**parsed, "original_types": parsed["types"], "types": types, "union": union, "matrix": matrix,
            "joint": joint, "assignment": assignment,"powerUnionSizes":power_union_sizes,"cellsBeforeOutcomeSharing":cells_before_outcomes,"compileMs": (time.perf_counter() - start) * 1000}


def make_lp(game, player):
    own, opp = game["types"][player], game["types"][1-player]
    matrix = game["matrix"] if player == 0 else -game["matrix"].T
    estimated=sum(len(t["ids"]) for t in opp)*matrix.shape[0] if game["independent"] else sum(len(t["ids"]) for t in own)*sum(len(t["ids"]) for t in opp)
    if estimated>8000000:
        raise RuntimeError("LP construction budget exceeded; no private types or actions were pruned")
    offsets, size = [], 0
    for t in own:
        offsets.append(size)
        size += len(t["ids"])
    er, ec, ev, rhs, ur, uc, uv = [], [], [], [], [], [], []

    def eq(entries, value):
        row = len(rhs)
        for col, x in entries:
            if x:
                er.append(row); ec.append(col); ev.append(x)
        rhs.append(value)

    for i, t in enumerate(own):
        eq([(offsets[i]+a, 1.0) for a in range(len(t["ids"]))], 1.0)
    if game["independent"]:
        qoffset = size
        size += len(game["union"][player])
        incident = [[] for _ in game["union"][player]]
        for i, t in enumerate(own):
            for j, a in enumerate(t["ids"]):
                incident[a].append((offsets[i]+j, -t["weight"]))
        for a in range(len(incident)):
            eq([(qoffset+a, 1.0)] + incident[a], 0.0)
    voffset = size
    size += len(opp)
    conditional = [dict() for _ in opp]
    if not game["independent"]:
        for a, b, w in game["joint"]:
            i, j = (a,b) if player == 0 else (b,a)
            conditional[j][i] = conditional[j].get(i, 0.0) + w/opp[j]["weight"]
    row = 0
    for j, t in enumerate(opp):
        for b in t["ids"]:
            ur.append(row); uc.append(voffset+j); uv.append(1.0)
            if game["independent"]:
                for a in range(matrix.shape[0]):
                    v = -float(matrix[a,b])
                    if v:
                        ur.append(row); uc.append(qoffset+a); uv.append(v)
            else:
                for i, w in conditional[j].items():
                    for k, a in enumerate(own[i]["ids"]):
                        v = -w * float(matrix[a,b])
                        if v:
                            ur.append(row); uc.append(offsets[i]+k); uv.append(v)
            row += 1
    aub = coo_matrix((uv,(ur,uc)),shape=(row,size)).tocsr()
    aeq = coo_matrix((ev,(er,ec)),shape=(len(rhs),size)).tocsr()
    objective = np.zeros(size)
    for j, t in enumerate(opp):
        objective[voffset+j] = -t["weight"]
    bounds = [(0.0, 1.0)] * voffset + [(-1.0, 1.0)] * len(opp)
    return {"c": objective, "A_ub": aub, "b_ub": np.zeros(row), "A_eq": aeq, "b_eq": np.array(rhs), "bounds": bounds}, offsets, {"variables": size, "equalities": len(rhs), "inequalities": row, "nonzeros": aub.nnz+aeq.nnz}


def lift(game, class_policies):
    result = [[], []]
    for p, originals in enumerate(game["original_types"]):
        for i, t in enumerate(originals):
            ci, groups = game["assignment"][p][i]
            policy = class_policies[p][ci]
            probabilities = {}
            for j, a in enumerate(game["types"][p][ci]["ids"]):
                for action in groups[a]:
                    probabilities[action] = float(policy[j]) / len(groups[a])
            result[p].append({"typeKey": t["key"], "probabilities": probabilities})
    return result


def verify(model, policies, tolerance=1e-6, include_actions=False):
    game = parse_model(model)
    types, weights, policy = game["types"], [], [[], []]
    for p in range(2):
        supplied = {t["typeKey"]:t["probabilities"] for t in policies[p]}
        for t in types[p]:
            actions = dict(t["actions"])
            row = supplied[t["key"]]
            if any(a not in actions or not math.isfinite(v) or v < 0 for a,v in row.items()) or abs(sum(row.values())-1)>1e-8:
                raise ValueError("Invalid realized private-type policy")
            d = {}
            for a,v in row.items():
                d[actions[a]] = d.get(actions[a],0.0)+v
            policy[p].append(d)
    best, profile, rows = [0.0,0.0], [0.0,0.0], [[],[]]
    max_gain = 0.0
    for p in range(2):
        common_distribution = None
        value_cache = {}
        for i,t in enumerate(types[p]):
            opp_weights = [o["weight"] for o in types[1-p]] if game["independent"] else [0.0]*len(types[1-p])
            if not game["independent"]:
                for a,b,w in game["joint"]:
                    ids = (a,b)
                    if ids[p] == i:
                        opp_weights[ids[1-p]] += w/t["weight"]
            if common_distribution is not None:
                distribution = common_distribution
            else:
                distribution = {}
                for j,w in enumerate(opp_weights):
                    for power,v in policy[1-p][j].items():
                        distribution[power] = distribution.get(power,0.0)+w*v
                if game["independent"]:
                    common_distribution = distribution
            values = {}
            for a,power in t["actions"]:
                cache_key = power if game["independent"] else (i,power)
                if cache_key not in value_cache:
                    value_cache[cache_key] = sum(w*(terminal(game["board"],power,b) if p==0 else -terminal(game["board"],b,power)) for b,w in distribution.items())
                values[a] = value_cache[cache_key]
            row = {"typeKey":t["key"],"weight":t["weight"],"bestValue":max(values.values())}
            own = next(x["probabilities"] for x in policies[p] if x["typeKey"]==t["key"])
            row["value"] = sum(own.get(a,0.0)*v for a,v in values.items())
            row["gain"] = row["bestValue"]-row["value"]
            if include_actions:
                row["actions"] = {a:{"ev":v,"frequency":own.get(a,0.0),"evLoss":max(0.0,row["bestValue"]-v)} for a,v in values.items()}
            max_gain = max(max_gain,row["gain"])
            best[p] += t["weight"]*row["bestValue"]
            profile[p] += t["weight"]*row["value"]
            rows[p].append(row)
    if abs(profile[0]+profile[1])>1e-8:
        raise ValueError("Zero-sum evaluation mismatch")
    gap = max(0.0,best[0]+best[1])
    return {"value":profile[0],"upper":best[0],"lower":-best[1],"nashGap":gap,"exploitability":gap/2,
            "maxConditionalGain":max_gain,"validated":gap<=tolerance and max_gain<=tolerance,"tolerance":tolerance,"rows":rows,
            "method":"Independent Python individual-card enumeration and exhaustive information-constrained best responses",
            "scope":"Supplied conditional final-turn game; not a full-game certificate"}


GAME_CACHE = {}


def rational_certificate(model, policies, denominator_limit=10000):
    """Exact bounds for small rationalized policies, not a claim about LP arithmetic."""
    game = parse_model(model)
    types = game["types"]
    if max(map(len,types))>16 or sum(len(t["actions"]) for side in types for t in side)>2000:
        raise ValueError("Rational verification is restricted to small controls")
    indexes = [{t["key"]:i for i,t in enumerate(side)} for side in types]
    def raw_key(t):
        return type_key(counts(t["hand"]),counts(t["remaining"]),t.get("observations",""))
    joint = {}
    if game["independent"]:
        ws = []
        for p in range(2):
            w = [Fraction(0)]*len(types[p])
            for t in model["ranges"][p]:
                mass=Fraction(str(t.get("weight",1)))
                if mass:w[indexes[p][raw_key(t)]]+=mass
            total=sum(w);ws.append([x/total for x in w])
        joint={(i,j):a*b for i,a in enumerate(ws[0]) for j,b in enumerate(ws[1]) if a*b}
    else:
        total=sum(Fraction(str(c.get("weight",1))) for c in model["cases"])
        for c in model["cases"]:
            mass=Fraction(str(c.get("weight",1)))
            if not mass:continue
            ids=tuple(indexes[p][raw_key(t)] for p,t in enumerate(c["players"]))
            joint[ids]=joint.get(ids,Fraction(0))+mass/total
    realized=[[],[]];adjustment=0.0
    for p in range(2):
        supplied={x["typeKey"]:x["probabilities"] for x in policies[p]}
        for t in types[p]:
            valid=dict(t["actions"]);row={}
            for a,v in supplied[t["key"]].items():
                if a not in valid or v<0:raise ValueError("Illegal rational policy")
                f=Fraction(v).limit_denominator(denominator_limit)
                adjustment=max(adjustment,abs(float(f)-v))
                if f:row[a]=f
            if sum(row.values())!=1:raise ValueError("Rounded rational policy does not sum to one")
            realized[p].append(row)
    best=[Fraction(0),Fraction(0)];profile=[Fraction(0),Fraction(0)]
    for p in range(2):
        for i,t in enumerate(types[p]):
            values=[]
            for a,apower in t["actions"]:
                q=Fraction(0)
                for (i0,i1),mass in joint.items():
                    ids=(i0,i1)
                    if ids[p]!=i:continue
                    other=ids[1-p];power_map=dict(types[1-p][other]["actions"])
                    for b,prob in realized[1-p][other].items():
                        payoff=terminal(game["board"],apower,power_map[b]) if p==0 else -terminal(game["board"],power_map[b],apower)
                        q+=mass*prob*payoff
                values.append(q);profile[p]+=realized[p][i].get(a,0)*q
            best[p]+=max(values)
    return {"upper":str(best[0]),"lower":str(-best[1]),"value":str(profile[0]),"nashGap":str(best[0]+best[1]),
            "exactEquilibrium":best[0]+best[1]==0,"maximumProbabilityAdjustment":adjustment,
            "scope":"Exact Fraction bounds for the rationalized candidate under original decimal input priors; not a rational-arithmetic LP solve"}


def solve(model, reduce=True, pool_types=True, seconds=10.0, tolerance=1e-6, include_actions=False):
    begin = time.perf_counter()
    cache_key = json.dumps([model,reduce,pool_types],sort_keys=True)
    reused = cache_key in GAME_CACHE
    if not reused:
        compile_start = time.perf_counter()
        game = compile_game(model,reduce,pool_types)
        problems = [make_lp(game,p) for p in range(2)]
        if len(GAME_CACHE)>=4:
            GAME_CACHE.clear()
        GAME_CACHE[cache_key] = (game,problems)
        compilation_ms = (time.perf_counter()-compile_start)*1000
    else:
        game,problems = GAME_CACHE[cache_key]
        compilation_ms = 0.0
    opt_start, class_policies, statuses = time.perf_counter(), [[],[]], []
    for p in range(2):
        problem,offsets,stats = problems[p]
        remaining = max(0.001,seconds-(time.perf_counter()-opt_start))
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore",message="Unrecognized options detected.*",category=OptimizeWarning)
            result = linprog(**problem,method="highs-ds",options={"time_limit":remaining,"threads":1,"primal_feasibility_tolerance":1e-9,"dual_feasibility_tolerance":1e-9})
        statuses.append({"status":result.status,"success":bool(result.success),"message":result.message,"iterations":int(result.nit or 0),**stats})
        for i,t in enumerate(game["types"][p]):
            xs = np.maximum(0.0,result.x[offsets[i]:offsets[i]+len(t["ids"])]) if result.x is not None else np.ones(len(t["ids"]))
            if xs.sum()<=0:
                xs = np.ones(len(t["ids"]))
            class_policies[p].append(xs/xs.sum())
    optimization_ms = (time.perf_counter()-opt_start)*1000
    policies = lift(game,class_policies)
    vstart = time.perf_counter()
    certificate = verify(model,policies,tolerance,include_actions)
    verified_ms = (time.perf_counter()-vstart)*1000
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if sys.platform!="darwin":
        peak *= 1024
    return {"algorithm":"Two independent behavioral Bayesian-game LPs, SciPy/HiGHS dual simplex", "reusedCompiledGame":reused,
            "compileMs":compilation_ms,"optimizationMs":optimization_ms,"verificationMs":verified_ms,"totalMs":(time.perf_counter()-begin)*1000,
            "peakRssBytes":peak,"rssScope":"Worker lifetime high-water mark; isolate workers for per-case peaks", "statuses":statuses,
            "stats":{"originalTypes":[len(x) for x in game["original_types"]],"strategyClasses":[len(x) for x in game["types"]],
                     "powerUnionSizes":game["powerUnionSizes"],"cellsBeforeOutcomeSharing":game["cellsBeforeOutcomeSharing"],"unionActions":[len(x) for x in game["union"]],"payoffCells":int(game["matrix"].size),"classActionEntries":[sum(len(t["ids"]) for t in side) for side in game["types"]]},
            "policies":policies,"certificate":certificate}


def control():
    # Card-free public two-stage game: exact backwards solution of 16 suffixes.
    allocations = lambda n:[v for v in itertools.product(range(n+1),repeat=3) if sum(v)<=n]
    first,second = allocations(1),allocations(2)
    board = [[[],[],[]],[[],[],[]]]
    def matrix_value(matrix):
        n,m = matrix.shape
        c=np.r_[np.zeros(n),-1.0]
        aub=np.c_[-matrix.T,np.ones(m)]
        result=linprog(c,A_ub=aub,b_ub=np.zeros(m),A_eq=np.array([[1.0]*n+[0.0]]),b_eq=[1.0],bounds=[(0,1)]*n+[(-1,1)],method='highs-ds')
        if not result.success:raise RuntimeError(result.message)
        return float(result.x[-1]) or 0.0
    root=np.zeros((len(first),len(first)))
    for i,a in enumerate(first):
        for j,b in enumerate(first):
            matrix=np.array([[terminal(board,tuple(a[l]+x[l] for l in range(3)),tuple(b[l]+y[l] for l in range(3))) for y in second] for x in second],dtype=float)
            root[i,j]=matrix_value(matrix)
    target=(1,1,1)
    all_final=allocations(3)
    upper=max(terminal(board,a,target) for a in all_final)
    lower=min(terminal(board,target,b) for b in all_final)
    return {"rootValue":matrix_value(root),"balancedPolicyUpper":upper,"balancedPolicyLower":lower,
            "openingDistributionRequired":False,"suffixGames":16,"rootActions":4,"suffixActions":10,
            "scope":"Separate card-free control, one point then two; does not solve hidden-card Snap"}


def handle(request):
    op=request.get("op","solve")
    if op=="control":return control()
    if op=="rational":return rational_certificate(request["model"],request["policies"])
    if op=="verify":return verify(request["model"],request["policies"],request.get("tolerance",1e-6),request.get("includeActions",False))
    result = solve(request["model"],request.get("reduce",True),request.get("poolTypes",True),request.get("seconds",10),request.get("tolerance",1e-6),request.get("includeActions",False))
    if request.get("summaryOnly"):
        result.pop("policies",None)
        result["certificate"].pop("rows",None)
    return result


if __name__=="__main__":
    if "--server" in sys.argv:
        print(json.dumps({"ready":True,"python":platform.python_version(),"scipy":scipy.__version__,"numpy":np.__version__,"platform":platform.platform(),"threadsRequested":1}),flush=True)
        for line in sys.stdin:
            try:print(json.dumps({"ok":True,"result":handle(json.loads(line))}),flush=True)
            except Exception as exc:print(json.dumps({"ok":False,"error":str(exc)}),flush=True)
    else:
        print(json.dumps(handle(json.load(sys.stdin))))
