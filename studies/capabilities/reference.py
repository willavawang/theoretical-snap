#!/usr/bin/env python3
"""Study-only independent effect evaluator, terminal LP, and robust-policy controls.
HiGHS floating-point bounds are checked numerically, not rational certificates.
This module imports the existing LP constructor, never the JS payoff compiler.
"""
from __future__ import annotations
import copy
import importlib.util
import json
import math
import os
from pathlib import Path
import resource
import sys
import time
import warnings

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
import numpy as np
from scipy.optimize import linprog, OptimizeWarning
from scipy.sparse import coo_matrix, vstack, csr_matrix

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("numerical_turn6_reference", ROOT / "scripts/solver/turn6_reference.py")
R = importlib.util.module_from_spec(spec)
spec.loader.exec_module(R)
TOL = 1e-6


def peak_bytes():
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(peak if sys.platform == "darwin" else peak * 1024)


def check_lp_bound(problem, result):
    """Numerical lower bound from any sign-valid inequality/equality multipliers.
    Residual stationarity is minimized over the finite variable bounds, rather
    than assuming solver-reported optimality or exact zero reduced costs.
    """
    y = np.minimum(np.asarray(result.ineqlin.marginals), 0.)
    z = np.asarray(result.eqlin.marginals)
    c = np.asarray(problem["c"])
    residual = c - problem["A_ub"].T@y - problem["A_eq"].T@z
    lower = np.array([b[0] for b in problem["bounds"]], dtype=float)
    upper = np.array([b[1] for b in problem["bounds"]], dtype=float)
    if not np.all(np.isfinite(lower)) or not np.all(np.isfinite(upper)):
        raise ValueError("Study bound checker requires finite variable bounds")
    # y <= 0 and A_ub*x <= b imply y*A_ub*x >= y*b.
    bound = float(problem["b_ub"]@y + problem["b_eq"]@z +
                  np.minimum(residual*lower,residual*upper).sum())
    primal = float(c@result.x)
    violation = max(0., float(np.max(problem["A_ub"]@result.x-problem["b_ub"],initial=0.)),
                    float(np.max(np.abs(problem["A_eq"]@result.x-problem["b_eq"]),initial=0.)),
                    float(np.max(lower-result.x,initial=0.)),float(np.max(result.x-upper,initial=0.)))
    gap = primal-bound
    if violation > 1e-7 or gap < -1e-7 or gap > 1e-7:
        raise RuntimeError("Independent numerical LP primal/dual bound check failed")
    return {"primalObjective":primal,"dualLowerBound":bound,"gap":max(0.,gap),
            "maxPrimalViolation":violation,"validated":True,
            "scope":"Floating-point bound recomputation with residuals minimized over finite bounds; not an exact rational proof"}


def optimize(problem, objective=None):
    if peak_bytes() > 2 * 1024**3:
        raise RuntimeError("2 GiB Python high-water budget exceeded; no pruning")
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message="Unrecognized options detected.*", category=OptimizeWarning)
        actual = {**problem, **({"c": objective} if objective is not None else {})}
        result = linprog(**actual,
                         method="highs-ds", options={"time_limit": 10.0, "threads": 1,
                         "primal_feasibility_tolerance": 1e-9, "dual_feasibility_tolerance": 1e-9})
    if not result.success:
        raise RuntimeError("Study LP stopped without certification: " + result.message)
    result["studyBoundCheck"] = check_lp_bound(actual,result)
    return result


def effect_key(a):
    return json.dumps({"move": a.get("move"), "plays": [
        {k: p.get(k, 0) for k in ("lane", "power", "spawnOthers", "destroyAtLeast")}
        for p in a.get("plays", [])]}, sort_keys=True)


def terminal(g, a, b):
    """Rebuild revealed bodies, staged moves, and ordered effects from source."""
    board = [[list(lane) for lane in side] for side in g["board"]]
    pair = (a, b)
    for player, action in enumerate(pair):
        m = action.get("move")
        if m:
            source, target = board[player][m["from"]], board[player][m["to"]]
            if m["power"] not in source or len(target) >= 4:
                raise ValueError("Illegal staged move")
            source.remove(m["power"])
            target.append(m["power"])
    for player in (g["priority"], 1-g["priority"]):
        for play in pair[player].get("plays", []):
            lane = play["lane"]
            if len(board[player][lane]) >= 4:
                raise ValueError("Illegal play into full lane")
            board[player][lane].append(play["power"])
            if play.get("spawnOthers", 0):
                for dest in range(3):
                    if dest != lane and len(board[player][dest]) < 4:
                        board[player][dest].append(play["spawnOthers"])
            if play.get("destroyAtLeast", 0):
                enemy = board[1-player][lane]
                eligible = [i for i, power in enumerate(enemy) if power >= play["destroyAtLeast"]]
                if len(eligible) > 1:
                    raise ValueError("Multiple destruction targets outside bounded study")
                if eligible:
                    del enemy[eligible[0]]
    differences = [sum(board[0][lane])-sum(board[1][lane]) for lane in range(3)]
    lane_result = sum((d > 0)-(d < 0) for d in differences)
    score = lane_result or sum(differences)
    return (score > 0)-(score < 0)


def parse(g):
    if g.get("schema") != "snap-capability-study-1" or "cases" in g or g["priority"] not in (0, 1):
        raise ValueError("Declared independent effect game required")
    if len(g["board"]) != 2 or any(len(side) != 3 for side in g["board"]):
        raise ValueError("Board shape")
    for side in g["board"]:
        for lane in side:
            if len(lane) > 4 or any(type(n) is not int or n < 0 for n in lane):
                raise ValueError("Body powers/capacity")
    if len(g["ranges"]) != 2:
        raise ValueError("Two private ranges required")
    originals = [[], []]
    for p, side in enumerate(g["ranges"]):
        if not 0 < len(side) <= 128 or len({t["id"] for t in side}) != len(side):
            raise ValueError("Type count/identities")
        mass = sum(t["weight"] for t in side)
        for t in side:
            if not math.isfinite(t["weight"]) or t["weight"] <= 0 or not t["actions"]:
                raise ValueError("Type weight/actions")
            if len({a["id"] for a in t["actions"]}) != len(t["actions"]):
                raise ValueError("Action identities")
            originals[p].append({**t, "key": t["id"], "weight": t["weight"]/mass})
    return originals


def compile_game(g, reduce=True, pool_types=True):
    start = time.perf_counter()
    original = parse(g)
    union, mapping, assignment = [[], []], [{}, {}], [[], []]
    for p, side in enumerate(original):
        for t in side:
            groups = {}
            for a in t["actions"]:
                key = effect_key(a) if reduce else (t["id"], a["id"])
                if key not in mapping[p]:
                    mapping[p][key] = len(union[p])
                    union[p].append(a)
                groups.setdefault(mapping[p][key], []).append(a["id"])
            assignment[p].append(groups)
    if len(union[0]) * len(union[1]) > 500000:
        raise RuntimeError("Study payoff-pair budget exceeded")
    matrix = np.array([[terminal(g, a, b) for b in union[1]] for a in union[0]], dtype=np.float64)
    before = list(map(len, union))
    if reduce:
        reps, remap = [[], []], [[], []]
        for p in (0, 1):
            seen = {}
            for i in range(len(union[p])):
                key = tuple(matrix[i, :] if p == 0 else matrix[:, i])
                if key not in seen:
                    seen[key] = len(reps[p])
                    reps[p].append(i)
                remap[p].append(seen[key])
        matrix = matrix[np.ix_(reps[0], reps[1])]
        union = [[union[p][i] for i in reps[p]] for p in (0, 1)]
        for p in (0, 1):
            new_assign = []
            for old in assignment[p]:
                groups = {}
                for i, ids in old.items():
                    groups.setdefault(remap[p][i], []).extend(ids)
                new_assign.append(groups)
            assignment[p] = new_assign
    classes, lifted = [[], []], [[], []]
    for p, side in enumerate(original):
        seen = {}
        for i, t in enumerate(side):
            ids = tuple(sorted(assignment[p][i]))
            key = ids if reduce and pool_types else ("type", i)
            if key not in seen:
                seen[key] = len(classes[p])
                classes[p].append({"ids": ids, "weight": 0.0})
            ci = seen[key]
            classes[p][ci]["weight"] += t["weight"]
            lifted[p].append((ci, assignment[p][i]))
    return {"source": g, "original_types": original, "types": classes, "union": union,
            "assignment": lifted, "matrix": matrix, "independent": True, "joint": [],
            "compileMs": 1000*(time.perf_counter()-start),
            "stats": {"originalTypes": list(map(len, original)), "strategyTypes": list(map(len, classes)),
                      "unionBeforeSharing": before, "unionAfterSharing": list(map(len, union)),
                      "payoffCells": int(matrix.size),
                      "originalActionEntries": [sum(len(t["actions"]) for t in side) for side in original],
                      "strategyEntries": [sum(len(t["ids"]) for t in side) for side in classes]}}


def verify(g, policies, include_actions=True):
    originals = parse(g)
    lookup = [{t["typeKey"]: t["probabilities"] for t in side} for side in policies]
    for p, side in enumerate(originals):
        if len(lookup[p]) != len(side) or len(policies[p]) != len(side):
            raise ValueError("Policy type identities")
        for t in side:
            row = lookup[p][t["key"]]
            ids = {a["id"] for a in t["actions"]}
            if any(a not in ids or not math.isfinite(v) or v < 0 for a, v in row.items()) or abs(sum(row.values())-1) > 1e-8:
                raise ValueError("Illegal policy")
    best, profile, rows, max_gain = [0., 0.], [0., 0.], [[], []], 0.
    for p, side in enumerate(originals):
        # Cache by source effect, but never optimize separately for an unknown hand.
        cache = {}
        for t in side:
            own = lookup[p][t["key"]]
            acts = []
            for a in t["actions"]:
                key = effect_key(a)
                if key not in cache:
                    cache[key] = sum(u["weight"]*prob * (terminal(g, a, b) if p == 0 else -terminal(g, b, a))
                        for u in originals[1-p] for b in u["actions"]
                        if (prob := lookup[1-p][u["key"]].get(b["id"], 0.)) > 0)
                acts.append({"actionId": a["id"], "ev": cache[key], "frequency": own.get(a["id"], 0.)})
            br = max(a["ev"] for a in acts)
            value = sum(a["frequency"]*a["ev"] for a in acts)
            gain = max(0., br-value)
            best[p] += t["weight"]*br
            profile[p] += t["weight"]*value
            max_gain = max(max_gain, gain)
            rows[p].append({"typeKey": t["key"], "weight": t["weight"], "value": value, "bestValue": br,
                            "gain": gain, **({"actions": [{**a, "evLoss": max(0., br-a["ev"])} for a in acts]} if include_actions else {})})
    gap = max(0., sum(best))
    if abs(sum(profile)) > 1e-8:
        raise ValueError("Zero sum check")
    return {"value": profile[0], "lower": -best[1], "upper": best[0], "nashGap": gap,
            "maxConditionalGain": max_gain, "validated": gap <= TOL and max_gain <= TOL,
            "tolerance": TOL, "rows": rows}


def solve(g, pool_types=True, include_actions=True):
    start = time.perf_counter()
    game = compile_game(g, pool_types=pool_types)
    problems, policies, statuses = [R.make_lp(game, p) for p in (0, 1)], [[], []], []
    prep = time.perf_counter()
    results = []
    for p, (problem, offsets, stats) in enumerate(problems):
        result = optimize(problem)
        results.append(result)
        statuses.append({**stats, "iterations": int(result.nit or 0), "success": True, "lpBoundCheck": result["studyBoundCheck"]})
        for i, t in enumerate(game["types"][p]):
            x = np.maximum(0., result.x[offsets[i]:offsets[i]+len(t["ids"])])
            policies[p].append(x/x.sum())
    optimized = time.perf_counter()
    realized = R.lift(game, policies)
    certificate = verify(g, realized, include_actions)
    end = time.perf_counter()
    if not certificate["validated"]:
        raise RuntimeError("Independent original-menu best response exceeds tolerance")
    report = {"stats": game["stats"], "statuses": statuses, "policies": realized, "certificate": certificate,
              "compileMs": game["compileMs"], "buildMs": 1000*(prep-start)-game["compileMs"],
              "optimizationMs": 1000*(optimized-prep), "verificationMs": 1000*(end-optimized),
              "totalMs": 1000*(end-start), "peakRssBytes": peak_bytes()}
    return report, {"game": game, "problems": problems, "results": results}


def security_value(g, our_policy):
    """Opponent's exhaustive information-constrained response to a fixed policy.
    Average over our hidden type BEFORE choosing each opponent-type response.
    """
    ts = parse(g)
    lookup = {t["typeKey"]: t["probabilities"] for t in our_policy}
    if set(lookup) != {t["key"] for t in ts[0]}:
        raise ValueError("Shared own private-type keys required")
    result, rows = 0., []
    for u in ts[1]:
        values = [sum(t["weight"] * lookup[t["key"]].get(a["id"], 0.) * terminal(g, a, b)
                    for t in ts[0] for a in t["actions"]) for b in u["actions"]]
        worst = min(values)
        result += u["weight"]*worst
        rows.append({"typeKey": u["key"], "value": worst,
                     "bestResponseActions": [b["id"] for b, v in zip(u["actions"], values) if v <= worst+1e-8]})
    return {"value": result, "opponentResponses": rows}


def robust_policy(games, values):
    """One own policy minimizing worst security regret over declared games."""
    started = time.perf_counter()
    own = parse(games[0])[0]
    if any([(t["key"], [a["id"] for a in t["actions"]], t["weight"]) for t in parse(g)[0]] !=
           [(t["key"], [a["id"] for a in t["actions"]], t["weight"]) for t in own] for g in games):
        raise ValueError("Robust comparison must keep our own game fixed")
    offsets, n = [], 0
    for t in own:
        offsets.append(n)
        n += len(t["actions"])
    voff = []
    for g in games:
        voff.append(n)
        n += len(parse(g)[1])
    regret = n
    n += 1
    rr, cc, vv, rhs = [], [], [], []
    def ub(entries, value):
        row = len(rhs)
        for col, v in entries:
            if v:
                rr.append(row); cc.append(col); vv.append(v)
        rhs.append(value)
    for k, (g, value) in enumerate(zip(games, values)):
        opp = parse(g)[1]
        for j, u in enumerate(opp):
            for b in u["actions"]:
                entries = [(voff[k]+j, 1.)]
                entries += [(offsets[i]+h, -t["weight"]*terminal(g, a, b))
                            for i, t in enumerate(own) for h, a in enumerate(t["actions"])]
                ub(entries, 0.)
        ub([(voff[k]+j, -u["weight"]) for j, u in enumerate(opp)]+[(regret, -1.)], -value)
    er, ec, ev = [], [], []
    for i, t in enumerate(own):
        for j in range(len(t["actions"])):
            er.append(i); ec.append(offsets[i]+j); ev.append(1.)
    objective = np.zeros(n); objective[regret] = 1.
    problem = {"c": objective, "A_ub": coo_matrix((vv,(rr,cc)),shape=(len(rhs),n)).tocsr(), "b_ub": np.array(rhs),
               "A_eq": coo_matrix((ev,(er,ec)),shape=(len(own),n)).tocsr(), "b_eq": np.ones(len(own)),
               "bounds": [(0.,1.)]*voff[0] + [(-1.,1.)]*(regret-voff[0]) + [(0.,2.)]}
    result = optimize(problem)
    policy = []
    for i, t in enumerate(own):
        x = np.maximum(0., result.x[offsets[i]:offsets[i]+len(t["actions"])])
        x /= x.sum()
        policy.append({"typeKey": t["key"], "probabilities": {a["id"]: float(z) for a,z in zip(t["actions"],x)}})
    security = [security_value(g, policy)["value"] for g in games]
    losses = [max(0., v-s) for v, s in zip(values, security)]
    if max(losses) > result.fun+TOL:
        raise RuntimeError("Robust policy independent regret verification failed")
    return {"regret": float(result.fun), "verifiedMaxRegret": max(losses), "lpBoundCheck": result["studyBoundCheck"], "securityValues": security,
            "losses": losses, "policy": policy, "variables": n, "inequalities": len(rhs),
            "totalMs": 1000*(time.perf_counter()-started), "validated": True}


def pair_interval(solved, own_type, action_a, action_b, epsilon=1e-9):
    """EV(a)-EV(b) over all epsilon-optimal opponent policies, not one mix."""
    game = solved["game"]
    g = game["source"]
    own = next(t for t in parse(g)[0] if t["key"] == own_type)
    acts = {a["id"]: a for a in own["actions"]}
    a, b = acts[action_a], acts[action_b]
    problem, offsets, _ = solved["problems"][1]
    # Existing opponent LP minimizes our upper bound; its optimal objective is v0.
    face = {**problem, "A_ub": vstack([problem["A_ub"], csr_matrix(problem["c"].reshape(1,-1))]).tocsr(),
            "b_ub": np.append(problem["b_ub"], solved["results"][1].fun+epsilon)}
    objective = np.zeros(len(problem["c"]))
    for j, t in enumerate(game["types"][1]):
        for k, cid in enumerate(t["ids"]):
            opp = game["union"][1][cid]
            objective[offsets[j]+k] = t["weight"]*(terminal(g,a,opp)-terminal(g,b,opp))
    lo, hi = optimize(face, objective), optimize(face, -objective)
    low, high = float(lo.fun), float(-hi.fun)
    if low > high+TOL:
        raise RuntimeError("EV interval inverted")
    return {"min": low, "max": high, "epsilon": epsilon,
            "lpBoundChecks":[lo["studyBoundCheck"],hi["studyBoundCheck"]],
            "scope": "All opponent policies feasible in the epsilon-optimal terminal LP; float tolerances apply"}
