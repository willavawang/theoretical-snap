#!/usr/bin/env python3
"""Fixed bounded capability-sensitivity pilot. Does not train/modify a provider."""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time
import numpy as np
import scipy
import reference as E

ROOT = Path(__file__).resolve().parents[2]
DELTA = .02


class JS:
    def __init__(self):
        self.process = subprocess.Popen(["node", "studies/capabilities/worker.cjs"], cwd=ROOT,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        self.ready = json.loads(self.process.stdout.readline())
        self.peak = 0
    def request(self, **request):
        self.process.stdin.write(json.dumps(request, separators=(",",":"))+"\n")
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError("Independent JS evaluator exited")
        answer = json.loads(line)
        if not answer["ok"]:
            raise RuntimeError(answer["error"])
        self.peak = max(self.peak, answer["peakRssBytes"])
        if self.peak+E.peak_bytes() > 2*1024**3:
            raise RuntimeError("Combined process high-water sum exceeds 2 GiB; no pruning")
        return answer["result"]
    def close(self):
        self.process.stdin.close()
        self.process.wait(timeout=10)
        if self.process.returncode:
            raise RuntimeError("JS evaluator failed")


def compare_checks(a, b, actions=True):
    for key in ("value","lower","upper","nashGap","maxConditionalGain"):
        if abs(a[key]-b[key]) > 1e-8:
            raise RuntimeError("Independent checker mismatch: "+key)
    if not b["validated"]:
        raise RuntimeError("JS original-action deviations not within tolerance")
    if actions:
        for p in (0,1):
            for x,y in zip(a["rows"][p], b["rows"][p]):
                if x["typeKey"] != y["typeKey"]:
                    raise RuntimeError("Type-key disagreement")
                ax = x["actions"]
                ax = {z["actionId"]:z for z in ax} if isinstance(ax,list) else ax
                by = {z["actionId"]:z for z in y["actions"]}
                if set(ax) != set(by):
                    raise RuntimeError("Original legal-action coverage mismatch")
                if any(abs(ax[k]["ev"]-by[k]["ev"]) > 1e-8 for k in ax):
                    raise RuntimeError("Original-action EV disagreement")


def transfer(games, results):
    out = {}
    for source, result in results.items():
        out[source] = {}
        for target, g in games.items():
            security = E.security_value(g, result["policies"][0])
            value = results[target]["certificate"]["value"]
            out[source][target] = {"securityValue":security["value"],
                                  "securityLoss":max(0.,value-security["value"])}
    return out


def compact(result, js_check):
    # Original own-action EVs and full realized profile are retained for replay.
    check = copy.deepcopy(js_check)
    for row in check["rows"][1]:
        row.pop("actions",None)
    return {k:v for k,v in result.items() if k != "certificate"} | {"certificate":check}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="studies/capabilities/results")
    parser.add_argument("--log-report", action="store_true")
    args = parser.parse_args()
    output = Path(args.out)
    output.mkdir(parents=True, exist_ok=True)
    start = time.perf_counter()
    def budget():
        if time.perf_counter()-start > 900:
            raise RuntimeError("15-minute study budget exceeded")
    fixtures = json.loads(subprocess.check_output(["node","studies/capabilities/worker.cjs","--fixtures"],cwd=ROOT,text=True))
    js = JS()
    report = {"schema":"snap-capability-sensitivity-1", "scope":"Conditional model-sensitivity pilot; not learner transfer or full-game equilibrium",
              "sourceCommit":subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip(),
              "host":{"platform":platform.platform(),"machine":platform.machine(),"cpuCount":os.cpu_count(),
                      "python":platform.python_version(),"numpy":np.__version__,"scipy":scipy.__version__,**js.ready,
                      "runner":os.environ.get("RUNNER_NAME","local"),
                      "numericThreads":{k:os.environ.get(k) for k in ("OMP_NUM_THREADS","OPENBLAS_NUM_THREADS","MKL_NUM_THREADS")}},
              "conventions":{"outcomeUtility":[-1,0,1],"validationTolerance":E.TOL,"materiality":DELTA,
                             "rawCrossGameEVIsNotTeachingQuality":True,
                             "privateRanges":"Independent declared menu priors; opponent strategically optimizes"},
              "sourceHashes":{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in [ROOT/"studies/capabilities/fixtures.cjs",ROOT/"studies/capabilities/model.cjs",
                                       ROOT/"studies/capabilities/reference.py",ROOT/"studies/capabilities/run.py",
                                       ROOT/"scripts/solver/turn6_reference.py"]},
              "fixtures":fixtures, "cases":[], "controls":[], "ablations":[], "rankingIntervals":[]}
    saved = {}
    primary_solves = 0
    for case in fixtures["cases"]:
        budget()
        results, contexts = {}, {}
        for label,g in case["models"].items():
            if label == "D":
                E.R.GAME_CACHE.clear()
                solved = E.R.solve(case["numerical"], reduce=True, pool_types=True,
                                   seconds=20., tolerance=E.TOL, include_actions=True)
                if not all(s["success"] for s in solved["statuses"]) or not solved["certificate"]["validated"]:
                    raise RuntimeError("Existing numerical oracle failed validation")
            else:
                solved, contexts[label] = E.solve(g)
            independent = js.request(op="verify",game=g,policies=solved["policies"])
            compare_checks(solved["certificate"], independent)
            if label != "D":
                stats = js.request(op="compile",game=g)["stats"]
                if stats != solved["stats"]:
                    raise RuntimeError("Independent compiler size mismatch")
            results[label] = compact(solved, independent)
            primary_solves += 1
        # Same frozen strategy: exact representation must preserve all original EVs.
        frozen = js.request(op="verify",game=case["models"]["Q"],policies=results["D"]["policies"])
        compare_checks(results["D"]["certificate"],frozen,actions=False)
        for x,y in zip(results["D"]["certificate"]["rows"][0],frozen["rows"][0]):
            if any(abs(a["ev"]-b["ev"])>1e-8 for a,b in zip(x["actions"],y["actions"])):
                raise RuntimeError("Exact quotient changed frozen own-action EV")
        if abs(results["D"]["certificate"]["value"]-results["Q"]["certificate"]["value"])>E.TOL:
            raise RuntimeError("Exact quotient changed game value")
        robust = {}
        for labels in (("D","C"),("D","C","U")):
            robust["/".join(labels)] = E.robust_policy([case["models"][k] for k in labels],
                [results[k]["certificate"]["value"] for k in labels])
        unpooled, _ = E.solve(case["models"]["Q"],pool_types=False,include_actions=False)
        check = js.request(op="verify",game=case["models"]["Q"],policies=unpooled["policies"],includeActions=False)
        compare_checks(unpooled["certificate"],check,False)
        if abs(unpooled["certificate"]["value"]-results["Q"]["certificate"]["value"])>E.TOL:
            raise RuntimeError("Hand-only pooling changed value")
        report["ablations"].append({"id":case["id"],"kind":"Same payoff/outcome reductions, private-type pooling on/off",
            "pooled":{k:results["Q"][k] for k in ("stats","compileMs","optimizationMs","verificationMs","totalMs")},
            "unpooled":{k:unpooled[k] for k in ("stats","compileMs","optimizationMs","verificationMs","totalMs")},
            "order":"Pooled always first; not a randomized performance estimate",
            "sameValue":True})
        row = {"id":case["id"],"boardId":case["boardId"],"prior":case["prior"],"models":results,
               "exactFrozenCheck":True, "transfer":transfer(case["models"],results),"robust":robust}
        report["cases"].append(row)
        saved[case["id"]] = {"case":case,"contexts":contexts,"results":results}
        print(json.dumps({"progress":case["id"],"elapsedSeconds":round(time.perf_counter()-start,3),
                          "robustDC":robust["D/C"]["verifiedMaxRegret"],"robustDCU":robust["D/C/U"]["verifiedMaxRegret"]}),flush=True)
    # Label duplication stress: isolate type pooling without changing any capability.
    expanded = copy.deepcopy(fixtures["cases"][0]["models"]["Q"])
    for p, ts in enumerate(expanded["ranges"]):
        expanded["ranges"][p] = [{**copy.deepcopy(t),"id":t["id"]+"#alias"+str(j),"weight":t["weight"]/16}
                                for t in ts for j in range(16)]
    stress = {}
    for pool in (True,False):
        budget()
        result,_ = E.solve(expanded,pool_types=pool,include_actions=False)
        jc = js.request(op="verify",game=expanded,policies=result["policies"],includeActions=False)
        compare_checks(result["certificate"],jc,False)
        stress[str(pool)] = {k:result[k] for k in ("stats","compileMs","optimizationMs","verificationMs","totalMs")}
    report["ablations"].append({"id":"duplicate-labels-32-by-112","kind":"Synthetic duplicate labels, not realistic extra hands",
                                "pooled":stress["True"],"unpooled":stress["False"],"sameValue":True})
    # A named-card effect control changes feasible choices, not opponent preferences.
    control_contexts = {}
    for control in fixtures["controls"]:
        budget()
        result,context = E.solve(control["game"])
        jc = js.request(op="verify",game=control["game"],policies=result["policies"])
        compare_checks(result["certificate"],jc)
        report["controls"].append({"id":control["id"],**compact(result,jc)})
        control_contexts[control["id"]] = (control["game"],result,context)
    report["controlComparisons"] = {}
    for labels in (("focus-15","doom-15"),("movement-absent","movement-available"),
                   ("destruction-absent","destruction-after-us","destruction-before-us")):
        games = {k:control_contexts[k][0] for k in labels}
        results = {k:control_contexts[k][1] for k in labels}
        report["controlComparisons"]["/".join(labels)] = {"transfer":transfer(games,results),
            "robust":E.robust_policy(list(games.values()),[x["certificate"]["value"] for x in results.values()])}
    # Screen ranking changes, then audit at most eight against equilibrium ambiguity.
    candidates = []
    for item in report["cases"]:
        for target in ("C","U"):
            rows_a,rows_b = item["models"]["D"]["certificate"]["rows"][0],item["models"][target]["certificate"]["rows"][0]
            for ta,tb in zip(rows_a,rows_b):
                av,bv = {a["actionId"]:a["ev"] for a in ta["actions"]},{a["actionId"]:a["ev"] for a in tb["actions"]}
                ids = sorted(av)
                for i,a in enumerate(ids):
                    for b in ids[i+1:]:
                        da,db = av[a]-av[b],bv[a]-bv[b]
                        if da*db < 0 and min(abs(da),abs(db)) > DELTA:
                            candidates.append({"id":item["id"],"typeKey":ta["typeKey"],"actions":[a,b],
                                "models":["D",target],"pointDifferences":[da,db],"strength":min(abs(da),abs(db))})
    candidates.sort(key=lambda x:(-x["strength"],x["id"],x["typeKey"],x["actions"]))
    report["rankingScreen"] = {"pointReversalCandidates":len(candidates),"audited":min(8,len(candidates)),
                              "unexamined":"Off-support rankings remain unresolved without an optimal-face check"}
    for candidate in candidates[:8]:
        budget()
        setting = saved[candidate["id"]]
        intervals = []
        for label in candidate["models"]:
            # D's game is exactly Q, including all relevant private menu constraints.
            context = setting["contexts"]["Q" if label=="D" else label]
            intervals.append(E.pair_interval(context,candidate["typeKey"],*candidate["actions"]))
        separated = (intervals[0]["min"] > DELTA and intervals[1]["max"] < -DELTA or
                     intervals[1]["min"] > DELTA and intervals[0]["max"] < -DELTA)
        report["rankingIntervals"].append({**candidate,"intervals":intervals,"allOptimalPoliciesReverse":separated})
    # Post-hoc descriptive transfers across the already declared priors.
    # These evaluate exported policies, not minimum regret across priors.
    report["postHocPriorTransfers"] = []
    for source in report["cases"]:
        target_prior = "flexible" if source["prior"] == "concentrated" else "concentrated"
        target = next(c for c in report["cases"] if c["boardId"]==source["boardId"] and c["prior"]==target_prior)
        fixture = next(c for c in fixtures["cases"] if c["id"]==target["id"])
        for label in ("D","C"):
            value = E.security_value(fixture["models"][label],source["models"][label]["policies"][0])["value"]
            report["postHocPriorTransfers"].append({"boardId":source["boardId"],"sourcePrior":source["prior"],
                "targetPrior":target_prior,"model":label,"securityValue":value,
                "securityLoss":max(0.,target["models"][label]["certificate"]["value"]-value),
                "scope":"Exported-policy sensitivity only; common policies across priors were not optimized"})
    js.close()
    report["resources"] = {"elapsedSeconds":time.perf_counter()-start,"pythonPeakRssBytes":E.peak_bytes(),
                           "nodePeakRssBytes":js.peak,"sumOfLifetimeHighWaterBytes":E.peak_bytes()+js.peak,
                           "memoryScope":"Two long-lived sequentially cooperating workers; sum of lifetime peaks, not simultaneous RSS or per-case memory",
                           "primaryGameSolves":primary_solves,"primaryLPOptimizations":2*primary_solves,
                           "ablationGameSolves":14,"controlGameSolves":8,
                           "robustLPOptimizations":27,"intervalLPOptimizations":4*len(report["rankingIntervals"]),
                           "budgets":{"studySeconds":900,"individualLPSeconds":10,"combinedHighWaterBytes":2*1024**3}}
    report["summary"] = {
        "allPrimaryCertificatesValidated":all(m["certificate"]["validated"] for c in report["cases"] for m in c["models"].values()),
        "allExactFrozenChecksPassed":all(c["exactFrozenCheck"] for c in report["cases"]),
        "casesOverDeltaRobustDC":sum(c["robust"]["D/C"]["verifiedMaxRegret"]>DELTA+E.TOL for c in report["cases"]),
        "casesOverDeltaRobustDCU":sum(c["robust"]["D/C/U"]["verifiedMaxRegret"]>DELTA+E.TOL for c in report["cases"]),
        "maxRobustDC":max(c["robust"]["D/C"]["verifiedMaxRegret"] for c in report["cases"]),
        "maxRobustDCU":max(c["robust"]["D/C/U"]["verifiedMaxRegret"] for c in report["cases"]),
        "certifiedRankingReversals":sum(c["allOptimalPoliciesReverse"] for c in report["rankingIntervals"]),
        "rawEVsAcrossGamesAreNotTransferEvidence":True}
    text = json.dumps(report,sort_keys=True,separators=(",",":"),allow_nan=False)
    (output/"report.json").write_text(text+"\n")
    # Split the same evidence into reviewable, persistent repository-sized files.
    (output/"cases").mkdir(exist_ok=True)
    case_paths = []
    for fixture,result in zip(fixtures["cases"],report["cases"]):
        name = "cases/"+result["id"].replace("/","--")+".json"
        (output/name).write_text(json.dumps({"fixture":fixture,"result":result},sort_keys=True,separators=(",",":"))+"\n")
        case_paths.append(name)
    (output/"controls.json").write_text(json.dumps({"fixtures":fixtures["controls"],"results":report["controls"],
        "comparisons":report["controlComparisons"]},sort_keys=True,indent=2)+"\n")
    manifest = {k:v for k,v in report.items() if k not in ("fixtures","cases","controls","controlComparisons")}
    manifest["evidenceFiles"] = {"cases":case_paths,"controls":"controls.json"}
    manifest["fullReportSha256"] = hashlib.sha256(text.encode()).hexdigest()
    (output/"manifest.json").write_text(json.dumps(manifest,sort_keys=True,indent=2)+"\n")
    print(json.dumps({"summary":report["summary"],"resources":report["resources"]}),flush=True)
    if args.log_report:
        chunks = [text[i:i+6000] for i in range(0,len(text),6000)]
        print("REPORT_JSON_BEGIN "+str(len(chunks)),flush=True)
        for i,chunk in enumerate(chunks):
            print("REPORT_JSON_CHUNK "+str(i)+" "+chunk,flush=True)
        print("REPORT_JSON_END "+hashlib.sha256(text.encode()).hexdigest(),flush=True)


if __name__ == "__main__":
    main()
