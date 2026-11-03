import copy
import json
from pathlib import Path
import subprocess
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parent))
import reference as E


class IndependentStudyControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixtures = json.loads(subprocess.check_output(["node","studies/capabilities/worker.cjs","--fixtures"],cwd=E.ROOT,text=True))
        cls.controls = {x["id"]:x["game"] for x in cls.fixtures["controls"]}

    def test_effects_known_answers(self):
        for name,expected in (("destruction-absent",1),("destruction-after-us",-1),("destruction-before-us",1)):
            g=self.controls[name]
            self.assertEqual(E.terminal(g,g["ranges"][0][0]["actions"][0],g["ranges"][1][0]["actions"][1]),expected)
            self.assertEqual(E.terminal(g,g["ranges"][0][0]["actions"][1],g["ranges"][1][0]["actions"][1]),1)

    def test_numeric_oracle_exact_quotient_and_frozen_action_values(self):
        c=self.fixtures["cases"][0]
        old=E.R.solve(c["numerical"],include_actions=True)
        new,ctx=E.solve(c["models"]["Q"])
        self.assertTrue(old["certificate"]["validated"])
        self.assertAlmostEqual(old["certificate"]["value"],new["certificate"]["value"],places=8)
        frozen=E.verify(c["models"]["Q"],old["policies"])
        for p in (0,1):
            for x,y in zip(old["certificate"]["rows"][p],frozen["rows"][p]):
                for a in y["actions"]:
                    self.assertAlmostEqual(x["actions"][a["actionId"]]["ev"],a["ev"],places=8)
        unpooled,_=E.solve(c["models"]["Q"],pool_types=False)
        self.assertAlmostEqual(new["certificate"]["value"],unpooled["certificate"]["value"],places=8)

    def test_movement_changes_security_not_only_an_equilibrium_mix(self):
        g0,g1=self.controls["movement-absent"],self.controls["movement-available"]
        s0,_=E.solve(g0);s1,_=E.solve(g1)
        self.assertAlmostEqual(s0["certificate"]["value"],1.)
        self.assertAlmostEqual(s1["certificate"]["value"],0.)
        pure=[{"typeKey":"allocate-two","probabilities":{"add-two:0":1.}}]
        self.assertAlmostEqual(E.security_value(g1,pure)["value"],-1.)
        robust=E.robust_policy([g0,g1],[1.,0.])
        self.assertAlmostEqual(robust["verifiedMaxRegret"],.5,places=8)
        self.assertAlmostEqual(robust["lpBoundCheck"]["dualLowerBound"],.5,places=8)
        self.assertTrue(robust["lpBoundCheck"]["validated"])
        self.assertAlmostEqual(robust["policy"][0]["probabilities"]["add-two:0"],.75,places=8)

    def test_matched_total_power_is_not_matched_feasible_effects(self):
        games=[self.controls[k] for k in ("focus-15","doom-15")]
        solved=[E.solve(g)[0] for g in games]
        self.assertTrue(all(abs(s["certificate"]["value"]-1.)<1e-8 for s in solved))
        robust=E.robust_policy(games,[1.,1.])
        self.assertAlmostEqual(robust["verifiedMaxRegret"],1.,places=8)
        self.assertAlmostEqual(robust["lpBoundCheck"]["dualLowerBound"],1.,places=8)

    def test_body_size_and_priority(self):
        for name in ("destruction-absent","destruction-after-us","destruction-before-us"):
            solved,_=E.solve(self.controls[name])
            self.assertAlmostEqual(solved["certificate"]["value"],1.)
            rows=solved["certificate"]["rows"][0][0]["actions"]
            ev={a["actionId"]:a["evLoss"] for a in rows}
            self.assertAlmostEqual(ev["two-fives"],0.)
            if name=="destruction-after-us":
                self.assertAlmostEqual(ev["one-ten"],2.)

    def test_optimal_face_covers_returned_policy_difference(self):
        c=self.fixtures["cases"][0]
        solved,context=E.solve(c["models"]["Q"])
        row=solved["certificate"]["rows"][0][0]
        a,b=row["actions"][:2]
        interval=E.pair_interval(context,row["typeKey"],a["actionId"],b["actionId"])
        point=a["ev"]-b["ev"]
        self.assertLessEqual(interval["min"],point+1e-7)
        self.assertGreaterEqual(interval["max"],point-1e-7)

    def test_security_replies_cannot_see_own_hidden_type(self):
        g={"schema":"snap-capability-study-1","priority":0,"board":[[[],[],[]],[[],[],[]]],"ranges":[
            [{"id":"l","weight":1,"actions":[{"id":"l","plays":[{"lane":0,"power":3}]}]},
             {"id":"m","weight":1,"actions":[{"id":"m","plays":[{"lane":1,"power":3}]}]}],
            [{"id":"u","weight":1,"actions":[{"id":"l","plays":[{"lane":0,"power":4}]},
                                              {"id":"m","plays":[{"lane":1,"power":4}]}]}]]}
        # Each unblocked lane ties one lane win, then loses on total power:
        # use a two-lane asymmetric background to expose information constraints.
        g["board"]=[[[1],[1],[]],[[],[],[1]]]
        policy=[{"typeKey":"l","probabilities":{"l":1}},{"typeKey":"m","probabilities":{"m":1}}]
        values=[]
        for b in g["ranges"][1][0]["actions"]:
            values.append(sum(E.terminal(g,t["actions"][0],b) for t in g["ranges"][0])/2)
        self.assertAlmostEqual(E.security_value(g,policy)["value"],min(values))
        self.assertAlmostEqual(min(values),-.5)

    def test_lp_bound_accounts_for_residuals_instead_of_trusting_objective(self):
        g=self.controls["movement-available"]
        _,context=E.solve(g)
        problem,_,_=context["problems"][0]
        result=E.optimize(problem)
        check=E.check_lp_bound(problem,result)
        self.assertLess(check["gap"],1e-7)
        bad=copy.deepcopy(result)
        bad.x[0]+=2
        with self.assertRaises(RuntimeError):
            E.check_lp_bound(problem,bad)

    def test_ambiguous_destroy_rejected(self):
        g=copy.deepcopy(self.controls["destruction-after-us"])
        g["board"][0][0]=[10,11]
        with self.assertRaises(ValueError):
            E.terminal(g,{"plays":[]},g["ranges"][1][0]["actions"][1])


if __name__=="__main__":
    unittest.main()
